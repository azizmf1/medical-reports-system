import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole, getUserScope } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { notifyUser, notifyRole } from '../lib/notify.js';
import { badRequest, notFound, forbidden } from '../lib/errors.js';
import { ROLES, TEMPLATE_STATES } from '../config.js';
import { validateTemplateSchema } from '../lib/formValidation.js';
import { EXAMINEE_SECTION } from '../lib/examinee.js';
import { latestPublishedVersion } from '../services/templates.js';

const router = Router();
router.use(requireAuth);

function versionRow(v) {
  return {
    id: v.id, report_type_id: v.report_type_id, version_no: v.version_no, state: v.state,
    schema: JSON.parse(v.schema_json), settings: JSON.parse(v.settings_json),
    rejection_reason: v.rejection_reason, created_at: v.created_at,
    submitted_at: v.submitted_at, published_at: v.published_at, created_by: v.created_by,
  };
}

// Sharing settings must stay within each entity's enabled channels — validated
// at template save AND again at approval (spec 3.3).
function validateSettings(settings) {
  const out = { sharing: [], validity_days: null, duplicate_prevention: !!settings?.duplicate_prevention };
  if (settings?.validity_days != null && settings.validity_days !== '') {
    const n = Number(settings.validity_days);
    if (!Number.isInteger(n) || n <= 0) throw badRequest('Validity period must be a positive number of days', 'مدة الصلاحية يجب أن تكون عدد أيام موجبًا');
    out.validity_days = n;
  }
  for (const t of settings?.sharing || []) {
    const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(t.entity_id);
    if (!entity) throw badRequest('Sharing target entity not found', 'جهة المشاركة غير موجودة');
    if (!['push', 'pull', 'both'].includes(t.channel)) throw badRequest('Invalid sharing channel', 'قناة مشاركة غير صالحة');
    const needsPush = ['push', 'both'].includes(t.channel);
    const needsPull = ['pull', 'both'].includes(t.channel);
    if ((needsPush && !entity.push_enabled) || (needsPull && !entity.pull_enabled)) {
      throw badRequest(
        `Channel "${t.channel}" is not enabled for entity ${entity.name_en}`,
        `القناة "${t.channel}" غير مفعّلة للجهة ${entity.name_ar}`
      );
    }
    out.sharing.push({ entity_id: entity.id, channel: t.channel });
  }
  return out;
}

// List report types with their versions. Data Entry gets only Published
// versions of types in scope; Builder/Operations get everything.
router.get('/report-types', (req, res) => {
  const types = db.prepare('SELECT * FROM report_types ORDER BY id').all();
  const scope = getUserScope(req.user);
  const result = [];
  for (const t of types) {
    if (scope.reportTypes !== null && !scope.reportTypes.includes(t.id)) continue;
    const versions = db.prepare('SELECT * FROM template_versions WHERE report_type_id = ? ORDER BY version_no').all(t.id);
    const published = versions.filter((v) => v.state === TEMPLATE_STATES.PUBLISHED);
    if (scope.reportTypes !== null && [ROLES.DATA_ENTRY].includes(req.user.role) && !published.length) continue;
    result.push({
      id: t.id, name_en: t.name_en, name_ar: t.name_ar, created_by: t.created_by,
      versions: [ROLES.REPORT_BUILDER, ROLES.OPERATIONS].includes(req.user.role)
        ? versions.map(versionRow)
        : published.map(versionRow),
    });
  }
  res.json({ report_types: result });
});

// Fixed section definition, for the builder preview + form renderer.
router.get('/examinee-section', (req, res) => res.json({ section: EXAMINEE_SECTION }));

router.get('/versions/:id', (req, res, next) => {
  const v = db.prepare('SELECT * FROM template_versions WHERE id = ?').get(req.params.id);
  if (!v) return next(notFound());
  if (![ROLES.REPORT_BUILDER, ROLES.OPERATIONS].includes(req.user.role)) {
    // Data entry may fetch published versions in scope (to render the form)
    const scope = getUserScope(req.user);
    if (v.state !== TEMPLATE_STATES.PUBLISHED || (scope.reportTypes !== null && !scope.reportTypes.includes(v.report_type_id))) {
      return next(forbidden());
    }
  }
  res.json({ version: versionRow(v) });
});

// --- Report Builder actions ---

router.post('/', requireRole(ROLES.REPORT_BUILDER), (req, res, next) => {
  try {
    const { name_en, name_ar, schema, settings } = req.body;
    if (!name_en || !name_ar) throw badRequest('Template name EN and AR are required', 'اسم القالب بالإنجليزية والعربية مطلوب');
    const schemaErrors = validateTemplateSchema(schema);
    if (schemaErrors.length) throw badRequest('Template schema is invalid', 'مخطط القالب غير صالح', { details: schemaErrors });
    const cleanSettings = validateSettings(settings);
    const tx = db.transaction(() => {
      const typeInfo = db.prepare('INSERT INTO report_types (name_en, name_ar, created_by) VALUES (?,?,?)')
        .run(name_en, name_ar, req.user.id);
      const vInfo = db.prepare(
        'INSERT INTO template_versions (report_type_id, version_no, state, schema_json, settings_json, created_by) VALUES (?,?,?,?,?,?)'
      ).run(typeInfo.lastInsertRowid, 1, TEMPLATE_STATES.DRAFT, JSON.stringify(schema), JSON.stringify(cleanSettings), req.user.id);
      return vInfo.lastInsertRowid;
    });
    const versionId = tx();
    audit('user', req.user.id, 'template.create', { version_id: versionId }, req.ip);
    res.status(201).json({ version: versionRow(db.prepare('SELECT * FROM template_versions WHERE id = ?').get(versionId)) });
  } catch (e) { next(e); }
});

router.put('/versions/:id', requireRole(ROLES.REPORT_BUILDER), (req, res, next) => {
  try {
    const v = db.prepare('SELECT * FROM template_versions WHERE id = ?').get(req.params.id);
    if (!v) throw notFound();
    if (![TEMPLATE_STATES.DRAFT, TEMPLATE_STATES.REJECTED].includes(v.state)) {
      throw badRequest('Only Draft or Rejected versions can be edited', 'لا يمكن تعديل سوى النسخ في حالة مسودة أو مرفوضة');
    }
    const { name_en, name_ar, schema, settings } = req.body;
    const schemaErrors = validateTemplateSchema(schema);
    if (schemaErrors.length) throw badRequest('Template schema is invalid', 'مخطط القالب غير صالح', { details: schemaErrors });
    const cleanSettings = validateSettings(settings);
    // Editing a Rejected version moves it back to Draft.
    db.prepare('UPDATE template_versions SET schema_json = ?, settings_json = ?, state = ?, rejection_reason = NULL WHERE id = ?')
      .run(JSON.stringify(schema), JSON.stringify(cleanSettings), TEMPLATE_STATES.DRAFT, v.id);
    if (name_en && name_ar) {
      db.prepare('UPDATE report_types SET name_en = ?, name_ar = ? WHERE id = ?').run(name_en, name_ar, v.report_type_id);
    }
    audit('user', req.user.id, 'template.update', { version_id: v.id }, req.ip);
    res.json({ version: versionRow(db.prepare('SELECT * FROM template_versions WHERE id = ?').get(v.id)) });
  } catch (e) { next(e); }
});

router.post('/versions/:id/submit', requireRole(ROLES.REPORT_BUILDER), (req, res, next) => {
  try {
    const v = db.prepare('SELECT * FROM template_versions WHERE id = ?').get(req.params.id);
    if (!v) throw notFound();
    if (v.state !== TEMPLATE_STATES.DRAFT) throw badRequest('Only Draft versions can be submitted', 'لا يمكن إرسال سوى النسخ في حالة مسودة');
    db.prepare("UPDATE template_versions SET state = ?, submitted_at = datetime('now') WHERE id = ?")
      .run(TEMPLATE_STATES.SUBMITTED, v.id);
    const type = db.prepare('SELECT * FROM report_types WHERE id = ?').get(v.report_type_id);
    notifyRole(ROLES.OPERATIONS, 'template_submitted', { template_en: type.name_en, template_ar: type.name_ar, version: v.version_no });
    audit('user', req.user.id, 'template.submit', { version_id: v.id }, req.ip);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Published templates are immutable — editing creates version N+1 in Draft.
router.post('/report-types/:id/new-version', requireRole(ROLES.REPORT_BUILDER), (req, res, next) => {
  try {
    const published = latestPublishedVersion(req.params.id);
    if (!published) throw badRequest('No published version to base a new version on', 'لا توجد نسخة منشورة لإنشاء نسخة جديدة منها');
    const open = db.prepare(
      'SELECT id FROM template_versions WHERE report_type_id = ? AND state IN (?,?,?)'
    ).get(req.params.id, TEMPLATE_STATES.DRAFT, TEMPLATE_STATES.SUBMITTED, TEMPLATE_STATES.REJECTED);
    if (open) throw badRequest('An unpublished version already exists for this template', 'توجد نسخة غير منشورة لهذا القالب بالفعل');
    const maxNo = db.prepare('SELECT MAX(version_no) AS m FROM template_versions WHERE report_type_id = ?').get(req.params.id).m;
    const info = db.prepare(
      'INSERT INTO template_versions (report_type_id, version_no, state, schema_json, settings_json, created_by) VALUES (?,?,?,?,?,?)'
    ).run(published.report_type_id, maxNo + 1, TEMPLATE_STATES.DRAFT, published.schema_json, published.settings_json, req.user.id);
    audit('user', req.user.id, 'template.new_version', { version_id: info.lastInsertRowid }, req.ip);
    res.status(201).json({ version: versionRow(db.prepare('SELECT * FROM template_versions WHERE id = ?').get(info.lastInsertRowid)) });
  } catch (e) { next(e); }
});

// --- Operations: template approval ---

router.get('/pending', requireRole(ROLES.OPERATIONS), (req, res) => {
  const rows = db.prepare(
    `SELECT v.*, t.name_en, t.name_ar FROM template_versions v JOIN report_types t ON t.id = v.report_type_id
     WHERE v.state = ? ORDER BY v.submitted_at`
  ).all(TEMPLATE_STATES.SUBMITTED);
  res.json({ versions: rows.map((v) => ({ ...versionRow(v), name_en: v.name_en, name_ar: v.name_ar })) });
});

router.post('/versions/:id/approve', requireRole(ROLES.OPERATIONS), (req, res, next) => {
  try {
    const v = db.prepare('SELECT * FROM template_versions WHERE id = ?').get(req.params.id);
    if (!v) throw notFound();
    if (v.state !== TEMPLATE_STATES.SUBMITTED) throw badRequest('Version is not awaiting approval', 'النسخة ليست بانتظار الاعتماد');
    // Re-validate sharing settings against entity channels at approval time.
    validateSettings(JSON.parse(v.settings_json));
    const tx = db.transaction(() => {
      // Publishing V(N+1) automatically retires the previously published version.
      db.prepare('UPDATE template_versions SET state = ? WHERE report_type_id = ? AND state = ?')
        .run(TEMPLATE_STATES.RETIRED, v.report_type_id, TEMPLATE_STATES.PUBLISHED);
      db.prepare("UPDATE template_versions SET state = ?, published_at = datetime('now') WHERE id = ?")
        .run(TEMPLATE_STATES.PUBLISHED, v.id);
    });
    tx();
    const type = db.prepare('SELECT * FROM report_types WHERE id = ?').get(v.report_type_id);
    if (v.created_by) notifyUser(v.created_by, 'template_published', { template_en: type.name_en, template_ar: type.name_ar, version: v.version_no });
    audit('user', req.user.id, 'template.approve', { version_id: v.id }, req.ip);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/versions/:id/reject', requireRole(ROLES.OPERATIONS), (req, res, next) => {
  try {
    const v = db.prepare('SELECT * FROM template_versions WHERE id = ?').get(req.params.id);
    if (!v) throw notFound();
    if (v.state !== TEMPLATE_STATES.SUBMITTED) throw badRequest('Version is not awaiting approval', 'النسخة ليست بانتظار الاعتماد');
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw badRequest('Rejection reason is mandatory', 'سبب الرفض إلزامي');
    db.prepare('UPDATE template_versions SET state = ?, rejection_reason = ? WHERE id = ?')
      .run(TEMPLATE_STATES.REJECTED, reason, v.id);
    const type = db.prepare('SELECT * FROM report_types WHERE id = ?').get(v.report_type_id);
    if (v.created_by) notifyUser(v.created_by, 'template_rejected', { template_en: type.name_en, template_ar: type.name_ar, version: v.version_no, reason });
    audit('user', req.user.id, 'template.reject', { version_id: v.id, reason }, req.ip);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
