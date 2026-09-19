CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_barcodes_value ON product_barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at);
CREATE INDEX IF NOT EXISTS idx_inventory_product_time ON inventory_ledger(product_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_parties_kind_name ON parties(kind, name);
