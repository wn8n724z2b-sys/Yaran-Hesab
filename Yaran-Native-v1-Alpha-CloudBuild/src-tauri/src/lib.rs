mod db;
mod printer;

use tauri::AppHandle;

#[tauri::command]
fn load_state(app: AppHandle) -> Result<Option<String>, String> {
    db::load_state_impl(&app)
}

#[tauri::command]
fn save_state(app: AppHandle, json: String) -> Result<(), String> {
    db::save_state_impl(&app, &json)
}

#[tauri::command]
fn save_state_with_audit(app: AppHandle, json: String, audit_json: String) -> Result<(), String> {
    db::save_state_with_audit_impl(&app, &json, &audit_json)
}

#[tauri::command]
fn list_audit_log(app: AppHandle, limit: i64) -> Result<Vec<serde_json::Value>, String> {
    db::list_audit_log_impl(&app, limit)
}

#[tauri::command]
fn list_invoice_revisions(app: AppHandle, sale_id: String) -> Result<Vec<serde_json::Value>, String> {
    db::list_invoice_revisions_impl(&app, &sale_id)
}

#[tauri::command]
fn create_backup(app: AppHandle) -> Result<String, String> {
    db::create_backup_impl(&app)
}

#[tauri::command]
fn verify_admin_password(app: AppHandle, password: String) -> Result<bool, String> {
    db::verify_admin_password_impl(&app, &password)
}


#[tauri::command]
fn restore_latest_backup(app: AppHandle) -> Result<bool, String> {
    db::restore_latest_backup_impl(&app)
}

#[tauri::command]
fn database_integrity(app: AppHandle) -> Result<serde_json::Value, String> {
    db::integrity_check_impl(&app)
}

#[tauri::command]
fn print_receipt_png(printer_name: String, png_base64: String) -> Result<(), String> {
    printer::print_receipt_png(&printer_name, &png_base64)
}
#[tauri::command]
fn native_health(app: AppHandle) -> Result<serde_json::Value, String> {
    db::health(&app)
}

#[tauri::command]
fn list_printers() -> Result<Vec<String>, String> {
    printer::list_windows_printers()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            db::init(app.handle()).map_err(|e| {
                Box::<dyn std::error::Error>::from(std::io::Error::new(std::io::ErrorKind::Other, e))
            })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            save_state_with_audit,
            list_audit_log,
            list_invoice_revisions,
            create_backup,
            restore_latest_backup,
            verify_admin_password,
            database_integrity,
            native_health,
            list_printers,
            print_receipt_png
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hesabdari Asan");
}
