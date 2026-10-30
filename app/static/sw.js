/**
 * BitAxeTool - Service Worker
 * Provides offline shell caching, background notification delivery, and PWA installation support.
 */

const CACHE_NAME = 'bitaxetool-v2.3.8';
const STATIC_ASSETS = [
    '/',
    '/manifest.json',
    '/static/css/style.css?v=2.3.8',
    '/static/js/app.js?v=2.3.8',
    '/static/js/chart.min.js?v=2.3.8',
    '/static/icons/icon-192.png',
    '/static/icons/icon-512.png',
    '/static/icons/icon-maskable-512.png',
    '/static/icons/apple-touch-icon.png',
    '/static/icons/favicon-32.png',
    '/static/icons/favicon-16.png',
    '/favicon.ico'
];

// Install: Cache essential shell and activate immediately
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[SW] Cache addAll warning:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// Activate: Clean up all old caches immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Network-First for API, HTML, CSS, and JS; Cache-First for static images/icons
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Bypass caching for APIs and WebSocket upgrades
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
        return;
    }

    // Network-First for HTML, CSS, and JS to guarantee instantaneous updates without stale caches
    if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.search.includes('v=')) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    }
                    return networkResponse;
                })
                .catch(() => caches.match(event.request).then(cached => cached || caches.match('/')))
        );
        return;
    }

    // Cache-First for static assets (images, icons) with background revalidation
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }
            return fetch(event.request);
        })
    );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});

// Message listener for in-app trigger of OS-level notifications
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, options } = event.data;
        self.registration.showNotification(title, {
            badge: '/static/icons/favicon-32.png',
            icon: '/static/icons/icon-192.png',
            vibrate: [200, 100, 200],
            ...options
        });
    }
});
