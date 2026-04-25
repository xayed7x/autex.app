
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkRealtime() {
  const { data, error } = await supabase.rpc('check_realtime_status', {})
  if (error) {
    // If RPC doesn't exist, try raw query
    const { data: data2, error: error2 } = await supabase.from('_realtime_check').select('*').limit(1).maybeSingle()
    console.log('Realtime check error (expected if RPC missing):', error.message)
    
    // Try to check publication
    const { data: pubData, error: pubError } = await supabase.rpc('get_publications', {})
    console.log('Publications:', pubData || pubError)
  } else {
    console.log('Realtime Status:', data)
  }
}

checkRealtime()
