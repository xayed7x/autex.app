/**
 * Subscription Utility Functions
 * 
 * Core logic for checking subscription status, bot permissions,
 * and calculating expiry dates in Bangladesh timezone (GMT+6).
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

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
      'Overages: ৳3/extra customer'
    ] 
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
      'Overages: ৳3/extra customer'
    ] 
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
      'Overages: ৳3/extra customer'
    ] 
  },
} as const

export type SubscriptionStatus = 'trial' | 'active' | 'expired'
export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PLANS

export interface SubscriptionInfo {
  status: SubscriptionStatus
  plan: SubscriptionPlan | null
  daysRemaining: number
  expiresAt: Date | null
  trialEndsAt: Date | null
  canUseBot: boolean
  isPaused: boolean
  pausedReason: string | null
  lastPaymentDate: Date | null
  totalPaid: number
}

export interface BotPermission {
  allowed: boolean
  reason: string
}

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
 * Calculate expiry date from today with days added
 * Sets time to 23:59:59 Bangladesh time
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
 * Get full subscription status for a workspace
 */
export async function getSubscriptionStatus(
  workspaceId: string,
  supabase?: ReturnType<typeof createClient<Database>>
): Promise<SubscriptionInfo> {
  // Create service role client if not provided
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
  const trialEndsAt = workspace.trial_ends_at ? new Date(workspace.trial_ends_at) : null
  const subscriptionExpiresAt = workspace.subscription_expires_at ? new Date(workspace.subscription_expires_at) : null
  const isPaused = workspace.admin_paused || false
  const pausedReason = workspace.admin_paused_reason || null
  const lastPaymentDate = workspace.last_payment_date ? new Date(workspace.last_payment_date) : null
  const totalPaid = workspace.total_paid || 0

  // Calculate expiry based on status
  let expiresAt: Date | null = null
  let daysRemaining = 0

  if (status === 'trial' && trialEndsAt) {
    expiresAt = trialEndsAt
    daysRemaining = calculateDaysRemaining(trialEndsAt)
  } else if (status === 'active' && subscriptionExpiresAt) {
    expiresAt = subscriptionExpiresAt
    daysRemaining = calculateDaysRemaining(subscriptionExpiresAt)
  }

  // Check if can use bot
  const canUseBot = checkCanUseBot(status, expiresAt, isPaused)

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
 * Check if subscription allows bot usage
 */
function checkCanUseBot(
  status: SubscriptionStatus,
  expiresAt: Date | null,
  isPaused: boolean
): boolean {
  // If admin paused, bot cannot be used
  if (isPaused) return false

  // Check status
  if (status === 'expired') return false

  // For trial and active, check if not expired
  if (!expiresAt) return false

  const now = new Date()
  return expiresAt > now
}

// Admin email that is exempt from subscription checks
const ADMIN_EMAIL = 'admin@gmail.com'

/**
 * Quick check for bot permission (used in webhook)
 * Admin workspaces are always allowed
 */
export async function checkBotPermission(
  workspaceId: string,
  supabase?: ReturnType<typeof createClient<Database>>
): Promise<BotPermission> {
  // Create service role client if not provided
  const client = supabase || createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // First check if this is an admin workspace
  const { data: workspace } = await client
    .from('workspaces')
    .select('owner_id')
    .eq('id', workspaceId)
    .single()

  if (workspace?.owner_id) {
    // Get admin emails from env or fallback
    const adminEmails = (process.env.ADMIN_EMAILS || ADMIN_EMAIL).split(',').map(e => e.trim().toLowerCase())
    
    // Get owner's email via auth admin API
    try {
      const { data: { user: ownerUser } } = await client.auth.admin.getUserById(workspace.owner_id)
      
      if (ownerUser?.email && adminEmails.includes(ownerUser.email.toLowerCase())) {
        return { allowed: true, reason: 'Admin workspace - exempt from subscription' }
      }
    } catch (e) {
      // If getUserById fails, continue with normal check
      console.warn('Could not fetch owner user for admin check:', e)
    }
  }

  // Not admin, proceed with normal subscription check
  const status = await getSubscriptionStatus(workspaceId, client)

  if (status.isPaused) {
    return { 
      allowed: false, 
      reason: `Admin paused: ${status.pausedReason || 'No reason specified'}` 
    }
  }

  if (status.status === 'expired') {
    return { allowed: false, reason: 'Subscription expired' }
  }

  if (!status.canUseBot) {
    if (status.status === 'trial') {
      return { allowed: false, reason: 'Trial period has ended' }
    }
    return { allowed: false, reason: 'Subscription has ended' }
  }

  return { allowed: true, reason: 'Active subscription' }
}

/**
 * Check if subscription is currently active (trial or paid)
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
    case 'trial':
      return status.daysRemaining > 0 
        ? `Trial - ${status.daysRemaining} day${status.daysRemaining === 1 ? '' : 's'} left`
        : 'Trial Expired'
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
