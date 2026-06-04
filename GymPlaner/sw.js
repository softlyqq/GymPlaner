/**
 * GymPlaner — sw.js (Service Worker)
 * Стратегії кешування: Cache First для статики, Network First для API
 * Підтримка: офлайн-режим, фонова синхронізація, push-сповіщення
 */

'use strict';

/* ---- Версія кешу — змінюй при кожному деплої ---- */
const CACHE_VERSION  = 'gymplaner-v1.2.0';
const STATIC_CACHE   = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE  = `${CACHE_VERSION}-dynamic`;
const API_CACHE      = `${CACHE_VERSION}-api`;

/* ---- Ресурси для передкешування (Cache First) ---- */
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './modules/db.js',
  './modules/sync.js',
  './modules/ai.js',
  './modules/gamification.js',
  './modules/notifications.js',
  './modules/security.js',
  './modules/social.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  /* CDN — кешуємо при першому завантаженні */
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@300;400;500;600;700&family=Barlow+Condensed:wght@400;600;700&display=swap',
];

/* ---- Максимум записів у динамічному кеші ---- */
const DYNAMIC_CACHE_LIMIT = 50;

/* ============================================================
   INSTALL — передкешування статичних ресурсів
   ============================================================ */
self.addEventListener('install', event => {
  console.log('[SW] Installing:', CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      // Кешуємо по одному, не падаємо якщо CDN недоступний
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
        )
      );
    }).then(() => self.skipWaiting()) // Активуємо одразу
  );
});

/* ============================================================
   ACTIVATE — очищення старих кешів
   ============================================================ */
self.addEventListener('activate', event => {
  console.log('[SW] Activating:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('gymplaner-') && !k.startsWith(CACHE_VERSION))
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim()) // Захопити всі вкладки
  );
});

/* ============================================================
   FETCH — стратегії кешування
   ============================================================ */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Пропускаємо не-GET та chrome-extension
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // Стратегія: мережа → кеш (для "свіжих" даних)
  if (isApiRequest(url)) {
    event.respondWith(networkFirstStrategy(request, API_CACHE));
    return;
  }

  // Стратегія: кеш → мережа (для статики)
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }

  // Стратегія: мережа → кеш із лімітом (для решти)
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
});

/* ---- Визначення типів запитів ---- */
const isApiRequest  = (url) => url.pathname.includes('/api/') || url.hostname.includes('firebaseio.com') || url.hostname.includes('googleapis.com');
const isStaticAsset = (url) => /\.(js|css|svg|png|jpg|webp|woff2?|ttf)$/.test(url.pathname) || PRECACHE_URLS.includes(url.href);

/* ---- Cache First: повертаємо з кешу, оновлюємо фоново ---- */
async function cacheFirstStrategy(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await putInCache(cacheName, request, response.clone());
    return response;
  } catch {
    return offlineFallback(request);
  }
}

/* ---- Network First: намагаємось мережу, fallback до кешу ---- */
async function networkFirstStrategy(request, cacheName) {
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(5000) });
    if (response.ok) await putInCache(cacheName, request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback(request);
  }
}

/* ---- Stale While Revalidate ---- */
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) putInCache(cacheName, request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise || offlineFallback(request);
}

/* ---- Зберегти в кеш з обрізанням ---- */
async function putInCache(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  if (keys.length >= DYNAMIC_CACHE_LIMIT) await cache.delete(keys[0]);
  await cache.put(request, response);
}

/* ---- Fallback HTML для офлайн ---- */
function offlineFallback(request) {
  if (request.headers.get('accept')?.includes('text/html')) {
    return caches.match('./index.html');
  }
  return new Response('Офлайн', { status: 503, statusText: 'Service Unavailable' });
}

/* ============================================================
   BACKGROUND SYNC — синхронізація при поверненні онлайн
   ============================================================ */
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-workouts') {
    event.waitUntil(syncQueuedData('workouts'));
  }
  if (event.tag === 'sync-progress') {
    event.waitUntil(syncQueuedData('progress'));
  }
  if (event.tag === 'sync-all') {
    event.waitUntil(Promise.all([
      syncQueuedData('workouts'),
      syncQueuedData('progress'),
      syncQueuedData('achievements'),
    ]));
  }
});

/** Надіслати дані з черги синхронізації на сервер */
async function syncQueuedData(type) {
  try {
    // Читаємо чергу з IndexedDB через повідомлення до клієнта
    const clients = await self.clients.matchAll();
    if (clients.length === 0) return;

    clients[0].postMessage({
      type: 'SYNC_REQUEST',
      payload: { syncType: type, timestamp: Date.now() }
    });
    console.log('[SW] Sync requested for:', type);
  } catch (err) {
    console.error('[SW] Sync failed:', err);
    throw err; // Повторити спробу
  }
}

/* ============================================================
   PUSH NOTIFICATIONS — обробка сповіщень
   ============================================================ */
self.addEventListener('push', event => {
  console.log('[SW] Push received');
  let data = { title: 'GymPlaner', body: 'Час тренуватися! 💪', tag: 'workout-reminder' };

  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}

  const options = {
    body:    data.body,
    tag:     data.tag,
    icon:    './icons/icon-192.svg',
    badge:   './icons/icon-72.svg',
    vibrate: [200, 100, 200],
    data:    { url: data.url || './', timestamp: Date.now() },
    actions: [
      { action: 'start',  title: '▶ Почати тренування' },
      { action: 'later',  title: '⏰ Нагадати пізніше' },
      { action: 'skip',   title: '✕ Пропустити' },
    ],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

/* ---- Обробка кліку на сповіщення ---- */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const { action } = event;
  const { url } = event.notification.data;

  if (action === 'later') {
    // Повторне сповіщення через 30 хв
    scheduleLocalNotification(30 * 60 * 1000, 'Час тренуватися! 💪', 'Ти відклав нагадування — не забудь!');
    return;
  }
  if (action === 'skip') return;

  // Відкрити або сфокусувати вкладку
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes('gymplaner') || c.url.includes('index.html'));
      if (existing) { existing.focus(); existing.postMessage({ type: 'NAVIGATE', page: 'dashboard' }); }
      else self.clients.openWindow(url);
    })
  );
});

/** Локальне відкладене сповіщення (setTimeout у SW) */
function scheduleLocalNotification(delay, title, body) {
  setTimeout(() => {
    self.registration.showNotification(title, {
      body, icon: './icons/icon-192.svg', tag: 'reminder-delayed'
    });
  }, delay);
}

/* ============================================================
   ПОВІДОМЛЕННЯ від клієнтів
   ============================================================ */
self.addEventListener('message', event => {
  const { type, payload } = event.data || {};

  if (type === 'SKIP_WAITING') { self.skipWaiting(); return; }

  if (type === 'CACHE_URLS') {
    caches.open(STATIC_CACHE).then(cache => cache.addAll(payload.urls || []));
    return;
  }

  if (type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    return;
  }

  if (type === 'GET_CACHE_SIZE') {
    getCacheSize().then(size => event.source.postMessage({ type: 'CACHE_SIZE', size }));
    return;
  }
});

/** Розрахувати розмір кешу */
async function getCacheSize() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota, usageMB: Math.round(usage / 1024 / 1024 * 10) / 10 };
  }
  return { usage: 0, quota: 0 };
}

/* ============================================================
   PERIODIC BACKGROUND SYNC (де підтримується)
   ============================================================ */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'workout-reminder') {
    event.waitUntil(sendWorkoutReminder());
  }
});

async function sendWorkoutReminder() {
  // Читаємо дані зі стану — реалізація через клієнтські повідомлення
  const clients = await self.clients.matchAll();
  if (clients.length > 0) {
    clients[0].postMessage({ type: 'CHECK_WORKOUT_REMINDER' });
  }
}
