(function () {
  const hasTauri = !!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
  const invoke = hasTauri ? window.__TAURI__.core.invoke : null;
  let writeChain = Promise.resolve();

  function queueWrite(task) {
    const run = writeChain.then(task, task);
    writeChain = run.catch(function () { return false; });
    return run;
  }

  async function hydrate() {
    if (!hasTauri) return { native: false };
    try {
      const raw = await invoke('load_state');
      window.__YARAN_PRELOADED_STATE__ = raw || null;
      const health = await invoke('native_health');
      window.__YARAN_NATIVE_HEALTH__ = health;
      return { native: true, health: health };
    } catch (error) {
      console.error('Hesabdari Asan native hydrate failed:', error);
      return { native: true, error: String(error) };
    }
  }

  function persist(raw) {
    if (!hasTauri) return Promise.resolve(false);
    return queueWrite(async function () {
      try {
        await invoke('save_state', { json: raw });
        window.__YARAN_PRELOADED_STATE__ = raw;
        return true;
      } catch (error) {
        console.error('Hesabdari Asan SQLite save failed:', error);
        throw error;
      }
    });
  }

  function commit(raw, audit) {
    if (!hasTauri) return Promise.resolve(false);
    return queueWrite(async function () {
      await invoke('save_state_with_audit', {
        json: raw,
        auditJson: JSON.stringify(audit || {})
      });
      window.__YARAN_PRELOADED_STATE__ = raw;
      return true;
    });
  }

  async function auditLog(limit) {
    if (!hasTauri) return [];
    return await invoke('list_audit_log', { limit: Number(limit) || 100 });
  }

  async function invoiceRevisions(saleId) {
    if (!hasTauri) return [];
    return await invoke('list_invoice_revisions', { saleId: String(saleId || '') });
  }

  async function backup(raw) {
    if (!hasTauri) return null;
    try {
      if (raw) await queueWrite(function () { return invoke('save_state', { json: raw }); });
      return await invoke('create_backup');
    } catch (error) {
      console.error('Hesabdari Asan native backup failed:', error);
      return null;
    }
  }


  async function exportBackup(raw) {
    if (!hasTauri) return null;
    try {
      if (raw) await queueWrite(function () { return invoke('save_state', { json: raw }); });
      return await invoke('export_backup');
    } catch (error) { console.error(error); return null; }
  }

  async function exportText(filename, content) {
    if (!hasTauri) return null;
    try { return await invoke('export_text_file', { filename: String(filename || ''), content: String(content || '') }); }
    catch (error) { console.error(error); return null; }
  }

  async function openExternal(url) {
    if (!hasTauri) { window.open(url, '_blank'); return true; }
    await invoke('open_external', { url: String(url || '') });
    return true;
  }

  async function restoreLatestBackup() {
    if (!hasTauri) return false;
    return await queueWrite(function () { return invoke('restore_latest_backup'); });
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

  async function printReceiptPng(printerName, pngBase64) {
    if (!hasTauri) return false;
    return await invoke('print_receipt_png', {
      printerName: String(printerName || ''),
      pngBase64: String(pngBase64 || '')
    });
  }

  async function integrityCheck() {
    if (!hasTauri) return { ok: true, message: 'preview' };
    return await queueWrite(function () { return invoke('database_integrity'); });
  }

  window.YaranNative = {
    isNative: hasTauri,
    hydrate: hydrate,
    persist: persist,
    commit: commit,
    auditLog: auditLog,
    invoiceRevisions: invoiceRevisions,
    backup: backup,
    exportBackup: exportBackup,
    exportText: exportText,
    openExternal: openExternal,
    restoreLatestBackup: restoreLatestBackup,
    verifyAdmin: verifyAdmin,
    printers: printers,
    printReceiptPng: printReceiptPng,
    integrityCheck: integrityCheck
  };
})();
