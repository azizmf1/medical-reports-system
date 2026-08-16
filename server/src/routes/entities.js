import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { ROLES } from '../config.js';

const router = Router();
router.use(requireAuth);

function entityRow(e) {
  return {
    id: e.id, code: e.code, name_en: e.name_en, name_ar: e.name_ar, status: e.status,
    push_enabled: !!e.push_enabled, pull_enabled: !!e.pull_enabled,
    push_url: e.push_url, // secret not echoed back in full
    has_push_secret: !!e.push_secret,
    client_id: db.prepare('SELECT client_id FROM entity_credentials WHERE entity_id = ? AND revoked = 0').get(e.id)?.client_id || null,
    pull_type_ids: db.prepare('SELECT report_type_id FROM entity_pull_scope WHERE entity_id = ?').all(e.id).map((r) => r.report_type_id),
  };
}

// Report Builders need the entity list (with enabled channels) to configure
// template sharing settings; Operations manages them.
router.get('/', requireRole(ROLES.OPERATIONS, ROLES.REPORT_BUILDER), (req, res) => {
  res.json({ entities: db.prepare('SELECT * FROM entities ORDER BY code').all().map(entityRow) });
});

router.use(requireRole(ROLES.OPERATIONS));

function validate(body) {
  if (!body.code || !body.name_en || !body.name_ar) {
    throw badRequest('Code and names (EN/AR) are required', 'الرمز والاسم بالإنجليزية والعربية مطلوبة');
  }
  if (body.push_enabled && !body.push_url) {
    throw badRequest('Push-enabled entities need a webhook URL', 'الجهات المفعّل لديها الدفع تحتاج رابط Webhook');
  }
}

function setPullScope(entityId, typeIds) {
  db.prepare('DELETE FROM entity_pull_scope WHERE entity_id = ?').run(entityId);
  for (const t of typeIds || []) {
    db.prepare('INSERT OR IGNORE INTO entity_pull_scope (entity_id, report_type_id) VALUES (?,?)').run(entityId, t);
  }
}

router.post('/', (req, res, next) => {
  try {
    validate(req.body);
    if (db.prepare('SELECT id FROM entities WHERE code = ?').get(req.body.code)) {
      throw badRequest('Entity code already exists', 'رمز الجهة موجود مسبقًا');
    }
    const info = db.prepare(
      'INSERT INTO entities (code, name_en, name_ar, status, push_enabled, pull_enabled, push_url, push_secret) VALUES (?,?,?,?,?,?,?,?)'
    ).run(req.body.code, req.body.name_en, req.body.name_ar, req.body.status || 'active',
      req.body.push_enabled ? 1 : 0, req.body.pull_enabled ? 1 : 0,
      req.body.push_url || null, req.body.push_secret || null);
    setPullScope(info.lastInsertRowid, req.body.pull_type_ids);
    audit('user', req.user.id, 'entity.create', { entity_id: info.lastInsertRowid }, req.ip);
    res.status(201).json({ entity: entityRow(db.prepare('SELECT * FROM entities WHERE id = ?').get(info.lastInsertRowid)) });
  } catch (e) { next(e); }
});

router.put('/:id', (req, res, next) => {
  try {
    const e = db.prepare('SELECT * FROM entities WHERE id = ?').get(req.params.id);
    if (!e) throw notFound('Entity not found', 'الجهة غير موجودة');
    const merged = { ...e, ...req.body };
    validate(merged);
    db.prepare(
      'UPDATE entities SET name_en = ?, name_ar = ?, status = ?, push_enabled = ?, pull_enabled = ?, push_url = ?, push_secret = ? WHERE id = ?'
    ).run(merged.name_en, merged.name_ar, merged.status,
      merged.push_enabled ? 1 : 0, merged.pull_enabled ? 1 : 0,
      merged.push_url || null,
      req.body.push_secret !== undefined ? (req.body.push_secret || null) : e.push_secret,
      e.id);
    if (req.body.pull_type_ids) setPullScope(e.id, req.body.pull_type_ids);
    audit('user', req.user.id, 'entity.update', { entity_id: e.id }, req.ip);
    res.json({ entity: entityRow(db.prepare('SELECT * FROM entities WHERE id = ?').get(e.id)) });
  } catch (e2) { next(e2); }
});

// Generate (or regenerate) Pull credentials. The secret is returned ONCE and
// stored hashed; previous credentials are revoked.
router.post('/:id/credentials', (req, res, next) => {
  try {
    const e = db.prepare('SELECT * FROM entities WHERE id = ?').get(req.params.id);
    if (!e) throw notFound('Entity not found', 'الجهة غير موجودة');
    const clientId = `ent_${e.code.toLowerCase()}_${crypto.randomBytes(4).toString('hex')}`;
    const clientSecret = crypto.randomBytes(24).toString('base64url');
    db.prepare('UPDATE entity_credentials SET revoked = 1 WHERE entity_id = ?').run(e.id);
    db.prepare('INSERT INTO entity_credentials (entity_id, client_id, secret_hash) VALUES (?,?,?)')
      .run(e.id, clientId, bcrypt.hashSync(clientSecret, 10));
    audit('user', req.user.id, 'entity.credentials.regenerate', { entity_id: e.id, client_id: clientId }, req.ip);
    res.json({ client_id: clientId, client_secret: clientSecret });
  } catch (e2) { next(e2); }
});

export default router;
