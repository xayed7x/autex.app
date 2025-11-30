import { createClient } from '@supabase/supabase-js';
import {
  SendMessageRequest,
  SendMessageResponse,
  FacebookError,
  RateLimitInfo,
} from '@/types/facebook';

const GRAPH_API_VERSION = 'v19.0';
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
      .eq('id', parseInt(pageId))
      .single();

    if (pageError || !fbPage) {
      throw new Error(`Failed to fetch Facebook page: ${pageError?.message || 'Page not found'}`);
    }

    const accessToken = fbPage.encrypted_access_token;

    // Verify token exists and log first few characters for debugging
    if (!accessToken || accessToken.length < 20) {
      throw new Error('Invalid or missing access token in database');
    }
    console.log('Access token retrieved:', {
      tokenPrefix: accessToken.substring(0, 15) + '...',
      tokenLength: accessToken.length,
    });

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

