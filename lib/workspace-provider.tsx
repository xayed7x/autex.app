'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface WorkspaceContextType {
  workspaceId: string | null
  user: User | null
  hasFacebookPage: boolean
  needsReplyCount: number
  unreadConversationsCount: number
  pendingOrdersCount: number
  loading: boolean
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaceId: null,
  user: null,
  hasFacebookPage: false,
  needsReplyCount: 0,
  unreadConversationsCount: 0,
  pendingOrdersCount: 0,
  loading: true,
})

export function useWorkspace() {
  return useContext(WorkspaceContext)
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [hasFacebookPage, setHasFacebookPage] = useState(false)
  const [needsReplyCount, setNeedsReplyCount] = useState(0)
  const [unreadConversationsCount, setUnreadConversationsCount] = useState(0)
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Effect 1: Auth check - runs only once on mount
  useEffect(() => {
    const supabase = createClient()
    
    const checkAuth = async () => {
      // Check if user is authenticated
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !authUser) {
        router.push('/login')
        return
      }

      setUser(authUser)

      // Get user's workspace
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', authUser.id)
        .single()

      if (workspaceError || !workspace) {
        console.error('No workspace found for user:', workspaceError)
        setLoading(false)
        return
      }

      setWorkspaceId(workspace.id)

      // Get initial counts
      const [{ count: manualCount }, { count: ordersCount }, { count: unread }] = await Promise.all([
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id)
          .eq('needs_manual_response', true)
          .not('control_mode', 'in', '("bot","hybrid")'),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id)
          .eq('status', 'pending'),
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id)
          .eq('is_read', false)
      ])

      setNeedsReplyCount(manualCount || 0)
      setPendingOrdersCount(ordersCount || 0)
      setUnreadConversationsCount(unread || 0)

      // Get user's Facebook pages status
      try {
        const fbResponse = await fetch('/api/facebook/pages')
        if (fbResponse.ok) {
          const fbData = await fbResponse.json()
          setHasFacebookPage(fbData.pages && fbData.pages.length > 0)
        }
      } catch (fbError) {
        console.error('Failed to fetch Facebook pages during init:', fbError)
      }

      setLoading(false)
    }

    checkAuth()

    // Listen for auth changes
    const supabaseForAuth = createClient()
    const { data: { subscription } } = supabaseForAuth.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.push('/login')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router]) // Only depends on router, runs once

  // Effect 2: Realtime subscriptions - runs when workspaceId is set
  useEffect(() => {
    if (!workspaceId) return

    const supabase = createClient()

    const refreshCounts = () => {
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('needs_manual_response', true)
        .not('control_mode', 'in', '("bot","hybrid")')
        .then(({ count }) => setNeedsReplyCount(count || 0))
        
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('is_read', false)
        .then(({ count }) => setUnreadConversationsCount(count || 0))
    }

    const ordersChannel = supabase
      .channel(`orders-${workspaceId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders',
        filter: `workspace_id=eq.${workspaceId}`
      }, () => {
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('status', 'pending')
          .then(({ count }) => setPendingOrdersCount(count || 0))
      })
      .subscribe()

    const convChannel = supabase
      .channel(`conversations-counts-${workspaceId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'conversations',
        filter: `workspace_id=eq.${workspaceId}`
      }, () => {
        refreshCounts()
      })
      .subscribe()

    // Listen for manual flag clears from conversations page for immediate UI update
    window.addEventListener('needsReplyCountChanged', refreshCounts)

    return () => {
      supabase.removeChannel(ordersChannel)
      supabase.removeChannel(convChannel)
      window.removeEventListener('needsReplyCountChanged', refreshCounts)
    }
  }, [workspaceId]) // Only re-runs when workspaceId changes

  return (
    <WorkspaceContext.Provider value={{ 
      workspaceId, 
      user, 
      hasFacebookPage, 
      needsReplyCount,
      unreadConversationsCount,
      pendingOrdersCount,
      loading 
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}
