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
fn create_backup(app: AppHandle) -> Result<String, String> {
    db::create_backup_impl(&app)
}

#[tauri::command]
fn verify_admin_password(app: AppHandle, password: String) -> Result<bool, String> {
    db::verify_admin_password_impl(&app, &password)
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
            create_backup,
            verify_admin_password,
            native_health,
            list_printers
        ])
        .run(tauri::generate_context!())
        .expect("error while running Yaran Financial System");
}
