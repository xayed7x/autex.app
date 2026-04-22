/**
 * Email Sending Functions
 * 
 * All email sending logic goes through this module.
 * Uses Resend API with React Email templates.
 */

import { resend, FROM_EMAIL } from './index';
import { WelcomeEmail } from './templates/welcome';
import { TrialEndingEmail } from './templates/trial-ending';
import { TrialExpiredEmail } from './templates/trial-expired';
import { SubscriptionActivatedEmail } from './templates/subscription-activated';
import { RenewalReminderEmail } from './templates/renewal-reminder';
import { SubscriptionExpiredEmail } from './templates/subscription-expired';

interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Format date for display in emails
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Send welcome email to new users
 */
export async function sendWelcomeEmail(
  to: string,
  businessName: string,
  trialEndDate: Date
): Promise<SendEmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: '🎉 Welcome to Autex AI! Your trial has started',
      react: WelcomeEmail({
        businessName,
        trialEndDate: formatDate(trialEndDate),
      }),
    });

    if (error) {
      console.error('[Email] Failed to send welcome email:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Welcome email sent to ${to}, ID: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] Error sending welcome email:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Send trial ending reminder (1 day before)
 */
export async function sendTrialEndingEmail(
  to: string,
  businessName: string,
  expiryDate: Date
): Promise<SendEmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: '⏰ Your Autex AI trial ends tomorrow!',
      react: TrialEndingEmail({
        businessName,
        expiryDate: formatDate(expiryDate),
      }),
    });

    if (error) {
      console.error('[Email] Failed to send trial ending email:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Trial ending email sent to ${to}, ID: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] Error sending trial ending email:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Send trial expired notification
 */
export async function sendTrialExpiredEmail(
  to: string,
  businessName: string
): Promise<SendEmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: '😔 Your Autex AI trial has expired',
      react: TrialExpiredEmail({
        businessName,
      }),
    });

    if (error) {
      console.error('[Email] Failed to send trial expired email:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Trial expired email sent to ${to}, ID: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] Error sending trial expired email:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Send subscription activated confirmation
 */
export async function sendSubscriptionActivatedEmail(
  to: string,
  businessName: string,
  planName: string,
  expiryDate: Date,
  daysRemaining: number,
  amount?: number,
  paymentMethod?: string,
  transactionId?: string
): Promise<SendEmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `🎉 Your ${planName} subscription is now active!`,
      react: SubscriptionActivatedEmail({
        businessName,
        planName,
        expiryDate: formatDate(expiryDate),
        daysRemaining,
        amount,
        paymentMethod,
        transactionId,
      }),
    });

    if (error) {
      console.error('[Email] Failed to send subscription activated email:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Subscription activated email sent to ${to}, ID: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] Error sending subscription activated email:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Send renewal reminder (3 days before expiry)
 */
export async function sendRenewalReminderEmail(
  to: string,
  businessName: string,
  planName: string,
  expiryDate: Date,
  daysRemaining: number
): Promise<SendEmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `📅 Your Autex subscription expires in ${daysRemaining} days`,
      react: RenewalReminderEmail({
        businessName,
        planName,
        expiryDate: formatDate(expiryDate),
        daysRemaining,
      }),
    });

    if (error) {
      console.error('[Email] Failed to send renewal reminder email:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Renewal reminder email sent to ${to}, ID: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] Error sending renewal reminder email:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Send subscription expired notification
 */
export async function sendSubscriptionExpiredEmail(
  to: string,
  businessName: string,
  planName: string
): Promise<SendEmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: '⚠️ Your Autex AI subscription has expired',
      react: SubscriptionExpiredEmail({
        businessName,
        planName,
      }),
    });

    if (error) {
      console.error('[Email] Failed to send subscription expired email:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Subscription expired email sent to ${to}, ID: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] Error sending subscription expired email:', err);
    return { success: false, error: String(err) };
  }
}

// ============================================
// ADMIN NOTIFICATION EMAILS
// ============================================

import { AdminNewUserEmail } from './templates/admin-new-user';
import { AdminSubscriptionEmail } from './templates/admin-subscription';

// Admin email address for notifications
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@gmail.com';

/**
 * Send admin notification for new user signup
 */
export async function sendAdminNewUserEmail(
  userName: string,
  userEmail: string,
  businessName: string,
  trialEndsAt: Date,
  workspaceId?: string,
  phoneNumber?: string
): Promise<SendEmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `🆕 New User: ${businessName} just signed up!`,
      react: AdminNewUserEmail({
        userName,
        userEmail,
        businessName,
        signupDate: formatDate(new Date()),
        trialEndsAt: formatDate(trialEndsAt),
        workspaceId,
        phoneNumber,
      }),
    });

    if (error) {
      console.error('[Email] Failed to send admin new user email:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Admin new user notification sent, ID: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] Error sending admin new user email:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Send admin notification for subscription activation
 */
export async function sendAdminSubscriptionEmail(
  businessName: string,
  userEmail: string,
  planName: string,
  amount: number,
  paymentMethod: string,
  durationDays: number,
  expiresAt: Date,
  transactionId?: string,
  isRenewal: boolean = false
): Promise<SendEmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `💰 ${isRenewal ? 'Renewal' : 'New Sale'}: ${businessName} - ৳${amount}`,
      react: AdminSubscriptionEmail({
        businessName,
        userEmail,
        planName,
        amount,
        paymentMethod,
        durationDays,
        expiresAt: formatDate(expiresAt),
        transactionId,
        isRenewal,
      }),
    });

    if (error) {
      console.error('[Email] Failed to send admin subscription email:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Admin subscription notification sent, ID: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] Error sending admin subscription email:', err);
    return { success: false, error: String(err) };
  }
}

