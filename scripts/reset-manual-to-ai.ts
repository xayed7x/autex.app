
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function resetAllManualConversations() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log('🔄 Fetching all conversations in manual mode...');

  // 1. Find all conversations where control_mode is 'manual'
  const { data: manualConvs, error: fetchError } = await supabase
    .from('conversations')
    .select('id, workspace_id')
    .eq('control_mode', 'manual');

  if (fetchError) {
    console.error('Error fetching conversations:', fetchError);
    return;
  }

  if (!manualConvs || manualConvs.length === 0) {
    console.log('✅ No conversations are currently in manual mode.');
    return;
  }

  console.log(`🚀 Found ${manualConvs.length} conversations. Switching to AI mode...`);

  // 2. Update all of them back to 'bot' mode and clear flags
  const { error: updateError } = await supabase
    .from('conversations')
    .update({
      control_mode: 'bot',
      needs_manual_response: false,
      manual_flag_reason: null,
      manual_flagged_at: null,
    } as any)
    .eq('control_mode', 'manual');

  if (updateError) {
    console.error('Error updating conversations:', updateError);
  } else {
    console.log(`✅ Successfully restored ${manualConvs.length} conversations to AI Bot mode.`);
  }
}

resetAllManualConversations();
