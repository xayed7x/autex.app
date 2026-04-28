
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function queryEmbeddings() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get a workspace_id first
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, name')
    .limit(1)

  if (!workspaces || workspaces.length === 0) {
    console.log('No workspaces found.')
    return
  }

  const workspaceId = workspaces[0].id
  console.log(`Querying embeddings for workspace: ${workspaces[0].name} (${workspaceId})`)

  const { data: embeddings, error } = await supabase
    .from('conversation_example_embeddings')
    .select('customer_text, agent_text, type')
    .eq('workspace_id', workspaceId)
    .limit(5)

  if (error) {
    console.error('Error querying embeddings:', error)
    return
  }

  console.log('Typical Rows (Top 5):')
  console.table(embeddings)
}

queryEmbeddings()
