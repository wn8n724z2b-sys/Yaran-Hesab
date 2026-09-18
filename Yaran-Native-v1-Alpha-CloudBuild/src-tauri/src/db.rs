use chrono::Local;
use rusqlite::{params, Connection};
use std::{fs, path::{Path, PathBuf}};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../migrations/001_core.sql")),
    (2, include_str!("../migrations/002_domain.sql")),
    (3, include_str!("../migrations/003_indexes.sql")),
];

fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("yaran.sqlite3"))
}

fn open(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL").map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON").map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(5)).map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    let mut conn = open(app)?;
    conn.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);")
        .map_err(|e| e.to_string())?;

    for (version, sql) in MIGRATIONS {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM schema_migrations WHERE version = ?1",
            params![version],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;
        if exists == 0 {
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            tx.execute_batch(sql).map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO schema_migrations(version, applied_at) VALUES(?1, ?2)",
                params![version, Local::now().to_rfc3339()],
            ).map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
        }
    }

    let admin_hash = format!("{:x}", Sha256::digest(b"admin"));
    conn.execute(
        "INSERT OR IGNORE INTO security_settings(id, admin_password_hash, updated_at) VALUES(1, ?1, ?2)",
        params![admin_hash, Local::now().to_rfc3339()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn verify_admin_password_impl(app: &AppHandle, password: &str) -> Result<bool, String> {
    let conn = open(app)?;
    let stored: String = conn.query_row(
        "SELECT admin_password_hash FROM security_settings WHERE id = 1",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    let entered = format!("{:x}", Sha256::digest(password.as_bytes()));
    Ok(stored == entered)
}

pub fn load_state_impl(app: &AppHandle) -> Result<Option<String>, String> {
    let conn = open(app)?;
    let mut stmt = conn.prepare("SELECT json FROM app_state WHERE id = 1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let json: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(Some(json))
    } else {
        Ok(None)
    }
}

pub fn save_state_impl(app: &AppHandle, json: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(json).map_err(|e| format!("invalid state json: {e}"))?;
    let conn = open(app)?;
    conn.execute(
        "INSERT INTO app_state(id, json, updated_at) VALUES(1, ?1, ?2)\n         ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
        params![json, Local::now().to_rfc3339()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn sql_quote_path(path: &Path) -> String {
    path.to_string_lossy().replace('\'', "''")
}

pub fn create_backup_impl(app: &AppHandle) -> Result<String, String> {
    let dir = app_dir(app)?.join("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let target = dir.join(format!("Yaran_Backup_{stamp}.sqlite3"));
    let conn = open(app)?;
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);").map_err(|e| e.to_string())?;
    let sql = format!("VACUUM INTO '{}';", sql_quote_path(&target));
    conn.execute_batch(&sql).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO backup_registry(created_at, file_path, kind) VALUES(?1, ?2, 'native')",
        params![Local::now().to_rfc3339(), target.to_string_lossy().to_string()],
    ).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

pub fn health(app: &AppHandle) -> Result<serde_json::Value, String> {
    let path = db_path(app)?;
    let backup_dir = app_dir(app)?.join("backups");
    Ok(serde_json::json!({
        "native": true,
        "database": path.to_string_lossy(),
        "backupDir": backup_dir.to_string_lossy(),
        "storage": "SQLite WAL",
        "schemaVersion": 3
    }))
}
