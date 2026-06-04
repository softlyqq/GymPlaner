/**
 * GymPlaner — modules/i18n.js
 * Інтернаціоналізація: перемикання мов (UA/EN), збереження вибору, переклад DOM
 */

'use strict';

const I18n = (() => {
  const STORAGE_KEY = 'gymplaner_lang';
  let _currentLang = 'uk';
  let _listeners = [];

  const DICTIONARY = {
    uk: {
      // Auth Screen
      'auth_brand_sub': 'Тренуйся розумно. Досягай більше.',
      'auth_tab_login': 'Увійти',
      'auth_tab_register': 'Реєстрація',
      'auth_label_username': 'Логін',
      'auth_label_password': 'Пароль',
      'auth_label_name': "Ім'я",
      'auth_placeholder_username': 'Введи логін',
      'auth_placeholder_password': 'Введи пароль',
      'auth_placeholder_name': "Твоє ім'я",
      'auth_placeholder_reg_username': 'Придумай логін',
      'auth_placeholder_reg_password': 'Придумай пароль',
      'auth_btn_login': 'Увійти',
      'auth_btn_register': 'Зареєструватись',

      // Sidebar
      'nav_dashboard': 'Дашборд',
      'nav_planner': 'Планувальник',
      'nav_exercises': 'База вправ',
      'nav_calendar': 'Календар',
      'nav_progress': 'Прогрес',
      'nav_ai': 'AI Аналітика',
      'nav_gamification': 'Гейміфікація',
      'nav_social': 'Соціальне',
      'nav_achievements': 'Досягнення',
      'nav_profile': 'Профіль',
      'nav_settings': 'Налаштування',
      'sidebar_logout': '⬅ Вийти',

      // Dashboard
      'dash_welcome': 'Вітаємо',
      'dash_athlete': 'Атлете',
      'dash_ready': 'Готовий до нового тренування?',
      'dash_btn_quick': '+ Швидке тренування',
      'dash_stat_workouts': 'Всього тренувань',
      'dash_stat_week': 'Цього тижня',
      'dash_stat_streak': 'Серія днів',
      'dash_stat_xp': 'XP зароблено',
      'dash_sec_today': 'Сьогодні',
      'dash_sec_programs': 'Мої програми',
      'dash_btn_all_progs': 'Всі програми',
      'dash_no_today': 'Сьогодні немає запланованих тренувань',
      'dash_btn_make_plan': 'Скласти план',
      'dash_no_programs': 'Ще немає програм',

      // Planner
      'plan_title': 'Програми тренувань',
      'plan_btn_new': '+ Нова програма',
      'plan_btn_export': '⬇ Експорт JSON',
      'plan_btn_import': '⬆ Імпорт JSON',

      // Exercises
      'ex_title': 'База вправ',
      'ex_btn_custom': '+ Своя вправа',
      'ex_placeholder_search': '🔍  Пошук вправ...',

      // Calendar
      'cal_title': 'Календар тренувань',
      'cal_sec_log': 'Журнал тренувань',
      'cal_log_empty': 'Журнал порожній',
      'cal_status_done': '✓ Виконано',
      'cal_status_planned': 'Заплановано',

      // Progress
      'prog_title': 'Трекер прогресу',
      'prog_btn_meas': '+ Додати заміри',
      'prog_tab_weight': 'Вага тіла',
      'prog_tab_meas': 'Виміри',
      'prog_tab_records': 'Рекорди',
      'prog_btn_add_rec': '+ Додати рекорд',
      'prog_no_weight': 'Немає записів ваги',
      'prog_no_meas': 'Немає вимірів',
      'prog_no_records': 'Немає рекордів',

      // AI Analytics
      'ai_title': '🤖 AI Аналітика',
      'ai_btn_refresh': '↻ Оновити аналіз',
      'ai_calc_title': 'Калькулятор 1RM',
      'ai_calc_weight': 'Вага (кг)',
      'ai_calc_reps': 'Повторень',
      'ai_calc_1rm': '1RM',
      'ai_btn_calc': 'Розрахувати',
      'ai_sync_title': 'Статус синхронізації',
      'ai_sync_mode': 'Режим:',
      'ai_sync_state': 'Стан:',
      'ai_sync_sw': 'Кеш SW:',
      'ai_btn_sync': '🔄 Синхронізувати',
      'ai_btn_clear_cache': '🗑 Очистити кеш',

      // Gamification
      'gami_title': '🎮 Гейміфікація',

      // Social
      'soc_title': '🌐 Соціальне',
      'soc_tab_leaderboard': '🏆 Рейтинг',
      'soc_tab_profile': '👤 Мій профіль',
      'soc_tab_compare': '⚔️ Порівняння',
      'soc_visibility': 'Видимість профілю',
      'soc_vis_public': 'Публічний (видно в рейтингу)',
      'soc_vis_private': 'Приватний',
      'soc_btn_save': 'Зберегти',
      'soc_compare_with': 'Порівняти з (введи логін)',
      'soc_compare_placeholder': 'Логін іншого гравця',
      'soc_btn_compare': 'Порівняти',

      // Achievements
      'ach_title': 'Досягнення 🏆',

      // Profile
      'prof_title': 'Особистий кабінет',
      'prof_btn_save': 'Зберегти',
      'prof_avatar_btn': '📷 Змінити фото',
      'prof_stat_workouts': 'Тренувань',
      'prof_stat_programs': 'Програм',
      'prof_stat_records': 'Рекордів',
      'prof_label_name': "Ім'я",
      'prof_label_age': 'Вік',
      'prof_label_height': 'Ріст (см)',
      'prof_label_goal': 'Мета',
      'prof_label_level': 'Рівень',
      'prof_goal_empty': 'Обери мету',
      'prof_goal_mass': 'Набір маси',
      'prof_goal_cut': 'Схуднення',
      'prof_goal_strength': 'Сила',
      'prof_goal_endurance': 'Витривалість',
      'prof_goal_health': 'Здоров\'я',
      'prof_level_empty': 'Обери рівень',
      'prof_level_beg': 'Початківець',
      'prof_level_int': 'Середній',
      'prof_level_adv': 'Просунутий',
      'prof_timer_title': 'Таймер відпочинку',
      'prof_timer_label': 'Час відпочинку (сек):',

      // Settings
      'sett_title': '⚙️ Налаштування',
      'sett_sec_notif': '🔔 Сповіщення',
      'sett_sec_backup': '💾 Резервні копії',
      'sett_sec_pwa': '📲 PWA / Додаток',
      'sett_pwa_mode': 'Режим відображення:',
      'sett_pwa_sw': 'Service Worker:',
      'sett_btn_install': '📲 Встановити додаток',
      'sett_btn_clear': '🗑 Очистити кеш',
      'sett_sec_danger': '⚠️ Небезпечна зона',
      'sett_btn_clear_data': '🗑 Видалити всі дані',

      // Modals
      'mod_cancel': 'Скасувати',
      'mod_save': 'Зберегти',
      'mod_close': 'Закрити',
      // Program Modal
      'mod_prog_new': 'Нова програма',
      'mod_prog_edit': 'Редагувати програму',
      'mod_prog_name': 'Назва програми',
      'mod_prog_placeholder_name': 'Наприклад: Пуш-Пул-Ноги',
      'mod_prog_desc': 'Опис',
      'mod_prog_placeholder_desc': 'Опис програми...',
      'mod_prog_days': 'Дні тижня',
      'mod_prog_exercises': 'Вправи',
      'mod_prog_btn_add_ex': '+ Додати вправу',
      // Add Exercise Modal
      'mod_add_ex_title': 'Додати вправу',
      'mod_add_ex_select': 'Вправа',
      'mod_add_ex_sets': 'Підходи',
      'mod_add_ex_reps': 'Повторення',
      'mod_add_ex_weight': 'Вага (кг)',
      'mod_add_ex_comment': 'Коментар',
      'mod_add_ex_placeholder_comment': 'Нотатка до вправи...',
      'mod_add_ex_btn_add': 'Додати',
      // Exercise Detail Modal
      'mod_ex_det_title': 'Назва вправи',
      // Custom Exercise Modal
      'mod_cust_ex_title': 'Своя вправа',
      'mod_cust_ex_name': 'Назва',
      'mod_cust_ex_placeholder_name': 'Назва вправи',
      'mod_cust_ex_group': 'Група м\'язів',
      'mod_cust_ex_desc': 'Опис',
      'mod_cust_ex_placeholder_desc': 'Техніка виконання...',
      // Body Measurements Modal
      'mod_meas_title': 'Заміри тіла',
      'mod_meas_date': 'Дата',
      'mod_meas_weight': 'Вага (кг)',
      'mod_meas_chest': 'Груди (см)',
      'mod_meas_waist': 'Талія (см)',
      'mod_meas_hips': 'Стегна (см)',
      'mod_meas_bicep': 'Біцепс (см)',
      // Record Modal
      'mod_rec_title': 'Особистий рекорд',
      'mod_rec_ex': 'Вправа',
      'mod_rec_weight': 'Вага (кг)',
      'mod_rec_reps': 'Повторення',
      'mod_rec_date': 'Дата',
      // Workout Session Modal
      'mod_sess_title': 'Тренування',
      'mod_sess_btn_finish': '✓ Завершити тренування',
      'mod_sess_btn_pdf': '📄 PDF',

      // Extra UI JS Text
      'confirm_delete_all_data': 'Видалити всі дані? Цю дію неможливо скасувати.',
      'confirm_delete_program': 'Видалити "{name}"?',
      'toast_data_cleared': 'Дані очищено',
      'toast_program_saved': 'Програму "{name}" збережено ✓',
      'toast_program_deleted': 'Програму видалено',
      'toast_exercise_added': 'Вправу додано ✓',
      'toast_measurements_saved': 'Заміри збережено ✓',
      'toast_record_saved': 'Рекорд збережено 🥇',
      'toast_session_finished': 'Тренування "{name}" завершено! 💪',
      'toast_avatar_updated': 'Фото оновлено ✓',
      'toast_profile_saved': 'Профіль збережено ✓',
      'toast_settings_saved': 'Налаштування збережено ✓',
      'toast_notif_prefs_saved': 'Налаштування сповіщень збережено ✓',
      'toast_cache_cleared': 'Кеш очищено ✓',
      'toast_sync_done': 'Синхронізацію завершено ✓',
      'toast_sync_unavailable': 'Синхронізація недоступна',
      'toast_rest_finished': '⏱ Відпочинок завершено! 💪',
      'toast_fill_fields': 'Заповни всі поля',
      'toast_select_date': 'Вибери дату',
      'toast_export_done': 'Дані експортовано ✓',
      'toast_import_done': 'Дані імпортовано ✓',
      'toast_import_error': 'Помилка файлу JSON',
      'toast_enter_name': 'Введи назву програми',
      'toast_enter_ex_name': 'Введи назву вправи',
      'toast_enter_username': 'Введи логін',
      'toast_pwa_installed': 'GymPlaner встановлено! 🎉',
      'toast_pwa_not_supported': 'Додаток вже встановлено або браузер не підтримує',
      'toast_offline_mode': '📵 Офлайн-режим. Дані зберігаються локально.',
      'toast_online_mode': '✅ З\'єднання відновлено!',
      'clipboard_copied': 'Текст скопійовано в буфер обміну 📋',
      'timer_reps': 'Повт.',
      'timer_kg': 'Кг',
    },
    en: {
      // Auth Screen
      'auth_brand_sub': 'Train smart. Achieve more.',
      'auth_tab_login': 'Login',
      'auth_tab_register': 'Register',
      'auth_label_username': 'Username',
      'auth_label_password': 'Password',
      'auth_label_name': 'Name',
      'auth_placeholder_username': 'Enter username',
      'auth_placeholder_password': 'Enter password',
      'auth_placeholder_name': 'Your name',
      'auth_placeholder_reg_username': 'Choose username',
      'auth_placeholder_reg_password': 'Choose password',
      'auth_btn_login': 'Login',
      'auth_btn_register': 'Register',

      // Sidebar
      'nav_dashboard': 'Dashboard',
      'nav_planner': 'Planner',
      'nav_exercises': 'Exercises',
      'nav_calendar': 'Calendar',
      'nav_progress': 'Progress',
      'nav_ai': 'AI Analytics',
      'nav_gamification': 'Gamification',
      'nav_social': 'Social',
      'nav_achievements': 'Achievements',
      'nav_profile': 'Profile',
      'nav_settings': 'Settings',
      'sidebar_logout': '⬅ Logout',

      // Dashboard
      'dash_welcome': 'Welcome',
      'dash_athlete': 'Athlete',
      'dash_ready': 'Ready for a new workout?',
      'dash_btn_quick': '+ Quick Workout',
      'dash_stat_workouts': 'Total Workouts',
      'dash_stat_week': 'This Week',
      'dash_stat_streak': 'Active Streak',
      'dash_stat_xp': 'XP Earned',
      'dash_sec_today': 'Today',
      'dash_sec_programs': 'My Programs',
      'dash_btn_all_progs': 'All Programs',
      'dash_no_today': 'No workouts scheduled for today',
      'dash_btn_make_plan': 'Create a Plan',
      'dash_no_programs': 'No programs created yet',

      // Planner
      'plan_title': 'Workout Programs',
      'plan_btn_new': '+ New Program',
      'plan_btn_export': '⬇ Export JSON',
      'plan_btn_import': '⬆ Import JSON',

      // Exercises
      'ex_title': 'Exercise Database',
      'ex_btn_custom': '+ Custom Exercise',
      'ex_placeholder_search': '🔍  Search exercises...',

      // Calendar
      'cal_title': 'Workout Calendar',
      'cal_sec_log': 'Workout Log',
      'cal_log_empty': 'Workout log is empty',
      'cal_status_done': '✓ Completed',
      'cal_status_planned': 'Planned',

      // Progress
      'prog_title': 'Progress Tracker',
      'prog_btn_meas': '+ Add Measurements',
      'prog_tab_weight': 'Body Weight',
      'prog_tab_meas': 'Measurements',
      'prog_tab_records': 'Records',
      'prog_btn_add_rec': '+ Add Record',
      'prog_no_weight': 'No weight entries yet',
      'prog_no_meas': 'No measurements yet',
      'prog_no_records': 'No records yet',

      // AI Analytics
      'ai_title': '🤖 AI Analytics',
      'ai_btn_refresh': '↻ Refresh Analysis',
      'ai_calc_title': '1RM Calculator',
      'ai_calc_weight': 'Weight (kg)',
      'ai_calc_reps': 'Reps',
      'ai_calc_1rm': '1RM',
      'ai_btn_calc': 'Calculate',
      'ai_sync_title': 'Sync Status',
      'ai_sync_mode': 'Mode:',
      'ai_sync_state': 'Status:',
      'ai_sync_sw': 'SW Cache:',
      'ai_btn_sync': '🔄 Sync Now',
      'ai_btn_clear_cache': '🗑 Clear Cache',

      // Gamification
      'gami_title': '🎮 Gamification',

      // Social
      'soc_title': '🌐 Social',
      'soc_tab_leaderboard': '🏆 Leaderboard',
      'soc_tab_profile': '👤 My Profile',
      'soc_tab_compare': '⚔️ Comparison',
      'soc_visibility': 'Profile Visibility',
      'soc_vis_public': 'Public (visible on leaderboard)',
      'soc_vis_private': 'Private',
      'soc_btn_save': 'Save',
      'soc_compare_with': 'Compare with (enter username)',
      'soc_compare_placeholder': "Other player's username",
      'soc_btn_compare': 'Compare',

      // Achievements
      'ach_title': 'Achievements 🏆',

      // Profile
      'prof_title': 'My Profile',
      'prof_btn_save': 'Save',
      'prof_avatar_btn': '📷 Change Photo',
      'prof_stat_workouts': 'Workouts',
      'prof_stat_programs': 'Programs',
      'prof_stat_records': 'Records',
      'prof_label_name': 'Name',
      'prof_label_age': 'Age',
      'prof_label_height': 'Height (cm)',
      'prof_label_goal': 'Goal',
      'prof_label_level': 'Level',
      'prof_goal_empty': 'Select a goal',
      'prof_goal_mass': 'Bulking',
      'prof_goal_cut': 'Cutting',
      'prof_goal_strength': 'Strength',
      'prof_goal_endurance': 'Endurance',
      'prof_goal_health': 'Health',
      'prof_level_empty': 'Select a level',
      'prof_level_beg': 'Beginner',
      'prof_level_int': 'Intermediate',
      'prof_level_adv': 'Advanced',
      'prof_timer_title': 'Rest Timer',
      'prof_timer_label': 'Rest time (sec):',

      // Settings
      'sett_title': '⚙️ Settings',
      'sett_sec_notif': '🔔 Notifications',
      'sett_sec_backup': '💾 Backups',
      'sett_sec_pwa': '📲 PWA / App',
      'sett_pwa_mode': 'Display Mode:',
      'sett_pwa_sw': 'Service Worker:',
      'sett_btn_install': '📲 Install App',
      'sett_btn_clear': '🗑 Clear Cache',
      'sett_sec_danger': '⚠️ Danger Zone',
      'sett_btn_clear_data': '🗑 Delete All Data',

      // Modals
      'mod_cancel': 'Cancel',
      'mod_save': 'Save',
      'mod_close': 'Close',
      // Program Modal
      'mod_prog_new': 'New Program',
      'mod_prog_edit': 'Edit Program',
      'mod_prog_name': 'Program Name',
      'mod_prog_placeholder_name': 'e.g., Push-Pull-Legs',
      'mod_prog_desc': 'Description',
      'mod_prog_placeholder_desc': 'Program description...',
      'mod_prog_days': 'Days of Week',
      'mod_prog_exercises': 'Exercises',
      'mod_prog_btn_add_ex': '+ Add Exercise',
      // Add Exercise Modal
      'mod_add_ex_title': 'Add Exercise',
      'mod_add_ex_select': 'Exercise',
      'mod_add_ex_sets': 'Sets',
      'mod_add_ex_reps': 'Reps',
      'mod_add_ex_weight': 'Weight (kg)',
      'mod_add_ex_comment': 'Comment',
      'mod_add_ex_placeholder_comment': 'Exercise note...',
      'mod_add_ex_btn_add': 'Add',
      // Exercise Detail Modal
      'mod_ex_det_title': 'Exercise Name',
      // Custom Exercise Modal
      'mod_cust_ex_title': 'Custom Exercise',
      'mod_cust_ex_name': 'Name',
      'mod_cust_ex_placeholder_name': 'Exercise name',
      'mod_cust_ex_group': 'Muscle Group',
      'mod_cust_ex_desc': 'Description',
      'mod_cust_ex_placeholder_desc': 'Exercise technique...',
      // Body Measurements Modal
      'mod_meas_title': 'Body Measurements',
      'mod_meas_date': 'Date',
      'mod_meas_weight': 'Weight (kg)',
      'mod_meas_chest': 'Chest (cm)',
      'mod_meas_waist': 'Waist (cm)',
      'mod_meas_hips': 'Hips (cm)',
      'mod_meas_bicep': 'Bicep (cm)',
      // Record Modal
      'mod_rec_title': 'Personal Record',
      'mod_rec_ex': 'Exercise',
      'mod_rec_weight': 'Weight (kg)',
      'mod_rec_reps': 'Reps',
      'mod_rec_date': 'Date',
      // Workout Session Modal
      'mod_sess_title': 'Workout Session',
      'mod_sess_btn_finish': '✓ Finish Workout',
      'mod_sess_btn_pdf': '📄 PDF',

      // Extra UI JS Text
      'confirm_delete_all_data': 'Delete all data? This action cannot be undone.',
      'confirm_delete_program': 'Delete "{name}"?',
      'toast_data_cleared': 'Data cleared',
      'toast_program_saved': 'Program "{name}" saved ✓',
      'toast_program_deleted': 'Program deleted',
      'toast_exercise_added': 'Exercise added ✓',
      'toast_measurements_saved': 'Measurements saved ✓',
      'toast_record_saved': 'Record saved 🥇',
      'toast_session_finished': 'Workout "{name}" finished! 💪',
      'toast_avatar_updated': 'Photo updated ✓',
      'toast_profile_saved': 'Profile saved ✓',
      'toast_settings_saved': 'Settings saved ✓',
      'toast_notif_prefs_saved': 'Notification settings saved ✓',
      'toast_cache_cleared': 'Cache cleared ✓',
      'toast_sync_done': 'Sync completed ✓',
      'toast_sync_unavailable': 'Sync unavailable',
      'toast_rest_finished': '⏱ Rest completed! 💪',
      'toast_fill_fields': 'Please fill all fields',
      'toast_select_date': 'Please select a date',
      'toast_export_done': 'Data exported ✓',
      'toast_import_done': 'Data imported ✓',
      'toast_import_error': 'JSON file error',
      'toast_enter_name': 'Please enter program name',
      'toast_enter_ex_name': 'Please enter exercise name',
      'toast_enter_username': 'Please enter username',
      'toast_pwa_installed': 'GymPlaner installed! 🎉',
      'toast_pwa_not_supported': 'App is already installed or browser is not supported',
      'toast_offline_mode': '📵 Offline mode. Data is saved locally.',
      'toast_online_mode': '✅ Connection restored!',
      'clipboard_copied': 'Text copied to clipboard 📋',
      'timer_reps': 'Reps',
      'timer_kg': 'Kg',
    }
  };

  const init = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'uk' || saved === 'en') {
      _currentLang = saved;
    } else {
      _currentLang = 'uk';
      localStorage.setItem(STORAGE_KEY, _currentLang);
    }
    translateDOM();
  };

  const setLanguage = (lang) => {
    if (lang !== 'uk' && lang !== 'en') return;
    _currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    translateDOM();
    _listeners.forEach(cb => cb(lang));
  };

  const getLanguage = () => _currentLang;

  const t = (key, params = {}) => {
    const langDict = DICTIONARY[_currentLang] || DICTIONARY['uk'];
    let text = langDict[key] || DICTIONARY['uk'][key] || key;
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, v);
    });
    return text;
  };

  const translateDOM = () => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = t(key);
      if (text) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.placeholder = text;
        } else {
          el.textContent = text;
        }
      }
    });

    // Translate day picker labels in program modal dynamically if they exist
    const days = document.querySelectorAll('#days-picker span');
    const dayNames = _currentLang === 'uk' 
      ? ['Пн','Вт','Ср','Чт','Пт','Сб','Нд']
      : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    days.forEach((daySpan, i) => {
      if (dayNames[i]) daySpan.textContent = dayNames[i];
    });
  };

  const onLanguageChange = (cb) => {
    _listeners.push(cb);
  };

  return { init, setLanguage, getLanguage, t, translateDOM, onLanguageChange };
})();

if (typeof window !== 'undefined') {
  window.I18n = I18n;
  // Initialize on script load
  document.addEventListener('DOMContentLoaded', I18n.init);
}
if (typeof module !== 'undefined') {
  module.exports = I18n;
}
