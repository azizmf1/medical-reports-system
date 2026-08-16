import { db } from '../db.js';
import { ROLES } from '../config.js';

// Notification types are i18n keys; params are interpolated client-side so the
// text renders per the active language (in-app only — no email/SMS).
export function notifyUser(userId, type, params = {}) {
  db.prepare('INSERT INTO notifications (user_id, type, params_json) VALUES (?,?,?)')
    .run(userId, type, JSON.stringify(params));
}

export function notifyRole(role, type, params = {}) {
  const users = db.prepare('SELECT id FROM users WHERE role = ? AND active = 1').all(role);
  for (const u of users) notifyUser(u.id, type, params);
}

// Checkers whose scope covers the report's type AND facility.
export function notifyCheckersInScope(report, type, params = {}) {
  const checkers = db.prepare(
    `SELECT u.id FROM users u
     WHERE u.role = ? AND u.active = 1
       AND EXISTS (SELECT 1 FROM user_report_type_scope s WHERE s.user_id = u.id AND s.report_type_id = ?)
       AND EXISTS (SELECT 1 FROM user_facility_scope f WHERE f.user_id = u.id AND f.facility_id = ?)`
  ).all(ROLES.CHECKER, report.report_type_id, report.facility_id);
  for (const c of checkers) notifyUser(c.id, type, params);
}
