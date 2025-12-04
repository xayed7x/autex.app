import { Skeleton } from "@/components/ui/skeleton"
import { TopBar } from "@/components/dashboard/top-bar"

export function AdminSkeleton() {
  return (
    <>
      <TopBar title="Admin Dashboard" />
      
      <div className="p-4 lg:p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>

        {/* Key Metrics Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </div>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cost History Chart Skeleton */}
          <div className="lg:col-span-2 rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="p-6 space-y-1.5 border-b">
              <Skeleton className="h-6 w-48" />
            </div>
            <div className="p-6">
              <Skeleton className="h-[300px] w-full" />
            </div>
          </div>

          {/* Cost Distribution Pie Chart Skeleton */}
          <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="p-6 space-y-1.5 border-b">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="p-6">
              <Skeleton className="h-[300px] w-full" />
            </div>
          </div>

          {/* Detailed Breakdown Table Skeleton */}
          <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="p-6 space-y-1.5 border-b">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <div className="space-y-1 flex flex-col items-end">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
