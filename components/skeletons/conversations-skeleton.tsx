import { Skeleton } from "@/components/ui/skeleton"
import { TopBar } from "@/components/dashboard/top-bar"

export function ConversationsSkeleton() {
  return (
    <>
      <TopBar title="Conversations" />
      
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Conversations List Skeleton - Left Panel */}
        <div className="w-full lg:w-80 border-r border-border flex flex-col bg-background">
          {/* Search and Filters Skeleton */}
          <div className="p-4 border-b border-border space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>

          {/* Conversation List Items Skeleton */}
          <div className="flex-1 overflow-y-auto">
            <div className="divide-y divide-border">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="p-4 flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chat Panel Skeleton - Right Panel */}
        <div className="hidden lg:flex flex-1 flex-col bg-background h-full">
          {/* Chat Header Skeleton */}
          <div className="p-4 border-b border-border flex items-center gap-4 shrink-0">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>

          {/* Messages Skeleton */}
          <div className="flex-1 p-4 space-y-6 overflow-y-hidden">
            <div className="flex flex-col items-start gap-1">
              <Skeleton className="h-3 w-12 ml-1" />
              <Skeleton className="h-12 w-64 rounded-lg" />
            </div>
            <div className="flex flex-col items-end gap-1">
              <Skeleton className="h-3 w-12 mr-1" />
              <Skeleton className="h-16 w-72 rounded-lg" />
            </div>
            <div className="flex flex-col items-start gap-1">
              <Skeleton className="h-3 w-12 ml-1" />
              <Skeleton className="h-10 w-48 rounded-lg" />
            </div>
            <div className="flex flex-col items-end gap-1">
              <Skeleton className="h-3 w-12 mr-1" />
              <Skeleton className="h-24 w-80 rounded-lg" />
            </div>
          </div>

          {/* Input Skeleton */}
          <div className="p-4 border-t border-border flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-10" />
          </div>
        </div>
      </div>
    </>
  )
}
