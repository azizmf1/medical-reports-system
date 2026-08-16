import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole, getUserScope } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest } from '../lib/errors.js';
import { ROLES } from '../config.js';

const router = Router();
router.use(requireAuth);

// All authenticated roles can list facilities (needed for pickers); scoped
// roles only see facilities in their scope.
router.get('/', (req, res) => {
  let rows = db.prepare('SELECT * FROM facilities ORDER BY code').all();
  const scope = getUserScope(req.user);
  if (scope.facilities && scope.facilities !== 'ALL') {
    rows = rows.filter((f) => scope.facilities.includes(f.id));
  }
  res.json({ facilities: rows });
});

router.use(requireRole(ROLES.OPERATIONS));

function validate(body) {
  if (!body.code || !body.name_en || !body.name_ar) {
    throw badRequest('Code and names (EN/AR) are required', 'الرمز والاسم بالإنجليزية والعربية مطلوبة');
  }
  if (body.status && !['active', 'inactive'].includes(body.status)) {
    throw badRequest('Invalid status', 'حالة غير صالحة');
  }
}

router.post('/', (req, res, next) => {
  try {
    validate(req.body);
    if (db.prepare('SELECT id FROM facilities WHERE code = ?').get(req.body.code)) {
      throw badRequest('Facility code already exists', 'رمز المنشأة موجود مسبقًا');
    }
    const info = db.prepare('INSERT INTO facilities (code, name_en, name_ar, city, status) VALUES (?,?,?,?,?)')
      .run(req.body.code, req.body.name_en, req.body.name_ar, req.body.city || null, req.body.status || 'active');
    audit('user', req.user.id, 'facility.create', { facility_id: info.lastInsertRowid }, req.ip);
    res.status(201).json({ facility: db.prepare('SELECT * FROM facilities WHERE id = ?').get(info.lastInsertRowid) });
  } catch (e) { next(e); }
});

router.put('/:id', (req, res, next) => {
  try {
    const f = db.prepare('SELECT * FROM facilities WHERE id = ?').get(req.params.id);
    if (!f) throw badRequest('Facility not found', 'المنشأة غير موجودة');
    validate({ ...f, ...req.body });
    db.prepare('UPDATE facilities SET name_en = ?, name_ar = ?, city = ?, status = ? WHERE id = ?')
      .run(req.body.name_en ?? f.name_en, req.body.name_ar ?? f.name_ar,
        req.body.city ?? f.city, req.body.status ?? f.status, f.id);
    audit('user', req.user.id, 'facility.update', { facility_id: f.id }, req.ip);
    res.json({ facility: db.prepare('SELECT * FROM facilities WHERE id = ?').get(f.id) });
  } catch (e) { next(e); }
});

export default router;
