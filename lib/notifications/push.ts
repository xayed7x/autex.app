import webpush from 'web-push';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@autex.app';

if (!vapidPublicKey || !vapidPrivateKey) {
  console.warn('VAPID keys are not set. Push notifications will not work.');
} else {
  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  );
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  data?: any;
}

/**
 * Sends a push notification to a specific subscription
 */
export async function sendPushNotification(
  subscription: webpush.PushSubscription,
  payload: PushPayload
) {
  try {
    const payloadString = JSON.stringify(payload);
    await webpush.sendNotification(subscription, payloadString);
    return { success: true };
  } catch (error: any) {
    console.error('Error sending push notification:', error);
    
    // If the subscription is no longer valid (expired or revoked), we should let the caller know
    if (error.statusCode === 404 || error.statusCode === 410) {
      return { success: false, expired: true };
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Sends push notifications to all subscriptions for a given workspace/user
 * This should be called from the server (e.g. webhook handler)
 */
export async function notifyAdmins(
  supabase: any,
  workspaceId: string,
  payload: PushPayload
) {
  // Fetch all subscriptions for this workspace
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('workspace_id', workspaceId);

  if (error || !subscriptions) {
    console.error('Error fetching push subscriptions:', error);
    return;
  }

  const results = await Promise.all(
    subscriptions.map(async (sub: any) => {
      const result = await sendPushNotification(sub.subscription, payload);
      
      // If subscription is expired, remove it from DB
      if (result.expired) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('id', sub.id);
      }
      
      return result;
    })
  );

  return results;
}
