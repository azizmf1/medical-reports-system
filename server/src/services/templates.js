import { db } from '../db.js';
import { TEMPLATE_STATES, REPORT_STATES, DUPLICATE_BLOCKING_STATES } from '../config.js';

export function latestPublishedVersion(reportTypeId) {
  return db.prepare(
    `SELECT * FROM template_versions WHERE report_type_id = ? AND state = ? ORDER BY version_no DESC LIMIT 1`
  ).get(reportTypeId, TEMPLATE_STATES.PUBLISHED);
}

// Sharing / validity / duplicate-prevention settings are LIVE at report-type
// level: the latest Published version's settings govern ALL reports of the type.
export function currentSettings(reportTypeId) {
  const v = latestPublishedVersion(reportTypeId);
  if (!v) return { sharing: [], validity_days: null, duplicate_prevention: false };
  const s = JSON.parse(v.settings_json || '{}');
  return {
    sharing: Array.isArray(s.sharing) ? s.sharing : [],
    validity_days: s.validity_days ?? null,
    duplicate_prevention: !!s.duplicate_prevention,
  };
}

export function isReportExpired(report) {
  return !!report.expiry_date && report.expiry_date < new Date().toISOString().slice(0, 10);
}

export function validityStatus(report) {
  if (report.state === REPORT_STATES.CANCELLED) return 'Cancelled';
  if (isReportExpired(report)) return 'Expired';
  return 'Valid';
}

// BR-DUP (template setting 3): when duplicate prevention is ON, block a new
// report of this type for the same examinee while a blocking report exists:
// Draft/Submitted/Under Review/Returned, or Approved and still valid.
export function findDuplicateBlocker(reportTypeId, idType, idNumber, excludeReportId = null) {
  const settings = currentSettings(reportTypeId);
  if (!settings.duplicate_prevention) return null;
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(
    `SELECT * FROM reports
     WHERE report_type_id = ? AND examinee_id_type = ? AND examinee_id_number = ?
       AND (state IN (${DUPLICATE_BLOCKING_STATES.map(() => '?').join(',')})
            OR (state = ? AND (expiry_date IS NULL OR expiry_date >= ?)))`
  ).all(reportTypeId, idType, idNumber, ...DUPLICATE_BLOCKING_STATES, REPORT_STATES.APPROVED, today);
  const blocker = rows.find((r) => r.id !== excludeReportId);
  return blocker || null;
}
