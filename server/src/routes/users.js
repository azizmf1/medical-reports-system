import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest } from '../lib/errors.js';
import { ROLES, ALL_ROLES, SCOPED_ROLES } from '../config.js';

const router = Router();
router.use(requireAuth, requireRole(ROLES.OPERATIONS));

function userRow(u) {
  return {
    id: u.id, username: u.username, full_name_en: u.full_name_en, full_name_ar: u.full_name_ar,
    role: u.role, active: !!u.active, created_at: u.created_at,
    report_type_ids: db.prepare('SELECT report_type_id FROM user_report_type_scope WHERE user_id = ?').all(u.id).map((r) => r.report_type_id),
    facility_ids: db.prepare('SELECT facility_id FROM user_facility_scope WHERE user_id = ?').all(u.id).map((r) => r.facility_id),
  };
}

// BR-R1: exactly one role per user — `role` is a single value, validated here
// on create and update.
function validateBody(body, { forCreate }) {
  const { username, password, full_name_en, full_name_ar, role } = body;
  if (forCreate && (!username || !password)) throw badRequest('Username and password are required', 'اسم المستخدم وكلمة المرور مطلوبان');
  if (!full_name_en || !full_name_ar) throw badRequest('Full name in English and Arabic is required', 'الاسم الكامل بالإنجليزية والعربية مطلوب');
  if (!ALL_ROLES.includes(role)) throw badRequest('A single valid role is required', 'يجب تحديد دور واحد صالح');
}

function setScopes(userId, role, body) {
  db.prepare('DELETE FROM user_report_type_scope WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM user_facility_scope WHERE user_id = ?').run(userId);
  if (!SCOPED_ROLES.includes(role)) return;
  for (const t of body.report_type_ids || []) {
    db.prepare('INSERT OR IGNORE INTO user_report_type_scope (user_id, report_type_id) VALUES (?,?)').run(userId, t);
  }
  // System Administration Manager: facilities are implicit ALL — assignments ignored.
  if (role === ROLES.SYS_ADMIN_MANAGER) return;
  for (const f of body.facility_ids || []) {
    db.prepare('INSERT OR IGNORE INTO user_facility_scope (user_id, facility_id) VALUES (?,?)').run(userId, f);
  }
}

router.get('/', (req, res) => {
  res.json({ users: db.prepare('SELECT * FROM users ORDER BY id').all().map(userRow) });
});

router.post('/', (req, res, next) => {
  try {
    validateBody(req.body, { forCreate: true });
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(req.body.username);
    if (exists) throw badRequest('Username already exists', 'اسم المستخدم موجود مسبقًا');
    const info = db.prepare(
      'INSERT INTO users (username, password_hash, full_name_en, full_name_ar, role) VALUES (?,?,?,?,?)'
    ).run(req.body.username, bcrypt.hashSync(String(req.body.password), 10),
      req.body.full_name_en, req.body.full_name_ar, req.body.role);
    setScopes(info.lastInsertRowid, req.body.role, req.body);
    audit('user', req.user.id, 'user.create', { user_id: info.lastInsertRowid }, req.ip);
    res.status(201).json({ user: userRow(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)) });
  } catch (e) { next(e); }
});

router.put('/:id', (req, res, next) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) throw badRequest('User not found', 'المستخدم غير موجود');
    validateBody({ ...user, ...req.body }, { forCreate: false });
    const role = req.body.role || user.role;
    db.prepare('UPDATE users SET full_name_en = ?, full_name_ar = ?, role = ?, active = ? WHERE id = ?')
      .run(req.body.full_name_en ?? user.full_name_en, req.body.full_name_ar ?? user.full_name_ar,
        role, req.body.active === undefined ? user.active : (req.body.active ? 1 : 0), user.id);
    if (req.body.password) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(req.body.password), 10), user.id);
    }
    setScopes(user.id, role, req.body);
    audit('user', req.user.id, 'user.update', { user_id: user.id }, req.ip);
    res.json({ user: userRow(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
  } catch (e) { next(e); }
});

export default router;
