'use client'

import { Sidebar } from "@/components/dashboard/sidebar"
import { MobileNav } from "@/components/dashboard/mobile-nav"
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace-provider"

import { DashboardSkeleton } from "@/components/skeletons/dashboard-skeleton"

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { loading } = useWorkspace()

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar />
        <div className="lg:pl-64">
          <main className="pb-20 lg:pb-0">
            <DashboardSkeleton />
          </main>
        </div>
        <MobileNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="lg:pl-64">
        <main className="pb-20 lg:pb-0">{children}</main>
      </div>
      <MobileNav />
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <WorkspaceProvider>
      <DashboardContent>{children}</DashboardContent>
    </WorkspaceProvider>
  )
}
