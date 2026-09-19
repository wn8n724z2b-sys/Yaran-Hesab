use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../migrations/001_core.sql")),
    (2, include_str!("../migrations/002_domain.sql")),
    (3, include_str!("../migrations/003_indexes.sql")),
    (4, include_str!("../migrations/004_beta_core.sql")),
    (5, include_str!("../migrations/005_invoice_audit.sql")),
];

fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("hesabdari_asan.sqlite3"))
}

fn open(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    let mut conn = open(app)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);",
    )
    .map_err(|e| e.to_string())?;

    for (version, sql) in MIGRATIONS {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = ?1",
                params![version],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists == 0 {
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            tx.execute_batch(sql).map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO schema_migrations(version, applied_at) VALUES(?1, ?2)",
                params![version, Local::now().to_rfc3339()],
            )
            .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
        }
    }

    let admin_hash = format!("{:x}", Sha256::digest(b"admin"));
    conn.execute(
        "INSERT OR IGNORE INTO security_settings(id, admin_password_hash, updated_at) VALUES(1, ?1, ?2)",
        params![admin_hash, Local::now().to_rfc3339()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn s(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn s_or(v: &Value, key: &str, default: &str) -> String {
    let out = s(v, key);
    if out.is_empty() {
        default.to_string()
    } else {
        out
    }
}

fn opt_s(v: &Value, key: &str) -> Option<String> {
    let value = s(v, key);
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn n(v: &Value, key: &str) -> f64 {
    v.get(key).and_then(Value::as_f64).unwrap_or(0.0)
}

fn b(v: &Value, key: &str) -> bool {
    v.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn arr<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn sync_sale(tx: &Transaction<'_>, sale: &Value, status: &str) -> Result<(), String> {
    let sale_id = s(sale, "id");
    if sale_id.is_empty() {
        return Ok(());
    }
    let invoice_no = sale.get("no").and_then(Value::as_i64).unwrap_or(0);
    let sold_at = s_or(sale, "time", &Local::now().to_rfc3339());
    let customer_id = opt_s(sale, "customerId");
    let payment = s_or(sale, "payment", "نقدی");
    let subtotal = n(sale, "subtotal");
    let discount = n(sale, "discount");
    let total = n(sale, "total");
    let updated_at = opt_s(sale, "editedAt")
        .or_else(|| opt_s(sale, "deletedAt"))
        .unwrap_or_else(|| sold_at.clone());

    tx.execute(
        "INSERT INTO sales(id, invoice_no, sold_at, customer_id, payment_method, subtotal, discount, total, status, created_at, updated_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            sale_id,
            invoice_no,
            sold_at,
            customer_id,
            payment,
            subtotal,
            discount,
            total,
            status,
            sold_at,
            updated_at
        ],
    )
    .map_err(|e| e.to_string())?;

    for item in arr(sale, "items") {
        let product_id = s(item, "id");
        if product_id.is_empty() {
            continue;
        }
        tx.execute(
            "INSERT INTO sale_items(sale_id, product_id, product_name, unit, qty, sell_price, unit_cost)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                sale_id,
                product_id,
                s_or(item, "name", "کالا"),
                s_or(item, "baseUnit", "دانه"),
                n(item, "qty"),
                n(item, "sell"),
                n(item, "buy")
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn sync_domain(tx: &Transaction<'_>, state: &Value, raw: &str) -> Result<(), String> {
    // Child tables first: rebuilding these mirrors is atomic inside the same SQLite transaction.
    tx.execute_batch(
        "DELETE FROM sale_items;
         DELETE FROM sales;
         DELETE FROM product_barcodes;
         DELETE FROM inventory_ledger;
         DELETE FROM purchases;
         DELETE FROM supplier_payments;
         DELETE FROM customer_receipts;
         DELETE FROM expenses;
         DELETE FROM inventory_snapshots;
         DELETE FROM products;
         DELETE FROM categories;
         DELETE FROM parties;
         DELETE FROM financial_periods;
         DELETE FROM store_settings;",
    )
    .map_err(|e| e.to_string())?;

    for category in arr(state, "categories") {
        let id = s(category, "id");
        let name = s(category, "name");
        if id.is_empty() || name.is_empty() {
            continue;
        }
        let now = Local::now().to_rfc3339();
        tx.execute(
            "INSERT INTO categories(id, name, created_at, updated_at) VALUES(?1, ?2, ?3, ?3)",
            params![id, name, now],
        )
        .map_err(|e| e.to_string())?;
    }

    for product in arr(state, "products") {
        let id = s(product, "id");
        if id.is_empty() {
            continue;
        }
        let now = Local::now().to_rfc3339();
        tx.execute(
            "INSERT INTO products(id, name, producer, category_id, base_unit, purchase_unit, unit_conversion_enabled,
              units_per_purchase, average_unit_cost, sell_price, stock, min_stock, image_path, is_active, created_at, updated_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 1, ?14, ?14)",
            params![
                id,
                s_or(product, "name", "کالا"),
                opt_s(product, "producer"),
                opt_s(product, "categoryId"),
                s_or(product, "baseUnit", "دانه"),
                s_or(product, "purchaseUnit", "دانه"),
                if b(product, "unitConversionEnabled") { 1 } else { 0 },
                n(product, "unitsPerPurchase").max(1.0),
                n(product, "buy"),
                n(product, "sell"),
                n(product, "stock"),
                n(product, "min"),
                opt_s(product, "image"),
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        if let Some(codes) = product.get("barcodes").and_then(Value::as_array) {
            for (index, code) in codes.iter().filter_map(Value::as_str).enumerate() {
                let code = code.trim();
                if code.is_empty() {
                    continue;
                }
                tx.execute(
                    "INSERT INTO product_barcodes(product_id, barcode, is_primary) VALUES(?1, ?2, ?3)",
                    params![id, code, if index == 0 { 1 } else { 0 }],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    for (key, kind) in [("customers", "customer"), ("suppliers", "supplier")] {
        for party in arr(state, key) {
            let id = s(party, "id");
            if id.is_empty() {
                continue;
            }
            let now = Local::now().to_rfc3339();
            tx.execute(
                "INSERT INTO parties(id, kind, name, phone, balance, created_at, updated_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![
                    id,
                    kind,
                    s_or(party, "name", "بدون نام"),
                    opt_s(party, "phone"),
                    n(party, "balance"),
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    for sale in arr(state, "sales") {
        sync_sale(tx, sale, "active")?;
    }
    for sale in arr(state, "deletedSales") {
        sync_sale(tx, sale, "deleted")?;
    }

    for movement in arr(state, "inventory") {
        let product_id = s(movement, "productId");
        if product_id.is_empty() {
            continue;
        }
        tx.execute(
            "INSERT INTO inventory_ledger(product_id, occurred_at, movement_type, qty, unit_cost, reference_type, reference_id, note)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                product_id,
                s_or(movement, "time", &Local::now().to_rfc3339()),
                s_or(movement, "type", "گردش"),
                n(movement, "qty"),
                movement.get("unitCost").and_then(Value::as_f64),
                Some("ui".to_string()),
                opt_s(movement, "ref"),
                opt_s(movement, "note")
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    for purchase in arr(state, "purchases") {
        let id = s(purchase, "id");
        let product_id = s(purchase, "productId");
        if id.is_empty() || product_id.is_empty() {
            continue;
        }
        tx.execute(
            "INSERT INTO purchases(id, purchased_at, product_id, product_name, mode, quantity, purchase_unit,
              units_per_purchase, units, pack_cost, unit_cost, average_cost, total, payment_method, supplier_id)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                id,
                s_or(purchase, "time", &Local::now().to_rfc3339()),
                product_id,
                s_or(purchase, "productName", "کالا"),
                opt_s(purchase, "mode"),
                n(purchase, "quantity"),
                opt_s(purchase, "purchaseUnit"),
                n(purchase, "unitsPerPurchase").max(1.0),
                n(purchase, "units"),
                n(purchase, "packCost"),
                n(purchase, "unitCost"),
                n(purchase, "avgCost"),
                n(purchase, "total"),
                s_or(purchase, "payment", "نقدی"),
                opt_s(purchase, "supplierId")
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    for expense in arr(state, "expenses") {
        let id = s(expense, "id");
        if id.is_empty() {
            continue;
        }
        tx.execute(
            "INSERT INTO expenses(id, occurred_at, category, amount, note) VALUES(?1, ?2, ?3, ?4, ?5)",
            params![
                id,
                s_or(expense, "time", &Local::now().to_rfc3339()),
                s_or(expense, "category", "هزینه"),
                n(expense, "amount"),
                opt_s(expense, "note")
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    for payment in arr(state, "supplierPayments") {
        let id = s(payment, "id");
        let supplier_id = s(payment, "supplierId");
        if id.is_empty() || supplier_id.is_empty() {
            continue;
        }
        tx.execute(
            "INSERT INTO supplier_payments(id, occurred_at, supplier_id, supplier_name, amount, note)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                s_or(payment, "time", &Local::now().to_rfc3339()),
                supplier_id,
                opt_s(payment, "supplierName"),
                n(payment, "amount"),
                opt_s(payment, "note")
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    for receipt in arr(state, "customerReceipts") {
        let id = s(receipt, "id");
        let customer_id = s(receipt, "customerId");
        if id.is_empty() || customer_id.is_empty() {
            continue;
        }
        tx.execute(
            "INSERT INTO customer_receipts(id, occurred_at, customer_id, customer_name, amount, note)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                s_or(receipt, "time", &Local::now().to_rfc3339()),
                customer_id,
                opt_s(receipt, "customerName"),
                n(receipt, "amount"),
                opt_s(receipt, "note")
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    for snapshot in arr(state, "inventorySnapshots") {
        let date = s(snapshot, "date");
        if date.is_empty() {
            continue;
        }
        tx.execute(
            "INSERT INTO inventory_snapshots(snapshot_date, inventory_value) VALUES(?1, ?2)",
            params![date, n(snapshot, "value")],
        )
        .map_err(|e| e.to_string())?;
    }

    for period in arr(state, "financialPeriods") {
        let no = period.get("no").and_then(Value::as_i64).unwrap_or(0);
        if no <= 0 {
            continue;
        }
        tx.execute(
            "INSERT OR REPLACE INTO financial_periods(period_no, started_at, ended_at, summary_json)
             VALUES(?1, ?2, ?3, ?4)",
            params![
                no,
                s_or(period, "start", &Local::now().to_rfc3339()),
                opt_s(period, "end"),
                period
                    .get("summary")
                    .map(Value::to_string)
                    .unwrap_or_else(|| "{}".to_string())
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(period) = state.get("financialPeriod") {
        let no = period.get("no").and_then(Value::as_i64).unwrap_or(1);
        tx.execute(
            "INSERT OR REPLACE INTO financial_periods(period_no, started_at, ended_at, summary_json)
             VALUES(?1, ?2, NULL, NULL)",
            params![no, s_or(period, "start", &Local::now().to_rfc3339())],
        )
        .map_err(|e| e.to_string())?;
    }

    if let Some(settings) = state.get("settings") {
        tx.execute(
            "INSERT INTO store_settings(id, json, updated_at) VALUES(1, ?1, ?2)",
            params![settings.to_string(), Local::now().to_rfc3339()],
        )
        .map_err(|e| e.to_string())?;
    }

    let hash = format!("{:x}", Sha256::digest(raw.as_bytes()));
    let previous: Option<String> = tx
        .query_row(
            "SELECT state_hash FROM state_revisions ORDER BY id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if previous.as_deref() != Some(hash.as_str()) {
        tx.execute(
            "INSERT INTO state_revisions(created_at, state_hash, products_count, sales_count, purchases_count)
             VALUES(?1, ?2, ?3, ?4, ?5)",
            params![
                Local::now().to_rfc3339(),
                hash,
                arr(state, "products").len() as i64,
                arr(state, "sales").len() as i64,
                arr(state, "purchases").len() as i64
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM state_revisions WHERE id NOT IN (SELECT id FROM state_revisions ORDER BY id DESC LIMIT 1000)",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn verify_admin_password_impl(app: &AppHandle, password: &str) -> Result<bool, String> {
    let conn = open(app)?;
    let stored: String = conn
        .query_row(
            "SELECT admin_password_hash FROM security_settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let entered = format!("{:x}", Sha256::digest(password.as_bytes()));
    Ok(stored == entered)
}

pub fn load_state_impl(app: &AppHandle) -> Result<Option<String>, String> {
    let conn = open(app)?;
    let mut stmt = conn
        .prepare("SELECT json FROM app_state WHERE id = 1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let json: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(Some(json))
    } else {
        Ok(None)
    }
}

fn insert_audit_event(tx: &Transaction<'_>, audit: &Value) -> Result<(), String> {
    let action = s_or(audit, "action", "state.save");
    let entity_type = opt_s(audit, "entityType");
    let entity_id = opt_s(audit, "entityId");
    let actor = s_or(audit, "actor", "Admin");
    let invoice_no = audit.get("invoiceNo").and_then(Value::as_i64);
    let created_at = s_or(audit, "createdAt", &Local::now().to_rfc3339());
    let payload_json = audit
        .get("payload")
        .cloned()
        .unwrap_or_else(|| audit.clone())
        .to_string();

    tx.execute(
        "INSERT INTO audit_log(created_at, action, entity_type, entity_id, payload_json, actor, invoice_no)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            created_at,
            action,
            entity_type,
            entity_id,
            payload_json,
            actor,
            invoice_no
        ],
    )
    .map_err(|e| e.to_string())?;

    if action == "invoice.create" || action == "invoice.update" || action == "invoice.delete" {
        if let (Some(sale_id), Some(no)) = (audit.get("entityId").and_then(Value::as_str), invoice_no) {
            let payload = audit.get("payload").cloned().unwrap_or(Value::Null);
            let snapshot = if action == "invoice.delete" {
                payload.get("before").cloned().unwrap_or(payload.clone())
            } else {
                payload.get("after").cloned().unwrap_or(payload.clone())
            };
            let revision_no: i64 = tx
                .query_row(
                    "SELECT COALESCE(MAX(revision_no), 0) + 1 FROM invoice_revisions WHERE sale_id = ?1",
                    params![sale_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO invoice_revisions(sale_id, invoice_no, revision_no, changed_at, action, actor, snapshot_json)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![sale_id, no, revision_no, created_at, action, actor, snapshot.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn save_state_tx(app: &AppHandle, json: &str, audit: Option<&Value>) -> Result<(), String> {
    let state = serde_json::from_str::<Value>(json)
        .map_err(|e| format!("invalid state json: {e}"))?;
    let mut conn = open(app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO app_state(id, json, updated_at) VALUES(1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
        params![json, Local::now().to_rfc3339()],
    )
    .map_err(|e| e.to_string())?;
    sync_domain(&tx, &state, json)?;
    if let Some(event) = audit {
        insert_audit_event(&tx, event)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save_state_impl(app: &AppHandle, json: &str) -> Result<(), String> {
    save_state_tx(app, json, None)
}

pub fn save_state_with_audit_impl(
    app: &AppHandle,
    json: &str,
    audit_json: &str,
) -> Result<(), String> {
    let audit = serde_json::from_str::<Value>(audit_json)
        .map_err(|e| format!("invalid audit json: {e}"))?;
    save_state_tx(app, json, Some(&audit))
}

pub fn list_audit_log_impl(app: &AppHandle, limit: i64) -> Result<Vec<Value>, String> {
    let conn = open(app)?;
    let limit = limit.clamp(1, 500);
    let mut stmt = conn
        .prepare(
            "SELECT id, created_at, action, entity_type, entity_id, payload_json, actor, invoice_no
             FROM audit_log ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit], |row| {
            let payload_raw: Option<String> = row.get(5)?;
            let payload = payload_raw
                .as_deref()
                .and_then(|x| serde_json::from_str::<Value>(x).ok())
                .unwrap_or(Value::Null);
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "createdAt": row.get::<_, String>(1)?,
                "action": row.get::<_, String>(2)?,
                "entityType": row.get::<_, Option<String>>(3)?,
                "entityId": row.get::<_, Option<String>>(4)?,
                "payload": payload,
                "actor": row.get::<_, String>(6)?,
                "invoiceNo": row.get::<_, Option<i64>>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub fn list_invoice_revisions_impl(app: &AppHandle, sale_id: &str) -> Result<Vec<Value>, String> {
    let conn = open(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT revision_no, invoice_no, changed_at, action, actor, snapshot_json
             FROM invoice_revisions WHERE sale_id = ?1 ORDER BY revision_no DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![sale_id], |row| {
            let snapshot_raw: String = row.get(5)?;
            let snapshot = serde_json::from_str::<Value>(&snapshot_raw).unwrap_or(Value::Null);
            Ok(serde_json::json!({
                "revisionNo": row.get::<_, i64>(0)?,
                "invoiceNo": row.get::<_, i64>(1)?,
                "changedAt": row.get::<_, String>(2)?,
                "action": row.get::<_, String>(3)?,
                "actor": row.get::<_, String>(4)?,
                "snapshot": snapshot,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn sql_quote_path(path: &Path) -> String {
    path.to_string_lossy().replace('\'', "''")
}

pub fn create_backup_impl(app: &AppHandle) -> Result<String, String> {
    let dir = app_dir(app)?.join("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let target = dir.join(format!("HesabdariAsan_Backup_{stamp}.sqlite3"));
    let conn = open(app)?;
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
        .map_err(|e| e.to_string())?;
    let sql = format!("VACUUM INTO '{}';", sql_quote_path(&target));
    conn.execute_batch(&sql).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO backup_registry(created_at, file_path, kind) VALUES(?1, ?2, 'native')",
        params![Local::now().to_rfc3339(), target.to_string_lossy().to_string()],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, file_path FROM backup_registry ORDER BY id DESC LIMIT -1 OFFSET 30")
        .map_err(|e| e.to_string())?;
    let old = stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    drop(stmt);
    for (id, path) in old {
        let _ = fs::remove_file(path);
        let _ = conn.execute("DELETE FROM backup_registry WHERE id = ?1", params![id]);
    }

    Ok(target.to_string_lossy().to_string())
}

pub fn health(app: &AppHandle) -> Result<Value, String> {
    let path = db_path(app)?;
    let backup_dir = app_dir(app)?.join("backups");
    let conn = open(app)?;
    let products: i64 = conn
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap_or(0);
    let sales: i64 = conn
        .query_row("SELECT COUNT(*) FROM sales WHERE status = 'active'", [], |r| r.get(0))
        .unwrap_or(0);
    Ok(serde_json::json!({
        "native": true,
        "database": path.to_string_lossy(),
        "backupDir": backup_dir.to_string_lossy(),
        "storage": "SQLite WAL + normalized domain tables",
        "schemaVersion": 5,
        "products": products,
        "sales": sales,
        "auditEvents": conn.query_row("SELECT COUNT(*) FROM audit_log", [], |r| r.get::<_, i64>(0)).unwrap_or(0)
    }))
}

pub fn restore_latest_backup_impl(app: &AppHandle) -> Result<bool, String> {
    let path = db_path(app)?;
    let wal = PathBuf::from(format!("{}-wal", path.to_string_lossy()));
    let shm = PathBuf::from(format!("{}-shm", path.to_string_lossy()));
    let conn = open(app)?;
    let backup: Option<String> = conn
        .query_row(
            "SELECT file_path FROM backup_registry ORDER BY id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(backup_path) = backup else {
        return Ok(false);
    };
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| e.to_string())?;
    drop(conn);

    let backup_path = PathBuf::from(backup_path);
    if !backup_path.exists() {
        return Err("فایل پشتیبان پیدا نشد".to_string());
    }
    let _ = fs::remove_file(&wal);
    let _ = fs::remove_file(&shm);
    fs::copy(&backup_path, &path).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&wal);
    let _ = fs::remove_file(&shm);
    Ok(true)
}

pub fn integrity_check_impl(app: &AppHandle) -> Result<Value, String> {
    let conn = open(app)?;
    let result: String = conn
        .query_row("PRAGMA integrity_check;", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "ok": result.eq_ignore_ascii_case("ok"),
        "message": result,
        "database": db_path(app)?.to_string_lossy()
    }))
}
