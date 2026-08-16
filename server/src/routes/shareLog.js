import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { ROLES } from '../config.js';

const router = Router();
router.use(requireAuth, requireRole(ROLES.OPERATIONS));

// Sharing Log (Operations): every share / cancellation push event.
router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT l.*, r.report_number, e.code AS entity_code, e.name_en AS entity_en, e.name_ar AS entity_ar
     FROM share_log l JOIN reports r ON r.id = l.report_id JOIN entities e ON e.id = l.entity_id
     ORDER BY l.id DESC LIMIT 300`
  ).all();
  res.json({ log: rows });
});

export default router;
