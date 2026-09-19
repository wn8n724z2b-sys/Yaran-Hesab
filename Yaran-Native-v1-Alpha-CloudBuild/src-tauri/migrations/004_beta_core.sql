CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  purchased_at TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  mode TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  purchase_unit TEXT,
  units_per_purchase REAL NOT NULL DEFAULT 1,
  units REAL NOT NULL DEFAULT 0,
  pack_cost REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  average_cost REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'نقدی',
  supplier_id TEXT,
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(supplier_id) REFERENCES parties(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  note TEXT
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_name TEXT,
  amount REAL NOT NULL DEFAULT 0,
  note TEXT,
  FOREIGN KEY(supplier_id) REFERENCES parties(id)
);

CREATE TABLE IF NOT EXISTS customer_receipts (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  amount REAL NOT NULL DEFAULT 0,
  note TEXT,
  FOREIGN KEY(customer_id) REFERENCES parties(id)
);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  snapshot_date TEXT PRIMARY KEY,
  inventory_value REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS store_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS state_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  products_count INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  purchases_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_purchases_time ON purchases(purchased_at);
CREATE INDEX IF NOT EXISTS idx_purchases_product ON purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_expenses_time ON expenses(occurred_at);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_time ON supplier_payments(occurred_at);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_time ON customer_receipts(occurred_at);
