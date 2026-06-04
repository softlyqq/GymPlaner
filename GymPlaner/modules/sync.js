/**
 * GymPlaner — modules/sync.js
 * Хмарна синхронізація: черга змін, вирішення конфліктів, Firebase-ready архітектура
 * Патерн: Optimistic UI + Event Sourcing (зберігаємо дії, а не стан)
 */

'use strict';

const Sync = (() => {
  /* ---- Конфігурація ---- */
  const CONFIG = {
    /** URL вашого API або Firebase — замінити при підключенні */
    apiBaseUrl:  window.GYMPLANER_API_URL || null,
    firebaseUrl: window.GYMPLANER_FIREBASE_URL || null,
    syncInterval:  5 * 60 * 1000,   // Автосинхронізація кожні 5 хв
    retryDelay:    30 * 1000,        // Затримка перед повтором при помилці
    maxRetries:    3,
    conflictStrategy: 'server-wins', // 'server-wins' | 'client-wins' | 'latest-wins'
  };

  let _syncTimer    = null;
  let _isOnline     = navigator.onLine;
  let _isSyncing    = false;
  let _listeners    = {};  // event listeners
  let _syncStatus   = 'idle'; // 'idle' | 'syncing' | 'error' | 'offline'

  /* ============================================================
     ІНІЦІАЛІЗАЦІЯ
     ============================================================ */
  const init = () => {
    /* Слухаємо зміну мережі */
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    /* Слухаємо повідомлення від Service Worker */
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    /* Оновити початковий статус */
    _isOnline = navigator.onLine;
    updateNetworkBadge();

    /* Автосинхронізація */
    startAutoSync();

    /* Реєстрація Background Sync (якщо підтримується) */
    registerBackgroundSync();

    console.log('[Sync] Initialized. Online:', _isOnline);
  };

  /* ============================================================
     МЕРЕЖЕВИЙ СТАТУС
     ============================================================ */
  const handleOnline = async () => {
    _isOnline = true;
    _syncStatus = 'idle';
    updateNetworkBadge();
    emit('online');
    console.log('[Sync] Back online — starting sync');
    // Невелика затримка щоб мережа стабілізувалась
    await delay(2000);
    await flushQueue();
  };

  const handleOffline = () => {
    _isOnline = false;
    _syncStatus = 'offline';
    updateNetworkBadge();
    emit('offline');
    console.log('[Sync] Gone offline');
  };

  /** Оновити UI-індикатор мережі */
  const updateNetworkBadge = () => {
    const badge = document.getElementById('network-status-badge');
    if (!badge) return;
    if (_isOnline) {
      badge.className = 'network-badge online';
      badge.title = 'Онлайн';
    } else {
      badge.className = 'network-badge offline';
      badge.title = 'Офлайн — дані зберігаються локально';
    }
  };

  /* ============================================================
     ЧЕРГА ЗМІН (Event Sourcing)
     ============================================================ */

  /**
   * Додати операцію до черги синхронізації
   * @param {string} collection - 'workouts' | 'programs' | 'statistics' | 'achievements'
   * @param {string} operation  - 'create' | 'update' | 'delete'
   * @param {object} payload    - дані операції
   */
  const enqueue = async (collection, operation, payload) => {
    if (!window.DB) return;
    const item = {
      collection,
      operation,
      payload,
      username: getCurrentUser(),
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
      localId: `q_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    };
    await window.DB.SyncQueue.push(item);
    emit('queued', item);

    // Якщо онлайн — відразу пробуємо синхронізувати
    if (_isOnline) setTimeout(flushQueue, 500);
  };

  /**
   * Скинути всі pending операції на сервер
   */
  const flushQueue = async () => {
    if (_isSyncing || !_isOnline || !window.DB) return;
    if (!CONFIG.apiBaseUrl && !CONFIG.firebaseUrl) {
      // Сервер не налаштований — лише локальна черга
      console.log('[Sync] No remote configured — queue stored locally');
      return;
    }

    _isSyncing = true;
    _syncStatus = 'syncing';
    emit('sync-start');

    try {
      const pending = await window.DB.SyncQueue.getPending();
      if (!pending.length) { _syncStatus = 'idle'; emit('sync-done', { synced: 0 }); return; }

      console.log(`[Sync] Flushing ${pending.length} items`);
      let synced = 0, failed = 0;

      for (const item of pending) {
        try {
          await sendToRemote(item);
          await window.DB.SyncQueue.markDone(item.queueId);
          synced++;
        } catch (err) {
          item.retries = (item.retries || 0) + 1;
          if (item.retries >= CONFIG.maxRetries) {
            await window.DB.SyncQueue.markFailed(item.queueId, err.message);
            failed++;
          }
          console.warn('[Sync] Failed item:', item.localId, err.message);
        }
      }

      _syncStatus = 'idle';
      emit('sync-done', { synced, failed, total: pending.length });
      console.log(`[Sync] Done: ${synced} synced, ${failed} failed`);

    } catch (err) {
      _syncStatus = 'error';
      emit('sync-error', err);
      console.error('[Sync] Flush error:', err);
    } finally {
      _isSyncing = false;
    }
  };

  /**
   * Надіслати один елемент на сервер
   * Firebase Realtime Database або власний REST API
   */
  const sendToRemote = async (item) => {
    const { collection, operation, payload, username } = item;

    /* --- Firebase Realtime Database --- */
    if (CONFIG.firebaseUrl) {
      const path = `users/${username}/${collection}`;
      const url  = `${CONFIG.firebaseUrl}/${path}/${payload.id || ''}.json`;
      const method = operation === 'delete' ? 'DELETE' : (operation === 'create' ? 'POST' : 'PUT');
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method !== 'DELETE' ? JSON.stringify({ ...payload, syncedAt: Date.now() }) : undefined,
      });
      if (!res.ok) throw new Error(`Firebase error: ${res.status}`);
      const data = await res.json();
      return data;
    }

    /* --- Власний REST API --- */
    if (CONFIG.apiBaseUrl) {
      const url = `${CONFIG.apiBaseUrl}/${collection}${payload.id ? '/' + payload.id : ''}`;
      const res = await fetch(url, {
        method: operation === 'delete' ? 'DELETE' : (operation === 'create' ? 'POST' : 'PUT'),
        headers: {
          'Content-Type': 'application/json',
          'X-User': username,
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        body: operation !== 'delete' ? JSON.stringify(payload) : undefined,
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    }
  };

  /* ============================================================
     ВИРІШЕННЯ КОНФЛІКТІВ
     ============================================================ */

  /**
   * Вирішити конфлікт між локальними та серверними даними
   * @returns {object} - переможець
   */
  const resolveConflict = (local, remote) => {
    switch (CONFIG.conflictStrategy) {
      case 'server-wins':
        return remote;
      case 'client-wins':
        return local;
      case 'latest-wins':
        return (local.updatedAt || 0) > (remote.updatedAt || 0) ? local : remote;
      case 'merge':
        // Глибоке злиття — серверні поля мають пріоритет
        return deepMerge(local, remote);
      default:
        return remote;
    }
  };

  /**
   * Глибоке злиття об'єктів
   */
  const deepMerge = (local, remote) => {
    const result = { ...local };
    for (const key of Object.keys(remote)) {
      if (remote[key] !== null && typeof remote[key] === 'object' && !Array.isArray(remote[key])) {
        result[key] = deepMerge(local[key] || {}, remote[key]);
      } else {
        // Для масивів — об'єднуємо унікальні елементи по id
        if (Array.isArray(remote[key]) && Array.isArray(local[key])) {
          const merged = [...local[key]];
          for (const item of remote[key]) {
            const existing = merged.findIndex(x => x.id === item.id);
            if (existing >= 0) merged[existing] = resolveConflict(merged[existing], item);
            else merged.push(item);
          }
          result[key] = merged;
        } else {
          result[key] = remote[key];
        }
      }
    }
    return result;
  };

  /* ============================================================
     АВТОСИНХРОНІЗАЦІЯ
     ============================================================ */
  const startAutoSync = () => {
    if (_syncTimer) clearInterval(_syncTimer);
    _syncTimer = setInterval(() => {
      if (_isOnline) flushQueue();
    }, CONFIG.syncInterval);
  };

  /* ---- Background Sync API (Service Worker) ---- */
  const registerBackgroundSync = async () => {
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg?.sync) {
        await reg.sync.register('sync-all');
        console.log('[Sync] Background sync registered');
      }
    } catch (err) {
      console.log('[Sync] Background sync not supported:', err.message);
    }
  };

  /* ============================================================
     ПОВІДОМЛЕННЯ ВІД SERVICE WORKER
     ============================================================ */
  const handleSWMessage = (event) => {
    const { type, payload } = event.data || {};
    if (type === 'SYNC_REQUEST') flushQueue();
    if (type === 'NAVIGATE') window.App?.navigate(payload.page);
    if (type === 'CHECK_WORKOUT_REMINDER') checkWorkoutReminder();
  };

  /* ============================================================
     PULL — отримання даних з сервера
     ============================================================ */
  const pullFromRemote = async (username) => {
    if (!_isOnline || (!CONFIG.apiBaseUrl && !CONFIG.firebaseUrl)) return null;
    try {
      const url = CONFIG.firebaseUrl
        ? `${CONFIG.firebaseUrl}/users/${username}.json`
        : `${CONFIG.apiBaseUrl}/users/${username}/data`;
      const res  = await fetch(url, { headers: { 'Authorization': `Bearer ${getAuthToken()}` } });
      if (!res.ok) throw new Error(`Pull error: ${res.status}`);
      return res.json();
    } catch (err) {
      console.warn('[Sync] Pull failed:', err.message);
      return null;
    }
  };

  /* ---- Повна синхронізація (push + pull) ---- */
  const fullSync = async () => {
    if (!_isOnline) return { ok: false, reason: 'offline' };
    await flushQueue();
    const remote = await pullFromRemote(getCurrentUser());
    if (remote && window.DB) {
      await window.DB.importUserData({ ...remote, username: getCurrentUser() });
      emit('pull-done', remote);
    }
    return { ok: true };
  };

  /* ============================================================
     EVENT EMITTER (мінімальний)
     ============================================================ */
  const on  = (event, cb) => { _listeners[event] = _listeners[event] || []; _listeners[event].push(cb); };
  const off = (event, cb) => { _listeners[event] = (_listeners[event] || []).filter(l => l !== cb); };
  const emit = (event, data) => (_listeners[event] || []).forEach(cb => cb(data));

  /* ============================================================
     УТИЛІТИ
     ============================================================ */
  const getCurrentUser = () => {
    try { return JSON.parse(localStorage.getItem('gymplaner_session')); } catch { return null; }
  };
  const getAuthToken = () => localStorage.getItem('gymplaner_token') || '';
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  const checkWorkoutReminder = () => {
    // Перевіряємо чи є тренування сьогодні і чи воно виконане
    const today = (new Date().getDay() + 6) % 7;
    // Логіку реалізовано через Notifications.checkAndSend()
    if (window.Notifications) window.Notifications.checkScheduled();
  };

  /* ---- Статус синхронізації ---- */
  const getStatus = () => ({
    isOnline:  _isOnline,
    isSyncing: _isSyncing,
    status:    _syncStatus,
    hasRemote: !!(CONFIG.apiBaseUrl || CONFIG.firebaseUrl),
  });

  /** Налаштувати API endpoints */
  const configure = (opts) => Object.assign(CONFIG, opts);

  return {
    init, enqueue, flushQueue, fullSync, pullFromRemote,
    resolveConflict, getStatus, configure, on, off,
    get isOnline() { return _isOnline; },
  };
})();

if (typeof window !== 'undefined') window.Sync = Sync;
