/**
 * GymPlaner — modules/security.js
 * Безпека: шифрування даних (Web Crypto API), автобекап, відновлення
 * Алгоритм: AES-GCM 256-bit з PBKDF2 key derivation
 */

'use strict';

const Security = (() => {

  /* ---- Перевірка підтримки Web Crypto API ---- */
  const hasCrypto = () => !!(window.crypto && window.crypto.subtle);

  /* ---- Константи ---- */
  const ALGO       = 'AES-GCM';
  const KEY_LENGTH = 256;
  const ITERATIONS = 100_000;
  const BACKUP_KEY = 'gymplaner_backups';
  const MAX_BACKUPS = 5;

  /* ============================================================
     KEY DERIVATION — пароль → ключ шифрування
     ============================================================ */

  /**
   * Отримати криптографічний ключ з пароля користувача
   * Використовує PBKDF2 для захисту від brute-force
   */
  const deriveKey = async (password, saltBuffer) => {
    const enc      = new TextEncoder();
    const keyMat   = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits','deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBuffer, iterations: ITERATIONS, hash: 'SHA-256' },
      keyMat,
      { name: ALGO, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  };

  /* ============================================================
     ШИФРУВАННЯ
     ============================================================ */

  /**
   * Зашифрувати рядок або об'єкт
   * @param {string|object} data  - дані для шифрування
   * @param {string}        pass  - пароль
   * @returns {string} - base64 рядок: [salt(16) + iv(12) + ciphertext]
   */
  const encrypt = async (data, pass) => {
    try {
      const text    = typeof data === 'string' ? data : JSON.stringify(data);
      const enc     = new TextEncoder();
      const salt    = crypto.getRandomValues(new Uint8Array(16));
      const iv      = crypto.getRandomValues(new Uint8Array(12));
      const key     = await deriveKey(pass, salt);
      const cipher  = await crypto.subtle.encrypt({ name: ALGO, iv }, key, enc.encode(text));

      // Об'єднуємо salt + iv + ciphertext
      const combined = new Uint8Array(salt.length + iv.length + cipher.byteLength);
      combined.set(salt, 0);
      combined.set(iv,   salt.length);
      combined.set(new Uint8Array(cipher), salt.length + iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (err) {
      console.error('[Security] Encrypt error:', err);
      throw new Error('Помилка шифрування');
    }
  };

  /**
   * Розшифрувати рядок
   * @param {string} encryptedBase64 - base64 рядок
   * @param {string} pass            - пароль
   * @returns {string|object}
   */
  const decrypt = async (encryptedBase64, pass) => {
    try {
      const combined = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
      const salt     = combined.slice(0, 16);
      const iv       = combined.slice(16, 28);
      const cipher   = combined.slice(28);
      const key      = await deriveKey(pass, salt);
      const plain    = await crypto.subtle.decrypt({ name: ALGO, iv }, key, cipher);
      const text     = new TextDecoder().decode(plain);
      try { return JSON.parse(text); } catch { return text; }
    } catch (err) {
      console.error('[Security] Decrypt error:', err);
      throw new Error('Помилка розшифрування — невірний пароль?');
    }
  };

  /* ============================================================
     ХЕШУВАННЯ ПАРОЛІВ (для зберігання в LocalStorage)
     Використовується замість btoa() при реєстрації
     ============================================================ */

  /**
   * Хешувати пароль через SHA-256
   * @param {string} password
   * @param {string} salt - username або випадковий рядок
   * @returns {string} - hex-рядок
   */
  const hashPassword = async (password, salt = '') => {
    if (!hasCrypto()) {
      // Fallback: простий btoa (тільки коли crypto.subtle недоступний — HTTP)
      return btoa(unescape(encodeURIComponent(password + salt)));
    }
    const enc  = new TextEncoder();
    const data = enc.encode(password + salt + 'gymplaner_pepper_2024');
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  };

  /**
   * Перевірити пароль (compare hash)
   */
  const verifyPassword = async (password, hash, salt = '') => {
    try {
      const newHash = await hashPassword(password, salt);
      return newHash === hash;
    } catch { return false; }
  };

  /* ============================================================
     АВТОМАТИЧНЕ РЕЗЕРВНЕ КОПІЮВАННЯ
     ============================================================ */

  /**
   * Створити резервну копію всіх даних користувача
   * @param {string} username
   * @param {string} encryptionPass - пароль для шифрування (або null = без шифрування)
   */
  const createBackup = async (username, encryptionPass = null) => {
    try {
      // Зібрати всі дані
      const rawData = window.DB
        ? await window.DB.exportUserData(username)
        : collectFromLocalStorage(username);

      const payload = {
        version:    '2.0',
        username,
        createdAt:  new Date().toISOString(),
        data:       rawData,
        checksum:   await computeChecksum(JSON.stringify(rawData)),
      };

      const backup = {
        id:          `backup_${Date.now()}`,
        createdAt:   payload.createdAt,
        username,
        encrypted:   !!encryptionPass,
        size:        JSON.stringify(payload).length,
        content:     encryptionPass ? await encrypt(payload, encryptionPass) : payload,
      };

      // Зберегти в IndexedDB або LocalStorage
      await storeBackup(backup);
      console.log('[Security] Backup created:', backup.id, `(${(backup.size/1024).toFixed(1)} KB)`);
      return backup;
    } catch (err) {
      console.error('[Security] Backup error:', err);
      throw err;
    }
  };

  /** Зберегти бекап (ротація — зберігаємо MAX_BACKUPS) */
  const storeBackup = async (backup) => {
    const backups = getStoredBackups();
    backups.unshift(backup);
    const trimmed = backups.slice(0, MAX_BACKUPS);
    localStorage.setItem(BACKUP_KEY, JSON.stringify(trimmed));
  };

  /** Отримати список бекапів */
  const getStoredBackups = () => {
    try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]'); }
    catch { return []; }
  };

  /**
   * Відновити з резервної копії
   * @param {string} backupId
   * @param {string} decryptionPass - якщо зашифровано
   */
  const restoreBackup = async (backupId, decryptionPass = null) => {
    const backups = getStoredBackups();
    const backup  = backups.find(b => b.id === backupId);
    if (!backup) throw new Error('Бекап не знайдено');

    let payload;
    if (backup.encrypted) {
      if (!decryptionPass) throw new Error('Потрібен пароль для розшифрування');
      payload = await decrypt(backup.content, decryptionPass);
    } else {
      payload = backup.content;
    }

    // Перевірити контрольну суму
    const checksum = await computeChecksum(JSON.stringify(payload.data));
    if (checksum !== payload.checksum) {
      throw new Error('Пошкоджена резервна копія — контрольна сума не збігається');
    }

    // Відновити дані
    if (window.DB) {
      await window.DB.importUserData({ ...payload.data, username: payload.username });
    } else {
      restoreToLocalStorage(payload.username, payload.data);
    }

    console.log('[Security] Restored from backup:', backupId);
    return { ok: true, username: payload.username, createdAt: payload.createdAt };
  };

  /* ============================================================
     АВТОБЕКАП — раз на 24 год при запуску
     ============================================================ */
  const initAutoBackup = (username) => {
    const lastBackup = localStorage.getItem(`gymplaner_last_backup_${username}`);
    const oneDayAgo  = Date.now() - 24 * 60 * 60 * 1000;

    if (!lastBackup || parseInt(lastBackup) < oneDayAgo) {
      setTimeout(async () => {
        try {
          await createBackup(username);
          localStorage.setItem(`gymplaner_last_backup_${username}`, Date.now().toString());
          console.log('[Security] Auto-backup completed');
        } catch (err) {
          console.warn('[Security] Auto-backup failed:', err.message);
        }
      }, 5000); // 5 сек після запуску
    }
  };

  /* ============================================================
     ЕКСПОРТ / ІМПОРТ ЗАШИФРОВАНОГО ФАЙЛУ
     ============================================================ */

  /** Скачати зашифрований бекап як файл */
  const downloadEncryptedBackup = async (username, password) => {
    const backup  = await createBackup(username, password);
    const json    = JSON.stringify(backup, null, 2);
    const blob    = new Blob([json], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `gymplaner_backup_${username}_${new Date().toISOString().split('T')[0]}.enc.json`;
    a.click();
    URL.revokeObjectURL(url);
    return backup.id;
  };

  /** Завантажити та відновити з файлу */
  const uploadAndRestore = async (file, password) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const backup = JSON.parse(e.target.result);
          // Зберегти бекап локально
          await storeBackup(backup);
          // Відновити
          const result = await restoreBackup(backup.id, password);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Помилка читання файлу'));
      reader.readAsText(file);
    });
  };

  /* ============================================================
     РЕНДЕР UI
     ============================================================ */
  const renderBackupPanel = (containerId, username) => {
    const el      = document.getElementById(containerId);
    if (!el) return;
    const backups = getStoredBackups().filter(b => b.username === username);

    el.innerHTML = `
      <div class="backup-panel">
        <div class="backup-actions">
          <button class="btn-primary" id="btn-create-backup">💾 Створити бекап</button>
          <button class="btn-secondary" id="btn-download-backup">🔐 Завантажити зашифрований</button>
          <label class="btn-ghost" for="restore-file-input">📂 Відновити з файлу</label>
          <input type="file" id="restore-file-input" accept=".json" style="display:none" />
        </div>

        <div class="backup-list">
          <h5 class="gami-section-title">Збережені копії (${backups.length}/${MAX_BACKUPS})</h5>
          ${backups.length ? backups.map(b => `
            <div class="backup-item">
              <div class="backup-info">
                <span class="backup-date">${new Date(b.createdAt).toLocaleString('uk-UA')}</span>
                <span class="backup-size">${(b.size/1024).toFixed(1)} KB ${b.encrypted ? '🔐' : ''}</span>
              </div>
              <button class="btn-ghost btn-sm" onclick="Security._restoreFromId('${b.id}', '${username}')">Відновити</button>
            </div>`).join('') : '<p class="backup-empty">Немає збережених копій</p>'}
        </div>
      </div>`;

    el.querySelector('#btn-create-backup')?.addEventListener('click', async () => {
      try {
        await createBackup(username);
        window.UI?.toast('Резервну копію створено ✓');
        renderBackupPanel(containerId, username);
      } catch (e) { window.UI?.toast('Помилка: ' + e.message, 'error'); }
    });

    el.querySelector('#btn-download-backup')?.addEventListener('click', async () => {
      const pass = prompt('Пароль для шифрування бекапу:');
      if (!pass) return;
      try {
        await downloadEncryptedBackup(username, pass);
        window.UI?.toast('Зашифрований бекап завантажено ✓');
      } catch (e) { window.UI?.toast('Помилка: ' + e.message, 'error'); }
    });

    el.querySelector('#restore-file-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const pass = prompt('Пароль (якщо зашифровано, інакше залиш порожнім):');
      try {
        await uploadAndRestore(file, pass || null);
        window.UI?.toast('Дані відновлено ✓');
        window.App?.navigate('dashboard');
      } catch (e) { window.UI?.toast('Помилка відновлення: ' + e.message, 'error'); }
    });
  };

  /* ---- Утиліти ---- */
  const computeChecksum = async (str) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).slice(0, 8).map(b => b.toString(16).padStart(2,'0')).join('');
  };

  /** Fallback: зібрати дані з LocalStorage */
  const collectFromLocalStorage = (username) => {
    const prefix = 'gymplaner_';
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        try { data[key.replace(prefix,'')] = JSON.parse(localStorage.getItem(key)); }
        catch {}
      }
    }
    return data;
  };

  /** Fallback: відновити до LocalStorage */
  const restoreToLocalStorage = (username, data) => {
    Object.entries(data).forEach(([key, value]) => {
      localStorage.setItem('gymplaner_' + key, JSON.stringify(value));
    });
  };

  /** Публічний helper для кнопок у DOM */
  const _restoreFromId = async (backupId, username) => {
    const pass = prompt('Пароль (якщо бекап зашифровано):');
    try {
      await restoreBackup(backupId, pass || null);
      window.UI?.toast('Дані відновлено з бекапу ✓');
      window.App?.navigate('dashboard');
    } catch (e) { window.UI?.toast('Помилка: ' + e.message, 'error'); }
  };

  return {
    encrypt, decrypt, hashPassword, verifyPassword,
    createBackup, restoreBackup, downloadEncryptedBackup, uploadAndRestore,
    getStoredBackups, initAutoBackup, renderBackupPanel, _restoreFromId,
  };
})();

if (typeof window !== 'undefined') window.Security = Security;
