"use client";

import { useEffect } from 'react';
import { useNotifications } from '@/hooks/use-notifications';

export function PWAInitializer() {
  const { subscribe, isSubscribed, permission } = useNotifications();

  useEffect(() => {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('PWA: Service Worker registered!', reg.scope))
        .catch((err) => console.error('PWA: Service Worker registration failed!', err));
    }

    // Only auto-subscribe if permission is already granted but we aren't subscribed in this session
    if (permission === 'granted' && !isSubscribed) {
      subscribe();
    }
  }, [permission, isSubscribed, subscribe]);

  return null;
}
