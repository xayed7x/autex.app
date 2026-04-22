/**
 * Supabase Database Webhook Handler
 * 
 * Handles database events from Supabase webhooks.
 * Currently handles:
 * - New user signup → Send welcome email
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWelcomeEmail, sendAdminNewUserEmail } from '@/lib/email/send';

// Webhook payload types
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
    const authHeader = request.headers.get('x-supabase-webhook-secret') 
      || request.headers.get('authorization');
    
    // Skip verification in development, require in production
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev && webhookSecret && authHeader !== webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      console.warn('[Webhook] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload: WebhookPayload = await request.json();
    console.log('[Webhook] Received:', payload.type, payload.table);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Handle new workspace creation (user signup)
    if (payload.type === 'INSERT' && payload.table === 'workspaces' && payload.record) {
      const workspaceId = payload.record.id as string;
      const ownerId = payload.record.owner_id as string;
      const workspaceName = payload.record.name as string;
      const trialEndsAt = payload.record.trial_ends_at as string;

      if (!ownerId || !trialEndsAt) {
        console.log('[Webhook] Missing owner_id or trial_ends_at, skipping welcome email');
        return NextResponse.json({ success: true, skipped: true });
      }

      // Get owner's email
      const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(ownerId);

      if (userError || !user?.email) {
        console.error('[Webhook] Could not get owner email:', userError);
        return NextResponse.json({ 
          success: false, 
          error: 'Could not get owner email' 
        });
      }

      // Try to get phone number from profiles if it exists
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', ownerId)
        .single();

      // Send welcome email to user
      const result = await sendWelcomeEmail(
        user.email,
        workspaceName,
        new Date(trialEndsAt)
      );

      console.log('[Webhook] Welcome email result:', result);

      // Send admin notification about new signup
      const adminResult = await sendAdminNewUserEmail(
        user.user_metadata?.full_name || workspaceName,
        user.email,
        workspaceName,
        new Date(trialEndsAt),
        workspaceId,
        profile?.phone || undefined
      );

      console.log('[Webhook] Admin notification result:', adminResult);

      return NextResponse.json({
        success: true,
        emailSent: result.success,
        emailId: result.id,
        adminNotified: adminResult.success,
        workspace: workspaceId,
      });
    }

    // Handle other events as needed
    return NextResponse.json({ 
      success: true, 
      message: 'Event received but no action taken' 
    });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
