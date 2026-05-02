import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  sendTrialEndingEmail, 
  sendTrialExpiredEmail, 
  sendRenewalReminderEmail, 
  sendSubscriptionExpiredEmail 
} from '@/lib/email/send';
import { SUBSCRIPTION_PLANS } from '@/lib/subscription/utils';

export const dynamic = 'force-dynamic';

/**
 * Helper to get owner email from workspace
 */
async function getOwnerEmail(
  supabase: SupabaseClient,
  ownerId: string
): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.admin.getUserById(ownerId);
    return user?.email || null;
  } catch (error) {
    console.error('[Cron] Failed to get owner email:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // 1. Security Check
    const authHeader = request.headers.get('authorization');
    const vercelCronHeader = request.headers.get('x-vercel-cron');
    const netlifyCronHeader = request.headers.get('x-netlify-event');
    const cronSecret = process.env.CRON_SECRET;
    
    const isDev = process.env.NODE_ENV === 'development';
    
    // Valid if:
    // 1. Correct Bearer token (from GitHub Actions or manual)
    // 2. Vercel Native Cron (x-vercel-cron header)
    // 3. Netlify Native Cron (x-netlify-event header)
    // 4. Development mode
    const isValidAuth = 
      (cronSecret && authHeader === `Bearer ${cronSecret}`) || 
      (vercelCronHeader === '1') ||
      (netlifyCronHeader === 'scheduled');
    
    if (!isDev && !isValidAuth) {
      console.error('[Cron] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date();
    const nowISO = now.toISOString();
    
    // Calculate tomorrow for "ending soon" checks
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString();
    
    // Calculate 14 days from now for renewal reminders
    const fourteenDays = new Date(now);
    fourteenDays.setDate(fourteenDays.getDate() + 14);
    const fourteenDaysISO = fourteenDays.toISOString();

    const emailResults = {
      trialEndingReminders: 0,
      trialExpiredEmails: 0,
      renewalReminders: 0,
      subscriptionExpiredEmails: 0,
    };

    // ==========================================
    // 2. Send Trial Ending Reminders (3, 2, 1 days before)
    // ==========================================
    const { data: trialsSoon } = await supabase
      .from('workspaces')
      .select('id, name, owner_id, trial_ends_at, last_reminder_sent_at')
      .eq('subscription_status', 'trial')
      .gte('trial_ends_at', nowISO)
      .lt('trial_ends_at', threeDaysISO);

    for (const workspace of trialsSoon || []) {
      const expiryDate = new Date(workspace.trial_ends_at!);
      const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // Check if we already sent a reminder today
      const lastSent = workspace.last_reminder_sent_at ? new Date(workspace.last_reminder_sent_at) : null;
      const sentToday = lastSent && lastSent.toDateString() === now.toDateString();

      if (daysRemaining >= 1 && daysRemaining <= 3 && !sentToday) {
        const ownerEmail = await getOwnerEmail(supabase, workspace.owner_id);
        if (ownerEmail) {
          const result = await sendTrialEndingEmail(
            ownerEmail, 
            workspace.name, 
            expiryDate,
            daysRemaining
          );
          if (result.success) {
            emailResults.trialEndingReminders++;
            await supabase
              .from('workspaces')
              .update({ last_reminder_sent_at: nowISO })
              .eq('id', workspace.id);
          }
        }
      }
    }

    // ==========================================
    // 3. Expire Trials & Send Emails
    // ==========================================
    const { data: expiredTrials, error: trialError } = await supabase
      .from('workspaces')
      .update({ subscription_status: 'expired' })
      .eq('subscription_status', 'trial')
      .lt('trial_ends_at', nowISO)
      .select('id, name, owner_id');

    if (trialError) {
      console.error('Error expiring trials:', trialError);
    }

    // Send trial expired emails
    for (const workspace of expiredTrials || []) {
      const ownerEmail = await getOwnerEmail(supabase, workspace.owner_id);
      if (ownerEmail) {
        const result = await sendTrialExpiredEmail(ownerEmail, workspace.name);
        if (result.success) emailResults.trialExpiredEmails++;
      }
    }

    // ==========================================
    // 4. Send Renewal Reminders (14 days, then 3, 2, 1 days before)
    // ==========================================
    const { data: renewalSoon } = await supabase
      .from('workspaces')
      .select('id, name, owner_id, subscription_plan, subscription_expires_at, last_reminder_sent_at')
      .eq('subscription_status', 'active')
      .gte('subscription_expires_at', nowISO)
      .lt('subscription_expires_at', fourteenDaysISO);

    for (const workspace of renewalSoon || []) {
      const expiryDate = new Date(workspace.subscription_expires_at!);
      const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // Check if we already sent a reminder today
      const lastSent = workspace.last_reminder_sent_at ? new Date(workspace.last_reminder_sent_at) : null;
      const sentToday = lastSent && lastSent.toDateString() === now.toDateString();

      // We send reminders at 14 days, and then 3, 2, 1 days
      const shouldNotify = (daysRemaining === 14 || (daysRemaining >= 1 && daysRemaining <= 3)) && !sentToday;

      if (shouldNotify) {
        const ownerEmail = await getOwnerEmail(supabase, workspace.owner_id);
        if (ownerEmail) {
          const planInfo = SUBSCRIPTION_PLANS[workspace.subscription_plan as keyof typeof SUBSCRIPTION_PLANS];
          const planName = planInfo?.name || workspace.subscription_plan || 'Subscription';
          
          const result = await sendRenewalReminderEmail(
            ownerEmail,
            workspace.name,
            planName,
            expiryDate,
            daysRemaining
          );
          if (result.success) {
            emailResults.renewalReminders++;
            await supabase
              .from('workspaces')
              .update({ last_reminder_sent_at: nowISO })
              .eq('id', workspace.id);
          }
        }
      }
    }

    // ==========================================
    // 5. Expire Active Subscriptions & Send Emails
    // ==========================================
    const { data: expiredSubs, error: subError } = await supabase
      .from('workspaces')
      .update({ subscription_status: 'expired' })
      .eq('subscription_status', 'active')
      .lt('subscription_expires_at', nowISO)
      .select('id, name, owner_id, subscription_plan');

    if (subError) {
      console.error('Error expiring subscriptions:', subError);
    }

    // Send subscription expired emails
    for (const workspace of expiredSubs || []) {
      const ownerEmail = await getOwnerEmail(supabase, workspace.owner_id);
      if (ownerEmail) {
        const planInfo = SUBSCRIPTION_PLANS[workspace.subscription_plan as keyof typeof SUBSCRIPTION_PLANS];
        const planName = planInfo?.name || workspace.subscription_plan || 'Subscription';
        
        const result = await sendSubscriptionExpiredEmail(ownerEmail, workspace.name, planName);
        if (result.success) emailResults.subscriptionExpiredEmails++;
      }
    }

    const trialCount = expiredTrials?.length || 0;
    const subCount = expiredSubs?.length || 0;

    console.log(`[Cron] Processed. Trials expired: ${trialCount}, Subs expired: ${subCount}`);
    console.log(`[Cron] Emails sent:`, emailResults);

    return NextResponse.json({
      success: true,
      processed: {
        expiredTrials: trialCount,
        expiredSubscriptions: subCount,
        total: trialCount + subCount
      },
      emailsSent: emailResults,
      timestamp: nowISO
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
