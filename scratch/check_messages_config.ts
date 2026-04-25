
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkPolicies() {
  const { data, error } = await supabase.rpc('get_policies', { table_name: 'messages' })
  if (error) {
    // Try raw query via RPC if get_policies doesn't exist
    const { data: rawData, error: rawError } = await supabase.from('pg_policies').select('*').eq('tablename', 'messages')
    console.log('Policies Error:', error.message)
    console.log('Raw Policies:', rawData || rawError)
  } else {
    console.log('Policies for messages:', data)
  }
  
  // Also check if Realtime is enabled for the table
  const { data: pubData, error: pubError } = await supabase.rpc('check_realtime_enabled', { t_name: 'messages' })
  console.log('Realtime Enabled:', pubData || pubError)
}

checkPolicies()
