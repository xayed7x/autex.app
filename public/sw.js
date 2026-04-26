/*
 * Service Worker for Autex PWA Notifications
 */

self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const payload = event.data.json();
      const title = payload.title || 'New Notification';
      const options = {
        body: payload.body || '',
        icon: payload.icon || '/web-app-manifest-192x192.png',
        badge: payload.badge || '/icon.svg', // Small monochrome icon for notification bar
        data: payload.data || {},
        tag: payload.tag || 'autex-notification', // Overwrite old notifications with same tag
        renotify: true,
        actions: payload.actions || [],
        vibrate: [200, 100, 200]
      };

      event.waitUntil(
        self.registration.showNotification(title, options)
      );
    } catch (e) {
      console.error('Push event error:', e);
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  const notification = event.notification;
  const action = event.action;

  notification.close();

  // URL to open
  let urlToOpen = notification.data?.url || '/dashboard';

  // Handle specific actions if needed
  if (action === 'view_orders') {
    urlToOpen = '/dashboard/orders';
  } else if (action === 'view_chat') {
    urlToOpen = notification.data?.url || '/dashboard/conversations';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a window is already open, focus it
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Basic install listener for logging
self.addEventListener('install', (event) => {
  console.log('SW installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('SW activated');
  event.waitUntil(clients.claim());
});

// Required for PWA installation criteria
self.addEventListener('fetch', (event) => {
  // We can just respond with the original request (no caching for now)
  // But having the listener is required for the 'Install' prompt to appear.
  event.respondWith(fetch(event.request));
});
