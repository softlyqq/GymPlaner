/**
 * GymPlaner — script.js v2.0
 * Інтегрує: DB, Sync, AIEngine, Gamification, Notifications, Security, Social, PWA
 */
'use strict';

/* ============================================================
   Storage — LocalStorage з префіксом (fallback для non-IDB)
   ============================================================ */
const Storage = (() => {
  const P = 'gymplaner_';
  const set    = (k,v) => { try { localStorage.setItem(P+k, JSON.stringify(v)); } catch{} };
  const get    = (k,fb=null) => { try { const r=localStorage.getItem(P+k); return r!==null?JSON.parse(r):fb; } catch{ return fb; } };
  const remove = (k) => localStorage.removeItem(P+k);
  const clearAll = () => { Object.keys(localStorage).filter(k=>k.startsWith(P)).forEach(k=>localStorage.removeItem(k)); };
  return { set, get, remove, clearAll };
})();

/* ============================================================
   Auth
   ============================================================ */
const Auth = (() => {
  let cur = null;
  const getUser = () => cur;

  const login = async (username, password) => {
    try {
      const users = Storage.get('users', {});
      const u = users[username];
      if (!u) return { ok:false, error:'Користувача не знайдено' };
      let valid = false;
      try {
        if (u.password.length === 64 && window.Security && window.crypto && window.crypto.subtle) {
          valid = await Security.verifyPassword(password, u.password, username);
        } else {
          // btoa fallback — сумісність із HTTP та старими акаунтами
          valid = u.password === btoa(unescape(encodeURIComponent(password)))
               || u.password === btoa(password);
        }
      } catch { valid = u.password === btoa(password); }
      if (!valid) return { ok:false, error:'Невірний пароль' };
      cur = username;
      Storage.set('session', username);
      return { ok:true };
    } catch(err) {
      console.error('[Auth.login]', err);
      return { ok:false, error:'Помилка входу. Спробуй ще раз.' };
    }
  };

  const register = async (name, username, password) => {
    try {
      if (!name.trim()||!username.trim()||!password.trim()) return { ok:false, error:'Заповни всі поля' };
      if (username.length<3) return { ok:false, error:'Логін мінімум 3 символи' };
      if (password.length<4) return { ok:false, error:'Пароль мінімум 4 символи' };
      const users = Storage.get('users', {});
      if (users[username]) return { ok:false, error:'Цей логін вже зайнятий' };

      // Безпечне хешування з fallback: SHA-256 → btoa
      let hash;
      try {
        hash = (window.Security && window.crypto?.subtle)
          ? await Security.hashPassword(password, username)
          : btoa(unescape(encodeURIComponent(password)));
      } catch {
        hash = btoa(unescape(encodeURIComponent(password)));
      }

      users[username] = { name, password: hash, createdAt: Date.now() };
      Storage.set('users', users);
      Storage.set(`profile_${username}`, { name, age:'', height:'', goal:'', level:'', avatar:'', isPublic:true, createdAt: Date.now() });
      cur = username;
      Storage.set('session', username);
      return { ok:true };
    } catch(err) {
      console.error('[Auth.register]', err);
      return { ok:false, error:'Помилка реєстрації. Спробуй ще раз.' };
    }
  };

  const logout = () => { cur=null; Storage.remove('session'); };
  const restoreSession = () => { const s=Storage.get('session'); if(s){cur=s;return true;} return false; };
  return { getUser, login, register, logout, restoreSession };
})();

/* ============================================================
   Exercise DB
   ============================================================ */
const DEFAULT_EXERCISES = [
  {id:'e1', name_uk:'Жим штанги лежачи', name_en:'Barbell Bench Press', group:'chest', desc_uk:'Базова вправа для розвитку грудних м\'язів.', desc_en:'Basic compound exercise for chest development.', tips_uk:'Тримай лопатки зведеними.', tips_en:'Keep shoulder blades retracted.'},
  {id:'e2', name_uk:'Жим гантелей лежачи', name_en:'Dumbbell Bench Press', group:'chest', desc_uk:'Альтернатива з більшою амплітудою.', desc_en:'Chest press alternative offering wider range of motion.', tips_uk:'Зводь гантелі у верхній точці.', tips_en:'Squeeze dumbbells at the peak.'},
  {id:'e3', name_uk:'Розведення гантелей лежачи', name_en:'Dumbbell Flyes', group:'chest', desc_uk:'Ізоляція грудних.', desc_en:'Isolation chest exercise.', tips_uk:'Легке згинання ліктів.', tips_en:'Keep a slight bend in your elbows.'},
  {id:'e4', name_uk:'Хрест на блоках', name_en:'Cable Flyes', group:'chest', desc_uk:'Ізоляція нижніх та внутрішніх грудних.', desc_en:'Isolation of lower and inner chest.', tips_uk:'Плавний контрольований рух.', tips_en:'Maintain smooth and controlled motion.'},
  {id:'e5', name_uk:'Віджимання з вагою', name_en:'Weighted Dips', group:'chest', desc_uk:'Базова вправа для грудей і трицепсів.', desc_en:'Compound exercise for chest and triceps.', tips_uk:'Корпус прямий.', tips_en:'Keep your torso straight.'},
  {id:'e6', name_uk:'Станова тяга', name_en:'Deadlift', group:'back', desc_uk:'Базова вправа для всього заднього ланцюга.', desc_en:'Core compound exercise for posterior chain.', tips_uk:'Нейтральний хребет!', tips_en:'Keep spine neutral!'},
  {id:'e7', name_uk:'Підтягування широким хватом', name_en:'Wide Grip Pull-ups', group:'back', desc_uk:'Базова вправа для широчайних.', desc_en:'Key bodyweight exercise for latissimus dorsi.', tips_uk:'Тягнися груддю до перекладини.', tips_en:'Pull with your chest to the bar.'},
  {id:'e8', name_uk:'Тяга штанги в нахилі', name_en:'Barbell Row', group:'back', desc_uk:'Маса спини.', desc_en:'Compound movement for back thickness.', tips_uk:'Лікті ведуть рух.', tips_en:'Lead the movement with your elbows.'},
  {id:'e9', name_uk:'Тяга гантелі однією рукою', name_en:'One-Arm Dumbbell Row', group:'back', desc_uk:'Однобічна вправа для спини.', desc_en:'Unilateral exercise for back development.', tips_uk:'Максимальна амплітуда.', tips_en:'Use full range of motion.'},
  {id:'e10', name_uk:'Тяга вертикального блоку', name_en:'Lat Pulldown', group:'back', desc_uk:'Аналог підтягувань.', desc_en:'Pull-up alternative focusing on lats.', tips_uk:'Лопатки зводь у нижній точці.', tips_en:'Retract shoulder blades at the bottom.'},
  {id:'e11', name_uk:'Армійський жим стоячи', name_en:'Overhead Press', group:'shoulders', desc_uk:'Базовий прес для дельтоподібних.', desc_en:'Standard shoulder press for deltoids.', tips_uk:'Напружи прес.', tips_en:'Keep your core tight.'},
  {id:'e12', name_uk:'Розведення гантелей стоячи', name_en:'Lateral Raises', group:'shoulders', desc_uk:'Ізоляція середніх дельт.', desc_en:'Isolation of lateral deltoid heads.', tips_uk:'Легке згинання ліктів.', tips_en:'Keep a slight bend in your elbows.'},
  {id:'e13', name_uk:'Тяга штанги до підборіддя', name_en:'Upright Row', group:'shoulders', desc_uk:'Дельти та трапеції.', desc_en:'Compound exercise for deltoids and traps.', tips_uk:'Вузький хват — більше трапеції.', tips_en:'Narrow grip targets more trapezius.'},
  {id:'e14', name_uk:'Жим Арнольда', name_en:'Arnold Press', group:'shoulders', desc_uk:'Повний розвиток дельт.', desc_en:'Rotational press for complete shoulder training.', tips_uk:'Починай з долонями до себе.', tips_en:'Start with palms facing your body.'},
  {id:'e15', name_uk:'Згинання штанги стоячи', name_en:'Barbell Curl', group:'biceps', desc_uk:'Класика для маси біцепса.', desc_en:'Classic mass builder for biceps.', tips_uk:'Лікті притиснуті до тулуба.', tips_en:'Keep elbows close to your torso.'},
  {id:'e16', name_uk:'Молотки з гантелями', name_en:'Hammer Curls', group:'biceps', desc_uk:'Брахіаліс та голова біцепса.', desc_en:'Targets brachialis and biceps long head.', tips_uk:'Нейтральний хват.', tips_en:'Use neutral (hammer) grip.'},
  {id:'e17', name_uk:'Згинання на лаві Скотта', name_en:'Preacher Curl', group:'biceps', desc_uk:'Ізоляційна вправа без читингу.', desc_en:'Biceps isolation without cheating momentum.', tips_uk:'Повне розгинання внизу.', tips_en:'Perform full extension at the bottom.'},
  {id:'e18', name_uk:'Жим вузьким хватом', name_en:'Close-Grip Bench Press', group:'triceps', desc_uk:'Базова маса трицепса.', desc_en:'Triceps compound movement.', tips_uk:'Лікті не розводь широко.', tips_en:'Keep elbows tucked in close.'},
  {id:'e19', name_uk:'Французький жим лежачи', name_en:'Skull Crushers', group:'triceps', desc_uk:'Ізоляція трицепса.', desc_en:'Classic triceps isolation.', tips_uk:'Лікті нерухомі.', tips_en:'Keep your elbows fixed in place.'},
  {id:'e20', name_uk:'Розгинання на блоці', name_en:'Cable Pushdowns', group:'triceps', desc_uk:'Ізоляція на блочному тренажері.', desc_en:'Cable isolation for triceps.', tips_uk:'Лікті притиснуті до боків.', tips_en:'Keep elbows locked at your sides.'},
  {id:'e21', name_uk:'Віджимання від лави', name_en:'Bench Dips', group:'triceps', desc_uk:'Вправа з власною вагою.', desc_en:'Triceps bodyweight exercise.', tips_uk:'Чим ближче ноги — важче.', tips_en:'Keeping legs straight increases intensity.'},
  {id:'e22', name_uk:'Присідання зі штангою', name_en:'Barbell Squat', group:'legs', desc_uk:'Базовий рух для ніг.', desc_en:'Core lower body compound movement.', tips_uk:'Коліна над носками.', tips_en:'Keep knees aligned over toes.'},
  {id:'e23', name_uk:'Жим ногами', name_en:'Leg Press', group:'legs', desc_uk:'Квадрицепси в тренажері.', desc_en:'Machine leg press for quads.', tips_uk:'Не замикай коліна вгорі.', tips_en:'Do not lock out knees at the top.'},
  {id:'e24', name_uk:'Розгинання ніг у тренажері', name_en:'Leg Extensions', group:'legs', desc_uk:'Ізоляція квадрицепсів.', desc_en:'Quad isolation movement.', tips_uk:'2 секунди затримки вгорі.', tips_en:'Pause for 2 seconds at full extension.'},
  {id:'e25', name_uk:'Мертва тяга на прямих ногах', name_en:'Romanian Deadlift', group:'legs', desc_uk:'Біцепс стегна та сідниці.', desc_en:'Targets hamstrings and glutes.', tips_uk:'Відчуй розтяжку заду стегна.', tips_en:'Feel the stretch in hamstrings.'},
  {id:'e26', name_uk:'Випади з гантелями', name_en:'Dumbbell Lunges', group:'legs', desc_uk:'Ноги та сідниці.', desc_en:'Lower body exercise for legs and glutes.', tips_uk:'Коліно не виходить за носок.', tips_en:'Front knee should not pass toes.'},
  {id:'e27', name_uk:'Скручування лежачи', name_en:'Crunches', group:'abs', desc_uk:'Прямий м\'яз живота.', desc_en:'Basic abdominal core crunch.', tips_uk:'Не тягнись за шию руками.', tips_en:'Do not pull on your neck.'},
  {id:'e28', name_uk:'Планка', name_en:'Plank', group:'abs', desc_uk:'Статична вправа для кора.', desc_en:'Isomeric core holding exercise.', tips_uk:'Тіло — пряма лінія.', tips_en:'Maintain straight line from head to heel.'},
  {id:'e29', name_uk:'Підйом ніг у висі', name_en:'Hanging Leg Raises', group:'abs', desc_uk:'Нижній прес.', desc_en:'Targets lower abdominal area.', tips_uk:'Без розгойдування.', tips_en:'Perform without swinging body.'},
  {id:'e30', name_uk:'Велосипед', name_en:'Bicycle Crunches', group:'abs', desc_uk:'Косі м\'язи живота.', desc_en:'Targets obliques and rectus abdominis.', tips_uk:'Повне скручування.', tips_en:'Perform full body twist.'},
  {id:'e31', name_uk:'Біг на доріжці', name_en:'Treadmill Running', group:'cardio', desc_uk:'Класичне аеробне кардіо.', desc_en:'Aerobic endurance building.', tips_uk:'Пульс 60-70% від max.', tips_en:'Keep heart rate 60-70% of max.'},
  {id:'e32', name_uk:'Еліпсоїд', name_en:'Elliptical Trainer', group:'cardio', desc_uk:'Низьке навантаження на суглоби.', desc_en:'Low impact cardiovascular training.', tips_uk:'Рівний темп.', tips_en:'Maintain steady pace.'},
  {id:'e33', name_uk:'Велотренажер', name_en:'Stationary Cycling', group:'cardio', desc_uk:'Кардіо з акцентом на ноги.', desc_en:'Cardio focusing on legs.', tips_uk:'Регулюй опір.', tips_en:'Adjust resistance level.'},
  {id:'e34', name_uk:'Стрибки на скакалці', name_en:'Jump Rope', group:'cardio', desc_uk:'Інтенсивне кардіо.', desc_en:'High intensity cardio.', tips_uk:'М\'яке приземлення на носки.', tips_en:'Land softly on balls of feet.'},
  {id:'e35', name_uk:'HIIT-тренування', name_en:'HIIT Tabata', group:'cardio', desc_uk:'Інтервальне тренування Табата.', desc_en:'Interval Tabata protocol training.', tips_uk:'20 сек робота / 10 сек відпочинок.', tips_en:'20 sec work / 10 sec rest.'},
];

const ExerciseDB = (() => {
  const GROUPS = {
    uk: { chest:'Груди',back:'Спина',shoulders:'Плечі',biceps:'Біцепс',triceps:'Трицепс',legs:'Ноги',abs:'Прес',cardio:'Кардіо' },
    en: { chest:'Chest',back:'Back',shoulders:'Shoulders',biceps:'Biceps',triceps:'Triceps',legs:'Legs',abs:'Abs',cardio:'Cardio' }
  };
  const getAll   = () => {
    const lang = window.I18n ? I18n.getLanguage() : 'uk';
    const list = [...DEFAULT_EXERCISES, ...Storage.get('custom_exercises',[])];
    return list.map(e => ({
      ...e,
      name: lang === 'en' && e.name_en ? e.name_en : (e.name_uk || e.name),
      desc: lang === 'en' && e.desc_en ? e.desc_en : (e.desc_uk || e.desc),
      tips: lang === 'en' && e.tips_en ? e.tips_en : (e.tips_uk || e.tips)
    }));
  };
  const getById  = (id) => getAll().find(e=>e.id===id);
  const filter   = (group='all',search='') => {
    let l = getAll();
    if(group!=='all') l=l.filter(e=>e.group===group);
    if(search.trim()){ const q=search.toLowerCase(); l=l.filter(e=>e.name.toLowerCase().includes(q)); }
    return l;
  };
  const addCustom = (name,group,desc) => {
    const custom=Storage.get('custom_exercises',[]);
    const ex={id:'c'+Date.now(),name,group,desc,tips:'',custom:true};
    custom.push(ex); Storage.set('custom_exercises',custom);
    // Також зберегти в IndexedDB
    if(window.DB) window.DB.Exercises.put({...ex, username: Auth.getUser()});
    return ex;
  };
  const groupName = (k) => {
    const lang = window.I18n ? I18n.getLanguage() : 'uk';
    return (GROUPS[lang] || GROUPS['uk'])[k] || k;
  };
  return { getAll,getById,filter,addCustom,groupName, get GROUPS() {
    const lang = window.I18n ? I18n.getLanguage() : 'uk';
    return GROUPS[lang] || GROUPS['uk'];
  } };
})();

/* ============================================================
   Programs
   ============================================================ */
const Programs = (() => {
  const DAY_NAMES = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
  const key   = () => `programs_${Auth.getUser()}`;
  const getAll= () => Storage.get(key(),[]);
  const save  = async (prog) => {
    const list=getAll(); const idx=list.findIndex(p=>p.id===prog.id);
    if(idx>=0) list[idx]=prog; else list.push(prog);
    Storage.set(key(),list);
    if(window.DB) await window.DB.Programs.put({...prog, username:Auth.getUser()});
    if(window.Sync) await window.Sync.enqueue('programs', prog.id ? 'update':'create', prog);
  };
  const remove= async (id) => {
    Storage.set(key(),getAll().filter(p=>p.id!==id));
    if(window.DB) await window.DB.Programs.remove(id);
    if(window.Sync) await window.Sync.enqueue('programs','delete',{id});
  };
  const getById = (id) => getAll().find(p=>p.id===id);
  const forDay  = (d)   => getAll().filter(p=>p.days&&p.days.includes(d));
  const dayName = (i)   => DAY_NAMES[i];
  return { getAll,save,remove,getById,forDay,dayName,DAY_NAMES };
})();

/* ============================================================
   WorkoutLog
   ============================================================ */
const WorkoutLog = (() => {
  const key   = () => `log_${Auth.getUser()}`;
  const getAll= () => Storage.get(key(),[]);
  const add   = async (entry) => {
    const list=getAll();
    const e={id:Date.now(),...entry,date:entry.date||new Date().toISOString().split('T')[0]};
    list.unshift(e); Storage.set(key(),list);
    if(window.DB) await window.DB.Workouts.put({...e, username:Auth.getUser()});
    if(window.Sync) await window.Sync.enqueue('workouts','create',e);
    // XP за тренування
    if(window.Gamification) await window.Gamification.awardXP(Auth.getUser(),'complete_workout');
    if(window.Gamification) await window.Gamification.updateWeeklyProgress(Auth.getUser(),1);
    Achievements.check();
    updateSidebarXP();
  };
  const remove= async (id) => {
    Storage.set(key(),getAll().filter(e=>e.id!==id));
    if(window.DB) await window.DB.Workouts.remove(id);
  };
  const forDate     = (d) => getAll().filter(e=>e.date===d);
  const thisWeekCount=()  => {
    const now=new Date(); const dow=(now.getDay()+6)%7;
    const mon=new Date(now); mon.setDate(now.getDate()-dow); mon.setHours(0,0,0,0);
    return getAll().filter(e=>new Date(e.date)>=mon).length;
  };
  const streak=()=>{
    const logs=getAll(); if(!logs.length) return 0;
    const dates=[...new Set(logs.map(e=>e.date))].sort().reverse();
    let cnt=0,prev=null;
    for(const d of dates){ if(!prev){prev=d;cnt=1;continue;} const diff=(new Date(prev)-new Date(d))/86400000; if(diff<=1){cnt++;prev=d;}else break; }
    return cnt;
  };
  return { getAll,add,remove,forDate,thisWeekCount,streak };
})();

/* ============================================================
   Progress
   ============================================================ */
const Progress = (() => {
  const mKey=()=>`measurements_${Auth.getUser()}`;
  const rKey=()=>`records_${Auth.getUser()}`;
  const getMeasurements=()=>Storage.get(mKey(),[]);
  const addMeasurement=(m)=>{
    const l=getMeasurements(); l.push({id:Date.now(),...m}); l.sort((a,b)=>a.date.localeCompare(b.date));
    Storage.set(mKey(),l);
    if(window.DB) window.DB.Statistics.put({...m,id:'st_m_'+Date.now(),type:'measurement',username:Auth.getUser()});
    if(window.Gamification) window.Gamification.awardXP(Auth.getUser(),'log_measurement');
    Achievements.check();
  };
  const delMeasurement=(id)=>Storage.set(mKey(),getMeasurements().filter(m=>m.id!==id));
  const getRecords=()=>Storage.get(rKey(),[]);
  const addRecord=(r)=>{
    const l=getRecords(); const idx=l.findIndex(x=>x.exerciseId===r.exerciseId);
    if(idx>=0){ if(r.weight>l[idx].weight) l[idx]={...l[idx],...r}; }
    else l.push({id:Date.now(),...r});
    Storage.set(rKey(),l);
    if(window.DB) window.DB.Statistics.put({...r,id:'st_r_'+Date.now(),type:'record',username:Auth.getUser()});
    if(window.Gamification) window.Gamification.awardXP(Auth.getUser(),'new_pr');
    Achievements.check();
  };
  const delRecord=(id)=>Storage.set(rKey(),getRecords().filter(r=>r.id!==id));
  return { getMeasurements,addMeasurement,delMeasurement,getRecords,addRecord,delRecord };
})();

/* ============================================================
   Achievements
   ============================================================ */
const Achievements = (() => {
  const DEFS = [
    {id:'first_workout', icon:'🏋️',name_uk:'Перше тренування', name_en:'First Workout', desc_uk:'Заверши перше тренування', desc_en:'Complete your first workout', check:()=>WorkoutLog.getAll().length>=1},
    {id:'five_workouts', icon:'🔥',name_uk:'П\'ять тренувань', name_en:'Five Workouts', desc_uk:'Заверши 5 тренувань', desc_en:'Complete 5 workouts', check:()=>WorkoutLog.getAll().length>=5},
    {id:'ten_workouts',  icon:'💪',name_uk:'Десять тренувань', name_en:'Ten Workouts', desc_uk:'Заверши 10 тренувань', desc_en:'Complete 10 workouts', check:()=>WorkoutLog.getAll().length>=10},
    {id:'fifty_workouts',icon:'⚡',name_uk:'50 тренувань', name_en:'Fifty Workouts', desc_uk:'Заверши 50 тренувань', desc_en:'Complete 50 workouts', check:()=>WorkoutLog.getAll().length>=50},
    {id:'streak3',       icon:'📅',name_uk:'3 дні підряд', name_en:'3 Day Streak', desc_uk:'Тренуйся 3 дні поспіль', desc_en:'Train 3 days in a row', check:()=>WorkoutLog.streak()>=3},
    {id:'streak7',       icon:'🗓',name_uk:'Тиждень без пропусків', name_en:'Week Warrior', desc_uk:'7 днів підряд', desc_en:'Train 7 days in a row', check:()=>WorkoutLog.streak()>=7},
    {id:'first_record',  icon:'🥇',name_uk:'Перший рекорд', name_en:'First Record', desc_uk:'Встанови особистий рекорд', desc_en:'Log your first personal record', check:()=>Progress.getRecords().length>=1},
    {id:'five_records',  icon:'🏆',name_uk:'П\'ять рекордів', name_en:'Five Records', desc_uk:'Встанови 5 рекордів', desc_en:'Log 5 personal records', check:()=>Progress.getRecords().length>=5},
    {id:'first_program', icon:'📋',name_uk:'Перша програма', name_en:'First Program', desc_uk:'Створи першу програму', desc_en:'Create your first workout program', check:()=>Programs.getAll().length>=1},
    {id:'three_programs',icon:'📚',name_uk:'Три програми', name_en:'Three Programs', desc_uk:'Створи 3 програми', desc_en:'Create 3 workout programs', check:()=>Programs.getAll().length>=3},
    {id:'week_warrior',  icon:'⚔️',name_uk:'Воїн тижня', name_en:'Weekly Warrior', desc_uk:'4 тренування за тиждень', desc_en:'Complete 4 workouts in a single week', check:()=>WorkoutLog.thisWeekCount()>=4},
    {id:'iron_will',     icon:'🦾',name_uk:'Залізна воля', name_en:'Iron Will', desc_uk:'Зареєструй заміри 5 разів', desc_en:'Log your body measurements 5 times', check:()=>Progress.getMeasurements().length>=5},
  ];
  const key=()=>`achievements_${Auth.getUser()}`;
  const getUnlocked=()=>Storage.get(key(),{});
  const check=()=>{
    const ul=getUnlocked(); let changed=false;
    const lang = window.I18n ? I18n.getLanguage() : 'uk';
    const dateLocale = lang === 'en' ? 'en-US' : 'uk-UA';
    for(const d of DEFS){
      if(!ul[d.id]&&d.check()){
        ul[d.id]=new Date().toLocaleDateString(dateLocale);
        changed=true;
        const dName = lang === 'en' ? d.name_en : d.name_uk;
        UI.toast(`🏆 ${dName}!`,'info');
      }
    }
    if(changed) Storage.set(key(),ul);
  };
  const getAll=()=>{
    const ul=getUnlocked();
    const lang = window.I18n ? I18n.getLanguage() : 'uk';
    return DEFS.map(d=>({
      ...d,
      name: lang === 'en' ? d.name_en : d.name_uk,
      desc: lang === 'en' ? d.desc_en : d.desc_uk,
      unlockedAt:ul[d.id]||null
    }));
  };
  return { check,getAll };
})();

/* ============================================================
   Timer
   ============================================================ */
const Timer = (() => {
  let interval=null,remaining=90,total=90,running=false;
  const dEl=()=>document.getElementById('timer-display');
  const wEl=()=>document.getElementById('rest-timer-widget');
  const bEl=()=>document.getElementById('timer-start-btn');
  const fmt=(s)=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const render=()=>{
    dEl().textContent=fmt(remaining);
    if(remaining===0){ wEl().classList.remove('running'); wEl().classList.add('finished'); bEl().textContent='▶'; UI.toast('⏱ Відпочинок завершено! 💪','info'); }
  };
  const start=()=>{
    if(remaining===0){remaining=total;render();}
    if(running) return;
    running=true; wEl().classList.add('running'); wEl().classList.remove('finished'); bEl().textContent='⏸';
    interval=setInterval(()=>{ remaining--; render(); if(remaining<=0){clearInterval(interval);running=false;} },1000);
    // Push нагадування через SW
    if(window.Notifications) window.Notifications.scheduleRestNotification(total);
  };
  const pause=()=>{ clearInterval(interval); running=false; wEl().classList.remove('running'); bEl().textContent='▶'; };
  const toggle=()=>running?pause():start();
  const reset=(s)=>{ clearInterval(interval); running=false; total=s||total; remaining=total; wEl().classList.remove('running','finished'); bEl().textContent='▶'; render(); };
  const setTotal=(s)=>{ total=s; reset(s); };
  return { toggle,reset,setTotal,start };
})();

/* ============================================================
   UI utilities
   ============================================================ */
const UI = (() => {
  const toast=(msg,type='success')=>{
    const el=document.getElementById('toast');
    el.textContent=msg; el.className=`toast ${type}`; el.classList.remove('hidden');
    clearTimeout(UI._t); UI._t=setTimeout(()=>el.classList.add('hidden'),3500);
  };
  const openModal =(id)=>{ document.getElementById(id).classList.remove('hidden'); document.body.style.overflow='hidden'; };
  const closeModal=(id)=>{ document.getElementById(id).classList.add('hidden'); document.body.style.overflow=''; };
  const showPage  =(name)=>{
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    document.getElementById(`page-${name}`)?.classList.add('active');
    const nav=document.querySelector(`.nav-item[data-page="${name}"]`);
    nav?.classList.add('active');
    document.getElementById('page-title').textContent=nav?.querySelector('.nav-label')?.textContent||'';
  };
  const exportToPDF=(el,fn)=>{ if(window.html2pdf) html2pdf().set({margin:10,filename:fn||'gymplaner.pdf',html2canvas:{scale:2,backgroundColor:'#fff'},jsPDF:{unit:'mm',format:'a4'}}).from(el).save(); };
  return { toast,openModal,closeModal,showPage,exportToPDF };
})();
UI._t=null;

/* ============================================================
   Charts
   ============================================================ */
const Charts = (() => {
  let wc=null,mc=null;
  const def={ responsive:true,maintainAspectRatio:false, plugins:{ legend:{labels:{color:'#8a9ab5',font:{family:"'Barlow',sans-serif"}}}, tooltip:{backgroundColor:'#1f242e',titleColor:'#eef0f5',bodyColor:'#8a9ab5',borderColor:'#2a3040',borderWidth:1} }, scales:{ x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#505970',font:{family:"'Barlow',sans-serif"}}}, y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#505970',font:{family:"'Barlow',sans-serif"}}} } };
  const renderWeight=()=>{
    const d=Progress.getMeasurements().filter(m=>m.weight); const ctx=document.getElementById('weight-chart'); if(!ctx) return;
    if(wc) wc.destroy();
    wc=new Chart(ctx,{type:'line',data:{labels:d.map(m=>m.date),datasets:[{label:'Вага (кг)',data:d.map(m=>m.weight),borderColor:'#f0a500',backgroundColor:'rgba(240,165,0,0.1)',tension:0.4,fill:true,pointBackgroundColor:'#f0a500',pointRadius:5}]},options:{...def}});
  };
  const renderMeasurements=()=>{
    const d=Progress.getMeasurements(); const ctx=document.getElementById('measurements-chart'); if(!ctx) return;
    if(mc) mc.destroy();
    mc=new Chart(ctx,{type:'line',data:{labels:d.map(m=>m.date),datasets:[ {label:'Груди',data:d.map(m=>m.chest||null),borderColor:'#00d4ff',tension:0.4,spanGaps:true}, {label:'Талія',data:d.map(m=>m.waist||null),borderColor:'#f0a500',tension:0.4,spanGaps:true}, {label:'Стегна',data:d.map(m=>m.hips||null),borderColor:'#ff4757',tension:0.4,spanGaps:true}, {label:'Біцепс',data:d.map(m=>m.bicep||null),borderColor:'#2ed573',tension:0.4,spanGaps:true} ]},options:{...def}});
  };
  return { renderWeight,renderMeasurements };
})();

/* ============================================================
   Render
   ============================================================ */
const Render = (() => {
  const dashboard=()=>{
    const logs=WorkoutLog.getAll(); const user=Storage.get(`profile_${Auth.getUser()}`,{});
    document.getElementById('welcome-name').textContent=user.name||Auth.getUser();
    document.getElementById('stat-total-workouts').textContent=logs.length;
    document.getElementById('stat-this-week').textContent=WorkoutLog.thisWeekCount();
    document.getElementById('stat-streak').textContent=WorkoutLog.streak();
    // XP stat
    const gState=Storage.get(`gymplaner_gami_${Auth.getUser()}`,null);
    document.getElementById('stat-xp').textContent=(gState?.xp||0).toLocaleString();
    // Avatar
    const av=user.avatar; const topAv=document.getElementById('topbar-avatar');
    topAv.innerHTML=av?`<img src="${av}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:'👤';
    // Today
    const today=(new Date().getDay()+6)%7; const todayProgs=Programs.forDay(today);
    const todayEl=document.getElementById('today-workouts');
    todayEl.innerHTML=todayProgs.length?todayProgs.map(p=>`<div class="today-workout-item"><div><div class="today-workout-name">${p.name}</div><div class="today-workout-meta">${p.exercises?.length||0} вправ</div></div><button class="btn-primary" onclick="App.startSession('${p.id}')">Почати ▶</button></div>`).join(''):`<div class="empty-state"><span class="empty-icon">😴</span><p>Сьогодні немає запланованих тренувань</p><button class="btn-secondary" onclick="App.navigate('planner')">Скласти план</button></div>`;
    // Programs
    const dp=document.getElementById('dashboard-programs'); const top3=Programs.getAll().slice(0,3);
    dp.innerHTML=top3.length?top3.map(p=>programCard(p)).join(''):`<div class="empty-state"><span class="empty-icon">📋</span><p>Ще немає програм</p></div>`;
  };

  const programCard=(p)=>`<div class="program-card"><div class="program-card-title">${p.name}</div><div class="program-card-desc">${p.description||''}</div><div class="program-card-days">${(p.days||[]).map(d=>`<span class="day-badge">${Programs.DAY_NAMES[d]}</span>`).join('')}</div><div class="program-card-exercises">${p.exercises?.length||0} вправ</div><div class="program-card-actions"><button class="btn-primary" onclick="App.startSession('${p.id}')">▶ Почати</button><button class="btn-secondary" onclick="App.editProgram('${p.id}')">✎ Редагувати</button><button class="btn-ghost" onclick="App.deleteProgram('${p.id}')">🗑</button></div></div>`;

  const programs=()=>{ const el=document.getElementById('programs-list'); el.innerHTML=Programs.getAll().map(p=>programCard(p)).join(''); };

  const exercises=(group='all',search='')=>{
    const list=ExerciseDB.filter(group,search); const el=document.getElementById('exercises-list');
    el.innerHTML=list.length?list.map(e=>`<div class="exercise-card" onclick="App.showExerciseDetail('${e.id}')"><div class="exercise-card-name">${e.name}</div><span class="exercise-card-group">${ExerciseDB.groupName(e.group)}</span>${e.custom?'<div class="exercise-card-custom">⭐ Своя вправа</div>':''}</div>`).join(''):`<div class="empty-state"><span class="empty-icon">🔍</span><p>Нічого не знайдено</p></div>`;
  };

  const calendar=(year,month)=>{
    const el=document.getElementById('calendar-grid'); const label=document.getElementById('cal-month-label');
    const months=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
    label.textContent=`${months[month]} ${year}`;
    const today=new Date(); const firstDay=new Date(year,month,1); let startDow=(firstDay.getDay()+6)%7;
    const dim=new Date(year,month+1,0).getDate(); const logs=WorkoutLog.getAll();
    let html=['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map(d=>`<div class="cal-day-header">${d}</div>`).join('');
    for(let i=0;i<startDow;i++) html+=`<div class="cal-day empty"></div>`;
    for(let d=1;d<=dim;d++){
      const ds=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday=(d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear());
      const dl=logs.filter(l=>l.date===ds); const hasDone=dl.some(l=>l.done); const hasP=dl.some(l=>!l.done);
      const cls=['cal-day',isToday?'today':'',hasDone?'completed':(hasP?'has-workout':'')].filter(Boolean).join(' ');
      html+=`<div class="${cls}" onclick="App.showDayLog('${ds}')">${d}</div>`;
    }
    el.innerHTML=html; workoutLog();
  };

  const workoutLog=()=>{
    const logs=WorkoutLog.getAll().slice(0,20); const el=document.getElementById('workout-log');
    el.innerHTML=logs.length?logs.map(l=>`<div class="log-item"><span class="log-date">${l.date}</span><span class="log-name">${l.programName}</span><span class="log-status ${l.done?'done':'planned'}">${l.done?'✓ Виконано':'Заплановано'}</span><button class="btn-ghost" onclick="WorkoutLog.remove(${l.id}).then(()=>Render.calendar(App.calYear,App.calMonth))">🗑</button></div>`).join(''):`<div class="empty-state"><span class="empty-icon">📭</span><p>Журнал порожній</p></div>`;
  };

  const profile=()=>{
    const u=Storage.get(`profile_${Auth.getUser()}`,{});
    ['name','age','height','goal','level'].forEach(f=>{ const el=document.getElementById(`profile-${f}`); if(el) el.value=u[f]||''; });
    const prev=document.getElementById('avatar-preview'); prev.innerHTML=u.avatar?`<img src="${u.avatar}">`:'👤';
    document.getElementById('pstat-workouts').textContent=WorkoutLog.getAll().length;
    document.getElementById('pstat-programs').textContent=Programs.getAll().length;
    document.getElementById('pstat-records').textContent=Progress.getRecords().length;
    const tv=Storage.get(`timer_${Auth.getUser()}`,90);
    document.getElementById('timer-default-range').value=tv;
    document.getElementById('timer-val-display').textContent=tv;
    Timer.setTotal(tv);
  };

  const progress=()=>{ Charts.renderWeight(); Charts.renderMeasurements(); weightHistory(); measurementsHistory(); records(); };

  const weightHistory=()=>{
    const d=Progress.getMeasurements().slice().reverse(); const el=document.getElementById('weight-history');
    if(!d.length){el.innerHTML=`<div class="empty-state"><span class="empty-icon">⚖️</span><p>Немає записів ваги</p></div>`;return;}
    el.innerHTML=`<table class="data-table"><thead><tr><th>Дата</th><th>Вага (кг)</th><th></th></tr></thead><tbody>${d.map(m=>`<tr><td>${m.date}</td><td>${m.weight||'—'}</td><td><button class="del-btn" onclick="Progress.delMeasurement(${m.id});Render.progress()">🗑</button></td></tr>`).join('')}</tbody></table>`;
  };

  const measurementsHistory=()=>{
    const d=Progress.getMeasurements().slice().reverse(); const el=document.getElementById('measurements-history');
    if(!d.length){el.innerHTML=`<div class="empty-state"><span class="empty-icon">📏</span><p>Немає вимірів</p></div>`;return;}
    el.innerHTML=`<table class="data-table"><thead><tr><th>Дата</th><th>Груди</th><th>Талія</th><th>Стегна</th><th>Біцепс</th><th></th></tr></thead><tbody>${d.map(m=>`<tr><td>${m.date}</td><td>${m.chest||'—'}</td><td>${m.waist||'—'}</td><td>${m.hips||'—'}</td><td>${m.bicep||'—'}</td><td><button class="del-btn" onclick="Progress.delMeasurement(${m.id});Render.progress()">🗑</button></td></tr>`).join('')}</tbody></table>`;
  };

  const records=()=>{
    const d=Progress.getRecords(); const el=document.getElementById('records-list');
    el.innerHTML=d.length?d.map(r=>{ const ex=ExerciseDB.getById(r.exerciseId); return `<div class="record-card"><div class="record-exercise">${ex?.name||'Вправа'}</div><div class="record-value">${r.weight} кг</div><div class="record-meta">${r.reps} повт. · ${r.date}</div><button class="del-btn" style="background:none;color:var(--text-muted);font-size:12px;margin-top:8px" onclick="Progress.delRecord(${r.id});Render.records()">видалити</button></div>`; }).join(''):`<div class="empty-state"><span class="empty-icon">🥇</span><p>Немає рекордів</p></div>`;
  };

  const achievements=()=>{
    const list=Achievements.getAll(); const el=document.getElementById('achievements-grid');
    el.innerHTML=list.map(a=>`<div class="achievement-card ${a.unlockedAt?'unlocked':'locked'}"><span class="achievement-icon">${a.icon}</span><div class="achievement-name">${a.name}</div><div class="achievement-desc">${a.desc}</div>${a.unlockedAt?`<div class="achievement-date">✓ ${a.unlockedAt}</div>`:'<div class="achievement-date">🔒 Заблоковано</div>'}</div>`).join('');
  };

  return { dashboard,programs,exercises,calendar,workoutLog,profile,progress,weightHistory,measurementsHistory,records,achievements,programCard };
})();

/* ============================================================
   updateSidebarXP — оновити бар рівня у sidebar
   ============================================================ */
const updateSidebarXP = async () => {
  if(!window.Gamification||!Auth.getUser()) return;
  const state = await window.Gamification.getState(Auth.getUser());
  if(!state) return;
  const info  = window.Gamification.getLevelInfo(state.xp);
  document.getElementById('sidebar-level-icon').textContent = info.icon;
  document.getElementById('sidebar-level-name').textContent = info.name;
  document.getElementById('sidebar-xp-fill').style.width    = info.progress+'%';
  document.getElementById('sidebar-xp-val').textContent     = `${state.xp.toLocaleString()} XP`;
  // Дашборд XP stat
  const xpEl = document.getElementById('stat-xp');
  if(xpEl) xpEl.textContent = state.xp.toLocaleString();
};

/* ============================================================
   App — головний контролер
   ============================================================ */
const App = (() => {
  let calYear=new Date().getFullYear(), calMonth=new Date().getMonth();
  let editingProgId=null, tempExercises=[];
  let activeSessionProg=null;

  const init=()=>{
    if(Auth.restoreSession()) showApp();
    else showAuth();
    bindEvents();
  };

  const showAuth=()=>{ document.getElementById('auth-screen').classList.remove('hidden'); document.getElementById('app').classList.add('hidden'); };
  const showApp =async()=>{
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    // Ініціалізація модулів
    if(window.DB)            await window.DB.open();
    if(window.Sync)          window.Sync.init();
    if(window.Notifications) window.Notifications.init();
    if(window.Security)      window.Security.initAutoBackup(Auth.getUser());
    await updateSidebarXP();
    navigate('dashboard');
    if(window.PWA) window.PWA.dispatchReady();
  };

  const navigate=async(page)=>{
    UI.showPage(page);
    if(page==='dashboard')    { Render.dashboard(); await updateSidebarXP(); }
    if(page==='planner')      Render.programs();
    if(page==='exercises')    Render.exercises();
    if(page==='calendar')     { calYear=new Date().getFullYear(); calMonth=new Date().getMonth(); Render.calendar(calYear,calMonth); }
    if(page==='progress')     Render.progress();
    if(page==='achievements') Render.achievements();
    if(page==='profile')      Render.profile();
    if(page==='ai')           renderAIPage();
    if(page==='gamification') renderGamificationPage();
    if(page==='social')       renderSocialPage();
    if(page==='settings')     renderSettingsPage();
    closeSidebar();
  };

  /* ---- AI page ---- */
  const renderAIPage=async()=>{
    if(window.AIEngine) await window.AIEngine.renderInsights(Auth.getUser(),'ai-insights-container');
    // Sync status
    if(window.Sync){
      const s=window.Sync.getStatus();
      const modeEl=document.getElementById('sync-mode-label'); if(modeEl) modeEl.textContent=s.hasRemote?'Хмарний':'Локальний';
      const stEl=document.getElementById('sync-state-label');  if(stEl)  stEl.textContent=s.status;
    }
    // SW status
    const swEl=document.getElementById('pwa-sw-status');
    if(swEl) swEl.textContent=('serviceWorker' in navigator)?'Активний ✓':'Не підтримується';
  };

  /* ---- Gamification page ---- */
  const renderGamificationPage=async()=>{
    if(window.Gamification) await window.Gamification.renderGamificationWidget(Auth.getUser(),'gamification-container');
  };

  /* ---- Social page ---- */
  const renderSocialPage=async()=>{
    if(window.Social){ await window.Social.renderLeaderboard('leaderboard-container'); }
    // Public profile
    if(window.Social){
      const pp=await window.Social.buildPublicProfile(Auth.getUser());
      const el=document.getElementById('public-profile-container');
      if(el) el.innerHTML=`<div class="card"><div class="gami-level-title">${pp.levelIcon} ${pp.displayName}</div><div style="color:var(--text-secondary);font-size:13px;margin-top:8px">Рівень ${pp.level} — ${pp.levelName}</div><div style="margin-top:12px;display:flex;gap:20px"><div><strong>${pp.stats.totalWorkouts}</strong><div style="font-size:11px;color:var(--text-muted)">Тренувань</div></div><div><strong>${pp.stats.totalRecords}</strong><div style="font-size:11px;color:var(--text-muted)">Рекордів</div></div><div><strong>${pp.stats.streak}</strong><div style="font-size:11px;color:var(--text-muted)">Streak</div></div></div></div>`;
      const visEl=document.getElementById('profile-visibility-select');
      if(visEl) visEl.value=pp.isPublic?'public':'private';
    }
  };

  /* ---- Settings page ---- */
  const renderSettingsPage=()=>{
    if(window.Notifications) window.Notifications.renderSettingsPanel('notifications-settings-panel');
    if(window.Security)      window.Security.renderBackupPanel('backup-panel',Auth.getUser());
    // PWA info
    const dmEl=document.getElementById('pwa-display-mode');
    if(dmEl) dmEl.textContent=window.matchMedia('(display-mode:standalone)').matches?'Standalone (PWA)':'Browser';
    const swEl=document.getElementById('pwa-sw-status');
    if(swEl) swEl.textContent=('serviceWorker' in navigator)?'Активний ✓':'Не підтримується';
  };

  const closeSidebar=()=>{ document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.add('hidden'); };

  /* ---- Program Modal ---- */
  const openProgramModal=(id)=>{
    editingProgId=id; tempExercises=[];
    document.getElementById('modal-program-title').textContent=id?'Редагувати програму':'Нова програма';
    if(id){ const p=Programs.getById(id); document.getElementById('prog-name').value=p.name; document.getElementById('prog-desc').value=p.description||''; document.querySelectorAll('#days-picker input').forEach(cb=>cb.checked=p.days?.includes(parseInt(cb.value))); tempExercises=[...(p.exercises||[])]; }
    else  { document.getElementById('prog-name').value=''; document.getElementById('prog-desc').value=''; document.querySelectorAll('#days-picker input').forEach(cb=>cb.checked=false); }
    renderProgExercises(); UI.openModal('modal-program');
  };

  const renderProgExercises=()=>{
    const el=document.getElementById('prog-exercises-list');
    el.innerHTML=tempExercises.map((ex,i)=>{ const e=ExerciseDB.getById(ex.exerciseId); return `<div class="prog-ex-item"><div class="prog-ex-info"><div class="prog-ex-name">${e?.name||'Вправа'}</div><div class="prog-ex-meta">${ex.sets} підх. × ${ex.reps} повт. · ${ex.weight} кг</div>${ex.comment?`<div class="prog-ex-comment">${ex.comment}</div>`:''}</div><button class="prog-ex-del" onclick="App._delTempEx(${i})">✕</button></div>`; }).join('');
  };

  const _delTempEx=(i)=>{ tempExercises.splice(i,1); renderProgExercises(); };

  const saveProgram=async()=>{
    const name=document.getElementById('prog-name').value.trim();
    if(!name){ UI.toast('Введи назву програми','error'); return; }
    const days=Array.from(document.querySelectorAll('#days-picker input:checked')).map(cb=>parseInt(cb.value));
    const prog={ id:editingProgId||`prog_${Date.now()}`, name, description:document.getElementById('prog-desc').value.trim(), days, exercises:[...tempExercises], username:Auth.getUser(), createdAt:editingProgId?Programs.getById(editingProgId)?.createdAt:Date.now() };
    await Programs.save(prog); UI.closeModal('modal-program'); Render.programs(); Achievements.check();
    if(window.Gamification) await window.Gamification.awardXP(Auth.getUser(),'create_program');
    UI.toast(`Програму "${name}" збережено ✓`); await updateSidebarXP();
  };

  /* ---- Session ---- */
  const startSession=(programId)=>{
    const prog=Programs.getById(programId); if(!prog) return;
    activeSessionProg=prog; document.getElementById('session-title').textContent=prog.name;
    const container=document.getElementById('session-exercises');
    container.innerHTML=(prog.exercises||[]).map((ex,ei)=>{
      const exData=ExerciseDB.getById(ex.exerciseId);
      const setsHtml=Array.from({length:ex.sets},(_,si)=>`<div class="session-set" id="set-${ei}-${si}"><span class="session-set-num">${si+1}</span><div class="session-set-label"><input type="number" class="set-reps" value="${ex.reps}" min="0" /><small>Повт.</small></div><div class="session-set-label"><input type="number" class="set-weight" value="${ex.weight}" step="2.5" min="0" /><small>Кг</small></div><button class="session-set-done" onclick="App._toggleSetDone(${ei},${si})" title="Виконано">✓</button></div>`).join('');
      return `<div class="session-exercise"><div class="session-ex-header"><span class="session-ex-name">${exData?.name||'Вправа'}</span><span style="font-size:12px;color:var(--text-muted)">${ex.sets}×${ex.reps}</span></div>${ex.comment?`<p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;font-style:italic">${ex.comment}</p>`:''}<div class="session-sets">${setsHtml}</div></div>`;
    }).join('');
    UI.openModal('modal-session');
  };

  const _toggleSetDone=(ei,si)=>{ const el=document.getElementById(`set-${ei}-${si}`); el.classList.toggle('completed'); if(el.classList.contains('completed')) Timer.start(); };

  const finishSession=async()=>{
    if(!activeSessionProg) return;
    await WorkoutLog.add({ programName:activeSessionProg.name, programId:activeSessionProg.id, exercises:activeSessionProg.exercises||[], done:true });
    UI.closeModal('modal-session'); await navigate('dashboard');
    UI.toast(`Тренування "${activeSessionProg.name}" завершено! 💪`);
    activeSessionProg=null; await updateSidebarXP();
  };

  /* ---- Bind events ---- */
  const bindEvents=()=>{
    /* Auth */
    document.querySelectorAll('.auth-tab').forEach(btn=>btn.addEventListener('click',()=>{ document.querySelectorAll('.auth-tab').forEach(b=>b.classList.remove('active')); document.querySelectorAll('.auth-form').forEach(f=>f.classList.remove('active')); btn.classList.add('active'); document.getElementById(`${btn.dataset.tab}-form`).classList.add('active'); }));
    document.getElementById('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn   = e.target.querySelector('button[type=submit]');
      const errEl = document.getElementById('login-error');
      const u = document.getElementById('login-username').value.trim();
      const p = document.getElementById('login-password').value;
      errEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Входжу...';
      try {
        const res = await Auth.login(u, p);
        if (res.ok) { showApp(); }
        else { errEl.textContent = res.error; }
      } catch(err) {
        errEl.textContent = 'Помилка входу. Спробуй ще раз.';
        console.error('[login submit]', err);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Увійти';
      }
    });
    document.getElementById('register-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn    = e.target.querySelector('button[type=submit]');
      const errEl  = document.getElementById('reg-error');
      const n = document.getElementById('reg-name').value.trim();
      const u = document.getElementById('reg-username').value.trim();
      const p = document.getElementById('reg-password').value;
      errEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Зачекай...';
      try {
        const res = await Auth.register(n, u, p);
        if (res.ok) { showApp(); }
        else { errEl.textContent = res.error; }
      } catch(err) {
        errEl.textContent = 'Помилка. Перевір консоль.';
        console.error('[register submit]', err);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Зареєструватись';
      }
    });
    document.getElementById('btn-logout').addEventListener('click',()=>{ Auth.logout(); showAuth(); });
    /* Nav */
    document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.page)));
    document.getElementById('burger-btn').addEventListener('click',()=>{ document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebar-overlay').classList.toggle('hidden'); });
    document.getElementById('sidebar-overlay').addEventListener('click',closeSidebar);
    document.getElementById('btn-quick-workout').addEventListener('click',()=>navigate('planner'));
    document.getElementById('topbar-avatar').addEventListener('click',()=>navigate('profile'));
    /* Timer */
    document.getElementById('timer-start-btn').addEventListener('click',Timer.toggle);
    document.getElementById('timer-reset-btn').addEventListener('click',()=>{ const tv=Storage.get(`timer_${Auth.getUser()}`,90); Timer.reset(tv); });
    /* Modals */
    document.querySelectorAll('.modal-close,[data-modal]').forEach(btn=>btn.addEventListener('click',()=>UI.closeModal(btn.dataset.modal)));
    document.querySelectorAll('.modal-overlay').forEach(ov=>ov.addEventListener('click',e=>{ if(e.target===ov) UI.closeModal(ov.id); }));
    /* Planner */
    document.getElementById('btn-new-program').addEventListener('click',()=>openProgramModal(null));
    document.getElementById('btn-add-exercise-to-prog').addEventListener('click',()=>{ populateExerciseSelect('ae-exercise-select'); UI.openModal('modal-add-exercise'); });
    document.getElementById('btn-confirm-add-exercise').addEventListener('click',()=>{
      const id=document.getElementById('ae-exercise-select').value; const ex=ExerciseDB.getById(id); if(!ex) return;
      tempExercises.push({ exerciseId:id, sets:parseInt(document.getElementById('ae-sets').value)||3, reps:parseInt(document.getElementById('ae-reps').value)||10, weight:parseFloat(document.getElementById('ae-weight').value)||0, comment:document.getElementById('ae-comment').value.trim() });
      renderProgExercises(); UI.closeModal('modal-add-exercise');
    });
    document.getElementById('btn-save-program').addEventListener('click',saveProgram);
    document.getElementById('btn-export-json').addEventListener('click',exportJSON);
    document.getElementById('import-json-input').addEventListener('change',importJSON);
    /* Exercises */
    document.getElementById('exercise-search').addEventListener('input',e=>{ const t=document.querySelector('.muscle-tab.active'); Render.exercises(t?.dataset.group||'all',e.target.value); });
    document.querySelectorAll('.muscle-tab').forEach(btn=>btn.addEventListener('click',()=>{ document.querySelectorAll('.muscle-tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); Render.exercises(btn.dataset.group,document.getElementById('exercise-search').value); }));
    document.getElementById('btn-add-custom-exercise').addEventListener('click',()=>UI.openModal('modal-custom-exercise'));
    document.getElementById('btn-save-custom-exercise').addEventListener('click',()=>{
      const name=document.getElementById('ce-name').value.trim(),group=document.getElementById('ce-group').value,desc=document.getElementById('ce-desc').value.trim();
      if(!name){ UI.toast('Введи назву вправи','error'); return; }
      ExerciseDB.addCustom(name,group,desc); UI.closeModal('modal-custom-exercise'); Render.exercises(); UI.toast('Вправу додано ✓');
    });
    /* Calendar */
    document.getElementById('cal-prev').addEventListener('click',()=>{ calMonth--; if(calMonth<0){calMonth=11;calYear--;} Render.calendar(calYear,calMonth); });
    document.getElementById('cal-next').addEventListener('click',()=>{ calMonth++; if(calMonth>11){calMonth=0;calYear++;} Render.calendar(calYear,calMonth); });
    /* Progress */
    document.querySelectorAll('.progress-tab').forEach(btn=>btn.addEventListener('click',()=>{ document.querySelectorAll('.progress-tab').forEach(b=>b.classList.remove('active')); document.querySelectorAll('.progress-panel').forEach(p=>p.classList.remove('active')); btn.classList.add('active'); document.getElementById(`ptab-${btn.dataset.ptab}`).classList.add('active'); if(btn.dataset.ptab==='weight') Charts.renderWeight(); if(btn.dataset.ptab==='measurements') Charts.renderMeasurements(); }));
    document.getElementById('btn-add-measurement').addEventListener('click',()=>{ document.getElementById('meas-date').value=new Date().toISOString().split('T')[0]; UI.openModal('modal-measurement'); });
    document.getElementById('btn-save-measurement').addEventListener('click',()=>{
      const date=document.getElementById('meas-date').value; if(!date){UI.toast('Вибери дату','error');return;}
      Progress.addMeasurement({ date, weight:parseFloat(document.getElementById('meas-weight').value)||null, chest:parseFloat(document.getElementById('meas-chest').value)||null, waist:parseFloat(document.getElementById('meas-waist').value)||null, hips:parseFloat(document.getElementById('meas-hips').value)||null, bicep:parseFloat(document.getElementById('meas-bicep').value)||null });
      UI.closeModal('modal-measurement'); Render.progress(); UI.toast('Заміри збережено ✓');
    });
    document.getElementById('btn-add-record').addEventListener('click',()=>{ populateExerciseSelect('rec-exercise'); document.getElementById('rec-date').value=new Date().toISOString().split('T')[0]; UI.openModal('modal-record'); });
    document.getElementById('btn-save-record').addEventListener('click',()=>{
      const exerciseId=document.getElementById('rec-exercise').value, weight=parseFloat(document.getElementById('rec-weight').value), reps=parseInt(document.getElementById('rec-reps').value)||1, date=document.getElementById('rec-date').value;
      if(!weight||!date){UI.toast('Заповни всі поля','error');return;}
      Progress.addRecord({exerciseId,weight,reps,date}); UI.closeModal('modal-record'); Render.records(); UI.toast('Рекорд збережено 🥇');
    });
    /* Profile */
    document.getElementById('btn-save-profile').addEventListener('click',()=>{
      const p={name:document.getElementById('profile-name').value.trim(),age:document.getElementById('profile-age').value,height:document.getElementById('profile-height').value,goal:document.getElementById('profile-goal').value,level:document.getElementById('profile-level').value,avatar:Storage.get(`profile_${Auth.getUser()}`,{}).avatar||''};
      Storage.set(`profile_${Auth.getUser()}`,p); UI.toast('Профіль збережено ✓'); Render.dashboard();
    });
    document.getElementById('avatar-upload').addEventListener('change',e=>{
      const file=e.target.files[0]; if(!file) return;
      const r=new FileReader(); r.onload=ev=>{ const d=ev.target.result; const p=Storage.get(`profile_${Auth.getUser()}`,{}); p.avatar=d; Storage.set(`profile_${Auth.getUser()}`,p); document.getElementById('avatar-preview').innerHTML=`<img src="${d}">`; UI.toast('Фото оновлено ✓'); Render.dashboard(); }; r.readAsDataURL(file);
    });
    document.getElementById('timer-default-range').addEventListener('input',e=>{ const v=parseInt(e.target.value); document.getElementById('timer-val-display').textContent=v; Storage.set(`timer_${Auth.getUser()}`,v); Timer.setTotal(v); });
    /* Session */
    document.getElementById('btn-finish-session').addEventListener('click',finishSession);
    document.getElementById('btn-export-pdf').addEventListener('click',()=>UI.exportToPDF(document.getElementById('modal-session').querySelector('.modal'),'workout-plan.pdf'));
    /* Social tabs */
    document.querySelectorAll('.social-tab').forEach(btn=>btn.addEventListener('click',()=>{ document.querySelectorAll('.social-tab').forEach(b=>b.classList.remove('active')); document.querySelectorAll('.social-panel').forEach(p=>p.classList.remove('active')); btn.classList.add('active'); document.getElementById(`stab-${btn.dataset.stab}`).classList.add('active'); if(btn.dataset.stab==='leaderboard'&&window.Social) window.Social.renderLeaderboard('leaderboard-container'); }));
    document.getElementById('btn-save-visibility')?.addEventListener('click',()=>{ const v=document.getElementById('profile-visibility-select').value; if(window.Social) window.Social.setProfileVisibility(Auth.getUser(),v==='public'); UI.toast('Налаштування збережено ✓'); });
    document.getElementById('btn-compare')?.addEventListener('click',async()=>{ const u2=document.getElementById('compare-username-input').value.trim(); if(!u2){UI.toast('Введи логін','error');return;} if(window.Social) await window.Social.renderComparison('compare-container',Auth.getUser(),u2); });
    /* AI page */
    document.getElementById('btn-refresh-ai')?.addEventListener('click',()=>renderAIPage());
    document.getElementById('btn-calc-1rm')?.addEventListener('click',()=>{ const w=parseFloat(document.getElementById('calc-weight').value),r=parseInt(document.getElementById('calc-reps').value); if(window.AIEngine&&w&&r){ const rm=window.AIEngine.calculate1RM(w,r); document.getElementById('calc-result').value=rm+' кг'; } });
    document.getElementById('btn-force-sync')?.addEventListener('click',async()=>{ if(window.Sync){ await window.Sync.flushQueue(); UI.toast('Синхронізацію завершено ✓'); } else UI.toast('Синхронізація недоступна','info'); });
    document.getElementById('btn-clear-cache')?.addEventListener('click',()=>{ navigator.serviceWorker?.controller?.postMessage({type:'CLEAR_CACHE'}); UI.toast('Кеш очищено ✓'); });
    /* Settings */
    document.getElementById('btn-install-pwa')?.addEventListener('click',()=>{ if(window.PWA&&window.PWA.isInstallable()) window.PWA.triggerInstall(); else UI.toast('Додаток вже встановлено або браузер не підтримує','info'); });
    document.getElementById('btn-clear-cache-settings')?.addEventListener('click',()=>{ navigator.serviceWorker?.controller?.postMessage({type:'CLEAR_CACHE'}); UI.toast('Кеш очищено ✓'); });
    document.getElementById('btn-clear-data')?.addEventListener('click',()=>{
      if(!confirm('Видалити всі дані? Цю дію неможливо скасувати.')) return;
      const u=Auth.getUser(); const pw=Storage.get('users',{})[u]?.password;
      Storage.clearAll(); const users={}; users[u]={password:pw,createdAt:Date.now()}; Storage.set('users',users); Storage.set('session',u);
      navigate('dashboard'); UI.toast('Дані очищено','error');
    });
  };

  /* ---- Helpers ---- */
  const populateExerciseSelect=(selId)=>{
    const sel=document.getElementById(selId); const exs=ExerciseDB.getAll();
    sel.innerHTML=Object.entries(ExerciseDB.GROUPS).map(([gk,gn])=>{ const opts=exs.filter(e=>e.group===gk).map(e=>`<option value="${e.id}">${e.name}</option>`).join(''); return opts?`<optgroup label="${gn}">${opts}</optgroup>`:''; }).join('');
  };

  const exportJSON=()=>{
    const data={programs:Programs.getAll(),log:WorkoutLog.getAll(),measurements:Progress.getMeasurements(),records:Progress.getRecords(),custom:Storage.get('custom_exercises',[])};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`gymplaner_${Auth.getUser()}_${new Date().toISOString().split('T')[0]}.json`; a.click(); UI.toast('Дані експортовано ✓');
  };
  const importJSON=(e)=>{
    const file=e.target.files[0]; if(!file) return;
    const r=new FileReader(); r.onload=ev=>{ try{ const d=JSON.parse(ev.target.result); if(d.programs) Storage.set(`programs_${Auth.getUser()}`,d.programs); if(d.log) Storage.set(`log_${Auth.getUser()}`,d.log); if(d.measurements) Storage.set(`measurements_${Auth.getUser()}`,d.measurements); if(d.records) Storage.set(`records_${Auth.getUser()}`,d.records); if(d.custom) Storage.set('custom_exercises',d.custom); navigate('dashboard'); UI.toast('Дані імпортовано ✓'); }catch{ UI.toast('Помилка файлу JSON','error'); } }; r.readAsText(file); e.target.value='';
  };

  const api = { init,navigate,editProgram:(id)=>openProgramModal(id),deleteProgram:async(id)=>{ const p=Programs.getById(id); if(!confirm(`Видалити "${p?.name}"?`)) return; await Programs.remove(id); Render.programs(); UI.toast('Програму видалено'); },showExerciseDetail:(id)=>{ const ex=ExerciseDB.getById(id); if(!ex) return; document.getElementById('ex-detail-name').textContent=ex.name; document.getElementById('ex-detail-group').innerHTML=`<span class="exercise-card-group">${ExerciseDB.groupName(ex.group)}</span>`; document.getElementById('ex-detail-desc').textContent=ex.desc||''; document.getElementById('ex-detail-tips').textContent=ex.tips?`💡 ${ex.tips}`:''; UI.openModal('modal-exercise-detail'); },showDayLog:(ds)=>{ const l=WorkoutLog.forDate(ds); if(l.length) UI.toast(`${ds}: ${l.map(x=>x.programName).join(', ')}`); },startSession,_delTempEx,_toggleSetDone };

  Object.defineProperty(api,'calYear', {get:()=>calYear});
  Object.defineProperty(api,'calMonth',{get:()=>calMonth});

  return api;
})();

document.addEventListener('DOMContentLoaded', App.init);
