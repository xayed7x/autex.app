import { createClient } from '@supabase/supabase-js';
import { decryptToken } from '@/lib/facebook/crypto-utils';
import {
  SendMessageRequest,
  SendMessageResponse,
  FacebookError,
  RateLimitInfo,
} from '@/types/facebook';

const GRAPH_API_VERSION = 'v24.0';
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
 * @param businessCategory - The category of the business (food/clothing)
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
    flavor?: string;
    price_per_pound?: number;
    min_pounds?: number;
    max_pounds?: number;
  },
  businessCategory?: string
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
    
    let subtitleText = '';
    let buttons = [];

    if (businessCategory === 'food') {
      // Food format: "৳[price_per_pound] per pound" only
      const pricePerPound = product.price_per_pound || product.price;
      
      subtitleText = `৳${pricePerPound.toLocaleString()} per pound`;
      
      buttons = [
        {
          type: 'postback',
          title: 'Order Now 🛒',
          payload: `ORDER_NOW_${product.id}`,
        },
      ];
    } else {
      // Clothing format
      const sizes = product.variations?.sizes;
      const colors = product.variations?.colors;
      if (sizes && sizes.length > 0) {
        subtitleText += `সাইজ: ${sizes.join(', ')}`;
      }
      if (colors && colors.length > 0) {
        if (subtitleText.length > 0) subtitleText += ' | ';
        subtitleText += `কালার: ${colors.join(', ')}`;
      }
      
      if (!subtitleText) {
        subtitleText = 'Available for Order';
      }

      buttons = [
        {
          type: 'postback',
          title: 'Order now 🛒',
          payload: `ORDER_NOW_${product.id}`,
        },
        {
          type: 'postback',
          title: 'Description 📋',
          payload: `VIEW_DETAILS_${product.id}`,
        },
      ];
    }

    const requestBody = {
      recipient: {
        id: recipientPsid,
      },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            image_aspect_ratio: businessCategory === 'food' ? 'square' : 'horizontal',
            elements: [
              {
                title: `${product.name} ${businessCategory !== 'food' ? `— ৳${product.price.toLocaleString()}` : ''}`,
                image_url: product.imageUrl || undefined,
                subtitle: subtitleText,
                buttons: buttons,
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
 * Sends multiple product cards as a carousel to a Facebook user via Messenger
 * Uses Facebook's Generic Template with multiple elements
 * @param pageId - The Facebook Page ID
 * @param recipientPsid - The recipient's Page-Scoped ID
 * @param products - Array of products to display (max 10)
 * @param businessCategory - The category of the business
 * @returns Promise with the send message response
 * @throws Error if sending fails
 */
export async function sendProductCarousel(
  pageId: string,
  recipientPsid: string,
  products: Array<{
    id: string;
    name: string;
    price: number;
    imageUrl?: string;
    stock?: number;
    variations?: {
      colors?: string[];
      sizes?: string[];
    };
    flavor?: string;
    price_per_pound?: number;
    min_pounds?: number;
    max_pounds?: number;
  }>,
  businessCategory?: string
): Promise<SendMessageResponse> {
  try {
    // Facebook limits Generic Template to 10 elements
    const limitedProducts = products.slice(0, 10);
    
    if (limitedProducts.length === 0) {
      throw new Error('No products provided for carousel');
    }

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

    // Build carousel elements
    const elements = limitedProducts.map(product => {
      let subtitleText = '';
      let buttons = [];

      if (businessCategory === 'food') {
        const flavor = product.flavor || 'Cake';
        const pricePerPound = product.price_per_pound || product.price;
        const minP = product.min_pounds || 0.5;
        const maxP = product.max_pounds || 5.0;
        
        subtitleText = `🎂 ${flavor} | ৳${pricePerPound.toLocaleString()}/pound | ${minP}–${maxP} pound`;
        
        buttons = [
          {
            type: 'postback',
            title: 'Order Now 🛒',
            payload: `ORDER_NOW_${product.id}`,
          },
          {
            type: 'postback',
            title: 'More Photos 📸',
            payload: `MORE_PHOTOS_${product.id}`,
          },
        ];
      } else {
        const sizes = product.variations?.sizes;
        const colors = product.variations?.colors;
        if (sizes && sizes.length > 0) {
          subtitleText += `সাইজ: ${sizes.join(', ')}`;
        }
        if (colors && colors.length > 0) {
          if (subtitleText.length > 0) subtitleText += ' | ';
          subtitleText += `কালার: ${colors.join(', ')}`;
        }
        
        if (!subtitleText) {
          subtitleText = 'Available for Order';
        }

        buttons = [
          {
            type: 'postback',
            title: 'Order now 🛒',
            payload: `ORDER_NOW_${product.id}`,
          },
          {
            type: 'postback',
            title: 'Description 📋',
            payload: `VIEW_DETAILS_${product.id}`,
          },
        ];
      }

      return {
        title: `${product.name} ${businessCategory !== 'food' ? `— ৳${product.price.toLocaleString()}` : ''}`,
        image_url: product.imageUrl || undefined,
        subtitle: subtitleText,
        buttons: buttons,
      };
    });

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
            elements: elements,
          },
        },
      },
    };

    console.log(`Sending product carousel with ${limitedProducts.length} products`);

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
      console.error('Facebook API Error sending product carousel:', errorData);
      throw new Error(
        `Failed to send product carousel: ${errorData.error.message}`
      );
    }

    const result: SendMessageResponse = await response.json();
    console.log(`Product carousel sent successfully to ${recipientPsid}: ${result.message_id}`);
    return result;
  } catch (error) {
    console.error('Error sending product carousel:', error);
    throw error;
  }
}

/**
 * Sends multiple products as individual cards one after another (Vertical Feel)
 * Specifically for food businesses to give more prominence to each cake.
 * @param pageId - Facebook Page ID
 * @param recipientPsid - Customer PSID
 * @param products - Array of products (Max 4)
 * @param businessCategory - Category
 */
export async function sendProductsVertical(
  pageId: string,
  recipientPsid: string,
  products: any[],
  businessCategory?: string
): Promise<void> {
  // Limit to max 4 products to avoid spamming
  const limitedProducts = products.slice(0, 4);
  
  for (const product of limitedProducts) {
    try {
      await sendProductCard(pageId, recipientPsid, product, businessCategory);
      // Wait 300ms between sends for vertical arrival feel
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`Failed to send vertical product card for ${product.id}:`, err);
    }
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
      `${GRAPH_API_BASE_URL}/${commentId}/comments?access_token=${pageAccessToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
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

/**
 * Sends an image attachment to a Facebook user via Messenger
 * @param pageId - The Facebook Page ID
 * @param psid - The recipient's Page-Scoped ID
 * @param mediaUrl - The URL of the image or video to send
 * @param accessToken - The Page Access Token
 * @returns Promise that resolves when the message is sent
 * @throws Error if sending fails
 */
export async function sendImage(
  pageId: string,
  psid: string,
  mediaUrl: string,
  accessToken: string
): Promise<void> {
  try {
    // STRICT VALIDATION
    if (!psid || psid === 'undefined') {
      throw new Error('Recipient PSID is missing or "undefined". Blocked send to prevent API error.');
    }

    // Explicitly cast IDs to Strings to prevent rounding issues with large IDs
    // We use String() constructor here for maximum safety before object construction
    const idForRecipient = String(psid);
    const idForPage = String(pageId);

    // Basic detection for video vs image
    const isVideo = mediaUrl.toLowerCase().match(/\.(mp4|mov|avi|wmv|flv|mkv|webm)$/) || mediaUrl.includes('video/upload');
    const type = isVideo ? 'video' : 'image';

    console.log("DEBUG_ID_TYPE:", typeof psid, psid);

    // STEP 1: Pre-upload to Facebook to get attachment_id
    const uploadUrl = `${GRAPH_API_BASE_URL}/${idForPage}/message_attachments?access_token=${accessToken}`;
    
    const uploadBody = JSON.stringify({
      message: {
        attachment: {
          type: String(type).trim(),
          payload: {
            is_reusable: true,
            url: String(mediaUrl).trim(),
          },
        },
      },
    });

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json; charset=utf-8' 
      },
      body: uploadBody,
    });

    if (!uploadResponse.ok) {
      const errorData: FacebookError = await uploadResponse.json();
      console.error('Facebook Upload API Error:', errorData.error);
      throw new Error(
        `Facebook could not fetch the media URL: ${errorData.error.message} (Code: ${errorData.error.code})`
      );
    }

    const uploadResult = await uploadResponse.json();
    const attachment_id = uploadResult.attachment_id;
    
    if (!attachment_id) {
      throw new Error('Facebook did not return an attachment_id.');
    }

    console.log(`✅ [ATTACHMENT UPLOAD] Created ID ${attachment_id} for URL: ${mediaUrl}`);

    // STEP 2: Send to user using attachment_id
    const sendBody = JSON.stringify({
      recipient: {
        id: String(idForRecipient).trim(), 
      },
      message: {
        attachment: {
          type: String(type).trim(),
          payload: {
            attachment_id: String(attachment_id).trim(),
          },
        },
      },
    });

    // LOGGING THE FINAL PAYLOAD FOR TRACEABILITY
    console.log("FINAL_PAYLOAD (Image/Video)", sendBody);

    // Using explicit /pageId/ instead of /me/ to be consistent with working text messages
    const apiUrl = `${GRAPH_API_BASE_URL}/${idForPage}/messages?access_token=${accessToken}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: sendBody,
    });

    // Check for rate limit headers
    checkRateLimits(response.headers);

    // Handle errors
    if (!response.ok) {
      const errorData: FacebookError = await response.json();
      
      console.error('Facebook Send API Error (Attachment ID):', {
        status: response.status,
        pageId: idForPage,
        error: errorData.error,
      });
      
      throw new Error(
        `Facebook API error during send (${response.status}): ${errorData.error.message} (Code: ${errorData.error.code}, Subcode: ${errorData.error.error_subcode || 'N/A'})`
      );
    }

    console.log(`Image/Video sent successfully to ${idForRecipient} using attachment_id ${attachment_id}`);
  } catch (error) {
    console.error('Error in two-step sendImage:', error);
    throw error;
  }
}


/**
 * Sends a private reply to a Facebook comment
 * @param commentId - The comment ID to reply to
 * @param message - The message text or Generic Template object
 * @param pageAccessToken - The page access token
 * @returns Promise with the response
 */
export async function sendPrivateReply(
  commentId: string,
  message: string | any,
  pageAccessToken: string
): Promise<any> {
  try {
    const rawId = String(commentId).trim();
    if (!rawId || rawId === 'undefined') {
      throw new Error('Comment ID is missing or "undefined"');
    }

    // REVERT: Use the full composite ID (PostID_CommentID) as the Public Reply succeeded with it.
    const idStr = rawId;

    const payload: any = {};
    if (typeof message === 'string') {
      // FOR PRIVATE REPLIES: Meta expects a flat "message" string for text.
      payload.message = message;
    } else {
      // FOR TEMPLATES (Product Cards): Use the standard message object.
      payload.message = message;
    }

    // SYNC: Switching back to v24.0 to match the working /messages calls.
    const apiUrl = `https://graph.facebook.com/v24.0/${idStr}/private_replies?access_token=${pageAccessToken}`;
    console.log(`💬 [PRIVATE_REPLY] Attempting PM to full-ID: ${idStr}`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData: FacebookError = await response.json();
      
      // Handle the "already replied" error gracefully
      if (errorData.error.code === 100 && errorData.error.error_subcode === 2018042) {
        console.warn(`💬 [PRIVATE_REPLY] Skipping: Comment already has a private reply.`);
        return { already_replied: true };
      }
      
      console.error('Meta Private Reply Error Details:', errorData.error);
      throw new Error(`Failed to send private reply: ${errorData.error.message}`);
    }

    const result = await response.json();
    console.log(`💬 [PRIVATE_REPLY] Success: ${result.id || 'ok'}`);
    return result;
  } catch (error) {
    console.error('Error in sendPrivateReply helper:', error);
    throw error;
  }
}

/**
 * Sends a public reply to an Instagram comment
 * @param commentId - The Instagram comment ID to reply to
 * @param text - The message text
 * @param pageAccessToken - The page access token
 * @returns Promise with the response
 */
export async function replyToInstagramComment(
  commentId: string,
  text: string,
  pageAccessToken: string
): Promise<any> {
  try {
    const rawId = String(commentId).trim();
    if (!rawId || rawId === 'undefined') {
      throw new Error('Comment ID is missing or "undefined"');
    }

    const payload = { message: text };
    const apiUrl = `https://graph.facebook.com/v24.0/${rawId}/replies?access_token=${pageAccessToken}`;
    console.log(`📸💬 [IG_PUBLIC_REPLY] Attempting reply to ID: ${rawId}`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('📸💬 Meta IG Public Reply Error Details:', errorData.error);
      throw new Error(`Failed to send public reply to IG comment: ${errorData.error?.message}`);
    }

    const result = await response.json();
    console.log(`📸💬 [IG_PUBLIC_REPLY] Success: ${result.id || 'ok'}`);
    return result;
  } catch (error) {
    console.error('📸💬 Error in replyToInstagramComment helper:', error);
    throw error;
  }
}

/**
 * Sends a private DM to the author of an Instagram comment
 * Uses the standard /{page_id}/messages endpoint with recipient: { comment_id: ... }
 * @param pageId - The Facebook Page ID
 * @param commentId - The Instagram comment ID to reply to
 * @param text - The message text
 * @param pageAccessToken - The page access token
 * @returns Promise with the response
 */
export async function sendPrivateReplyToInstagramComment(
  pageId: string,
  commentId: string,
  text: string,
  pageAccessToken: string
): Promise<any> {
  try {
    const rawCommentId = String(commentId).trim();
    if (!rawCommentId || rawCommentId === 'undefined') {
      throw new Error('Comment ID is missing or "undefined"');
    }

    const payload = {
      recipient: { comment_id: rawCommentId },
      message: { text: text }
    };
    
    const apiUrl = `https://graph.facebook.com/v24.0/${pageId}/messages?access_token=${pageAccessToken}`;
    console.log(`📸💬 [IG_PRIVATE_REPLY] Attempting PM via comment ID: ${rawCommentId}`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      
      // Handle the "already replied" error gracefully
      if (errorData.error?.code === 100 && errorData.error?.error_subcode === 2018042) {
        console.warn(`📸💬 [IG_PRIVATE_REPLY] Skipping: Comment already has a private reply.`);
        return { already_replied: true };
      }
      
      console.error('📸💬 Meta IG Private Reply Error Details:', errorData.error);
      throw new Error(`Failed to send private reply to IG comment: ${errorData.error?.message}`);
    }

    const result = await response.json();
    console.log(`📸💬 [IG_PRIVATE_REPLY] Success: ${result.message_id || 'ok'}`);
    return result;
  } catch (error) {
    console.error('📸💬 Error in sendPrivateReplyToInstagramComment helper:', error);
    throw error;
  }
}
