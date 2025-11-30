'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface WorkspaceContextType {
  workspaceId: string | null
  user: User | null
  loading: boolean
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaceId: null,
  user: null,
  loading: true,
})

export function useWorkspace() {
  return useContext(WorkspaceContext)
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      
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
        // Could redirect to workspace creation page here
        setLoading(false)
        return
      }

      setWorkspaceId(workspace.id)
      setLoading(false)
    }

    checkAuth()

    // Listen for auth changes
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.push('/login')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  return (
    <WorkspaceContext.Provider value={{ workspaceId, user, loading }}>
      {children}
    </WorkspaceContext.Provider>
  )
}
