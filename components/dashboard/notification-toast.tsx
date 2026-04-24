"use client"

import { useEffect, useState } from "react"
import { ShoppingBag, MessageCircle, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

export interface CustomNotification {
  id: string
  type: "order" | "attention"
  title: string
  subtitle: string
  href: string
}

interface NotificationToastProps {
  queue: CustomNotification[]
  onDismiss: (id: string) => void
}

export function NotificationToast({ queue, onDismiss }: NotificationToastProps) {
  const router = useRouter()
  // Take only the last 3 notifications to display
  const displayQueue = queue.slice(-3).reverse()

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse gap-3 pointer-events-none">
      {displayQueue.map((notification, index) => (
        <div
          key={notification.id}
          className={cn(
            "pointer-events-auto w-[320px] bg-background/95 backdrop-blur-md border border-border shadow-2xl rounded-xl p-4 flex gap-4 items-start relative transform transition-all duration-500 ease-out animate-in slide-in-from-right-full",
            index === 0 ? "opacity-100 scale-100" : index === 1 ? "opacity-90 scale-95 translate-y-2" : "opacity-80 scale-90 translate-y-4"
          )}
          style={{
            zIndex: 100 - index,
          }}
          onClick={() => {
            router.push(notification.href)
            onDismiss(notification.id)
          }}
        >
          {/* Icon Section */}
          <div className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
            notification.type === "order" ? "bg-orange-500/10 text-orange-600" : "bg-blue-500/10 text-blue-600"
          )}>
            {notification.type === "order" ? (
              <ShoppingBag className="h-5 w-5" />
            ) : (
              <MessageCircle className="h-5 w-5" />
            )}
          </div>

          {/* Content Section */}
          <div className="flex-1 min-w-0 pr-4 cursor-pointer">
            <h4 className="text-sm font-bold text-foreground truncate">
              {notification.title}
            </h4>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {notification.subtitle}
            </p>
          </div>

          {/* Close Button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDismiss(notification.id)
            }}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
