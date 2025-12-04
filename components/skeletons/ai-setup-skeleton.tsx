import { Skeleton } from "@/components/ui/skeleton"
import { TopBar } from "@/components/dashboard/top-bar"

export function AISetupSkeleton() {
  return (
    <>
      <TopBar title="AI Setup" />
      
      <div className="p-4 lg:p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>

        {/* Bot Personality Card Skeleton */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="p-6 space-y-1.5 border-b">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        </div>

        {/* Order Collection Style Card Skeleton */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="p-6 space-y-1.5 border-b">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
            <div className="space-y-2 pt-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </div>

        {/* Footer Actions Skeleton */}
        <div className="sticky bottom-[3.8rem] lg:bottom-0 z-10 -mx-4 lg:-mx-6 -mb-4 lg:-mb-6 p-4 lg:p-6 bg-background/95 backdrop-blur border-t border-border flex flex-col sm:flex-row sm:justify-end gap-3 mt-6">
          <Skeleton className="h-11 w-full sm:w-32" />
          <Skeleton className="h-11 w-full sm:w-32" />
        </div>
      </div>
    </>
  )
}
