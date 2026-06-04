/**
 * GymPlaner — pwa.js
 * PWA Bootstrap: реєстрація Service Worker, install prompt, splash screen,
 * online/offline індикатор, SW оновлення
 */

'use strict';

const PWA = (() => {
  let _deferredInstallPrompt = null;
  let _swRegistration        = null;

  /* ============================================================
     ІНІЦІАЛІЗАЦІЯ — викликається одразу при завантаженні
     ============================================================ */
  const init = async () => {
    showSplash();
    await registerServiceWorker();
    setupInstallPrompt();
    setupNetworkBadge();
    handleDeepLinks();
    hideSplashAfterLoad();
  };

  /* ============================================================
     SPLASH SCREEN
     ============================================================ */
  const showSplash = () => {
    // Якщо вже є в DOM — пропускаємо
    if (document.getElementById('pwa-splash')) return;

    const splash = document.createElement('div');
    splash.id = 'pwa-splash';
    splash.innerHTML = `
      <div class="splash-inner">
        <svg class="splash-logo" width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ffc01a"/>
              <stop offset="100%" stop-color="#f0a500"/>
            </linearGradient>
          </defs>
          <rect x="28" y="32" width="8"  height="30" rx="3" fill="url(#sg)"/>
          <rect x="46" y="20" width="8"  height="42" rx="3" fill="url(#sg)"/>
          <rect x="64" y="40" width="8"  height="22" rx="3" fill="url(#sg)"/>
        </svg>
        <h1 class="splash-title">GymPlaner</h1>
        <p  class="splash-sub">Тренуйся розумно. Досягай більше.</p>
        <div class="splash-loader">
          <div class="splash-bar"></div>
        </div>
      </div>`;
    document.body.appendChild(splash);
  };

  const hideSplashAfterLoad = () => {
    const finish = () => {
      const splash = document.getElementById('pwa-splash');
      if (!splash) return;
      splash.classList.add('fade-out');
      setTimeout(() => splash.remove(), 600);
    };

    if (document.readyState === 'complete') {
      setTimeout(finish, 900);
    } else {
      window.addEventListener('load', () => setTimeout(finish, 900), { once: true });
    }
  };

  /* ============================================================
     SERVICE WORKER РЕЄСТРАЦІЯ
     ============================================================ */
  const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) {
      console.log('[PWA] Service Worker not supported');
      return null;
    }

    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      _swRegistration = reg;
      window._swRegistration = reg; // Доступно для Notifications

      console.log('[PWA] SW registered, scope:', reg.scope);

      // Слухати оновлення SW
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });

      // Слухати повідомлення від SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        const { type, payload } = event.data || {};
        if (type === 'NAVIGATE' && window.App) window.App.navigate(payload.page);
        if (type === 'CACHE_SIZE')  updateCacheSizeDisplay(payload);
        if (type === 'SYNC_REQUEST' && window.Sync) window.Sync.flushQueue();
        if (type === 'CHECK_WORKOUT_REMINDER' && window.Notifications) {
          window.Notifications.checkScheduled();
        }
      });

      // Запитати розмір кешу
      requestCacheSize(reg);

      return reg;
    } catch (err) {
      console.error('[PWA] SW registration failed:', err);
      return null;
    }
  };

  /** Запитати SW про розмір кешу */
  const requestCacheSize = (reg) => {
    if (reg?.active) {
      reg.active.postMessage({ type: 'GET_CACHE_SIZE' });
    }
  };

  const updateCacheSizeDisplay = ({ usageMB }) => {
    const el = document.getElementById('cache-size-display');
    if (el) el.textContent = `Кеш: ${usageMB} MB`;
  };

  /* ============================================================
     БАНЕР ОНОВЛЕННЯ
     ============================================================ */
  const showUpdateBanner = () => {
    if (document.getElementById('update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.className = 'update-banner';
    banner.innerHTML = `
      <span>🔄 Доступна нова версія GymPlaner</span>
      <button class="btn-primary btn-sm" id="btn-update-sw">Оновити</button>
      <button class="update-dismiss" id="btn-dismiss-update">✕</button>`;
    document.body.appendChild(banner);

    document.getElementById('btn-update-sw').addEventListener('click', () => {
      _swRegistration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    });

    document.getElementById('btn-dismiss-update').addEventListener('click', () => {
      banner.remove();
    });
  };

  /* ============================================================
     INSTALL PROMPT (додати на екран)
     ============================================================ */
  const setupInstallPrompt = () => {
    // Зберегти prompt для подальшого використання
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _deferredInstallPrompt = e;
      showInstallButton();
      console.log('[PWA] Install prompt captured');
    });

    // Після встановлення
    window.addEventListener('appinstalled', () => {
      _deferredInstallPrompt = null;
      hideInstallButton();
      if (window.UI) window.UI.toast('GymPlaner встановлено! 🎉');
      console.log('[PWA] App installed');
    });
  };

  const showInstallButton = () => {
    let btn = document.getElementById('btn-pwa-install');
    if (btn) { btn.classList.remove('hidden'); return; }

    btn = document.createElement('button');
    btn.id = 'btn-pwa-install';
    btn.className = 'btn-pwa-install';
    btn.innerHTML = '📲 Встановити додаток';
    btn.addEventListener('click', triggerInstall);

    // Додати у sidebar знизу (перед кнопкою logout)
    const logout = document.getElementById('btn-logout');
    if (logout) logout.parentElement.insertBefore(btn, logout);
    else document.body.appendChild(btn);
  };

  const hideInstallButton = () => {
    document.getElementById('btn-pwa-install')?.classList.add('hidden');
  };

  /** Показати системний діалог встановлення */
  const triggerInstall = async () => {
    if (!_deferredInstallPrompt) return;
    _deferredInstallPrompt.prompt();
    const { outcome } = await _deferredInstallPrompt.userChoice;
    console.log('[PWA] Install outcome:', outcome);
    _deferredInstallPrompt = null;
    if (outcome === 'accepted') hideInstallButton();
  };

  /* ============================================================
     ONLINE / OFFLINE BADGE
     ============================================================ */
  const setupNetworkBadge = () => {
    // Створити badge якщо немає
    if (!document.getElementById('network-status-badge')) {
      const badge = document.createElement('div');
      badge.id = 'network-status-badge';
      badge.className = `network-badge ${navigator.onLine ? 'online' : 'offline'}`;
      badge.title = navigator.onLine ? 'Онлайн' : 'Офлайн';
      badge.innerHTML = `<span class="badge-dot"></span><span class="badge-label">${navigator.onLine ? 'Online' : 'Offline'}</span>`;

      // Додати у topbar
      const topbarRight = document.querySelector('.topbar-right');
      if (topbarRight) topbarRight.prepend(badge);
      else document.body.appendChild(badge);
    }

    window.addEventListener('online',  () => updateBadge(true));
    window.addEventListener('offline', () => updateBadge(false));
  };

  const updateBadge = (isOnline) => {
    const badge = document.getElementById('network-status-badge');
    if (!badge) return;
    badge.className = `network-badge ${isOnline ? 'online' : 'offline'}`;
    badge.title = isOnline ? 'Онлайн' : 'Офлайн — дані зберігаються локально';
    badge.querySelector('.badge-label').textContent = isOnline ? 'Online' : 'Offline';

    if (window.UI) {
      if (!isOnline) window.UI.toast('📵 Офлайн-режим. Дані зберігаються локально.', 'info');
      else           window.UI.toast('✅ З\'єднання відновлено!', 'success');
    }
  };

  /* ============================================================
     DEEP LINKS — обробка ?action= параметрів
     ============================================================ */
  const handleDeepLinks = () => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    if (!action) return;

    // Виконати дію після того як додаток завантажиться
    window.addEventListener('gymplaner:ready', () => {
      switch (action) {
        case 'workout':     window.App?.navigate('planner');  break;
        case 'measurement': window.App?.navigate('progress'); break;
        case 'profile':     window.App?.navigate('profile');  break;
      }
    }, { once: true });
  };

  /** Викликати після успішного логіну */
  const dispatchReady = () => {
    window.dispatchEvent(new CustomEvent('gymplaner:ready'));
  };

  /* ============================================================
     PERIODIC BACKGROUND SYNC — реєстрація
     ============================================================ */
  const registerPeriodicSync = async () => {
    if (!_swRegistration) return;
    try {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await _swRegistration.periodicSync.register('workout-reminder', {
          minInterval: 24 * 60 * 60 * 1000, // 1 раз на добу
        });
        console.log('[PWA] Periodic sync registered');
      }
    } catch (err) {
      console.log('[PWA] Periodic sync not supported:', err.message);
    }
  };

  /* ============================================================
     ГЕТТЕРИ
     ============================================================ */
  const getRegistration = () => _swRegistration;
  const isInstallable   = () => !!_deferredInstallPrompt;
  const isInstalled     = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  return {
    init, triggerInstall, dispatchReady, registerPeriodicSync,
    getRegistration, isInstallable, isInstalled,
  };
})();

/* Запускаємо PWA одразу — до DOMContentLoaded */
PWA.init();
