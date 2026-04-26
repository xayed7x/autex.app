"use client";

import { useEffect, useState, useCallback } from 'react';
import { useWorkspace } from '@/lib/workspace-provider';

/**
 * Hook to manage PWA push notifications
 */
export function useNotifications() {
  const { workspaceId } = useWorkspace();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      return registration;
    } catch (err) {
      console.error('Service Worker registration failed:', err);
      return null;
    }
  };

  const checkSubscription = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setLoading(false);
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    setPermission(Notification.permission);
    setIsSubscribed(!!subscription);
    setLoading(false);
  }, []);

  const subscribe = async () => {
    try {
      if (!workspaceId) return false;

      // 1. Request permission
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return false;

      // 2. Get SW registration
      const registration = await registerServiceWorker();
      if (!registration) return false;

      // 3. Subscribe to push
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.error('VAPID public key not found');
        return false;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      // 4. Send to server
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription,
          workspaceId,
          deviceType: navigator.userAgent
        })
      });

      if (response.ok) {
        setIsSubscribed(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Push subscription failed:', err);
      return false;
    }
  };

  const unsubscribe = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        // 1. Send to server
        await fetch('/api/notifications/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        
        // 2. Browser unsubscribe
        await subscription.unsubscribe();
        setIsSubscribed(false);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Unsubscribe failed:', err);
      return false;
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      checkSubscription();
      // Auto-register SW on mount
      registerServiceWorker();
    }
  }, [checkSubscription]);

  return {
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
    checkSubscription
  };
}
