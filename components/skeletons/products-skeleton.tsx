import { Skeleton } from "@/components/ui/skeleton"
import { TopBar } from "@/components/dashboard/top-bar"

export function ProductsSkeleton() {
  return (
    <>
      <TopBar title="Products" />
      
      <div className="p-4 lg:p-6 space-y-6">
        {/* Filters Skeleton */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex gap-2 w-full sm:w-auto">
            <Skeleton className="h-10 w-full sm:w-[300px]" />
            <Skeleton className="h-10 w-[100px]" />
          </div>
          <Skeleton className="h-10 w-[140px]" />
        </div>

        {/* Table Skeleton */}
        <div className="rounded-md border bg-card">
          <div className="p-4 border-b">
            <div className="flex gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-4 flex-1" />
              ))}
            </div>
          </div>
          <div className="divide-y">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="p-4 flex gap-4 items-center">
                <Skeleton className="h-12 w-12 rounded-md" /> {/* Image */}
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-48" /> {/* Name */}
                  <Skeleton className="h-3 w-24" /> {/* Category */}
                </div>
                <Skeleton className="h-4 w-24" /> {/* Price */}
                <Skeleton className="h-6 w-20 rounded-full" /> {/* Stock Status */}
                <Skeleton className="h-4 w-16" /> {/* Sales */}
                <Skeleton className="h-8 w-8" /> {/* Action */}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
