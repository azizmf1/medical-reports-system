import { Router } from 'express';
import fs from 'fs';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { REPORT_STATES } from '../config.js';
import { checkHash } from '../services/verification.js';
import { validityStatus } from '../services/templates.js';
import { maskIdNumber } from '../lib/examinee.js';
import { pdfPathFor } from '../services/pdf.js';

const router = Router();

// Public QR verification (no login). Never exposes medical field data or
// examinee details beyond a masked ID.
router.get('/verify/:reportNumber', (req, res) => {
  const { reportNumber } = req.params;
  const r = db.prepare('SELECT * FROM reports WHERE report_number = ?').get(reportNumber);
  audit('public', null, 'verify', { report_number: reportNumber }, req.ip);
  if (!r || ![REPORT_STATES.APPROVED, REPORT_STATES.CANCELLED].includes(r.state)) {
    return res.json({ result: 'Invalid', report_number: reportNumber });
  }
  if (!checkHash(reportNumber, req.query.h)) {
    return res.json({ result: 'Invalid hash', report_number: reportNumber });
  }
  const type = db.prepare('SELECT name_en, name_ar FROM report_types WHERE id = ?').get(r.report_type_id);
  const facility = db.prepare('SELECT name_en, name_ar FROM facilities WHERE id = ?').get(r.facility_id);
  res.json({
    result: validityStatus(r), // Valid / Expired / Cancelled
    report_number: r.report_number,
    state: r.state,
    template_name_en: type.name_en,
    template_name_ar: type.name_ar,
    facility_en: facility.name_en,
    facility_ar: facility.name_ar,
    approval_date: r.approved_at,
    expiry_date: r.expiry_date,
    examinee_id_masked: maskIdNumber(r.examinee_id_number),
  });
});

// PDF download used in push payloads / Inquiry API — guarded by the hash.
router.get('/reports/:reportNumber/pdf', (req, res) => {
  const r = db.prepare('SELECT * FROM reports WHERE report_number = ?').get(req.params.reportNumber);
  if (!r || !checkHash(req.params.reportNumber, req.query.h)) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  }
  const path = pdfPathFor(r.report_number);
  if (!fs.existsSync(path)) return res.status(404).json({ error: { code: 'not_found', message: 'PDF not generated' } });
  res.download(path, `${r.report_number}.pdf`);
});

export default router;
