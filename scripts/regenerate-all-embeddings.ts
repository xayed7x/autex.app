
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { generateAndStoreExampleEmbeddings } from '../lib/ai/embeddings/example-embeddings';

dotenv.config({ path: '.env.local' });

async function regenerateAllEmbeddings() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log('🚀 Starting embedding regeneration for all workspaces...');

  const { data: workspaces, error: wsError } = await supabase
    .from('workspaces')
    .select('id, name');

  if (wsError) {
    console.error('Error fetching workspaces:', wsError);
    return;
  }

  for (const workspace of workspaces) {
    const { data: settings, error: sError } = await supabase
      .from('workspace_settings')
      .select('conversation_examples')
      .eq('workspace_id', workspace.id)
      .single();

    if (sError || !settings?.conversation_examples) {
      console.log(`[${workspace.name}] — skipped (no settings or examples)`);
      continue;
    }

    const examples = settings.conversation_examples as any[];

    if (examples.length > 0) {
      try {
        // The generateAndStoreExampleEmbeddings function handles deletion internally
        await generateAndStoreExampleEmbeddings(workspace.id, examples, supabase);
        console.log(`[${workspace.name}] — ${examples.length} examples embedded`);
      } catch (err: any) {
        console.error(`[${workspace.name}] — failed: ${err.message}`);
      }
    } else {
      console.log(`[${workspace.name}] — skipped (no examples)`);
    }
  }

  console.log('✅ Finished regenerating all embeddings.');
}

regenerateAllEmbeddings();
