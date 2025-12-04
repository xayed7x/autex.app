import { createClient } from '@supabase/supabase-js';
import { decryptToken } from '@/lib/facebook/crypto-utils';
import {
  SendMessageRequest,
  SendMessageResponse,
  FacebookError,
  RateLimitInfo,
} from '@/types/facebook';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Sends a text message to a Facebook user via Messenger
 * @param pageId - The Facebook Page ID
 * @param recipientPsid - The recipient's Page-Scoped ID
 * @param text - The message text to send
 * @returns Promise with the send message response
 * @throws Error if sending fails
 */
export async function sendMessage(
  pageId: string,
  recipientPsid: string,
  text: string
): Promise<SendMessageResponse> {
  try {
    // Fetch access token from database using admin client (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    const { data: fbPage, error: pageError } = await supabase
      .from('facebook_pages')
      .select('encrypted_access_token, workspace_id')
      .eq('id', pageId)
      .single();

    if (pageError || !fbPage) {
      throw new Error(`Failed to fetch Facebook page: ${pageError?.message || 'Page not found'}`);
    }

    const encryptedToken = fbPage.encrypted_access_token;

    // Verify encrypted token exists
    if (!encryptedToken || encryptedToken.length < 20) {
      throw new Error('Invalid or missing encrypted access token in database');
    }

    // Decrypt the access token
    let accessToken: string;
    try {
      accessToken = decryptToken(encryptedToken);
      console.log('Access token decrypted successfully:', {
        tokenPrefix: accessToken.substring(0, 15) + '...',
        tokenLength: accessToken.length,
      });
    } catch (decryptError) {
      console.error('Failed to decrypt access token:', decryptError);
      throw new Error('Failed to decrypt access token - token may be corrupted');
    }

    // Prepare request body (minimal required fields only)
    const requestBody = {
      recipient: {
        id: recipientPsid,
      },
      message: {
        text: text,
      },
    };

    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    // Call Facebook Graph API with specific page ID (not /me/)
    // Access token must be in URL query parameter, not request body
    const apiUrl = `${GRAPH_API_BASE_URL}/${pageId}/messages?access_token=${accessToken}`;
    console.log('Sending message to Facebook API:', {
      url: `${GRAPH_API_BASE_URL}/${pageId}/messages`,
      pageId: pageId,
      recipientPsid: recipientPsid,
      messageLength: text.length,
    });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // Check for rate limit headers
    checkRateLimits(response.headers);

    // Handle errors
    if (!response.ok) {
      const errorData: FacebookError = await response.json();
      
      // Log full error details for debugging
      console.error('Facebook API Error Details:', {
        status: response.status,
        pageId: pageId,
        error: errorData.error,
      });
      
      if (response.status === 401) {
        console.error('Invalid or expired access token for page:', pageId);
        throw new Error(`Authentication failed: ${errorData.error.message}`);
      }

      if (response.status === 429) {
        console.error('Rate limit exceeded for page:', pageId);
        throw new Error(`Rate limit exceeded: ${errorData.error.message}`);
      }

      throw new Error(
        `Facebook API error (${response.status}): ${errorData.error.message} (Code: ${errorData.error.code}, Subcode: ${errorData.error.error_subcode || 'N/A'})`
      );
    }

    const result: SendMessageResponse = await response.json();

    console.log(`Message sent successfully to ${recipientPsid}: ${result.message_id}`);
    return result;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

/**
 * Sends a product card with image and buttons to a Facebook user via Messenger
 * Uses Facebook's Generic Template for rich product display
 * @param pageId - The Facebook Page ID
 * @param recipientPsid - The recipient's Page-Scoped ID
 * @param product - Product details including image, price, and variations
 * @returns Promise with the send message response
 * @throws Error if sending fails
 */
export async function sendProductCard(
  pageId: string,
  recipientPsid: string,
  product: {
    id: string;
    name: string;
    price: number;
    imageUrl: string;
    stock: number;
    category?: string;
    description?: string;
    variations?: {
      colors?: string[];
      sizes?: string[];
    };
  }
): Promise<SendMessageResponse> {
  try {
    // Fetch access token from database
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    
    const { data: fbPage, error: pageError } = await supabase
      .from('facebook_pages')
      .select('encrypted_access_token')
      .eq('id', pageId)
      .single();

    if (pageError || !fbPage) {
      throw new Error(`Failed to fetch Facebook page: ${pageError?.message || 'Page not found'}`);
    }

    // Decrypt access token
    const accessToken = decryptToken(fbPage.encrypted_access_token);

    // Prepare Generic Template payload
    const requestBody = {
      recipient: {
        id: recipientPsid,
      },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              {
                title: product.name,
                image_url: product.imageUrl,
                subtitle: `৳${product.price.toLocaleString()} | Stock: ${product.stock} units`,
                buttons: [
                  {
                    type: 'postback',
                    title: 'Order Now 🛒',
                    payload: `ORDER_PRODUCT_${product.id}`,
                  },
                  {
                    type: 'postback',
                    title: 'View Details 📋',
                    payload: `VIEW_DETAILS_${product.id}`,
                  },
                ],
              },
            ],
          },
        },
      },
    };

    console.log('Sending product card:', {
      productName: product.name,
      productId: product.id,
      imageUrl: product.imageUrl,
    });

    // Call Facebook Graph API
    const apiUrl = `${GRAPH_API_BASE_URL}/${pageId}/messages?access_token=${accessToken}`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // Check rate limits
    checkRateLimits(response.headers);

    // Handle errors
    if (!response.ok) {
      const errorData: FacebookError = await response.json();
      console.error('Facebook API Error sending product card:', errorData);
      throw new Error(
        `Failed to send product card: ${errorData.error.message}`
      );
    }

    const result: SendMessageResponse = await response.json();
    console.log(`Product card sent successfully to ${recipientPsid}: ${result.message_id}`);
    return result;
  } catch (error) {
    console.error('Error sending product card:', error);
    throw error;
  }
}

/**
 * Checks rate limit headers and logs warnings if approaching limits
 * @param headers - Response headers from Facebook API
 */
function checkRateLimits(headers: Headers): void {
  const rateLimitInfo = parseRateLimitHeaders(headers);

  if (rateLimitInfo) {
    const usagePercentage = (rateLimitInfo.callCount / 100) * 100;

    if (usagePercentage > 80) {
      console.warn(
        `⚠️ High API usage detected: ${usagePercentage.toFixed(1)}% of rate limit used`,
        rateLimitInfo
      );
    }

    if (rateLimitInfo.estimatedTimeToRegainAccess) {
      console.warn(
        `⚠️ Rate limit reached. Access regained in ${rateLimitInfo.estimatedTimeToRegainAccess} minutes`
      );
    }
  }
}

/**
 * Parses rate limit information from Facebook API response headers
 * @param headers - Response headers
 * @returns Rate limit info or null if not available
 */
function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const businessUsage = headers.get('x-business-use-case-usage');
  const appUsage = headers.get('x-app-usage');

  if (businessUsage) {
    try {
      const usage = JSON.parse(businessUsage);
      const firstKey = Object.keys(usage)[0];
      if (firstKey && usage[firstKey]) {
        return {
          callCount: usage[firstKey].call_count || 0,
          totalCpuTime: usage[firstKey].total_cputime || 0,
          totalTime: usage[firstKey].total_time || 0,
          type: 'business',
          estimatedTimeToRegainAccess:
            usage[firstKey].estimated_time_to_regain_access || undefined,
        };
      }
    } catch (error) {
      console.error('Failed to parse business usage header:', error);
    }
  }

  if (appUsage) {
    try {
      const usage = JSON.parse(appUsage);
      return {
        callCount: usage.call_count || 0,
        totalCpuTime: usage.total_cputime || 0,
        totalTime: usage.total_time || 0,
        type: 'app',
        estimatedTimeToRegainAccess:
          usage.estimated_time_to_regain_access || undefined,
      };
    } catch (error) {
      console.error('Failed to parse app usage header:', error);
    }
  }

  return null;
}

/**
 * Replies to a Facebook comment
 * @param commentId - The comment ID to reply to
 * @param message - The reply message text
 * @param pageAccessToken - The page access token
 * @returns Promise with the comment response
 * @throws Error if reply fails
 */
export async function replyToComment(
  commentId: string,
  message: string,
  pageAccessToken: string
): Promise<{ id: string }> {
  try {
    const response = await fetch(
      `${GRAPH_API_BASE_URL}/${commentId}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          access_token: pageAccessToken,
        }),
      }
    );

    if (!response.ok) {
      const errorData: FacebookError = await response.json();
      throw new Error(
        `Failed to reply to comment: ${errorData.error.message}`
      );
    }

    const result = await response.json();
    console.log(`Comment reply posted successfully: ${result.id}`);
    return result;
  } catch (error) {
    console.error('Error replying to comment:', error);
    throw error;
  }
}

