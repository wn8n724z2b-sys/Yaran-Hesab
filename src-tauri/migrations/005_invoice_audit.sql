ALTER TABLE audit_log ADD COLUMN actor TEXT NOT NULL DEFAULT 'Admin';
ALTER TABLE audit_log ADD COLUMN invoice_no INTEGER;

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_invoice_no ON audit_log(invoice_no);

CREATE TABLE IF NOT EXISTS invoice_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id TEXT NOT NULL,
  invoice_no INTEGER NOT NULL,
  revision_no INTEGER NOT NULL,
  changed_at TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'Admin',
  snapshot_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_revisions_sale ON invoice_revisions(sale_id, revision_no);
CREATE INDEX IF NOT EXISTS idx_invoice_revisions_invoice ON invoice_revisions(invoice_no, changed_at);
