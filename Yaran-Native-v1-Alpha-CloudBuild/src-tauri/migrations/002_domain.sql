CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  producer TEXT,
  category_id TEXT,
  base_unit TEXT NOT NULL DEFAULT 'دانه',
  purchase_unit TEXT NOT NULL DEFAULT 'دانه',
  unit_conversion_enabled INTEGER NOT NULL DEFAULT 0,
  units_per_purchase REAL NOT NULL DEFAULT 1,
  average_unit_cost REAL NOT NULL DEFAULT 0,
  sell_price REAL NOT NULL DEFAULT 0,
  stock REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  image_path TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS product_barcodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  barcode TEXT NOT NULL UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('customer','supplier')),
  name TEXT NOT NULL,
  phone TEXT,
  balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  invoice_no INTEGER NOT NULL UNIQUE,
  sold_at TEXT NOT NULL,
  customer_id TEXT,
  payment_method TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(customer_id) REFERENCES parties(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  qty REAL NOT NULL,
  sell_price REAL NOT NULL,
  unit_cost REAL NOT NULL,
  FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS inventory_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_cost REAL,
  reference_type TEXT,
  reference_id TEXT,
  note TEXT,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS financial_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_no INTEGER NOT NULL UNIQUE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  summary_json TEXT
);
