/**
 * GymPlaner — modules/ai.js
 * AI Аналітика: аналіз прогресу, виявлення застою, рекомендації, прогнозування
 * Алгоритми: лінійна регресія, ковзне середнє, статистичний аналіз відхилень
 */

'use strict';

const AIEngine = (() => {

  /* ============================================================
     АНАЛІЗ ПРОГРЕСУ — головна функція
     ============================================================ */

  /**
   * Повний аналіз даних користувача
   * @returns {object} - insights, recommendations, predictions
   */
  const analyzeUser = async (username) => {
    if (!window.DB) return null;

    const [workouts, stats, measurements] = await Promise.all([
      window.DB.Workouts.byUser(username),
      window.DB.Statistics.records(username),
      window.DB.Statistics.measurements(username),
    ]);

    const insights = {
      workoutFrequency: analyzeFrequency(workouts),
      plateau:          detectPlateau(stats),
      weightTrend:      analyzeTrend(measurements.map(m => ({ x: m.date, y: m.weight })).filter(p => p.y)),
      volumeTrend:      analyzeVolumeTrend(workouts),
      recovery:         analyzeRecovery(workouts),
      consistency:      analyzeConsistency(workouts),
    };

    const recommendations = generateRecommendations(insights, workouts, stats);
    const predictions      = generatePredictions(stats, workouts);

    return { insights, recommendations, predictions, generatedAt: Date.now() };
  };

  /* ============================================================
     1. ЧАСТОТА ТРЕНУВАНЬ
     ============================================================ */
  const analyzeFrequency = (workouts) => {
    if (workouts.length < 4) return { status: 'insufficient_data', avgPerWeek: 0 };

    const sorted = [...workouts].sort((a,b) => a.date.localeCompare(b.date));
    const first  = new Date(sorted[0].date);
    const last   = new Date(sorted[sorted.length - 1].date);
    const weeks  = Math.max(1, (last - first) / (7 * 86400000));
    const avgPerWeek = workouts.length / weeks;

    let status;
    if (avgPerWeek >= 4)       status = 'excellent';
    else if (avgPerWeek >= 3)  status = 'good';
    else if (avgPerWeek >= 2)  status = 'moderate';
    else                       status = 'low';

    return { avgPerWeek: Math.round(avgPerWeek * 10) / 10, status, totalWeeks: Math.round(weeks) };
  };

  /* ============================================================
     2. ВИЯВЛЕННЯ ЗАСТОЮ (Plateau Detection)
     ============================================================ */
  const detectPlateau = (records) => {
    if (records.length < 3) return [];
    const plateaus = [];

    // Групуємо рекорди по вправах
    const byExercise = {};
    records.forEach(r => {
      if (!byExercise[r.exerciseId]) byExercise[r.exerciseId] = [];
      byExercise[r.exerciseId].push(r);
    });

    for (const [exId, recs] of Object.entries(byExercise)) {
      const sorted = recs.sort((a,b) => a.date.localeCompare(b.date));
      if (sorted.length < 3) continue;

      const last3 = sorted.slice(-3).map(r => r.weight);
      const maxDiff = Math.max(...last3) - Math.min(...last3);
      const lastProgress = sorted[sorted.length-1].date;
      const daysSince = (Date.now() - new Date(lastProgress)) / 86400000;

      if (maxDiff < 2.5 && daysSince > 21) {
        plateaus.push({
          exerciseId: exId,
          currentWeight: sorted[sorted.length-1].weight,
          daysSincePR:   Math.round(daysSince),
          severity: daysSince > 42 ? 'high' : 'medium',
        });
      }
    }
    return plateaus;
  };

  /* ============================================================
     3. ЛІНІЙНА РЕГРЕСІЯ (тренд)
     ============================================================ */

  /**
   * Обчислити лінію тренду по масиву точок { x: dateStr, y: number }
   * @returns { slope, intercept, r2, direction }
   */
  const analyzeTrend = (points) => {
    if (points.length < 3) return { direction: 'stable', slope: 0, r2: 0 };

    // Конвертуємо дати в числові індекси
    const n  = points.length;
    const xs = points.map((_, i) => i);
    const ys = points.map(p => p.y);

    const sumX  = xs.reduce((a,b) => a+b, 0);
    const sumY  = ys.reduce((a,b) => a+b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sumX2 = xs.reduce((a, x) => a + x * x, 0);

    const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Коефіцієнт детермінації R²
    const yMean  = sumY / n;
    const ssTot  = ys.reduce((a, y) => a + (y - yMean) ** 2, 0);
    const ssRes  = ys.reduce((a, y, i) => a + (y - (slope * i + intercept)) ** 2, 0);
    const r2     = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    const direction = slope > 0.05 ? 'up' : slope < -0.05 ? 'down' : 'stable';
    return { slope: Math.round(slope * 1000) / 1000, intercept, r2: Math.round(r2 * 100) / 100, direction };
  };

  /* ============================================================
     4. АНАЛІЗ ТРЕНУВАЛЬНОГО ОБ'ЄМУ
     ============================================================ */
  const analyzeVolumeTrend = (workouts) => {
    if (workouts.length < 4) return { trend: 'stable', weeklyVolume: [] };

    // Групуємо по тижнях
    const byWeek = {};
    workouts.forEach(w => {
      const d = new Date(w.date);
      const week = `${d.getFullYear()}-W${getWeekNumber(d)}`;
      byWeek[week] = (byWeek[week] || 0) + (w.exercises?.length || 1);
    });

    const weeklyVolume = Object.entries(byWeek)
      .sort((a,b) => a[0].localeCompare(b[0]))
      .map(([week, vol]) => ({ week, volume: vol }));

    const trend = analyzeTrend(weeklyVolume.map((w, i) => ({ x: i, y: w.volume })));

    return { trend: trend.direction, weeklyVolume, avgVolume: Math.round(weeklyVolume.reduce((a,w) => a + w.volume, 0) / weeklyVolume.length) };
  };

  /* ============================================================
     5. АНАЛІЗ ВІДНОВЛЕННЯ
     ============================================================ */
  const analyzeRecovery = (workouts) => {
    if (workouts.length < 3) return { status: 'unknown', avgRestDays: 0 };

    const sorted = [...workouts].sort((a,b) => a.date.localeCompare(b.date));
    const gaps = [];

    for (let i = 1; i < sorted.length; i++) {
      const diff = (new Date(sorted[i].date) - new Date(sorted[i-1].date)) / 86400000;
      gaps.push(diff);
    }

    const avgGap = gaps.reduce((a,b) => a+b, 0) / gaps.length;
    const trainingTooMuch = gaps.filter(g => g < 1).length / gaps.length > 0.3;
    const trainingTooLittle = avgGap > 4;

    return {
      avgRestDays:   Math.round(avgGap * 10) / 10,
      status:        trainingTooMuch ? 'overtraining_risk' : trainingTooLittle ? 'undertraining' : 'optimal',
      consecutiveDays: gaps.filter(g => g <= 1).length,
    };
  };

  /* ============================================================
     6. КОНСИСТЕНТНІСТЬ
     ============================================================ */
  const analyzeConsistency = (workouts) => {
    if (workouts.length < 4) return { score: 0, status: 'insufficient' };

    const last30 = workouts.filter(w => {
      const d = new Date(w.date);
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
      return d >= cutoff;
    }).length;

    const score = Math.min(100, Math.round(last30 / 12 * 100)); // 12 тренувань = 100%
    const status = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'moderate' : 'low';
    return { score, last30Days: last30, status };
  };

  /* ============================================================
     7. АВТОМАТИЧНІ РЕКОМЕНДАЦІЇ
     ============================================================ */
  const generateRecommendations = (insights, workouts, records) => {
    const recs = [];

    /* Застій в прогресі */
    insights.plateau.forEach(p => {
      recs.push({
        type: 'plateau_break',
        priority: p.severity === 'high' ? 'high' : 'medium',
        exerciseId: p.exerciseId,
        title: '📊 Виявлено застій у прогресі',
        message: `Результат не зростає вже ${p.daysSincePR} днів. Спробуй зміни в тренуванні.`,
        actions: [
          { label: 'Збільш кількість підходів на 1',  type: 'increase_sets'   },
          { label: 'Зміни діапазон повторень',          type: 'change_reps'     },
          { label: 'Спробуй дроп-сет або суперсет',    type: 'technique_change'},
          { label: 'Зроби тиждень розвантаження',       type: 'deload_week'     },
        ],
      });
    });

    /* Надмірне тренування */
    if (insights.recovery.status === 'overtraining_risk') {
      recs.push({
        type: 'recovery',
        priority: 'high',
        title: '⚠️ Ризик перетренованості',
        message: `Ти тренуєшся ${insights.recovery.consecutiveDays} днів підряд без відпочинку. Відпочинок — частина тренування!`,
        actions: [{ label: 'Запланувати день відпочинку', type: 'rest_day' }],
      });
    }

    /* Рекомендація збільшити вагу */
    records.filter(r => r.reps >= 12).forEach(r => {
      recs.push({
        type: 'weight_increase',
        priority: 'low',
        exerciseId: r.exerciseId,
        title: '💪 Час збільшувати вагу',
        message: `Ти виконуєш ${r.reps} повторень з ${r.weight} кг. Спробуй додати 2.5 кг.`,
        suggestedWeight: r.weight + 2.5,
        actions: [{ label: `Додати вагу → ${r.weight + 2.5} кг`, type: 'increase_weight' }],
      });
    });

    /* Низька активність */
    if (insights.workoutFrequency.status === 'low') {
      recs.push({
        type: 'frequency',
        priority: 'medium',
        title: '📅 Збільш частоту тренувань',
        message: `Ти тренуєшся ${insights.workoutFrequency.avgPerWeek} разів на тиждень. Для оптимального прогресу — мінімум 3 рази.`,
        actions: [{ label: 'Переглянути програму', type: 'edit_program' }],
      });
    }

    /* Вага тіла знижується надто швидко */
    if (insights.weightTrend.direction === 'down' && Math.abs(insights.weightTrend.slope) > 0.5) {
      recs.push({
        type: 'nutrition',
        priority: 'medium',
        title: '🥗 Занадто швидка втрата ваги',
        message: 'Ти втрачаєш більше 0.5 кг на тиждень. Це може призвести до втрати м\'язової маси.',
        actions: [{ label: 'Збільшити калорійність', type: 'nutrition_advice' }],
      });
    }

    return recs.sort((a,b) => ({ high:0, medium:1, low:2 }[a.priority] - { high:0, medium:1, low:2 }[b.priority]));
  };

  /* ============================================================
     8. ПРОГНОЗУВАННЯ ОСОБИСТИХ РЕКОРДІВ
     ============================================================ */
  const generatePredictions = (records, workouts) => {
    const predictions = [];

    // Групуємо по вправах
    const byExercise = {};
    records.forEach(r => {
      if (!byExercise[r.exerciseId]) byExercise[r.exerciseId] = [];
      byExercise[r.exerciseId].push(r);
    });

    for (const [exId, recs] of Object.entries(byExercise)) {
      const sorted = recs.sort((a,b) => a.date.localeCompare(b.date));
      if (sorted.length < 2) continue;

      const trend = analyzeTrend(sorted.map((r, i) => ({ x: i, y: r.weight })));
      if (trend.slope <= 0 || trend.r2 < 0.5) continue;

      const current = sorted[sorted.length-1].weight;
      const nextPR  = Math.round((current + trend.slope * 4) * 4) / 4; // 4 тижні
      const daysTo  = Math.round((nextPR - current) / trend.slope * 7);

      if (nextPR > current && daysTo > 0 && daysTo < 365) {
        predictions.push({
          exerciseId:    exId,
          currentPR:     current,
          predictedPR:   nextPR,
          estimatedDays: daysTo,
          confidence:    Math.round(trend.r2 * 100),
          trend:         trend.slope,
        });
      }
    }

    return predictions;
  };

  /* ============================================================
     9. КОВЗНЕ СЕРЕДНЄ (для згладжування графіків)
     ============================================================ */
  const movingAverage = (data, window = 7) => {
    return data.map((_, i, arr) => {
      const start = Math.max(0, i - Math.floor(window/2));
      const end   = Math.min(arr.length, i + Math.floor(window/2) + 1);
      const slice = arr.slice(start, end);
      return slice.reduce((a,b) => a + b, 0) / slice.length;
    });
  };

  /* ============================================================
     10. РЕКОМЕНДОВАНИЙ 1RM (One-Rep Max) — формула Brzycki
     ============================================================ */
  const calculate1RM = (weight, reps) => {
    if (reps === 1) return weight;
    return Math.round(weight * 36 / (37 - reps));
  };

  /* ============================================================
     UI — рендер аналітики
     ============================================================ */
  const renderInsights = async (username, containerId) => {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = `<div class="ai-loading">🤖 Аналізую твої дані...</div>`;

    const result = await analyzeUser(username);
    if (!result) {
      el.innerHTML = `<div class="ai-empty">Недостатньо даних для аналізу. Потрібно мінімум 5 тренувань.</div>`;
      return;
    }

    const { insights, recommendations, predictions } = result;

    el.innerHTML = `
      <div class="ai-section">
        <h4 class="ai-section-title">🤖 AI Аналіз</h4>

        <!-- Статус тренувань -->
        <div class="ai-metrics">
          ${metricCard('Активність', insights.workoutFrequency.avgPerWeek + '/тиж', statusColor(insights.workoutFrequency.status))}
          ${metricCard('Консистентність', insights.consistency.score + '%', scoreColor(insights.consistency.score))}
          ${metricCard('Відновлення', insights.recovery.avgRestDays + ' дн.', statusColor(insights.recovery.status === 'optimal' ? 'good' : 'moderate'))}
        </div>

        <!-- Рекомендації -->
        ${recommendations.length ? `
        <div class="ai-recs">
          <h5 class="ai-sub">💡 Рекомендації (${recommendations.length})</h5>
          ${recommendations.map(r => `
            <div class="ai-rec-card priority-${r.priority}">
              <div class="ai-rec-title">${r.title}</div>
              <div class="ai-rec-msg">${r.message}</div>
              ${r.actions.map(a => `<button class="btn-ghost ai-action-btn" data-action="${a.type}" data-ex="${r.exerciseId||''}">${a.label}</button>`).join('')}
            </div>`).join('')}
        </div>` : '<div class="ai-empty">✅ Чудова робота! Немає критичних рекомендацій.</div>'}

        <!-- Прогнози -->
        ${predictions.length ? `
        <div class="ai-predictions">
          <h5 class="ai-sub">🔮 Прогнози рекордів</h5>
          ${predictions.map(p => {
            const ex = window.ExerciseDB?.getById(p.exerciseId);
            return `<div class="ai-pred-card">
              <div class="ai-pred-ex">${ex?.name || 'Вправа'}</div>
              <div class="ai-pred-val">${p.predictedPR} кг <small>за ~${p.estimatedDays} дн.</small></div>
              <div class="ai-pred-conf">Впевненість: ${p.confidence}%</div>
            </div>`;
          }).join('')}
        </div>` : ''}
      </div>`;

    // Обробка кліків по рекомендаціях
    el.querySelectorAll('.ai-action-btn').forEach(btn => {
      btn.addEventListener('click', () => handleActionClick(btn.dataset.action, btn.dataset.ex));
    });
  };

  const metricCard = (label, value, color) =>
    `<div class="ai-metric-card"><div class="ai-metric-val" style="color:${color}">${value}</div><div class="ai-metric-label">${label}</div></div>`;

  const statusColor = (s) => ({ excellent:'#2ed573', good:'#2ed573', moderate:'#f0a500', low:'#ff4757', overtraining_risk:'#ff4757', undertraining:'#f0a500', optimal:'#2ed573' }[s] || '#8a9ab5');
  const scoreColor  = (s) => s >= 80 ? '#2ed573' : s >= 60 ? '#f0a500' : '#ff4757';

  const handleActionClick = (action, exerciseId) => {
    const actions = {
      'edit_program':    () => window.App?.navigate('planner'),
      'rest_day':        () => window.UI?.toast('Запланований день відпочинку ✓'),
      'increase_weight': () => window.UI?.toast('Не забудь збільшити вагу на наступному тренуванні! 💪', 'info'),
      'nutrition_advice':() => window.UI?.toast('Порадься з нутриціологом 🥗', 'info'),
    };
    (actions[action] || (() => {}))();
  };

  /* ---- Утиліти ---- */
  const getWeekNumber = (d) => {
    const onejan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  };

  return { analyzeUser, detectPlateau, analyzeTrend, movingAverage, calculate1RM, renderInsights, generateRecommendations, generatePredictions };
})();

if (typeof window !== 'undefined') window.AIEngine = AIEngine;
