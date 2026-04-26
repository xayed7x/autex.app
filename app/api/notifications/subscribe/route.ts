import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/notifications/subscribe
 * Registers or updates a push subscription
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subscription, workspaceId, deviceType } = await request.json();

    if (!subscription || !workspaceId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if this exact subscription already exists for this user
    // We store the subscription object as JSONB
    const { data: existing } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .contains('subscription', { endpoint: subscription.endpoint })
      .single();

    if (existing) {
      // Update existing subscription
      await supabase
        .from('push_subscriptions')
        .update({
          subscription,
          workspace_id: workspaceId,
          device_type: deviceType,
          created_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      
      return NextResponse.json({ success: true, updated: true });
    }

    // Create new subscription
    const { error } = await supabase
      .from('push_subscriptions')
      .insert({
        user_id: user.id,
        workspace_id: workspaceId,
        subscription,
        device_type: deviceType,
      });

    if (error) {
      console.error('Error saving push subscription:', error);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in subscribe route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/notifications/subscribe
 * Removes a push subscription (unsubscription)
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .contains('subscription', { endpoint });

    if (error) {
      console.error('Error deleting push subscription:', error);
      return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in unsubscribe route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
