/**
 * GymPlaner — modules/social.js
 * Соціальні функції: публічний профіль, рейтинг, порівняння, шарінг досягнень
 * Архітектура готова до підключення Firebase або власного API
 */

'use strict';

const Social = (() => {

  /* ============================================================
     ПУБЛІЧНИЙ ПРОФІЛЬ
     ============================================================ */

  /**
   * Сформувати публічний профіль (без приватних даних)
   */
  const buildPublicProfile = async (username) => {
    const profile  = JSON.parse(localStorage.getItem(`gymplaner_profile_${username}`) || '{}');
    const gamiState = window.DB ? await window.DB.Gamification.get(username) : null;
    const workouts = window.DB ? await window.DB.Workouts.byUser(username) : [];
    const records  = window.DB ? await window.DB.Statistics.records(username) : [];

    const levelInfo = gamiState && window.Gamification
      ? window.Gamification.getLevelInfo(gamiState.xp)
      : { level: 1, name: 'Початківець', icon: '🥚', xp: 0 };

    return {
      username,
      displayName:    profile.name || username,
      goal:           profile.goal || '',
      level:          levelInfo.level,
      levelName:      levelInfo.name,
      levelIcon:      levelInfo.icon,
      xp:             levelInfo.xp,
      badges:         gamiState?.badges || [],
      stats: {
        totalWorkouts: workouts.length,
        totalRecords:  records.length,
        streak:        calcStreak(workouts),
        topRecord:     getTopRecord(records),
      },
      isPublic:       profile.isPublic !== false, // За замовчуванням публічний
      joinedAt:       profile.createdAt || null,
    };
  };

  /**
   * Оновити налаштування приватності
   */
  const setProfileVisibility = (username, isPublic) => {
    const profile = JSON.parse(localStorage.getItem(`gymplaner_profile_${username}`) || '{}');
    profile.isPublic = isPublic;
    localStorage.setItem(`gymplaner_profile_${username}`, JSON.stringify(profile));
  };

  /* ============================================================
     РЕЙТИНГ АКТИВНОСТІ (локальний — між акаунтами на пристрої)
     ============================================================ */

  /**
   * Отримати рейтинг всіх локальних користувачів
   */
  const getLocalLeaderboard = async () => {
    const users = JSON.parse(localStorage.getItem('gymplaner_users') || '{}');
    const entries = [];

    for (const username of Object.keys(users)) {
      try {
        const profile = await buildPublicProfile(username);
        if (profile.isPublic) {
          entries.push({
            rank:        0,
            username,
            displayName: profile.displayName,
            level:       profile.level,
            levelIcon:   profile.levelIcon,
            xp:          profile.xp,
            workouts:    profile.stats.totalWorkouts,
            streak:      profile.stats.streak,
            score:       computeActivityScore(profile),
          });
        }
      } catch {}
    }

    // Сортуємо по score
    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, i) => e.rank = i + 1);
    return entries;
  };

  /**
   * Розрахувати Activity Score для рейтингу
   * XP * 0.4 + тренування * 10 + streak * 5 + рекорди * 20
   */
  const computeActivityScore = (profile) => Math.round(
    (profile.xp             || 0) * 0.4 +
    (profile.stats.totalWorkouts || 0) * 10 +
    (profile.stats.streak    || 0) * 5 +
    (profile.stats.totalRecords  || 0) * 20
  );

  /* ============================================================
     ПОРІВНЯННЯ ПРОГРЕСУ
     ============================================================ */

  /**
   * Порівняти двох користувачів по ключових метриках
   */
  const compareProfiles = async (username1, username2) => {
    const [p1, p2] = await Promise.all([
      buildPublicProfile(username1),
      buildPublicProfile(username2),
    ]);

    const metrics = [
      { label: 'Рівень',        v1: p1.level,                v2: p2.level                },
      { label: 'XP',             v1: p1.xp,                   v2: p2.xp                   },
      { label: 'Тренувань',      v1: p1.stats.totalWorkouts,  v2: p2.stats.totalWorkouts  },
      { label: 'Рекордів',       v1: p1.stats.totalRecords,   v2: p2.stats.totalRecords   },
      { label: 'Серія (streak)', v1: p1.stats.streak,         v2: p2.stats.streak         },
    ];

    return { profile1: p1, profile2: p2, metrics };
  };

  /* ============================================================
     ШАРІНГ ДОСЯГНЕНЬ
     ============================================================ */

  /**
   * Генерувати текст для шарінгу досягнення
   */
  const generateShareText = (achievement, username, stats = {}) => {
    const lines = [
      `🏆 ${achievement.name}`,
      ``,
      `${achievement.desc}`,
      ``,
      `📊 Мої результати в GymPlaner:`,
      `💪 Тренувань: ${stats.totalWorkouts || 0}`,
      `⚡ Рівень: ${stats.level || 1}`,
      `🔥 Серія: ${stats.streak || 0} днів`,
      ``,
      `#GymPlaner #Fitness #Тренування`,
    ];
    return lines.join('\n');
  };

  /**
   * Поширити досягнення через Web Share API або буфер обміну
   */
  const shareAchievement = async (achievement, username) => {
    const profile   = await buildPublicProfile(username);
    const shareText = generateShareText(achievement, username, profile.stats);
    const shareData = {
      title: `GymPlaner — ${achievement.name}`,
      text:  shareText,
      url:   window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        if (window.Gamification) await window.Gamification.awardXP(username, 'share_achievement');
        return { method: 'native', ok: true };
      } catch (err) {
        if (err.name !== 'AbortError') console.warn('[Social] Share failed:', err);
      }
    }

    // Fallback: копіювати в буфер
    try {
      await navigator.clipboard.writeText(shareText);
      window.UI?.toast('Текст скопійовано в буфер обміну 📋');
      return { method: 'clipboard', ok: true };
    } catch {
      // Старий спосіб
      const el = document.createElement('textarea');
      el.value = shareText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      window.UI?.toast('Текст скопійовано 📋');
      return { method: 'legacy', ok: true };
    }
  };

  /**
   * Генерувати "картку" досягнення для скриншоту (SVG → canvas → download)
   */
  const downloadAchievementCard = async (achievement, username) => {
    const profile = await buildPublicProfile(username);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1a1f2e"/>
          <stop offset="100%" stop-color="#0a0b0d"/>
        </linearGradient>
      </defs>
      <rect width="600" height="300" fill="url(#bg)" rx="20"/>
      <rect x="0" y="0" width="6" height="300" fill="#f0a500" rx="3"/>
      <text x="50" y="60" font-family="Arial Black" font-size="40" fill="#f0a500">GymPlaner</text>
      <text x="50" y="110" font-family="Arial" font-size="56" fill="white">${achievement.icon}</text>
      <text x="130" y="100" font-family="Arial Black" font-size="22" fill="white">${achievement.name}</text>
      <text x="130" y="128" font-family="Arial" font-size="14" fill="#8a9ab5">${achievement.desc}</text>
      <text x="50" y="185" font-family="Arial" font-size="14" fill="#8a9ab5">Спортсмен</text>
      <text x="50" y="210" font-family="Arial Black" font-size="20" fill="white">${profile.displayName}</text>
      <text x="50" y="240" font-family="Arial" font-size="13" fill="#f0a500">Рівень ${profile.level} · ${profile.stats.totalWorkouts} тренувань</text>
      <text x="500" y="280" font-family="Arial" font-size="11" fill="#505970" text-anchor="end">gymplaner.app</text>
    </svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `achievement_${achievement.id}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ============================================================
     РЕНДЕР UI
     ============================================================ */

  /** Рендер рейтингу активності */
  const renderLeaderboard = async (containerId) => {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = '<div class="loading-spinner">Завантаження...</div>';
    const board = await getLocalLeaderboard();

    if (!board.length) {
      el.innerHTML = '<div class="empty-state"><span class="empty-icon">🏆</span><p>Поки що немає інших гравців</p></div>';
      return;
    }

    el.innerHTML = `
      <div class="leaderboard">
        <div class="lb-header">
          <span>#</span><span>Гравець</span><span>Рівень</span><span>Тренувань</span><span>Score</span>
        </div>
        ${board.map(e => `
          <div class="lb-row ${e.rank <= 3 ? 'top-' + e.rank : ''}">
            <span class="lb-rank">${e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : e.rank}</span>
            <span class="lb-name">${e.levelIcon} ${e.displayName}</span>
            <span class="lb-level">Lv.${e.level}</span>
            <span class="lb-workouts">${e.workouts}</span>
            <span class="lb-score">${e.score.toLocaleString()}</span>
          </div>`).join('')}
      </div>`;
  };

  /** Рендер порівняння двох профілів */
  const renderComparison = async (containerId, username1, username2) => {
    const el = document.getElementById(containerId);
    if (!el) return;

    const result = await compareProfiles(username1, username2);
    const { profile1, profile2, metrics } = result;

    el.innerHTML = `
      <div class="comparison-table">
        <div class="comp-header">
          <div>${profile1.displayName}</div>
          <div class="comp-vs">VS</div>
          <div>${profile2.displayName}</div>
        </div>
        ${metrics.map(m => {
          const p1Wins = m.v1 > m.v2;
          const p2Wins = m.v2 > m.v1;
          return `<div class="comp-row">
            <div class="comp-val ${p1Wins ? 'winner' : ''}">${m.v1}</div>
            <div class="comp-label">${m.label}</div>
            <div class="comp-val ${p2Wins ? 'winner' : ''}">${m.v2}</div>
          </div>`;
        }).join('')}
      </div>`;
  };

  /* ---- Утиліти ---- */
  const calcStreak = (workouts) => {
    if (!workouts.length) return 0;
    const dates = [...new Set(workouts.map(w => w.date))].sort().reverse();
    let count = 0, prev = null;
    for (const d of dates) {
      if (!prev) { prev = d; count = 1; continue; }
      const diff = (new Date(prev) - new Date(d)) / 86400000;
      if (diff <= 1) { count++; prev = d; } else break;
    }
    return count;
  };

  const getTopRecord = (records) => {
    if (!records.length) return null;
    return records.reduce((top, r) => !top || r.weight > top.weight ? r : top, null);
  };

  return {
    buildPublicProfile, setProfileVisibility, getLocalLeaderboard,
    compareProfiles, shareAchievement, downloadAchievementCard,
    computeActivityScore, renderLeaderboard, renderComparison,
    generateShareText,
  };
})();

if (typeof window !== 'undefined') window.Social = Social;
