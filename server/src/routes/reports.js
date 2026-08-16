import { Router } from 'express';
import fs from 'fs';
import { db } from '../db.js';
import { requireAuth, requireRole, getUserScope, reportInScope, scopeFilterSql } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { notifyUser, notifyCheckersInScope } from '../lib/notify.js';
import { badRequest, notFound, forbidden } from '../lib/errors.js';
import { ROLES, REPORT_STATES, TEMPLATE_STATES } from '../config.js';
import { validateReportData } from '../lib/formValidation.js';
import { EXAMINEE_SECTION } from '../lib/examinee.js';
import { currentSettings, findDuplicateBlocker, validityStatus, isReportExpired } from '../services/templates.js';
import { renderReportSections, reportMeta, examineeValues } from '../services/reportData.js';
import { shareOnApproval, shareOnCancellation } from '../services/sharing.js';
import { generateReportPdf, pdfPathFor } from '../services/pdf.js';
import { verificationHash } from '../services/verification.js';

const router = Router();
router.use(requireAuth);

const EXAMINEE_SCHEMA = { sections: [EXAMINEE_SECTION] };

function recordTransition(reportId, fromState, toState, actorId, remarks = null) {
  db.prepare('INSERT INTO report_state_history (report_id, from_state, to_state, actor_id, remarks) VALUES (?,?,?,?,?)')
    .run(reportId, fromState, toState, actorId, remarks);
  db.prepare("UPDATE reports SET state = ?, updated_at = datetime('now') WHERE id = ?").run(toState, reportId);
}

function nextReportNumber() {
  const year = new Date().getFullYear();
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT seq FROM report_number_seq WHERE year = ?').get(year);
    const seq = (row?.seq || 0) + 1;
    if (row) db.prepare('UPDATE report_number_seq SET seq = ? WHERE year = ?').run(seq, year);
    else db.prepare('INSERT INTO report_number_seq (year, seq) VALUES (?,?)').run(year, seq);
    return `RPT-${year}-${String(seq).padStart(6, '0')}`;
  });
  return tx();
}

function getReportOr404(id) {
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!r) throw notFound('Report not found', 'التقرير غير موجود');
  return r;
}

// BR-R3: deny any access outside the user's scope, including direct ID access.
// Data Entry additionally sees only reports they created (BR-R4 for edits).
function assertReadAccess(user, report) {
  if (!reportInScope(user, report)) throw forbidden();
  if (user.role === ROLES.DATA_ENTRY && report.created_by !== user.id) throw forbidden();
}

function listRow(r) {
  const type = db.prepare('SELECT name_en, name_ar FROM report_types WHERE id = ?').get(r.report_type_id);
  const facility = db.prepare('SELECT code, name_en, name_ar FROM facilities WHERE id = ?').get(r.facility_id);
  const claimer = r.claimed_by ? db.prepare('SELECT full_name_en, full_name_ar FROM users WHERE id = ?').get(r.claimed_by) : null;
  return {
    id: r.id, report_number: r.report_number, state: r.state,
    report_type_id: r.report_type_id, type_en: type.name_en, type_ar: type.name_ar,
    facility_id: r.facility_id, facility_code: facility.code, facility_en: facility.name_en, facility_ar: facility.name_ar,
    examinee_id_type: r.examinee_id_type, examinee_id_number: r.examinee_id_number,
    examinee_name_en: r.examinee_name_en, examinee_name_ar: r.examinee_name_ar,
    expiry_date: r.expiry_date, validity_status: validityStatus(r),
    claimed_by: r.claimed_by, claimed_by_en: claimer?.full_name_en, claimed_by_ar: claimer?.full_name_ar,
    created_by: r.created_by, created_at: r.created_at, updated_at: r.updated_at, approved_at: r.approved_at,
  };
}

function validateExaminee(examinee, { requireMandatory }) {
  const errors = validateReportData(EXAMINEE_SCHEMA, examinee, { requireMandatory });
  if (errors.length) throw badRequest('Examinee data is invalid', 'بيانات المفحوص غير صحيحة', { details: errors });
}

// ---- Create / edit / submit (Data Entry) ----

router.post('/', requireRole(ROLES.DATA_ENTRY), (req, res, next) => {
  try {
    const { report_type_id, facility_id, examinee = {}, data = {} } = req.body;
    const scope = getUserScope(req.user);
    if (!scope.reportTypes.includes(Number(report_type_id)) || !scope.facilities.includes(Number(facility_id))) {
      throw forbidden();
    }
    const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(facility_id);
    if (!facility || facility.status !== 'active') {
      throw badRequest('No new reports can be created under an inactive facility', 'لا يمكن إنشاء تقارير جديدة تحت منشأة غير نشطة');
    }
    // Reports are created only from the latest Published template version.
    const version = db.prepare(
      'SELECT * FROM template_versions WHERE report_type_id = ? AND state = ? ORDER BY version_no DESC LIMIT 1'
    ).get(report_type_id, TEMPLATE_STATES.PUBLISHED);
    if (!version) throw badRequest('No published template version for this report type', 'لا توجد نسخة منشورة لهذا النوع من التقارير');

    validateExaminee(examinee, { requireMandatory: true });

    const blocker = findDuplicateBlocker(Number(report_type_id), examinee.id_type, examinee.id_number);
    if (blocker) {
      throw badRequest(
        `Duplicate prevention: an active report of this type already exists for this examinee (${blocker.report_number || 'draft #' + blocker.id})`,
        `منع التكرار: يوجد تقرير نشط من هذا النوع لهذا المفحوص (${blocker.report_number || 'مسودة رقم ' + blocker.id})`,
        { blocking_report_number: blocker.report_number, blocking_report_id: blocker.id }
      );
    }

    const dataErrors = validateReportData(JSON.parse(version.schema_json), data, { requireMandatory: false });
    if (dataErrors.length) throw badRequest('Report data is invalid', 'بيانات التقرير غير صحيحة', { details: dataErrors });

    const info = db.prepare(
      `INSERT INTO reports (report_type_id, template_version_id, facility_id,
        examinee_id_type, examinee_id_number, examinee_name_en, examinee_name_ar,
        examinee_dob, examinee_gender, examinee_nationality, examinee_phone,
        data_json, state, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(report_type_id, version.id, facility_id,
      examinee.id_type, examinee.id_number, examinee.full_name_en, examinee.full_name_ar,
      examinee.dob, examinee.gender, examinee.nationality, examinee.phone || null,
      JSON.stringify(data), REPORT_STATES.DRAFT, req.user.id);
    recordTransition(info.lastInsertRowid, null, REPORT_STATES.DRAFT, req.user.id);
    audit('user', req.user.id, 'report.create', { report_id: info.lastInsertRowid }, req.ip);
    res.status(201).json({ report: listRow(getReportOr404(info.lastInsertRowid)) });
  } catch (e) { next(e); }
});

router.put('/:id', requireRole(ROLES.DATA_ENTRY), (req, res, next) => {
  try {
    const r = getReportOr404(req.params.id);
    // BR-R4: Data Entry edits only their own reports, only Draft/Returned.
    if (r.created_by !== req.user.id) throw forbidden();
    if (![REPORT_STATES.DRAFT, REPORT_STATES.RETURNED].includes(r.state)) {
      throw badRequest('Report is not editable in its current state', 'لا يمكن تعديل التقرير في حالته الحالية');
    }
    const { examinee, data } = req.body;
    const version = db.prepare('SELECT * FROM template_versions WHERE id = ?').get(r.template_version_id);
    if (examinee) {
      validateExaminee(examinee, { requireMandatory: true });
      const blocker = findDuplicateBlocker(r.report_type_id, examinee.id_type, examinee.id_number, r.id);
      if (blocker) {
        throw badRequest(
          `Duplicate prevention: an active report of this type already exists for this examinee (${blocker.report_number || 'draft #' + blocker.id})`,
          `منع التكرار: يوجد تقرير نشط من هذا النوع لهذا المفحوص (${blocker.report_number || 'مسودة رقم ' + blocker.id})`,
          { blocking_report_number: blocker.report_number, blocking_report_id: blocker.id }
        );
      }
      db.prepare(
        `UPDATE reports SET examinee_id_type=?, examinee_id_number=?, examinee_name_en=?, examinee_name_ar=?,
         examinee_dob=?, examinee_gender=?, examinee_nationality=?, examinee_phone=? WHERE id = ?`
      ).run(examinee.id_type, examinee.id_number, examinee.full_name_en, examinee.full_name_ar,
        examinee.dob, examinee.gender, examinee.nationality, examinee.phone || null, r.id);
    }
    if (data !== undefined) {
      const dataErrors = validateReportData(JSON.parse(version.schema_json), data, { requireMandatory: false });
      if (dataErrors.length) throw badRequest('Report data is invalid', 'بيانات التقرير غير صحيحة', { details: dataErrors });
      db.prepare('UPDATE reports SET data_json = ? WHERE id = ?').run(JSON.stringify(data), r.id);
    }
    db.prepare("UPDATE reports SET updated_at = datetime('now') WHERE id = ?").run(r.id);
    audit('user', req.user.id, 'report.update', { report_id: r.id }, req.ip);
    res.json({ report: listRow(getReportOr404(r.id)) });
  } catch (e) { next(e); }
});

router.post('/:id/submit', requireRole(ROLES.DATA_ENTRY), (req, res, next) => {
  try {
    const r = getReportOr404(req.params.id);
    if (r.created_by !== req.user.id) throw forbidden();
    if (![REPORT_STATES.DRAFT, REPORT_STATES.RETURNED].includes(r.state)) {
      throw badRequest('Report cannot be submitted from its current state', 'لا يمكن إرسال التقرير من حالته الحالية');
    }
    const version = db.prepare('SELECT * FROM template_versions WHERE id = ?').get(r.template_version_id);
    // Full validation (mandatory fields included) at submission.
    const errors = validateReportData(JSON.parse(version.schema_json), JSON.parse(r.data_json), { requireMandatory: true });
    if (errors.length) throw badRequest('Report has validation errors', 'يحتوي التقرير على أخطاء تحقق', { details: errors });

    // Report number is assigned at FIRST submission.
    if (!r.report_number) {
      db.prepare('UPDATE reports SET report_number = ? WHERE id = ?').run(nextReportNumber(), r.id);
    }
    recordTransition(r.id, r.state, REPORT_STATES.SUBMITTED, req.user.id);
    const updated = getReportOr404(r.id);
    notifyCheckersInScope(updated, 'report_submitted', { report_number: updated.report_number });
    audit('user', req.user.id, 'report.submit', { report_id: r.id }, req.ip);
    res.json({ report: listRow(updated) });
  } catch (e) { next(e); }
});

// ---- Lists ----

router.get('/', (req, res, next) => {
  try {
    const { state, report_type_id, facility_id, q, id_type, id_number, from, to, validity } = req.query;
    const { sql, params } = scopeFilterSql(req.user);
    let where = sql;
    const p = [...params];
    if (req.user.role === ROLES.DATA_ENTRY) { where += ' AND r.created_by = ?'; p.push(req.user.id); }
    if (req.user.role === ROLES.CHECKER && req.query.queue === '1') {
      where += ` AND r.state IN ('${REPORT_STATES.SUBMITTED}','${REPORT_STATES.UNDER_REVIEW}')`;
    }
    if (state) { where += ' AND r.state = ?'; p.push(state); }
    if (report_type_id) { where += ' AND r.report_type_id = ?'; p.push(report_type_id); }
    if (facility_id) { where += ' AND r.facility_id = ?'; p.push(facility_id); }
    if (id_type) { where += ' AND r.examinee_id_type = ?'; p.push(id_type); }
    if (id_number) { where += ' AND r.examinee_id_number = ?'; p.push(id_number); }
    if (from) { where += " AND date(r.created_at) >= ?"; p.push(from); }
    if (to) { where += " AND date(r.created_at) <= ?"; p.push(to); }
    if (q) {
      where += ' AND (r.report_number LIKE ? OR r.examinee_id_number LIKE ? OR r.examinee_name_en LIKE ? OR r.examinee_name_ar LIKE ?)';
      p.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    let rows = db.prepare(`SELECT r.* FROM reports r WHERE ${where} ORDER BY r.updated_at DESC LIMIT 500`).all(...p);
    // Virtual "expired" filter on approved reports.
    if (validity === 'expired') rows = rows.filter((r) => r.state === REPORT_STATES.APPROVED && isReportExpired(r));
    res.json({ reports: rows.map(listRow) });
  } catch (e) { next(e); }
});

// Examinee history: all reports for an ID within the viewer's scope.
router.get('/examinee-history', (req, res, next) => {
  try {
    const { id_type, id_number } = req.query;
    if (!id_type || !id_number) throw badRequest('id_type and id_number are required', 'نوع الهوية ورقمها مطلوبان');
    const { sql, params } = scopeFilterSql(req.user);
    let where = `${sql} AND r.examinee_id_type = ? AND r.examinee_id_number = ?`;
    const p = [...params, id_type, id_number];
    if (req.user.role === ROLES.DATA_ENTRY) { where += ' AND r.created_by = ?'; p.push(req.user.id); }
    const rows = db.prepare(`SELECT r.* FROM reports r WHERE ${where} ORDER BY r.created_at DESC`).all(...p);
    res.json({ reports: rows.map(listRow) });
  } catch (e) { next(e); }
});

// ---- Detail ----

router.get('/:id', (req, res, next) => {
  try {
    const r = getReportOr404(req.params.id);
    assertReadAccess(req.user, r);
    const version = db.prepare('SELECT * FROM template_versions WHERE id = ?').get(r.template_version_id);
    const history = db.prepare(
      `SELECT h.*, u.full_name_en AS actor_en, u.full_name_ar AS actor_ar
       FROM report_state_history h LEFT JOIN users u ON u.id = h.actor_id
       WHERE h.report_id = ? ORDER BY h.id`
    ).all(r.id);
    const settings = currentSettings(r.report_type_id);
    res.json({
      report: {
        ...listRow(r),
        data: JSON.parse(r.data_json),
        examinee: examineeValues(r),
        schema: JSON.parse(version.schema_json),
        template_version_no: version.version_no,
        sections: renderReportSections(r),
        meta: reportMeta(r),
        history,
        cancel_reason: r.cancel_reason,
        current_settings: settings,
        has_pdf: !!r.report_number && fs.existsSync(pdfPathFor(r.report_number)),
        verification_hash: r.state === REPORT_STATES.APPROVED || r.state === REPORT_STATES.CANCELLED
          ? verificationHash(r.report_number) : null,
      },
    });
  } catch (e) { next(e); }
});

// ---- Checker actions ----

// Claim lock: opening for review locks the report to this checker.
router.post('/:id/claim', requireRole(ROLES.CHECKER), (req, res, next) => {
  try {
    const r = getReportOr404(req.params.id);
    if (!reportInScope(req.user, r)) throw forbidden();
    if (r.state === REPORT_STATES.UNDER_REVIEW && r.claimed_by !== req.user.id) {
      const claimer = db.prepare('SELECT full_name_en, full_name_ar FROM users WHERE id = ?').get(r.claimed_by);
      throw badRequest(`Under review by ${claimer.full_name_en}`, `قيد التدقيق بواسطة ${claimer.full_name_ar}`);
    }
    if (r.state !== REPORT_STATES.SUBMITTED && !(r.state === REPORT_STATES.UNDER_REVIEW && r.claimed_by === req.user.id)) {
      throw badRequest('Report is not in the review queue', 'التقرير ليس في قائمة التدقيق');
    }
    if (r.state === REPORT_STATES.SUBMITTED) {
      db.prepare('UPDATE reports SET claimed_by = ? WHERE id = ?').run(req.user.id, r.id);
      recordTransition(r.id, r.state, REPORT_STATES.UNDER_REVIEW, req.user.id);
    }
    audit('user', req.user.id, 'report.claim', { report_id: r.id }, req.ip);
    res.json({ report: listRow(getReportOr404(r.id)) });
  } catch (e) { next(e); }
});

// Release: return the report to the queue without a decision.
router.post('/:id/release', requireRole(ROLES.CHECKER), (req, res, next) => {
  try {
    const r = getReportOr404(req.params.id);
    if (r.state !== REPORT_STATES.UNDER_REVIEW || r.claimed_by !== req.user.id) {
      throw badRequest('You have not claimed this report', 'لم تقم بحجز هذا التقرير');
    }
    db.prepare('UPDATE reports SET claimed_by = NULL WHERE id = ?').run(r.id);
    recordTransition(r.id, r.state, REPORT_STATES.SUBMITTED, req.user.id, 'released');
    audit('user', req.user.id, 'report.release', { report_id: r.id }, req.ip);
    res.json({ report: listRow(getReportOr404(r.id)) });
  } catch (e) { next(e); }
});

// First action wins: only the claiming checker can decide.
function assertDecider(user, report) {
  if (!reportInScope(user, report)) throw forbidden();
  if (report.state !== REPORT_STATES.UNDER_REVIEW || report.claimed_by !== user.id) {
    throw badRequest('Claim the report before deciding', 'يجب حجز التقرير قبل اتخاذ القرار');
  }
  // BR-R5: a checker never approves a report they created (defense-in-depth).
  if (report.created_by === user.id) throw forbidden('Checkers cannot decide on their own reports', 'لا يمكن للمدقق البت في تقرير أنشأه بنفسه');
}

router.post('/:id/approve', requireRole(ROLES.CHECKER), async (req, res, next) => {
  try {
    const r = getReportOr404(req.params.id);
    assertDecider(req.user, r);
    // Triggered in order: expiry computation → PDF + QR → auto-share → audit.
    const settings = currentSettings(r.report_type_id);
    const approvedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let expiry = null;
    if (settings.validity_days) {
      const d = new Date();
      d.setDate(d.getDate() + settings.validity_days);
      expiry = d.toISOString().slice(0, 10);
    }
    db.prepare('UPDATE reports SET approved_by = ?, approved_at = ?, expiry_date = ?, verification_hash = ?, claimed_by = NULL WHERE id = ?')
      .run(req.user.id, approvedAt, expiry, verificationHash(r.report_number), r.id);
    recordTransition(r.id, r.state, REPORT_STATES.APPROVED, req.user.id, req.body?.remarks || null);
    notifyUser(r.created_by, 'report_approved', { report_number: r.report_number });
    let pdfOk = true;
    try {
      await generateReportPdf(r.id);
    } catch {
      pdfOk = false; // approval stands; PDF can be regenerated later (idempotent)
    }
    await shareOnApproval(r.id);
    audit('user', req.user.id, 'report.approve', { report_id: r.id, pdf_generated: pdfOk }, req.ip);
    res.json({ report: listRow(getReportOr404(r.id)), pdf_generated: pdfOk });
  } catch (e) { next(e); }
});

router.post('/:id/return', requireRole(ROLES.CHECKER), (req, res, next) => {
  try {
    const r = getReportOr404(req.params.id);
    assertDecider(req.user, r);
    const remarks = String(req.body?.remarks || '').trim();
    if (!remarks) throw badRequest('Remarks are mandatory when returning a report', 'الملاحظات إلزامية عند إعادة التقرير');
    db.prepare('UPDATE reports SET claimed_by = NULL WHERE id = ?').run(r.id);
    recordTransition(r.id, r.state, REPORT_STATES.RETURNED, req.user.id, remarks);
    notifyUser(r.created_by, 'report_returned', { report_number: r.report_number, remarks });
    audit('user', req.user.id, 'report.return', { report_id: r.id }, req.ip);
    res.json({ report: listRow(getReportOr404(r.id)) });
  } catch (e) { next(e); }
});

router.post('/:id/reject', requireRole(ROLES.CHECKER), (req, res, next) => {
  try {
    const r = getReportOr404(req.params.id);
    assertDecider(req.user, r);
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw badRequest('Rejection reason is mandatory', 'سبب الرفض إلزامي');
    db.prepare('UPDATE reports SET claimed_by = NULL WHERE id = ?').run(r.id);
    recordTransition(r.id, r.state, REPORT_STATES.REJECTED, req.user.id, reason);
    notifyUser(r.created_by, 'report_rejected', { report_number: r.report_number, reason });
    audit('user', req.user.id, 'report.reject', { report_id: r.id }, req.ip);
    res.json({ report: listRow(getReportOr404(r.id)) });
  } catch (e) { next(e); }
});

// ---- Cancel (System Administration Manager only — BR-R6) ----

router.post('/:id/cancel', requireRole(ROLES.SYS_ADMIN_MANAGER), async (req, res, next) => {
  try {
    const r = getReportOr404(req.params.id);
    if (!reportInScope(req.user, r)) throw forbidden();
    if (r.state !== REPORT_STATES.APPROVED) {
      throw badRequest('Only approved reports can be cancelled', 'لا يمكن إلغاء سوى التقارير المعتمدة');
    }
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw badRequest('Cancellation reason is mandatory', 'سبب الإلغاء إلزامي');
    db.prepare("UPDATE reports SET cancel_reason = ?, cancelled_by = ?, cancelled_at = datetime('now') WHERE id = ?")
      .run(reason, req.user.id, r.id);
    recordTransition(r.id, r.state, REPORT_STATES.CANCELLED, req.user.id, reason);
    notifyUser(r.created_by, 'report_cancelled', { report_number: r.report_number, reason });
    // Entities that received the original push get a report.cancelled push.
    await shareOnCancellation(r.id);
    audit('user', req.user.id, 'report.cancel', { report_id: r.id, reason }, req.ip);
    res.json({ report: listRow(getReportOr404(r.id)) });
  } catch (e) { next(e); }
});

// ---- PDF download (internal, authed) ----

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const r = getReportOr404(req.params.id);
    assertReadAccess(req.user, r);
    if (![REPORT_STATES.APPROVED, REPORT_STATES.CANCELLED].includes(r.state)) {
      throw badRequest('PDF exists only for approved reports', 'يتوفر ملف PDF للتقارير المعتمدة فقط');
    }
    const path = pdfPathFor(r.report_number);
    if (!fs.existsSync(path)) await generateReportPdf(r.id);
    res.download(path, `${r.report_number}.pdf`);
  } catch (e) { next(e); }
});

export default router;
