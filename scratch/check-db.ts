
import { createClient } from '@supabase/supabase-js'

async function checkMessages() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const customerPsid = '8820624021381395' // Ahamad Hassan's PSID from previous logs or guess
  
  // Find conversation
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, customer_name, workspace_id, fb_page_id')
    .ilike('customer_name', '%Ahamad Hassan%')

  console.log('Found Conversations:', JSON.stringify(convs, null, 2))

  if (convs && convs.length > 0) {
    for (const conv of convs) {
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(10)

      console.log(`Messages for Conv ${conv.id}:`, JSON.stringify(messages, null, 2))
    }
  }
}

checkMessages()
