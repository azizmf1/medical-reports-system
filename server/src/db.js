import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DB_PATH } from './config.js';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema kept ANSI-portable (no SQLite-only tricks in business logic) so a
// later PostgreSQL migration is straightforward.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name_en TEXT NOT NULL,
  full_name_ar TEXT NOT NULL,
  role TEXT NOT NULL, -- BR-R1: exactly one role per user (single column enforces it)
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | inactive
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | inactive
  push_enabled INTEGER NOT NULL DEFAULT 0,
  pull_enabled INTEGER NOT NULL DEFAULT 0,
  push_url TEXT,
  push_secret TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  client_id TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_pull_scope (
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  report_type_id INTEGER NOT NULL REFERENCES report_types(id),
  PRIMARY KEY (entity_id, report_type_id)
);

CREATE TABLE IF NOT EXISTS report_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS template_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type_id INTEGER NOT NULL REFERENCES report_types(id),
  version_no INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft', -- draft | submitted | published | rejected | retired
  schema_json TEXT NOT NULL,           -- sections/fields definition (excludes fixed examinee section)
  settings_json TEXT NOT NULL,         -- { sharing:[{entity_id,channel}], validity_days, duplicate_prevention }
  rejection_reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  published_at TEXT,
  UNIQUE (report_type_id, version_no)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_number TEXT UNIQUE,           -- assigned at first submission: RPT-YYYY-NNNNNN
  report_type_id INTEGER NOT NULL REFERENCES report_types(id),
  template_version_id INTEGER NOT NULL REFERENCES template_versions(id),
  facility_id INTEGER NOT NULL REFERENCES facilities(id),
  examinee_id_type TEXT NOT NULL,
  examinee_id_number TEXT NOT NULL,
  examinee_name_en TEXT NOT NULL,
  examinee_name_ar TEXT NOT NULL,
  examinee_dob TEXT NOT NULL,
  examinee_gender TEXT NOT NULL,
  examinee_nationality TEXT NOT NULL,
  examinee_phone TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'draft',
  expiry_date TEXT,
  verification_hash TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  claimed_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  cancel_reason TEXT,
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_examinee ON reports (examinee_id_type, examinee_id_number);
CREATE INDEX IF NOT EXISTS idx_reports_type_state ON reports (report_type_id, state);

CREATE TABLE IF NOT EXISTS report_state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id),
  remarks TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Push deliveries actually made (successful report.approved pushes); used to
-- target cancellation notifications only at entities that received the push.
CREATE TABLE IF NOT EXISTS report_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  event TEXT NOT NULL DEFAULT 'report.approved',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (report_id, entity_id, event)
);

CREATE TABLE IF NOT EXISTS share_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  channel TEXT NOT NULL,               -- push
  event TEXT NOT NULL,                 -- report.approved | report.cancelled
  status TEXT NOT NULL,                -- success | failed
  attempts INTEGER NOT NULL DEFAULT 1,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,            -- user | entity | public
  actor_id INTEGER,
  action TEXT NOT NULL,
  details_json TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  params_json TEXT NOT NULL DEFAULT '{}',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_report_type_scope (
  user_id INTEGER NOT NULL REFERENCES users(id),
  report_type_id INTEGER NOT NULL REFERENCES report_types(id),
  PRIMARY KEY (user_id, report_type_id)
);

CREATE TABLE IF NOT EXISTS user_facility_scope (
  user_id INTEGER NOT NULL REFERENCES users(id),
  facility_id INTEGER NOT NULL REFERENCES facilities(id),
  PRIMARY KEY (user_id, facility_id)
);

CREATE TABLE IF NOT EXISTS report_number_seq (
  year INTEGER PRIMARY KEY,
  seq INTEGER NOT NULL
);

-- Entity Simulator inbox: payloads received by the built-in webhook endpoint.
CREATE TABLE IF NOT EXISTS simulator_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  headers_json TEXT NOT NULL,
  body_json TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
