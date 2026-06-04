/**
 * GymPlaner — modules/gamification.js
 * Гейміфікація: рівні, XP, щоденні завдання, тижневі виклики, значки
 */

'use strict';

const Gamification = (() => {

  /* ============================================================
     КОНФІГУРАЦІЯ СИСТЕМИ РІВНІВ
     ============================================================ */
  const LEVELS = [
    { level: 1,  name: 'Новачок',       xpRequired: 0,      icon: '🥚' },
    { level: 2,  name: 'Початківець',   xpRequired: 100,    icon: '🐣' },
    { level: 3,  name: 'Атлет',         xpRequired: 300,    icon: '💪' },
    { level: 4,  name: 'Тренований',    xpRequired: 600,    icon: '🏃' },
    { level: 5,  name: 'Спортсмен',     xpRequired: 1000,   icon: '⚡' },
    { level: 6,  name: 'Силовик',       xpRequired: 1500,   icon: '🏋️' },
    { level: 7,  name: 'Залізний',      xpRequired: 2500,   icon: '🦾' },
    { level: 8,  name: 'Чемпіон',       xpRequired: 4000,   icon: '🏆' },
    { level: 9,  name: 'Легенда',       xpRequired: 6000,   icon: '👑' },
    { level: 10, name: 'Залізна Легенда',xpRequired: 10000, icon: '🌟' },
  ];

  /* ============================================================
     XP ЗА ДІЇ
     ============================================================ */
  const XP_REWARDS = {
    complete_workout:     50,   // Завершити тренування
    complete_all_sets:    20,   // Завершити всі підходи
    new_pr:               100,  // Новий особистий рекорд
    log_measurement:      15,   // Записати заміри
    create_program:       30,   // Створити програму
    login_streak_3:       25,   // 3 дні підряд
    login_streak_7:       75,   // 7 днів підряд
    login_streak_30:      200,  // 30 днів підряд
    daily_task:           40,   // Виконати щоденне завдання
    weekly_challenge:     150,  // Виконати тижневий виклик
    share_achievement:    20,   // Поширити досягнення
    complete_exercise:    5,    // Одна вправа
  };

  /* ============================================================
     ЩОДЕННІ ЗАВДАННЯ (генеруються щодня)
     ============================================================ */
  const DAILY_TASK_POOL = [
    { id:'dt_workout',    title:'Заверши тренування',            desc:'Виконай будь-яке заплановане тренування',     xp:50, type:'workout',     target:1  },
    { id:'dt_3sets',      title:'30 підходів сьогодні',          desc:'Виконай 30 підходів за одне тренування',       xp:40, type:'sets',        target:30 },
    { id:'dt_cardio',     title:'20 хв кардіо',                  desc:'Зроби кардіо-вправу тривалістю 20+ хвилин',   xp:35, type:'cardio',      target:1  },
    { id:'dt_measure',    title:'Зафіксуй заміри',               desc:'Запиши сьогоднішні виміри тіла',               xp:20, type:'measurement', target:1  },
    { id:'dt_pr',         title:'Постав рекорд',                 desc:'Встанови особистий рекорд у будь-якій вправі', xp:80, type:'pr',          target:1  },
    { id:'dt_legs',       title:'День ніг',                      desc:'Виконай тренування з вправами на ноги',        xp:45, type:'muscle_group', target:'legs'   },
    { id:'dt_push',       title:'День грудей/плечей',            desc:'Виконай тренування на груди або плечі',        xp:45, type:'muscle_group', target:'chest'  },
    { id:'dt_hydration',  title:'Відмітити тренування',          desc:'Запиши хоча б одне тренування в журнал',       xp:15, type:'log',         target:1  },
  ];

  /* ============================================================
     ТИЖНЕВІ ВИКЛИКИ
     ============================================================ */
  const WEEKLY_CHALLENGE_POOL = [
    { id:'wc_4workouts',    title:'Воїн тижня',           desc:'Заверши 4 тренування за цей тиждень',            xp:150, type:'workout_count',   target:4  },
    { id:'wc_5workouts',    title:'Залізна воля',          desc:'5 тренувань за тиждень — серйозна справа!',      xp:200, type:'workout_count',   target:5  },
    { id:'wc_pr_2',         title:'Рекордний тиждень',     desc:'Постав 2 особистих рекорди цього тижня',         xp:180, type:'pr_count',        target:2  },
    { id:'wc_streak7',      title:'7 днів підряд',         desc:'Тренуйся 7 днів без перерви',                   xp:250, type:'streak',          target:7  },
    { id:'wc_fullbody',     title:'Повне тіло',            desc:'Прокачай всі групи м\'язів протягом тижня',      xp:160, type:'all_groups',      target:6  },
    { id:'wc_measurements', title:'Трекер ваги',           desc:'Зафіксуй вагу 3 рази протягом тижня',            xp:80,  type:'measurement_count',target:3  },
  ];

  /* ============================================================
     ЗНАЧКИ (badges)
     ============================================================ */
  const BADGES = [
    { id:'b_iron',       name:'Залізна воля',     icon:'🔩', desc:'50 тренувань',              condition: s => s.totalWorkouts >= 50    },
    { id:'b_century',    name:'Сотня',             icon:'💯', desc:'100 тренувань',             condition: s => s.totalWorkouts >= 100   },
    { id:'b_beast',      name:'Бестія',            icon:'🦁', desc:'200 тренувань',             condition: s => s.totalWorkouts >= 200   },
    { id:'b_pr_master',  name:'Майстер рекордів',  icon:'🥇', desc:'10 особистих рекордів',     condition: s => s.totalPRs >= 10         },
    { id:'b_early_bird', name:'Ранній птах',       icon:'🐦', desc:'Зареєстровано < 30 днів',   condition: s => s.accountAgeDays < 30   },
    { id:'b_consistent', name:'Залізна звичка',    icon:'⛓', desc:'30 днів streak',             condition: s => s.maxStreak >= 30        },
    { id:'b_variety',    name:'Різносторонній',    icon:'🎯', desc:'Вправи на всі 8 груп',       condition: s => s.uniqueGroups >= 8     },
    { id:'b_lvl5',       name:'Середня ланка',     icon:'⚡', desc:'Досягнуто 5-го рівня',       condition: s => s.level >= 5             },
    { id:'b_lvl10',      name:'Залізна Легенда',   icon:'🌟', desc:'Максимальний рівень!',        condition: s => s.level >= 10            },
  ];

  /* ============================================================
     ОСНОВНІ МЕТОДИ
     ============================================================ */

  /** Отримати або ініціалізувати стан гейміфікації */
  const getState = async (username) => {
    if (!window.DB) return defaultState(username);
    const saved = await window.DB.Gamification.get(username);
    return saved || defaultState(username);
  };

  const defaultState = (username) => ({
    username,
    xp:             0,
    level:          1,
    totalXPEarned:  0,
    badges:         [],
    dailyTasks:     { date: '', tasks: [], completedIds: [] },
    weeklyChallenge:{ week: '', challenge: null, progress: 0, completed: false },
    xpHistory:      [],
    maxStreak:      0,
    updatedAt:      Date.now(),
  });

  const saveState = async (state) => {
    if (!window.DB) return;
    await window.DB.Gamification.put({ ...state, updatedAt: Date.now() });
  };

  /* ============================================================
     НАРАХУВАННЯ XP
     ============================================================ */

  /**
   * Нарахувати XP за дію
   * @param {string} username
   * @param {string} action - ключ з XP_REWARDS
   * @param {number} multiplier - множник (для streak бонусів)
   */
  const awardXP = async (username, action, multiplier = 1) => {
    const amount = Math.round((XP_REWARDS[action] || 10) * multiplier);
    const state  = await getState(username);

    state.xp           += amount;
    state.totalXPEarned += amount;
    state.xpHistory.push({ action, amount, date: new Date().toISOString(), timestamp: Date.now() });

    // Обрізати історію до 100 записів
    if (state.xpHistory.length > 100) state.xpHistory = state.xpHistory.slice(-100);

    // Перевірити підвищення рівня
    const newLevel = calculateLevel(state.xp);
    const levelUp  = newLevel > state.level;
    if (levelUp) {
      state.level = newLevel;
      onLevelUp(newLevel);
    }

    await saveState(state);
    await checkBadges(username, state);

    if (window.UI) {
      window.UI.toast(`+${amount} XP — ${action.replace(/_/g,' ')} ⚡`, 'info');
    }

    return { amount, levelUp, newLevel: state.level, totalXP: state.xp };
  };

  /** Розрахувати рівень по XP */
  const calculateLevel = (xp) => {
    let level = 1;
    for (const l of LEVELS) {
      if (xp >= l.xpRequired) level = l.level;
      else break;
    }
    return level;
  };

  /** Отримати дані поточного рівня */
  const getLevelInfo = (xp) => {
    const level     = calculateLevel(xp);
    const current   = LEVELS.find(l => l.level === level);
    const next      = LEVELS.find(l => l.level === level + 1);
    const xpInLevel = xp - current.xpRequired;
    const xpToNext  = next ? next.xpRequired - current.xpRequired : 1;
    const progress  = next ? Math.round(xpInLevel / xpToNext * 100) : 100;
    return { level, name: current.name, icon: current.icon, xp, xpInLevel, xpToNext, progress, isMax: !next };
  };

  /** Подія підвищення рівня */
  const onLevelUp = (level) => {
    const info = LEVELS.find(l => l.level === level);
    if (window.UI) {
      setTimeout(() => {
        window.UI.toast(`🎉 РІВЕНЬ ${level} — ${info.name} ${info.icon}!`, 'info');
      }, 500);
    }
  };

  /* ============================================================
     ЩОДЕННІ ЗАВДАННЯ
     ============================================================ */

  /** Отримати завдання на сьогодні (або згенерувати нові) */
  const getDailyTasks = async (username) => {
    const state   = await getState(username);
    const today   = new Date().toISOString().split('T')[0];

    if (state.dailyTasks.date !== today) {
      // Новий день — генерувати нові завдання
      const tasks = selectDailyTasks();
      state.dailyTasks = { date: today, tasks, completedIds: [] };
      await saveState(state);
    }

    return state.dailyTasks;
  };

  /** Вибрати 3 завдання на день (детерміновано по даті для передбачуваності) */
  const selectDailyTasks = () => {
    const seed  = new Date().toISOString().split('T')[0].replace(/-/g,'');
    const index = parseInt(seed) % DAILY_TASK_POOL.length;
    const tasks = [];
    for (let i = 0; i < 3; i++) {
      tasks.push(DAILY_TASK_POOL[(index + i) % DAILY_TASK_POOL.length]);
    }
    return tasks;
  };

  /** Позначити щоденне завдання як виконане */
  const completeTask = async (username, taskId) => {
    const state = await getState(username);
    if (state.dailyTasks.completedIds.includes(taskId)) return false;
    state.dailyTasks.completedIds.push(taskId);
    await saveState(state);
    await awardXP(username, 'daily_task');
    return true;
  };

  /* ============================================================
     ТИЖНЕВИЙ ВИКЛИК
     ============================================================ */

  /** Отримати або згенерувати тижневий виклик */
  const getWeeklyChallenge = async (username) => {
    const state     = await getState(username);
    const thisWeek  = getWeekKey();

    if (state.weeklyChallenge.week !== thisWeek) {
      const challenge = WEEKLY_CHALLENGE_POOL[parseInt(thisWeek.replace(/\D/g,'')) % WEEKLY_CHALLENGE_POOL.length];
      state.weeklyChallenge = { week: thisWeek, challenge, progress: 0, completed: false };
      await saveState(state);
    }

    return state.weeklyChallenge;
  };

  /** Оновити прогрес тижневого виклику */
  const updateWeeklyProgress = async (username, amount = 1) => {
    const state = await getState(username);
    if (state.weeklyChallenge.completed) return;
    state.weeklyChallenge.progress = Math.min(
      state.weeklyChallenge.challenge?.target || 1,
      (state.weeklyChallenge.progress || 0) + amount
    );
    if (state.weeklyChallenge.progress >= state.weeklyChallenge.challenge?.target) {
      state.weeklyChallenge.completed = true;
      await awardXP(username, 'weekly_challenge');
      window.UI?.toast('🏆 Тижневий виклик виконано!', 'info');
    }
    await saveState(state);
    return state.weeklyChallenge;
  };

  /* ============================================================
     ЗНАЧКИ
     ============================================================ */
  const checkBadges = async (username, state) => {
    if (!window.DB) return;

    const workouts    = await window.DB.Workouts.byUser(username);
    const records     = await window.DB.Statistics.records(username);
    const exercises   = workouts.flatMap(w => w.exercises || []);
    const uniqueGroups = new Set(exercises.map(e => e.group)).size;
    const accountAge  = Math.round((Date.now() - (state.createdAt || Date.now())) / 86400000);

    const summary = {
      totalWorkouts: workouts.length,
      totalPRs:      records.length,
      maxStreak:     state.maxStreak || 0,
      uniqueGroups,
      accountAgeDays: accountAge,
      level:         state.level,
    };

    for (const badge of BADGES) {
      if (!state.badges.includes(badge.id) && badge.condition(summary)) {
        state.badges.push(badge.id);
        window.UI?.toast(`🏅 Нова нагорода: ${badge.name}!`, 'info');
      }
    }
    await saveState(state);
  };

  /* ============================================================
     РЕНДЕР UI
     ============================================================ */
  const renderGamificationWidget = async (username, containerId) => {
    const el    = document.getElementById(containerId);
    if (!el) return;

    const state   = await getState(username);
    const info    = getLevelInfo(state.xp);
    const daily   = await getDailyTasks(username);
    const weekly  = await getWeeklyChallenge(username);

    el.innerHTML = `
      <!-- XP / Рівень -->
      <div class="gami-level-card">
        <div class="gami-level-icon">${info.icon}</div>
        <div class="gami-level-info">
          <div class="gami-level-title">Рівень ${info.level} — ${info.name}</div>
          <div class="xp-bar-wrap">
            <div class="xp-bar">
              <div class="xp-fill" style="width:${info.progress}%"></div>
            </div>
            <span class="xp-label">${info.isMax ? 'MAX' : info.xpInLevel + ' / ' + info.xpToNext + ' XP'}</span>
          </div>
          <div class="gami-total-xp">Всього: ${state.xp.toLocaleString()} XP</div>
        </div>
      </div>

      <!-- Значки -->
      ${state.badges.length ? `
      <div class="gami-badges">
        ${state.badges.map(bid => {
          const b = BADGES.find(x => x.id === bid);
          return b ? `<span class="gami-badge" title="${b.name}: ${b.desc}">${b.icon}</span>` : '';
        }).join('')}
      </div>` : ''}

      <!-- Щоденні завдання -->
      <div class="gami-section">
        <h5 class="gami-section-title">📋 Щоденні завдання</h5>
        ${daily.tasks.map(t => {
          const done = daily.completedIds.includes(t.id);
          return `<div class="daily-task ${done ? 'done' : ''}">
            <span class="task-check">${done ? '✓' : '○'}</span>
            <div class="task-info">
              <div class="task-title">${t.title}</div>
              <div class="task-desc">${t.desc}</div>
            </div>
            <span class="task-xp">+${t.xp} XP</span>
            ${!done ? `<button class="btn-ghost task-btn" onclick="Gamification.completeTask('${username}','${t.id}').then(()=>Gamification.renderGamificationWidget('${username}','${containerId}'))">Виконано</button>` : ''}
          </div>`;
        }).join('')}
      </div>

      <!-- Тижневий виклик -->
      ${weekly.challenge ? `
      <div class="gami-section">
        <h5 class="gami-section-title">⚔️ Тижневий виклик</h5>
        <div class="weekly-challenge ${weekly.completed ? 'done' : ''}">
          <div class="wc-title">${weekly.challenge.title}</div>
          <div class="wc-desc">${weekly.challenge.desc}</div>
          <div class="wc-progress-bar">
            <div class="wc-fill" style="width:${Math.round(weekly.progress / weekly.challenge.target * 100)}%"></div>
          </div>
          <div class="wc-meta">${weekly.progress} / ${weekly.challenge.target} · +${weekly.challenge.xp} XP</div>
          ${weekly.completed ? '<div class="wc-done">✓ Виконано!</div>' : ''}
        </div>
      </div>` : ''}
    `;
  };

  /* ---- Утиліти ---- */
  const getWeekKey = () => {
    const d = new Date();
    const y = d.getFullYear();
    const w = Math.ceil(((d - new Date(y,0,1)) / 86400000 + new Date(y,0,1).getDay() + 1) / 7);
    return `${y}-W${w}`;
  };

  return { awardXP, getLevelInfo, calculateLevel, getDailyTasks, completeTask, getWeeklyChallenge, updateWeeklyProgress, checkBadges, renderGamificationWidget, getState, LEVELS, XP_REWARDS, BADGES };
})();

if (typeof window !== 'undefined') window.Gamification = Gamification;
