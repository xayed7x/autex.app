import { Skeleton } from "@/components/ui/skeleton"
import { TopBar } from "@/components/dashboard/top-bar"

export function OrdersSkeleton() {
  return (
    <>
      <TopBar title="Orders" />
      
      <div className="p-4 lg:p-6 space-y-6">
        {/* Stats Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>

        {/* Filters Skeleton */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex gap-2">
            <Skeleton className="h-10 w-[250px]" />
            <Skeleton className="h-10 w-[100px]" />
          </div>
          <Skeleton className="h-10 w-[120px]" />
        </div>

        {/* Table Skeleton */}
        <div className="rounded-md border bg-card">
          <div className="p-4 border-b">
            <div className="flex gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-4 flex-1" />
              ))}
            </div>
          </div>
          <div className="divide-y">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="p-4 flex gap-4 items-center">
                <Skeleton className="h-4 w-4" /> {/* Checkbox */}
                <Skeleton className="h-4 w-24" /> {/* Order ID */}
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32" /> {/* Customer */}
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" /> {/* Status */}
                <Skeleton className="h-4 w-24" /> {/* Date */}
                <Skeleton className="h-4 w-20" /> {/* Amount */}
                <Skeleton className="h-8 w-8" /> {/* Action */}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
