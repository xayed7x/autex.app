import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { FacebookWebhookPayload } from '@/lib/facebook/utils';
import {
  processMessagingEvent,
  processCommentEvent,
} from '@/app/api/webhooks/facebook/route';

/**
 * Allow up to 60 seconds for background processing.
 * This is the heavy-lifting route that the webhook fires-and-forgets to.
 */
export const maxDuration = 60;

/**
 * POST /api/internal/process-event
 *
 * Internal-only route called by the Facebook webhook handler.
 * Receives the already-validated webhook payload and runs the
 * full processing pipeline (messaging events, comment events).
 *
 * Authenticated via x-internal-secret header (matches SUPABASE_SERVICE_ROLE_KEY).
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('⚙️ [INTERNAL] Background processing started at:', new Date().toISOString());

  try {
    // ========================================
    // STEP 1: AUTHENTICATE INTERNAL CALL
    // ========================================
    const internalSecret = request.headers.get('x-internal-secret');
    const expectedSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!internalSecret || internalSecret !== expectedSecret) {
      console.error('❌ [INTERNAL] Unauthorized internal call');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ========================================
    // STEP 2: PARSE PAYLOAD
    // ========================================
    const payload: FacebookWebhookPayload = await request.json();

    if (!payload.entry || payload.entry.length === 0) {
      console.log('⚠️ [INTERNAL] No entries in payload');
      return NextResponse.json({ status: 'no_entries' }, { status: 200 });
    }

    // ========================================
    // STEP 3: CREATE SUPABASE CLIENT
    // ========================================
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // ========================================
    // STEP 4: PROCESS EACH ENTRY
    // ========================================
    for (const entry of payload.entry) {
      console.log(`🔄 [INTERNAL] Processing entry: ${entry.id}`);

      // Process messaging events (Direct Messages)
      if (entry.messaging) {
        for (const event of entry.messaging) {
          try {
            await processMessagingEvent(supabase, entry.id, event);
          } catch (eventError: any) {
            console.error(`❌ [INTERNAL] Error processing messaging event:`, eventError.message);
          }
        }
      }

      // Handle feed/comment events
      if (entry.changes) {
        for (const change of entry.changes) {
          if (
            change.field === 'feed' &&
            change.value?.item === 'comment' &&
            change.value?.verb === 'add' &&
            change.value?.message
          ) {
            try {
              await processCommentEvent(supabase, entry.id, change.value);
            } catch (commentError: any) {
              console.error(`❌ [INTERNAL] Error processing comment event:`, commentError.message);
            }
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ [INTERNAL] Background processing completed in ${duration}ms`);
    return NextResponse.json({ status: 'processed', duration }, { status: 200 });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ [INTERNAL] Background processing failed after ${duration}ms:`, error.message);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
