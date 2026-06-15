# GymPlaner v2.0 — Production-Ready PWA

> Повнофункціональний Progressive Web App для планування тренувань з офлайн-підтримкою, AI-аналітикою, гейміфікацією та хмарною синхронізацією.

---

## Структура директорій

```
GymPlaner/
│
├── index.html                  # Головний HTML — вся розмітка додатку
├── style.css                   # Стилі — Industrial Dark theme + v2 розширення
├── script.js                   # Головний контролер + всі core-модулі
├── pwa.js                      # PWA bootstrap (SW реєстрація, install prompt)
├── sw.js                       # Service Worker (кешування, push, bg sync)
├── manifest.json               # PWA маніфест (іконки, shortcuts, theme)
│
├── modules/
│   ├── db.js                   # IndexedDB абстракція — всі CRUD-операції
│   ├── sync.js                 # Хмарна синхронізація — черга, конфлікти
│   ├── ai.js                   # AI-аналітика — регресія, рекомендації, прогнози
│   ├── gamification.js         # Гейміфікація — XP, рівні, завдання, виклики
│   ├── notifications.js        # Push-сповіщення — scheduling, Web Push API
│   ├── security.js             # Безпека — AES-GCM шифрування, бекапи
│   └── social.js               # Соціальні функції — рейтинг, шарінг, порівняння
│
└── icons/
    ├── icon-72.svg
    ├── icon-96.svg
    ├── icon-128.svg
    ├── icon-144.svg
    ├── icon-152.svg
    ├── icon-192.svg
    ├── icon-384.svg
    └── icon-512.svg
```

---

## Архітектура додатку

### Патерн: Modular IIFE + Event-Driven

```
┌─────────────────────────────────────────────────────────────┐
│                         index.html                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Auth    │  │  Render  │  │  Charts  │  │  Timer   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │ Programs │  │WorkoutLog│  │ Progress │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                      App (Controller)               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │              │              │              │
    ┌────▼────┐   ┌─────▼────┐  ┌─────▼────┐  ┌────▼────┐
    │   DB    │   │  Sync    │  │ AIEngine │  │  Gami   │
    │(IDB)    │   │(Queue)   │  │(ML/Stats)│  │(XP/Lvl) │
    └─────────┘   └──────────┘  └──────────┘  └─────────┘
         │              │
    ┌────▼────┐   ┌─────▼──────────────┐
    │Security │   │   Service Worker   │
    │(AES-GCM)│   │ Cache/Push/BgSync  │
    └─────────┘   └────────────────────┘
```

---

## Опис модулів

### `pwa.js` — PWA Bootstrap
**Відповідальність:** Ініціалізація PWA до завантаження DOM.

| Метод | Опис |
|---|---|
| `init()` | Запускає splash screen, реєструє SW, налаштовує install prompt та network badge |
| `registerServiceWorker()` | Реєстрація `sw.js`, слухає `updatefound` для показу банера оновлення |
| `setupInstallPrompt()` | Перехоплює `beforeinstallprompt`, зберігає для виклику пізніше |
| `triggerInstall()` | Показує системний діалог встановлення |
| `setupNetworkBadge()` | Online/offline індикатор у topbar |
| `dispatchReady()` | Кастомна подія `gymplaner:ready` — для deep links |

**Splash Screen:** SVG-лого + анімована progress-bar. Зникає через 900ms після `window.load`.

---

### `sw.js` — Service Worker
**Кеші:** `gymplaner-v1.2.0-static`, `-dynamic`, `-api`

| Стратегія | Коли використовується |
|---|---|
| **Cache First** | JS, CSS, SVG, шрифти — статичні ресурси |
| **Network First** | API-запити, Firebase — свіжі дані |
| **Stale While Revalidate** | Все інше — баланс між швидкістю та свіжістю |

**Можливості:**
- Передкешування 15+ ресурсів при `install`
- Очищення старих версій кешу при `activate`
- **Background Sync** — тег `sync-all` після відновлення мережі
- **Push Notifications** — обробка `push` event з action-кнопками
- **Periodic Background Sync** — щоденні нагадування (де підтримується)
- Комунікація з клієнтом через `postMessage`

---

### `modules/db.js` — IndexedDB
**База даних:** `GymPlanerDB v3`

| Store | Key | Індекси | Призначення |
|---|---|---|---|
| `users` | `username` | — | Облікові записи |
| `workouts` | `id` | `by_user`, `by_date` | Журнал тренувань |
| `exercises` | `id` | `by_group`, `by_user` | Каталог вправ |
| `statistics` | `id` | `by_user`, `by_type` | Заміри + рекорди |
| `achievements` | `id` | `by_user` | Розблоковані досягнення |
| `programs` | `id` | `by_user` | Тренувальні програми |
| `measurements` | `id` | `by_user`, `by_date` | Виміри тіла |
| `syncQueue` | `queueId` (auto) | `by_status`, `by_user` | Черга синхронізації |
| `gamification` | `username` | — | XP, рівні, завдання |

**Generic CRUD:** `get()`, `getAll()`, `getByIndex()`, `put()`, `putMany()`, `remove()`, `clear()`, `count()`

**Спеціалізовані колекції:** `DB.Users`, `DB.Workouts`, `DB.Exercises`, `DB.Statistics`, `DB.Programs`, `DB.SyncQueue`, `DB.Gamification`

---

### `modules/sync.js` — Хмарна синхронізація
**Архітектура:** Event Sourcing — зберігаємо *дії*, а не стан.

**Черга змін (Sync Queue):**
```
Дія користувача
      │
      ▼
  enqueue()  ──→  IndexedDB (syncQueue store)
      │
      ▼
  Online?  ──Yes──→  flushQueue()  ──→  Firebase / REST API
      │
     No
      │
      ▼
  Background Sync (SW)  ──→  flushQueue() при поверненні online
```

**Вирішення конфліктів:**

| Стратегія | Опис |
|---|---|
| `server-wins` | Серверна версія завжди перемагає (за замовчуванням) |
| `client-wins` | Локальна версія пріоритетна |
| `latest-wins` | Порівнює `updatedAt` timestamp |
| `merge` | Глибоке злиття — серверні поля мають пріоритет |

**Підключення Firebase:**
```javascript
Sync.configure({
  firebaseUrl: 'https://your-project.firebaseio.com',
  // або
  apiBaseUrl: 'https://your-api.com/v1',
});
```

---

### `modules/ai.js` — AI Аналітика
**Алгоритми:** без зовнішніх залежностей, чистий JS.

| Функція | Алгоритм | Вихід |
|---|---|---|
| `analyzeTrend()` | Лінійна регресія (МНК) | slope, R², direction |
| `detectPlateau()` | Аналіз відхилення останніх 3 рекордів | Список застоїв з severity |
| `analyzeFrequency()` | Середнє тренувань/тиждень | status: excellent/good/moderate/low |
| `analyzeRecovery()` | Розподіл інтервалів між тренуваннями | avgRestDays, overtraining risk |
| `analyzeConsistency()` | Тренування за останні 30 днів / 12 | score 0-100% |
| `generatePredictions()` | Лінійна екстраполяція рекордів на 4 тижні | predictedPR, estimatedDays, confidence |
| `movingAverage()` | Ковзне середнє (window=7) | Згладжений масив |
| `calculate1RM()` | Формула Brzycki: `w × 36 / (37 - reps)` | One-rep max |

**Рекомендації генеруються автоматично** за результатами аналізу:
- 🔴 Висока пріоритетність: ризик перетренованості, застій > 42 днів
- 🟡 Середня: низька частота, швидка втрата ваги
- 🟢 Низька: час збільшити робочу вагу (≥12 повторень)

---

### `modules/gamification.js` — Гейміфікація

**XP Система:**

| Дія | XP |
|---|---|
| Завершити тренування | +50 |
| Новий рекорд (PR) | +100 |
| Виконати щоденне завдання | +40 |
| Тижневий виклик | +150 |
| Streak 3 дні | +25 |
| Streak 7 днів | +75 |

**10 рівнів:** 🥚 Новачок (0) → 🌟 Залізна Легенда (10 000 XP)

**Щоденні завдання** — 3 на день, визначаються детерміновано по даті (однакові для всіх у той же день, змінюються кожен день).

**Тижневі виклики** — 1 на тиждень із пулу 6 викликів (ротація по номеру тижня).

**9 значків (badges):** від "Ранній птах" до "Залізна Легенда".

---

### `modules/notifications.js` — Push-сповіщення

**Типи нагадувань:**

| Тип | Тригер | Час |
|---|---|---|
| Тренування сьогодні | Щоденно | Вибраний користувачем час |
| Щоденні завдання | Щоденно | Окремий час |
| Кінець відпочинку | Після кожного підходу | = час таймера |
| Оновити програму | Одноразово | Через 30 днів від початку |

**Web Push API** (для продакшну з бекендом):
```javascript
// VAPID ключ від вашого сервера
const sub = await Notifications.subscribeToPush('YOUR_VAPID_PUBLIC_KEY');
// Відправити sub на сервер для надсилання push
```

**Без бекенду** — використовує `setTimeout` + `Notification API` (працює поки вкладка відкрита).

---

### `modules/security.js` — Безпека

**Шифрування:** AES-GCM 256-bit через Web Crypto API

```
Пароль + Salt(16 байт)
        │
        ▼ PBKDF2 (100 000 ітерацій, SHA-256)
   CryptoKey (AES-GCM 256)
        │
        ▼ encrypt(IV=12 байт, plaintext)
   [Salt(16) || IV(12) || Ciphertext] → Base64
```

**Хешування паролів:** SHA-256 + username-salt + pepper — замість небезпечного `btoa()`.

**Автобекап:** Запускається через 5 сек після логіну якщо минуло > 24 год від попереднього. Зберігає до 5 версій (FIFO).

**Ротація бекапів:** `MAX_BACKUPS = 5` — старі видаляються автоматично.

**Контрольна сума:** SHA-256 перших 8 байт — перевіряється при відновленні.

---

### `modules/social.js` — Соціальні функції

**Публічний профіль** — видаляє приватні дані перед відображенням:
- ✅ Показує: ім'я, рівень, XP, статистику, значки
- ❌ Приховує: пароль, email, приватні налаштування

**Activity Score** для рейтингу:
```
Score = XP × 0.4 + Тренування × 10 + Streak × 5 + Рекорди × 20
```

**Web Share API** — нативний шарінг на мобільних. Fallback — копіювання в буфер.

**Карточка досягнення** — генерується як SVG, скачується як файл.

---

## PWA: Встановлення на пристрої

### Android (Chrome)
1. Відкрити сайт у Chrome
2. Натиснути `⋮` → "Додати на головний екран"
3. Або використати кнопку "📲 Встановити додаток" в sidebar

### iOS (Safari)
1. Відкрити сайт у Safari
2. Натиснути кнопку "Поділитися" (квадрат зі стрілкою)
3. Вибрати "На екран «Початок»"

### Desktop (Chrome/Edge)
1. Відкрити сайт
2. У адресному рядку натиснути іконку встановлення (📲)
3. Або через кнопку в sidebar

### Маніфест shortcuts
- **"Почати тренування"** → `?action=workout` → автоматично відкриває Планувальник
- **"Додати заміри"** → `?action=measurement` → автоматично відкриває Прогрес

---

## Офлайн-режим

Усі сторінки та дані доступні без інтернету:

| Ресурс | Стратегія кешування |
|---|---|
| `index.html`, `style.css`, `script.js` | Cache First (SW precache) |
| Іконки, шрифти | Cache First |
| CDN (Chart.js, html2pdf) | Cache First при першому завантаженні |
| Дані користувача | IndexedDB (завжди локально) |
| API-запити | Network First → IDB fallback |

**Індикатор:** Badge у topbar змінюється `Online ●` / `Offline ●` з анімацією.

---

## Підключення Firebase (покрокова інструкція)

1. Створити проект на [console.firebase.google.com](https://console.firebase.google.com)
2. Увімкнути Realtime Database або Firestore
3. Додати у `index.html` перед `script.js`:
```html
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-database-compat.js"></script>
```
4. Налаштувати Sync:
```javascript
// В script.js після showApp()
Sync.configure({
  firebaseUrl: 'https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com',
  conflictStrategy: 'latest-wins',
});
```
5. Додати Firebase Auth для токенів
6. Налаштувати Rules у Firebase Console

---

## Технічний стек

| Технологія | Версія | Призначення |
|---|---|---|
| Vanilla JS ES6+ | — | Основна мова без фреймворків |
| Service Worker API | — | Офлайн, кешування, push |
| IndexedDB | — | Основне сховище даних |
| Web Crypto API | — | AES-GCM шифрування, SHA-256 |
| Web Share API | — | Нативний шарінг |
| Notification API | — | Push-сповіщення |
| Background Sync API | — | Фонова синхронізація |
| Periodic Background Sync | — | Планові нагадування |
| Chart.js | 4.4.0 | Графіки прогресу |
| html2pdf.js | 0.10.1 | Експорт у PDF |
| Google Fonts | — | Bebas Neue, Barlow |
| CSS Custom Properties | — | Theming системи |
| CSS Grid + Flexbox | — | Адаптивна розмітка |

---

## Production Deployment

### Мінімальна конфігурація (статичний хостинг)

```bash
# Netlify
netlify deploy --dir=GymPlaner --prod

# Vercel
vercel GymPlaner --prod

# GitHub Pages
# Завантажити папку GymPlaner у репозиторій
# Settings → Pages → Deploy from branch
```

### Важливо для HTTPS
Service Worker **вимагає HTTPS** (або `localhost`). Усі хмарні хостинги надають SSL автоматично.

### Заголовки для SW (якщо власний сервер)
```nginx
# nginx.conf
location /sw.js {
  add_header Cache-Control "no-cache, no-store, must-revalidate";
  add_header Service-Worker-Allowed "/";
}
location / {
  add_header Cache-Control "public, max-age=31536000, immutable";
}
```

---

## Production-Ready структура для масштабування

```
gymplaner-production/
│
├── public/                     # Статика для деплою
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
│
├── src/
│   ├── core/
│   │   ├── auth.js
│   │   ├── router.js
│   │   ├── storage.js
│   │   └── events.js           # EventEmitter
│   │
│   ├── modules/
│   │   ├── db.js
│   │   ├── sync.js
│   │   ├── ai.js
│   │   ├── gamification.js
│   │   ├── notifications.js
│   │   ├── security.js
│   │   └── social.js
│   │
│   ├── pages/
│   │   ├── dashboard.js
│   │   ├── planner.js
│   │   ├── exercises.js
│   │   ├── calendar.js
│   │   ├── progress.js
│   │   ├── ai-analytics.js
│   │   ├── gamification.js
│   │   ├── social.js
│   │   ├── achievements.js
│   │   ├── profile.js
│   │   └── settings.js
│   │
│   ├── components/
│   │   ├── modal.js
│   │   ├── toast.js
│   │   ├── timer.js
│   │   ├── chart-widget.js
│   │   └── exercise-card.js
│   │
│   ├── data/
│   │   ├── exercises.js        # База вправ
│   │   ├── achievements.js     # Визначення досягнень
│   │   └── levels.js           # Рівні XP
│   │
│   └── styles/
│       ├── _variables.css
│       ├── _reset.css
│       ├── _typography.css
│       ├── _buttons.css
│       ├── _layout.css
│       ├── _components.css
│       ├── _pages.css
│       ├── _modals.css
│       ├── _responsive.css
│       └── main.css
│
├── server/                     # Опційний бекенд
│   ├── api/
│   │   ├── auth.js
│   │   ├── workouts.js
│   │   ├── sync.js
│   │   └── push.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── rateLimit.js
│   └── index.js                # Express/Fastify сервер
│
├── tests/
│   ├── unit/
│   │   ├── db.test.js
│   │   ├── ai.test.js
│   │   └── gamification.test.js
│   └── e2e/
│       └── workout-flow.test.js
│
├── scripts/
│   ├── build.js                # Bundling (esbuild/rollup)
│   ├── generate-icons.js       # SVG → PNG конвертація
│   └── deploy.sh
│
├── .env.example
├── package.json
└── README.md
```

---

## Безпека — чеклист

- ✅ Паролі хешуються через SHA-256 + salt + pepper (не зберігаються у відкритому вигляді)
- ✅ Дані шифруються AES-GCM 256-bit при бекапі
- ✅ PBKDF2 (100 000 ітерацій) захищає від brute-force атак на ключ
- ✅ Контрольна сума SHA-256 перевіряє цілісність бекапів
- ✅ Service Worker ізолює кеш від інших сайтів
- ✅ CSP-заголовки рекомендовані при деплої
- ⚠️ Для продакшну: додати серверну авторизацію (JWT/session)
- ⚠️ Firebase Rules обов'язкові при підключенні хмари

---

*GymPlaner v2.0 — Тренуйся розумно. Досягай більше. ⚡*

## Програми тренуваннь
✅ додати  імпорт та експорт програм з таблиці Ексель або похожих програм\нотатник
✅ додати популярні програми від Бодібілдерів


## АІ аналітика
- додати популярні формули на 1RM
- додати різні вправи на формули 1RM


## Геміфікація
- покращити 


## Трекінг
- додати діаграму по рекордам


## Досягнення
- поправити нарахування Хр
- актуалізувати систему рівнів
- додати більше досягненнь 


## додати API для автоматичного трекінгу відвідування залу
- додати можливість записування регулярних подій 
- додати автоматичне підтвердження відвідування залу


## Лист на фітнес клуб
- "Hej! Chodzę na waszą siłownię i stworzyłem aplikację dla klubów fitness — tracker treningów, zapisy na zajęcia i śledzenie kalorii, wszystko w jednym. Mam już działający prototyp.
Czy możemy się spotkać na chwilę, żebym pokazał demo? Myślę, że waszym klientom by się to przydało."