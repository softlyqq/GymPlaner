/**
 * GymPlaner — modules/notifications.js
 * Push-сповіщення: дозвіл, scheduling, нагадування про тренування і відпочинок
 */

'use strict';

const Notifications = (() => {
  /* ---- Ключ сховища для налаштувань ---- */
  const PREFS_KEY = 'gymplaner_notif_prefs';

  const defaultPrefs = () => ({
    enabled:           false,
    workoutReminder:   true,
    workoutTime:       '08:00',
    restReminder:      true,
    programUpdateReminder: true,
    sound:             true,
    dailyTaskReminder: true,
    dailyTaskTime:     '09:00',
  });

  /** Зберегти/отримати налаштування */
  const getPrefs = () => {
    try { return { ...defaultPrefs(), ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; }
    catch { return defaultPrefs(); }
  };
  const savePrefs = (prefs) => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

  /* ============================================================
     ІНІЦІАЛІЗАЦІЯ
     ============================================================ */
  const init = async () => {
    if (!('Notification' in window)) {
      console.log('[Notif] Notifications not supported');
      return false;
    }

    const prefs = getPrefs();
    if (prefs.enabled && Notification.permission === 'granted') {
      scheduleAll();
      return true;
    }
    return false;
  };

  /* ============================================================
     ЗАПИТ ДОЗВОЛУ
     ============================================================ */
  const requestPermission = async () => {
    if (!('Notification' in window)) return 'not-supported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied')  return 'denied';

    const result = await Notification.requestPermission();
    if (result === 'granted') {
      const prefs = getPrefs();
      prefs.enabled = true;
      savePrefs(prefs);
      scheduleAll();
      sendLocal('GymPlaner активовано! 💪', 'Ти отримуватимеш нагадування про тренування.');
    }
    return result;
  };

  /* ============================================================
     НАДІСЛАТИ ЛОКАЛЬНЕ СПОВІЩЕННЯ
     ============================================================ */
  const sendLocal = (title, body, options = {}) => {
    if (Notification.permission !== 'granted') return;

    const swReg = window._swRegistration;
    const notifOptions = {
      body,
      icon: './icons/icon-192.svg',
      badge: './icons/icon-72.svg',
      tag:  options.tag || 'gymplaner',
      data: options.data || {},
      ...options,
    };

    if (swReg?.showNotification) {
      swReg.showNotification(title, notifOptions);
    } else {
      new Notification(title, notifOptions);
    }
  };

  /* ============================================================
     ПЛАНУВАННЯ СПОВІЩЕНЬ (через setTimeout — для PWA без бекенду)
     Для продакшну — замінити на Web Push API з сервером
     ============================================================ */

  let _scheduledTimers = [];

  const scheduleAll = () => {
    clearScheduled();
    const prefs = getPrefs();
    if (!prefs.enabled) return;

    if (prefs.workoutReminder)    scheduleWorkoutReminder(prefs.workoutTime);
    if (prefs.dailyTaskReminder)  scheduleDailyTaskReminder(prefs.dailyTaskTime);
    if (prefs.restReminder)       scheduleRestReminders();
    if (prefs.programUpdateReminder) scheduleProgramUpdateCheck();

    console.log('[Notif] All reminders scheduled');
  };

  const clearScheduled = () => {
    _scheduledTimers.forEach(t => clearTimeout(t));
    _scheduledTimers = [];
  };

  /** Нагадування про тренування (щоденне о певній годині) */
  const scheduleWorkoutReminder = (timeStr) => {
    const msToTime = getMsUntilTime(timeStr);
    const timer = setTimeout(() => {
      checkAndSendWorkoutReminder();
      // Повторити через 24 год
      scheduleWorkoutReminder(timeStr);
    }, msToTime);
    _scheduledTimers.push(timer);
  };

  /** Перевірити чи є тренування сьогодні і надіслати нагадування */
  const checkAndSendWorkoutReminder = () => {
    const today = (new Date().getDay() + 6) % 7; // 0=Пн
    const stored = localStorage.getItem('gymplaner_session');
    if (!stored) return;

    const username = JSON.parse(stored);
    const programs = JSON.parse(localStorage.getItem(`gymplaner_programs_${username}`) || '[]');
    const todayProgs = programs.filter(p => p.days?.includes(today));

    if (todayProgs.length > 0) {
      sendLocal(
        '🏋️ Час тренуватися!',
        `Сьогодні заплановано: ${todayProgs.map(p => p.name).join(', ')}`,
        { tag: 'workout-today', data: { url: './index.html?action=workout' } }
      );
    }
  };

  /** Нагадування про щоденні завдання */
  const scheduleDailyTaskReminder = (timeStr) => {
    const msToTime = getMsUntilTime(timeStr);
    const timer = setTimeout(() => {
      sendLocal('📋 Щоденні завдання', 'Виконай свої завдання та отримай XP! ⚡', { tag: 'daily-tasks' });
      scheduleDailyTaskReminder(timeStr);
    }, msToTime);
    _scheduledTimers.push(timer);
  };

  /** Нагадування про відпочинок під час тренування */
  let _restTimerNotif = null;
  const scheduleRestNotification = (seconds = 90) => {
    if (_restTimerNotif) clearTimeout(_restTimerNotif);
    _restTimerNotif = setTimeout(() => {
      sendLocal('⏱ Час наступного підходу!', `${seconds} секунд минуло. Вперед! 💪`, {
        tag: 'rest-timer', requireInteraction: false
      });
    }, seconds * 1000);
  };

  /** Нагадування оновити програму (якщо > 30 днів) */
  const scheduleProgramUpdateCheck = () => {
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const timer = setTimeout(() => {
      checkProgramUpdate();
    }, THIRTY_DAYS);
    _scheduledTimers.push(timer);
  };

  const checkProgramUpdate = () => {
    const username = (() => { try { return JSON.parse(localStorage.getItem('gymplaner_session')); } catch { return null; }})();
    if (!username) return;
    const programs = JSON.parse(localStorage.getItem(`gymplaner_programs_${username}`) || '[]');
    if (programs.length > 0) {
      sendLocal(
        '🔄 Час оновити програму?',
        'Ти використовуєш програму > 30 днів. Розглянь зміни для нового прогресу.',
        { tag: 'program-update' }
      );
    }
  };

  const checkScheduled = () => checkAndSendWorkoutReminder();

  /* ============================================================
     WEB PUSH API — для продакшну з бекендом
     ============================================================ */

  /** Підписатися на Web Push (потребує бекенду) */
  const subscribeToPush = async (vapidPublicKey) => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      console.log('[Notif] Push subscription:', sub.endpoint);
      return sub;
    } catch (err) {
      console.warn('[Notif] Push subscribe failed:', err.message);
      return null;
    }
  };

  /* ============================================================
     РЕНДЕР ПАНЕЛІ НАЛАШТУВАНЬ
     ============================================================ */
  const renderSettingsPanel = (containerId) => {
    const el    = document.getElementById(containerId);
    if (!el) return;
    const prefs = getPrefs();
    const perm  = Notification.permission;

    el.innerHTML = `
      <div class="notif-settings">
        <div class="notif-status">
          <span class="notif-perm ${perm}">${
            perm === 'granted' ? '🔔 Дозволено' :
            perm === 'denied'  ? '🔕 Заблоковано' : '❓ Не налаштовано'
          }</span>
          ${perm !== 'granted' ? `<button class="btn-primary" id="btn-req-notif">Увімкнути сповіщення</button>` : ''}
        </div>

        ${perm === 'granted' ? `
        <div class="notif-pref-group">
          <label class="notif-toggle">
            <input type="checkbox" id="pref-workout" ${prefs.workoutReminder ? 'checked' : ''} />
            <span>🏋️ Нагадування про тренування</span>
          </label>
          <input type="time" id="pref-workout-time" value="${prefs.workoutTime}" class="time-input" />
        </div>

        <div class="notif-pref-group">
          <label class="notif-toggle">
            <input type="checkbox" id="pref-daily" ${prefs.dailyTaskReminder ? 'checked' : ''} />
            <span>📋 Щоденні завдання</span>
          </label>
          <input type="time" id="pref-daily-time" value="${prefs.dailyTaskTime}" class="time-input" />
        </div>

        <div class="notif-pref-group">
          <label class="notif-toggle">
            <input type="checkbox" id="pref-rest" ${prefs.restReminder ? 'checked' : ''} />
            <span>⏱ Нагадування про відпочинок</span>
          </label>
        </div>

        <div class="notif-pref-group">
          <label class="notif-toggle">
            <input type="checkbox" id="pref-program" ${prefs.programUpdateReminder ? 'checked' : ''} />
            <span>🔄 Оновлення програми</span>
          </label>
        </div>

        <div class="notif-actions">
          <button class="btn-primary" id="btn-save-notif-prefs">Зберегти</button>
          <button class="btn-ghost" id="btn-test-notif">Тест сповіщення</button>
        </div>` : ''}
      </div>`;

    // Events
    el.querySelector('#btn-req-notif')?.addEventListener('click', async () => {
      await requestPermission();
      renderSettingsPanel(containerId);
    });

    el.querySelector('#btn-save-notif-prefs')?.addEventListener('click', () => {
      const prefs = {
        enabled:              true,
        workoutReminder:      el.querySelector('#pref-workout')?.checked || false,
        workoutTime:          el.querySelector('#pref-workout-time')?.value || '08:00',
        dailyTaskReminder:    el.querySelector('#pref-daily')?.checked || false,
        dailyTaskTime:        el.querySelector('#pref-daily-time')?.value || '09:00',
        restReminder:         el.querySelector('#pref-rest')?.checked || false,
        programUpdateReminder:el.querySelector('#pref-program')?.checked || false,
      };
      savePrefs(prefs);
      scheduleAll();
      window.UI?.toast('Налаштування сповіщень збережено ✓');
    });

    el.querySelector('#btn-test-notif')?.addEventListener('click', () => {
      sendLocal('🧪 Тест GymPlaner', 'Сповіщення працюють правильно! 💪', { tag: 'test' });
    });
  };

  /* ---- Утиліти ---- */

  /** Міліс до певного часу сьогодні або завтра */
  const getMsUntilTime = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    const now    = new Date();
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target - now;
  };

  /** VAPID key → Uint8Array */
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = window.atob(base64);
    return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
  };

  return {
    init, requestPermission, sendLocal, scheduleAll, clearScheduled,
    scheduleRestNotification, checkScheduled, renderSettingsPanel,
    subscribeToPush, getPrefs, savePrefs,
  };
})();

if (typeof window !== 'undefined') window.Notifications = Notifications;
