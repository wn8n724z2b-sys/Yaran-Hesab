(function () {
  const hasTauri = !!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
  const invoke = hasTauri ? window.__TAURI__.core.invoke : null;
  let saveTimer = null;
  let pendingState = null;

  async function hydrate(key) {
    if (!hasTauri) return { native: false };
    try {
      const raw = await invoke('load_state');
      if (raw) localStorage.setItem(key, raw);
      const health = await invoke('native_health');
      window.__YARAN_NATIVE_HEALTH__ = health;
      return { native: true, health: health };
    } catch (error) {
      console.error('Yaran native hydrate failed:', error);
      return { native: true, error: String(error) };
    }
  }

  function persist(raw) {
    if (!hasTauri) return;
    pendingState = raw;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async function () {
      const payload = pendingState;
      pendingState = null;
      try {
        await invoke('save_state', { json: payload });
      } catch (error) {
        console.error('Yaran SQLite save failed:', error);
      }
    }, 60);
  }

  async function backup(raw) {
    if (!hasTauri) return null;
    try {
      if (raw) await invoke('save_state', { json: raw });
      return await invoke('create_backup');
    } catch (error) {
      console.error('Yaran native backup failed:', error);
      return null;
    }
  }

  async function verifyAdmin(password) {
    if (!hasTauri) return password === 'admin';
    try { return await invoke('verify_admin_password', { password: password }); }
    catch (error) { console.error(error); return false; }
  }

  async function printers() {
    if (!hasTauri) return [];
    try { return await invoke('list_printers'); }
    catch (error) { console.error(error); return []; }
  }

  window.YaranNative = {
    isNative: hasTauri,
    hydrate: hydrate,
    persist: persist,
    backup: backup,
    verifyAdmin: verifyAdmin,
    printers: printers
  };
})();
