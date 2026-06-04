/**
 * GymPlaner — modules/db.js
 * IndexedDB абстракція — замінює LocalStorage для великих даних
 * Колекції: users, workouts, exercises, statistics, achievements, syncQueue
 */

'use strict';

const DB = (() => {
  /* ---- Константи ---- */
  const DB_NAME    = 'GymPlanerDB';
  const DB_VERSION = 3;

  /** Схема бази даних */
  const STORES = {
    users:        { keyPath: 'username' },
    workouts:     { keyPath: 'id',        autoIncrement: false },
    exercises:    { keyPath: 'id',        autoIncrement: false },
    statistics:   { keyPath: 'id',        autoIncrement: false },
    achievements: { keyPath: 'id',        autoIncrement: false },
    syncQueue:    { keyPath: 'queueId',   autoIncrement: true  },
    programs:     { keyPath: 'id',        autoIncrement: false },
    measurements: { keyPath: 'id',        autoIncrement: false },
    records:      { keyPath: 'id',        autoIncrement: false },
    notifications:{ keyPath: 'id',        autoIncrement: true  },
    gamification: { keyPath: 'username'  },
  };

  /** Індекси для швидкого пошуку */
  const INDEXES = {
    workouts:     [{ name: 'by_user',   keyPath: 'username' }, { name: 'by_date',  keyPath: 'date' }],
    exercises:    [{ name: 'by_group',  keyPath: 'group'    }, { name: 'by_user',  keyPath: 'username' }],
    statistics:   [{ name: 'by_user',   keyPath: 'username' }, { name: 'by_type',  keyPath: 'type' }],
    achievements: [{ name: 'by_user',   keyPath: 'username' }],
    syncQueue:    [{ name: 'by_status', keyPath: 'status'   }, { name: 'by_user',  keyPath: 'username' }],
    programs:     [{ name: 'by_user',   keyPath: 'username' }],
    measurements: [{ name: 'by_user',   keyPath: 'username' }, { name: 'by_date',  keyPath: 'date' }],
    records:      [{ name: 'by_user',   keyPath: 'username' }],
  };

  let _db = null; // Singleton з'єднання

  /* ============================================================
     ІНІЦІАЛІЗАЦІЯ
     ============================================================ */

  /** Відкрити / оновити БД */
  const open = () => new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;
      console.log(`[DB] Upgrading from v${oldVersion} to v${DB_VERSION}`);

      // Створюємо сховища яких немає
      Object.entries(STORES).forEach(([name, opts]) => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, opts);
          // Додаємо індекси
          (INDEXES[name] || []).forEach(idx =>
            store.createIndex(idx.name, idx.keyPath, { unique: false })
          );
          console.log(`[DB] Created store: ${name}`);
        }
      });
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      console.log('[DB] Opened:', DB_NAME, 'v' + DB_VERSION);
      resolve(_db);
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () => console.warn('[DB] Blocked — close other tabs');
  });

  /* ============================================================
     CRUD-ОПЕРАЦІЇ (generic)
     ============================================================ */

  /** Транзакція-хелпер */
  const tx = async (stores, mode = 'readonly') => {
    const db = await open();
    const storeList = Array.isArray(stores) ? stores : [stores];
    return db.transaction(storeList, mode);
  };

  /** Отримати один запис по ключу */
  const get = (storeName, key) => new Promise(async (resolve, reject) => {
    const t = await tx(storeName);
    const req = t.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });

  /** Отримати всі записи зі сховища */
  const getAll = (storeName, query = null) => new Promise(async (resolve, reject) => {
    const t = await tx(storeName);
    const req = t.objectStore(storeName).getAll(query);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });

  /** Отримати записи по індексу */
  const getByIndex = (storeName, indexName, value) => new Promise(async (resolve, reject) => {
    const t = await tx(storeName);
    const req = t.objectStore(storeName).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });

  /** Зберегти (put = insert or replace) */
  const put = (storeName, data) => new Promise(async (resolve, reject) => {
    const t = await tx(storeName, 'readwrite');
    const req = t.objectStore(storeName).put({ ...data, updatedAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });

  /** Зберегти масив за одну транзакцію */
  const putMany = (storeName, items) => new Promise(async (resolve, reject) => {
    const t = await tx(storeName, 'readwrite');
    const store = t.objectStore(storeName);
    let count = 0;
    items.forEach(item => {
      const req = store.put({ ...item, updatedAt: Date.now() });
      req.onsuccess = () => { count++; if (count === items.length) resolve(count); };
      req.onerror   = () => reject(req.error);
    });
    if (items.length === 0) resolve(0);
  });

  /** Видалити запис по ключу */
  const remove = (storeName, key) => new Promise(async (resolve, reject) => {
    const t = await tx(storeName, 'readwrite');
    const req = t.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror   = () => reject(req.error);
  });

  /** Очистити все сховище */
  const clear = (storeName) => new Promise(async (resolve, reject) => {
    const t = await tx(storeName, 'readwrite');
    const req = t.objectStore(storeName).clear();
    req.onsuccess = () => resolve(true);
    req.onerror   = () => reject(req.error);
  });

  /** Підрахунок записів */
  const count = (storeName, query = null) => new Promise(async (resolve, reject) => {
    const t = await tx(storeName);
    const req = t.objectStore(storeName).count(query);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });

  /* ============================================================
     СПЕЦІАЛІЗОВАНІ МЕТОДИ ПО КОЛЕКЦІЯХ
     ============================================================ */

  /** === USERS === */
  const Users = {
    get:    (username)  => get('users', username),
    put:    (user)      => put('users', user),
    remove: (username)  => remove('users', username),
    getAll: ()          => getAll('users'),
  };

  /** === WORKOUTS (журнал тренувань) === */
  const Workouts = {
    get:       (id)       => get('workouts', id),
    put:       (w)        => put('workouts', { ...w, id: w.id || `w_${Date.now()}` }),
    remove:    (id)       => remove('workouts', id),
    getAll:    ()         => getAll('workouts'),
    byUser:    (username) => getByIndex('workouts', 'by_user', username),
    byDate:    (date)     => getByIndex('workouts', 'by_date', date),

    /** Статистика по користувачу */
    statsForUser: async (username) => {
      const all = await getByIndex('workouts', 'by_user', username);
      const now  = new Date();
      const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay()+6)%7)); monday.setHours(0,0,0,0);
      return {
        total:    all.length,
        thisWeek: all.filter(w => new Date(w.date) >= monday).length,
        streak:   calcStreak(all),
        exercises:all.reduce((a, w) => a + (w.exercises?.length || 0), 0),
      };
    }
  };

  /** === EXERCISES (каталог вправ) === */
  const Exercises = {
    get:    (id)    => get('exercises', id),
    put:    (e)     => put('exercises', e),
    remove: (id)    => remove('exercises', id),
    getAll: ()      => getAll('exercises'),
    byGroup:(group) => getByIndex('exercises', 'by_group', group),
    custom: (user)  => getByIndex('exercises', 'by_user', user),
    seed:   (list)  => putMany('exercises', list),
  };

  /** === STATISTICS (заміри + рекорди) === */
  const Statistics = {
    get:    (id)    => get('statistics', id),
    put:    (s)     => put('statistics', { ...s, id: s.id || `st_${Date.now()}` }),
    remove: (id)    => remove('statistics', id),
    byUser: (user)  => getByIndex('statistics', 'by_user', user),
    byType: (type)  => getByIndex('statistics', 'by_type', type),

    /** Отримати заміри конкретного юзера */
    measurements: async (username) => {
      const all = await getByIndex('statistics', 'by_user', username);
      return all.filter(s => s.type === 'measurement').sort((a,b) => a.date.localeCompare(b.date));
    },

    /** Отримати рекорди конкретного юзера */
    records: async (username) => {
      const all = await getByIndex('statistics', 'by_user', username);
      return all.filter(s => s.type === 'record');
    },
  };

  /** === ACHIEVEMENTS === */
  const AchievementsStore = {
    get:    (id)    => get('achievements', id),
    put:    (a)     => put('achievements', a),
    byUser: (user)  => getByIndex('achievements', 'by_user', user),
  };

  /** === SYNC QUEUE === */
  const SyncQueue = {
    push:   (item)  => put('syncQueue', { ...item, status: 'pending', createdAt: Date.now() }),
    getPending: ()  => getByIndex('syncQueue', 'by_status', 'pending'),
    markDone: (queueId) => put('syncQueue', { queueId, status: 'done', updatedAt: Date.now() }),
    markFailed:(queueId, err) => put('syncQueue', { queueId, status: 'failed', error: err, updatedAt: Date.now() }),
    clear:  ()      => clear('syncQueue'),
  };

  /** === PROGRAMS === */
  const Programs = {
    get:    (id)    => get('programs', id),
    put:    (p)     => put('programs', p),
    remove: (id)    => remove('programs', id),
    byUser: (user)  => getByIndex('programs', 'by_user', user),
    getAll: ()      => getAll('programs'),
  };

  /** === GAMIFICATION === */
  const Gamification = {
    get:  (username) => get('gamification', username),
    put:  (data)     => put('gamification', data),
  };

  /* ============================================================
     УТИЛІТИ
     ============================================================ */

  /** Розрахунок streak з масиву записів тренувань */
  function calcStreak(workouts) {
    if (!workouts.length) return 0;
    const dates = [...new Set(workouts.map(w => w.date))].sort().reverse();
    let count = 0, prev = null;
    for (const d of dates) {
      if (!prev) { prev = d; count = 1; continue; }
      const diff = (new Date(prev) - new Date(d)) / 86400000;
      if (diff <= 1) { count++; prev = d; } else break;
    }
    return count;
  }

  /** Розмір сховища */
  const estimateSize = async () => {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return {
      usedMB:  (usage  / 1024 / 1024).toFixed(2),
      totalMB: (quota  / 1024 / 1024).toFixed(0),
      percent: Math.round(usage / quota * 100),
    };
  };

  /** Повний експорт усіх даних юзера */
  const exportUserData = async (username) => ({
    exportedAt:   new Date().toISOString(),
    version:      DB_VERSION,
    username,
    workouts:     await Workouts.byUser(username),
    programs:     await Programs.byUser(username),
    statistics:   await Statistics.byUser(username),
    achievements: await AchievementsStore.byUser(username),
    gamification: await Gamification.get(username),
    exercises:    await Exercises.custom(username),
  });

  /** Повний імпорт даних юзера */
  const importUserData = async (data) => {
    const { username } = data;
    if (data.workouts)     await putMany('workouts',     data.workouts.map(w => ({...w, username})));
    if (data.programs)     await putMany('programs',     data.programs.map(p => ({...p, username})));
    if (data.statistics)   await putMany('statistics',   data.statistics.map(s => ({...s, username})));
    if (data.achievements) await putMany('achievements', data.achievements);
    if (data.exercises)    await putMany('exercises',    data.exercises);
    if (data.gamification) await Gamification.put({ ...data.gamification, username });
    return true;
  };

  /* ---- Публічний API ---- */
  return {
    open, get, getAll, getByIndex, put, putMany, remove, clear, count,
    Users, Workouts, Exercises, Statistics, AchievementsStore, SyncQueue, Programs, Gamification,
    estimateSize, exportUserData, importUserData,
  };
})();

/* Зробити глобально доступним */
if (typeof window !== 'undefined') window.DB = DB;
if (typeof module !== 'undefined') module.exports = DB;
