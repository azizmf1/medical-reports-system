import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole, scopeFilterSql } from '../lib/auth.js';
import { ROLES, REPORT_STATES } from '../config.js';
import { isReportExpired } from '../services/templates.js';

const router = Router();
router.use(requireAuth, requireRole(ROLES.SYSTEM_MANAGER, ROLES.SYS_ADMIN_MANAGER));

// All dashboard figures are filtered by the viewer's scope (BR-R2).
router.get('/', (req, res) => {
  const { sql, params } = scopeFilterSql(req.user);
  const rows = db.prepare(`SELECT r.* FROM reports r WHERE ${sql}`).all(...params);

  const byState = {};
  let expired = 0;
  for (const r of rows) {
    byState[r.state] = (byState[r.state] || 0) + 1;
    if (r.state === REPORT_STATES.APPROVED && isReportExpired(r)) expired++;
  }

  const byType = db.prepare(
    `SELECT r.report_type_id AS id, t.name_en, t.name_ar, COUNT(*) AS count
     FROM reports r JOIN report_types t ON t.id = r.report_type_id
     WHERE ${sql} GROUP BY r.report_type_id`
  ).all(...params);

  const byFacility = db.prepare(
    `SELECT r.facility_id AS id, f.name_en, f.name_ar, COUNT(*) AS count
     FROM reports r JOIN facilities f ON f.id = r.facility_id
     WHERE ${sql} GROUP BY r.facility_id`
  ).all(...params);

  const byMonth = db.prepare(
    `SELECT strftime('%Y-%m', r.created_at) AS month, COUNT(*) AS count
     FROM reports r WHERE ${sql} AND r.created_at >= date('now', '-12 months')
     GROUP BY month ORDER BY month`
  ).all(...params);

  // Average time from first Submitted to Approved, in hours.
  const avgRow = db.prepare(
    `SELECT AVG((julianday(a.first_approved) - julianday(s.first_submitted)) * 24.0) AS avg_hours
     FROM (SELECT report_id, MIN(created_at) AS first_submitted FROM report_state_history WHERE to_state = 'submitted' GROUP BY report_id) s
     JOIN (SELECT report_id, MIN(created_at) AS first_approved FROM report_state_history WHERE to_state = 'approved' GROUP BY report_id) a
       ON a.report_id = s.report_id
     JOIN reports r ON r.id = s.report_id
     WHERE ${sql}`
  ).get(...params);

  res.json({
    total: rows.length,
    by_state: byState,
    expired_count: expired,
    by_type: byType,
    by_facility: byFacility,
    by_month: byMonth,
    avg_submit_to_approve_hours: avgRow?.avg_hours ?? null,
  });
});

export default router;
