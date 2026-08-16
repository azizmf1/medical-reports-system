import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signToken, requireAuth, getUserScope } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { ApiError } from '../lib/errors.js';

const router = Router();

function publicUser(u) {
  const scope = getUserScope(u);
  return {
    id: u.id, username: u.username, full_name_en: u.full_name_en, full_name_ar: u.full_name_ar,
    role: u.role, scope,
  };
}

router.post('/login', (req, res, next) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));
  if (!user || !user.active || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return next(new ApiError(401, 'Invalid username or password', 'اسم المستخدم أو كلمة المرور غير صحيحة'));
  }
  audit('user', user.id, 'login', null, req.ip);
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
