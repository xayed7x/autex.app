import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting
    const isAllowed = checkRateLimit(user.id)
    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    // Get workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('owner_id', user.id)
      .single()

    // Get workspace settings
    const { data: settings } = await supabase
      .from('workspace_settings')
      .select('business_category')
      .eq('workspace_id', workspace?.id)
      .single()

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        ...profile
      },
      workspace: workspace ? {
        ...workspace,
        business_category: settings?.business_category || 'clothing'
      } : null
    })
  } catch (error) {
    console.error('Settings API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_name, phone, workspace_name, business_category } = body

    // Update profile
    if (business_name !== undefined || phone !== undefined) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          business_name,
          phone,
          updated_at: new Date().toISOString()
        })

      if (profileError) {
        console.error('Error updating profile:', profileError)
        return NextResponse.json({ error: profileError.message }, { status: 500 })
      }
    }

    // Update workspace name
    if (workspace_name !== undefined) {
      const { error: workspaceError } = await supabase
        .from('workspaces')
        .update({ name: workspace_name })
        .eq('owner_id', user.id)

      if (workspaceError) {
        console.error('Error updating workspace:', workspaceError)
        return NextResponse.json({ error: workspaceError.message }, { status: 500 })
      }
    }

    // Update business category
    if (business_category !== undefined) {
      // Get workspace first
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', user.id)
        .single()
      
      if (workspace) {
        const { error: settingsError } = await supabase
          .from('workspace_settings')
          .upsert({
            workspace_id: workspace.id,
            business_category,
            updated_at: new Date().toISOString()
          }, { onConflict: 'workspace_id' })
        
        if (settingsError) {
          console.error('Error updating business category:', settingsError)
          return NextResponse.json({ error: settingsError.message }, { status: 500 })
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Settings update API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
