/**
 * Subscription Utility Functions
 *
 * Core logic for checking subscription status, bot permissions,
 * and calculating expiry dates in Bangladesh timezone (GMT+6).
 *
 * Model: Freemium — 100 unique customers per rolling 30-day window.
 * No time limit. Upgrade required only when limit is reached.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { resend, FROM_EMAIL } from '@/lib/email'

// Contact numbers for payment
export const CONTACT_NUMBERS = {
  whatsapp: '01977994057',
  bkash: '01915969330',
} as const

// Subscription plans with pricing (BDT)
export const SUBSCRIPTION_PLANS = {
  starter: {
    name: 'Starter',
    price: 1499,
    yearlyPrice: 14990,
    features: [
      'Unlimited Products',
      '500 Customers/Month',
      'Unlimited Comments',
      'Unlimited Conversations',
      'Overages: ৳3/extra customer',
    ],
  },
  growth: {
    name: 'Growth',
    price: 2999,
    yearlyPrice: 29990,
    features: [
      'Unlimited Products',
      '1,500 Customers/Month',
      'Unlimited Comments',
      'Unlimited Conversations',
      'Priority Support',
      'Overages: ৳3/extra customer',
    ],
  },
  pro: {
    name: 'Pro',
    price: 5999,
    yearlyPrice: 59990,
    features: [
      'Unlimited Products',
      '3,500 Customers/Month',
      'Unlimited Comments',
      'Unlimited Conversations',
      'Dedicated Support',
      'Overages: ৳3/extra customer',
    ],
  },
} as const

export type SubscriptionStatus = 'freemium' | 'active' | 'expired'
export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PLANS

export interface SubscriptionInfo {
  status: SubscriptionStatus
  plan: SubscriptionPlan | null
  daysRemaining: number
  expiresAt: Date | null
  trialEndsAt: Date | null // kept for schema compatibility — not used in logic
  canUseBot: boolean
  isPaused: boolean
  pausedReason: string | null
  lastPaymentDate: Date | null
  totalPaid: number
}

export interface BotPermission {
  allowed: boolean
  reason: string
  code?: 'EXPIRED' | 'LIMIT_REACHED' | 'PAUSED'
}

// Freemium window constants
const FREEMIUM_CUSTOMER_LIMIT = 100
const FREEMIUM_WINDOW_DAYS = 30

/**
 * Get Bangladesh timezone offset in hours
 */
const BD_TIMEZONE_OFFSET = 6 // GMT+6

/**
 * Get current time in Bangladesh timezone
 */
export function getBangladeshTime(): Date {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  return new Date(utc + BD_TIMEZONE_OFFSET * 3600000)
}

/**
 * Calculate expiry date from today with days added.
 * Sets time to 23:59:59 Bangladesh time.
 */
export function calculateExpiryDate(days: number): Date {
  const bdNow = getBangladeshTime()
  const expiry = new Date(bdNow)
  expiry.setDate(expiry.getDate() + days)
  expiry.setHours(23, 59, 59, 999)
  return expiry
}

/**
 * Calculate days remaining until a date
 */
export function calculateDaysRemaining(expiryDate: Date | null): number {
  if (!expiryDate) return 0

  const now = new Date()
  const diffMs = expiryDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  return Math.max(0, diffDays)
}

/**
 * Send the freemium limit-reached notification email to the workspace owner.
 * Called once per window — guarded by freemium_notified_at in DB.
 */
export async function sendFreemiumLimitEmail(
  workspaceId: string,
  ownerEmail: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ownerEmail,
      subject: 'আপনার Autex AI ফ্রি লিমিট শেষ হয়েছে',
      text: `আপনার এই মাসের ১০০ জন বিনামূল্যে কাস্টমার লিমিট পূর্ণ হয়েছে।

আপনার বট এখন pause করা হয়েছে। আপনি চাইলে dashboard থেকে manually reply করতে পারবেন।

সার্ভিস চালু রাখতে যেকোনো একটি plan-এ upgrade করুন:
👉 https://autexai.com/pricing

— Autex AI Team`,
    })
    console.log(`[FREEMIUM] Limit-reached email sent to ${ownerEmail} for workspace ${workspaceId}`)
  } catch (err) {
    console.error(`[FREEMIUM] Failed to send limit-reached email for workspace ${workspaceId}:`, err)
  }
}

/**
 * Get full subscription status for a workspace
 */
export async function getSubscriptionStatus(
  workspaceId: string,
  supabase?: ReturnType<typeof createClient<Database>>
): Promise<SubscriptionInfo> {
  const client = supabase || createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: workspace, error } = await client
    .from('workspaces')
    .select(`
      subscription_status,
      subscription_plan,
      trial_ends_at,
      subscription_expires_at,
      admin_paused,
      admin_paused_reason,
      last_payment_date,
      total_paid
    `)
    .eq('id', workspaceId)
    .single()

  if (error || !workspace) {
    console.error('Error fetching subscription status:', error)
    return {
      status: 'expired',
      plan: null,
      daysRemaining: 0,
      expiresAt: null,
      trialEndsAt: null,
      canUseBot: false,
      isPaused: false,
      pausedReason: null,
      lastPaymentDate: null,
      totalPaid: 0,
    }
  }

  const status = (workspace.subscription_status as SubscriptionStatus) || 'expired'
  const plan = workspace.subscription_plan as SubscriptionPlan | null
  // trial_ends_at is kept in schema for history — not used in active logic
  const trialEndsAt = (workspace as any).trial_ends_at
    ? new Date((workspace as any).trial_ends_at)
    : null
  const subscriptionExpiresAt = workspace.subscription_expires_at
    ? new Date(workspace.subscription_expires_at)
    : null
  const isPaused = workspace.admin_paused || false
  const pausedReason = workspace.admin_paused_reason || null
  const lastPaymentDate = workspace.last_payment_date
    ? new Date(workspace.last_payment_date)
    : null
  const totalPaid = workspace.total_paid || 0

  // Calculate expiry and days remaining
  let expiresAt: Date | null = null
  let daysRemaining = 0

  if (status === 'active' && subscriptionExpiresAt) {
    expiresAt = subscriptionExpiresAt
    daysRemaining = calculateDaysRemaining(subscriptionExpiresAt)
  }

  const canUseBot = !isPaused && (status === 'freemium' || (status === 'active' && !!expiresAt && expiresAt > new Date()))

  return {
    status,
    plan,
    daysRemaining,
    expiresAt,
    trialEndsAt,
    canUseBot,
    isPaused,
    pausedReason,
    lastPaymentDate,
    totalPaid,
  }
}

/**
 * Quick check for bot permission (used in webhook).
 *
 * Check order:
 *  1. Admin pause check
 *  2. Admin email exemption (moves above all other checks)
 *  3. Active paid subscription check
 *  4. Freemium 100-customer / 30-day rolling window check
 *  5. Expired / unknown fallback
 */
export async function checkBotPermission(
  workspaceId: string,
  supabase?: ReturnType<typeof createClient<Database>>
): Promise<BotPermission> {
  const client = supabase || createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Fetch workspace in a single query with all fields needed for every check
  const { data: workspace, error } = await client
    .from('workspaces')
    .select(`
      owner_id,
      subscription_status,
      subscription_expires_at,
      admin_paused,
      admin_paused_reason,
      freemium_period_start,
      freemium_notified_at,
      created_at
    `)
    .eq('id', workspaceId)
    .single()

  if (error || !workspace) {
    console.error('[checkBotPermission] Failed to fetch workspace:', error)
    return { allowed: false, reason: 'Workspace not found', code: 'EXPIRED' }
  }

  // ── 1. Admin Pause ──────────────────────────────────────────────────
  if (workspace.admin_paused) {
    return {
      allowed: false,
      reason: `Admin paused: ${workspace.admin_paused_reason || 'No reason specified'}`,
      code: 'PAUSED',
    }
  }

  const status = workspace.subscription_status as SubscriptionStatus
  const subscriptionExpiresAt = workspace.subscription_expires_at
    ? new Date(workspace.subscription_expires_at)
    : null
  const now = new Date()

  // ── 3. Active Paid Subscription ──────────────────────────────────────
  if (status === 'active') {
    if (subscriptionExpiresAt && now < subscriptionExpiresAt) {
      return { allowed: true, reason: 'Active subscription' }
    }

    // Subscription expired — mark in DB and block
    await client
      .from('workspaces')
      .update({ subscription_status: 'expired' } as any)
      .eq('id', workspaceId)

    return { allowed: false, code: 'EXPIRED', reason: 'Subscription has ended' }
  }

  // ── 4. Freemium Rolling Window ───────────────────────────────────────
  if (status === 'freemium') {
    // a. Determine window start (fallback to created_at if column is null)
    const rawPeriodStart = (workspace as any).freemium_period_start || workspace.created_at
    let windowStart = new Date(rawPeriodStart)

    // b. Window boundaries
    const windowEnd = new Date(windowStart)
    windowEnd.setDate(windowEnd.getDate() + FREEMIUM_WINDOW_DAYS)

    // c. If NOW() is past the window end → reset the period
    if (now >= windowEnd) {
      await client
        .from('workspaces')
        .update({
          freemium_period_start: now.toISOString(),
          freemium_notified_at: null,
        } as any)
        .eq('id', workspaceId)

      return { allowed: true, reason: 'Freemium - new period started' }
    }

    // d. Count distinct conversations created in the current window
    const { count, error: countError } = await client
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('created_at', windowStart.toISOString())
      .lt('created_at', windowEnd.toISOString())

    if (countError) {
      console.error('[checkBotPermission] Error counting freemium conversations:', countError)
      // Fail open to avoid blocking on transient DB errors
      return { allowed: true, reason: 'Freemium - count check failed (fail open)' }
    }

    // e. Within limit
    if ((count ?? 0) < FREEMIUM_CUSTOMER_LIMIT) {
      return { allowed: true, reason: 'Freemium - within limit' }
    }

    // f. Limit reached — send one-time notification email
    const freemiumNotifiedAt = (workspace as any).freemium_notified_at

    if (!freemiumNotifiedAt && workspace.owner_id) {
      try {
        const { data: { user: ownerUser } } = await client.auth.admin.getUserById(workspace.owner_id)

        if (ownerUser?.email) {
          // Fire-and-forget — do not await to avoid blocking the webhook
          sendFreemiumLimitEmail(workspaceId, ownerUser.email)

          await client
            .from('workspaces')
            .update({ freemium_notified_at: now.toISOString() } as any)
            .eq('id', workspaceId)
        }
      } catch (e) {
        console.error('[checkBotPermission] Failed to send freemium limit email:', e)
      }
    }

    return {
      allowed: false,
      code: 'LIMIT_REACHED',
      reason: 'Freemium limit reached',
    }
  }

  // ── 5. Expired / Unknown fallback ────────────────────────────────────
  return { allowed: false, code: 'EXPIRED', reason: 'Subscription has ended' }
}

/**
 * Check if subscription is currently active (freemium within limit or paid)
 */
export async function isSubscriptionActive(
  workspaceId: string,
  supabase?: ReturnType<typeof createClient<Database>>
): Promise<boolean> {
  const status = await getSubscriptionStatus(workspaceId, supabase)
  return status.canUseBot
}

/**
 * Format subscription status for display
 */
export function formatSubscriptionStatus(status: SubscriptionInfo): string {
  if (status.isPaused) {
    return 'Paused by Admin'
  }

  switch (status.status) {
    case 'freemium':
      return 'Free Plan'
    case 'active':
      return status.plan
        ? `${SUBSCRIPTION_PLANS[status.plan].name} - ${status.daysRemaining} day${status.daysRemaining === 1 ? '' : 's'} left`
        : `Active - ${status.daysRemaining} days left`
    case 'expired':
      return 'Expired'
    default:
      return 'Unknown'
  }
}

/**
 * Format date for display (Bangladesh locale)
 */
export function formatExpiryDate(date: Date | null): string {
  if (!date) return 'N/A'

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Get WhatsApp link for payment contact
 */
export function getWhatsAppLink(workspaceName?: string): string {
  const message = workspaceName
    ? `Hi, I want to renew my Autex subscription for "${workspaceName}".`
    : 'Hi, I want to renew my Autex subscription.'

  return `https://wa.me/880${CONTACT_NUMBERS.whatsapp}?text=${encodeURIComponent(message)}`
}
