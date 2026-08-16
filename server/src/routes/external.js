import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { REPORT_STATES } from '../config.js';
import { entityPullTypeIds } from '../services/sharing.js';
import { buildReportPayload } from '../services/reportData.js';

// Inquiry API for Pull entities: /api/external/v1
// Basic auth with Client ID + Client Secret (secret verified against hash).
const router = Router();

function jsonError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

router.use((req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="mrms-external"');
    return jsonError(res, 401, 'unauthorized', 'Client ID and secret required');
  }
  const [clientId, ...rest] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
  const secret = rest.join(':');
  const cred = db.prepare('SELECT * FROM entity_credentials WHERE client_id = ? AND revoked = 0').get(clientId || '');
  if (!cred || !bcrypt.compareSync(secret || '', cred.secret_hash)) {
    return jsonError(res, 401, 'unauthorized', 'Invalid credentials');
  }
  const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(cred.entity_id);
  if (!entity || entity.status !== 'active' || !entity.pull_enabled) {
    return jsonError(res, 403, 'forbidden', 'Pull channel is not enabled for this entity');
  }
  req.entity = entity;
  next();
});

// Both lookups return ONLY Approved reports pull-visible to the calling entity
// per CURRENT sharing settings and within the entity's report-type scope.
// Cancelled/expired approved reports are returned with their validity_status.
router.get('/reports', (req, res) => {
  const { reportNumber, idType, idNumber } = req.query;
  const visibleTypes = entityPullTypeIds(req.entity);
  const logCall = (queryKey, count) => audit('entity', req.entity.id, 'external.inquiry', {
    endpoint: '/reports', query: queryKey, result_count: count,
  }, req.ip);

  const pullVisible = (r) => visibleTypes.includes(r.report_type_id)
    && [REPORT_STATES.APPROVED, REPORT_STATES.CANCELLED].includes(r.state)
    && r.report_number;

  if (reportNumber) {
    const r = db.prepare('SELECT * FROM reports WHERE report_number = ?').get(String(reportNumber));
    if (!r) { logCall(`reportNumber=${reportNumber}`, 0); return jsonError(res, 404, 'not_found', 'Report not found or not shared'); }
    if (!pullVisible(r)) {
      logCall(`reportNumber=${reportNumber}`, 0);
      // Existing but out-of-scope/not-shared is indistinguishable from missing (404 per spec).
      return jsonError(res, 404, 'not_found', 'Report not found or not shared');
    }
    logCall(`reportNumber=${reportNumber}`, 1);
    return res.json(buildReportPayload(r, 'inquiry.result').report);
  }

  if (idType && idNumber) {
    const rows = db.prepare('SELECT * FROM reports WHERE examinee_id_type = ? AND examinee_id_number = ?')
      .all(String(idType), String(idNumber)).filter(pullVisible);
    logCall(`idType=${idType}&idNumber=${idNumber}`, rows.length);
    return res.json({ count: rows.length, reports: rows.map((r) => buildReportPayload(r, 'inquiry.result').report) });
  }

  return jsonError(res, 400, 'bad_request', 'Provide reportNumber, or idType and idNumber');
});

export default router;
