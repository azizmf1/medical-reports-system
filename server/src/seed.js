// Seed data per spec §6 — documented in SEED.md. Run: npm run seed
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { verificationHash } from './services/verification.js';

const PASSWORD = 'Passw0rd!';
const hash = bcrypt.hashSync(PASSWORD, 10);

const wipe = [
  'simulator_messages', 'notifications', 'audit_log', 'share_log', 'report_shares',
  'report_state_history', 'reports', 'report_number_seq', 'user_report_type_scope',
  'user_facility_scope', 'entity_pull_scope', 'entity_credentials', 'template_versions',
  'report_types', 'entities', 'facilities', 'users',
];
for (const t of wipe) db.prepare(`DELETE FROM ${t}`).run();

// ---- Users (one per role — BR-R1) ----
const insertUser = db.prepare('INSERT INTO users (username, password_hash, full_name_en, full_name_ar, role) VALUES (?,?,?,?,?)');
const users = {
  dataentry: insertUser.run('dataentry', hash, 'Dana Entry', 'دانة المدخل', 'data_entry').lastInsertRowid,
  checker: insertUser.run('checker', hash, 'Khalid Checker', 'خالد المدقق', 'checker').lastInsertRowid,
  sysmanager: insertUser.run('sysmanager', hash, 'Sara Manager', 'سارة المدير', 'system_manager').lastInsertRowid,
  sysadmin: insertUser.run('sysadmin', hash, 'Adel Admin', 'عادل مدير الإدارة', 'sys_admin_manager').lastInsertRowid,
  builder: insertUser.run('builder', hash, 'Bandar Builder', 'بندر الباني', 'report_builder').lastInsertRowid,
  operations: insertUser.run('operations', hash, 'Omar Operations', 'عمر العمليات', 'operations').lastInsertRowid,
};

// ---- Facilities ----
const insertFacility = db.prepare('INSERT INTO facilities (code, name_en, name_ar, city, status) VALUES (?,?,?,?,?)');
const fac1 = insertFacility.run('RYD01', 'Riyadh Central Medical Center', 'مركز الرياض الطبي المركزي', 'Riyadh', 'active').lastInsertRowid;
const fac2 = insertFacility.run('JED01', 'Jeddah Occupational Health Clinic', 'عيادة جدة للصحة المهنية', 'Jeddah', 'active').lastInsertRowid;
const fac3 = insertFacility.run('DMM01', 'Dammam Medical Complex', 'مجمع الدمام الطبي', 'Dammam', 'active').lastInsertRowid;

// ---- Entities ----
const ent1 = db.prepare(
  'INSERT INTO entities (code, name_en, name_ar, status, push_enabled, pull_enabled, push_url, push_secret) VALUES (?,?,?,?,?,?,?,?)'
).run('SIM-PUSH', 'Simulator Push Entity', 'جهة الدفع التجريبية', 'active', 1, 0,
  'http://localhost:4000/api/simulator/webhook', 'sim-secret-123').lastInsertRowid;
const ent2 = db.prepare(
  'INSERT INTO entities (code, name_en, name_ar, status, push_enabled, pull_enabled, push_url, push_secret) VALUES (?,?,?,?,?,?,?,?)'
).run('MOH-PULL', 'Ministry Inquiry Entity', 'جهة الاستعلام الوزارية', 'active', 0, 1, null, null).lastInsertRowid;

// Pull credentials (documented in SEED.md; secret stored hashed).
const PULL_CLIENT_ID = 'ent_moh_pull_demo';
const PULL_CLIENT_SECRET = 'pull-demo-secret-12345';
db.prepare('INSERT INTO entity_credentials (entity_id, client_id, secret_hash) VALUES (?,?,?)')
  .run(ent2, PULL_CLIENT_ID, bcrypt.hashSync(PULL_CLIENT_SECRET, 10));

// ---- Templates ----
const medicalSections = [
  {
    id: 'sec_general', title_en: 'General Examination', title_ar: 'الفحص العام',
    fields: [
      { key: 'height', type: 'number', label_en: 'Height (cm)', label_ar: 'الطول (سم)', required: true, min: 50, max: 250 },
      { key: 'weight', type: 'number', label_en: 'Weight (kg)', label_ar: 'الوزن (كجم)', required: true, min: 20, max: 350 },
      {
        key: 'blood_pressure', type: 'text', label_en: 'Blood Pressure', label_ar: 'ضغط الدم', required: true,
        regex: '^\\d{2,3}/\\d{2,3}$', regexMessageEn: 'Use format 120/80', regexMessageAr: 'استخدم الصيغة 120/80', maxLength: 7,
      },
      { key: 'pulse', type: 'number', label_en: 'Pulse (bpm)', label_ar: 'النبض (نبضة/دقيقة)', required: true, min: 30, max: 220 },
    ],
  },
  {
    id: 'sec_lab', title_en: 'Laboratory Results', title_ar: 'نتائج المختبر',
    fields: [
      {
        key: 'lab_results', type: 'table', label_en: 'Lab Tests', label_ar: 'الفحوصات المخبرية', required: true,
        columns: [
          { key: 'test_name', type: 'text', label_en: 'Test', label_ar: 'الفحص', required: true, maxLength: 80 },
          { key: 'result_value', type: 'text', label_en: 'Result', label_ar: 'النتيجة', required: true, maxLength: 40 },
          { key: 'unit', type: 'text', label_en: 'Unit', label_ar: 'الوحدة', required: false, maxLength: 20 },
          { key: 'within_range', type: 'boolean', label_en: 'Within Normal Range', label_ar: 'ضمن المعدل الطبيعي', required: false },
        ],
      },
    ],
  },
  {
    id: 'sec_radiology', title_en: 'Radiology', title_ar: 'الأشعة',
    fields: [
      {
        key: 'chest_xray', type: 'dropdown', label_en: 'Chest X-Ray', label_ar: 'أشعة الصدر', required: true,
        options: [
          { value: 'normal', label_en: 'Normal', label_ar: 'سليمة' },
          { value: 'abnormal', label_en: 'Abnormal', label_ar: 'غير سليمة' },
        ],
      },
      {
        key: 'radiology_notes', type: 'textarea', label_en: 'Radiology Notes', label_ar: 'ملاحظات الأشعة', required: true,
        maxLength: 500, condition: { field: 'chest_xray', op: 'eq', value: 'abnormal' },
      },
    ],
  },
  {
    id: 'sec_final', title_en: 'Final Result', title_ar: 'النتيجة النهائية',
    fields: [
      {
        key: 'final_result', type: 'dropdown', label_en: 'Final Result', label_ar: 'النتيجة النهائية', required: true,
        options: [
          { value: 'fit', label_en: 'Fit', label_ar: 'لائق' },
          { value: 'unfit', label_en: 'Unfit', label_ar: 'غير لائق' },
        ],
      },
      {
        key: 'unfit_reason', type: 'text', label_en: 'Unfit Reason', label_ar: 'سبب عدم اللياقة', required: true,
        maxLength: 200, condition: { field: 'final_result', op: 'eq', value: 'unfit' },
      },
    ],
  },
];

const type1 = db.prepare('INSERT INTO report_types (name_en, name_ar, created_by) VALUES (?,?,?)')
  .run('Pre-Employment Medical Examination', 'الفحص الطبي لما قبل التوظيف', users.builder).lastInsertRowid;
const type2 = db.prepare('INSERT INTO report_types (name_en, name_ar, created_by) VALUES (?,?,?)')
  .run('Periodic Fitness Examination', 'فحص اللياقة الدوري', users.builder).lastInsertRowid;

const insertVersion = db.prepare(
  `INSERT INTO template_versions (report_type_id, version_no, state, schema_json, settings_json, created_by, submitted_at, published_at)
   VALUES (?,?,?,?,?,?,datetime('now','-30 days'),datetime('now','-29 days'))`
);
// Template 1: validity 90 days + duplicate prevention ON + shared Push (entity 1) and Pull (entity 2).
const ver1 = insertVersion.run(type1, 1, 'published', JSON.stringify({ sections: medicalSections }),
  JSON.stringify({
    sharing: [{ entity_id: ent1, channel: 'push' }, { entity_id: ent2, channel: 'pull' }],
    validity_days: 90, duplicate_prevention: true,
  }), users.builder).lastInsertRowid;
// Template 2: no validity, duplicate prevention OFF, internal only (BR-T6).
const ver2 = insertVersion.run(type2, 1, 'published', JSON.stringify({ sections: medicalSections }),
  JSON.stringify({ sharing: [], validity_days: null, duplicate_prevention: false }), users.builder).lastInsertRowid;

db.prepare('INSERT INTO entity_pull_scope (entity_id, report_type_id) VALUES (?,?)').run(ent2, type1);
db.prepare('INSERT INTO entity_pull_scope (entity_id, report_type_id) VALUES (?,?)').run(ent2, type2);

// ---- User scopes (facility 3 deliberately unassigned to demo scope enforcement) ----
const addTypeScope = db.prepare('INSERT INTO user_report_type_scope (user_id, report_type_id) VALUES (?,?)');
const addFacScope = db.prepare('INSERT INTO user_facility_scope (user_id, facility_id) VALUES (?,?)');
for (const uid of [users.dataentry, users.checker, users.sysmanager, users.sysadmin]) {
  addTypeScope.run(uid, type1);
  addTypeScope.run(uid, type2);
}
for (const uid of [users.dataentry, users.checker, users.sysmanager]) {
  addFacScope.run(uid, fac1);
  addFacScope.run(uid, fac2);
}
// sysadmin: facilities implicit ALL — no rows needed.

// ---- Sample reports ----
const goodData = {
  height: 175, weight: 78, blood_pressure: '120/80', pulse: 72,
  lab_results: [
    { test_name: 'CBC', result_value: '13.5', unit: 'g/dL', within_range: true },
    { test_name: 'Fasting Glucose', result_value: '92', unit: 'mg/dL', within_range: true },
  ],
  chest_xray: 'normal',
  final_result: 'fit',
};
const unfitData = { ...goodData, chest_xray: 'abnormal', radiology_notes: 'Opacity in right lower lobe', final_result: 'unfit', unfit_reason: 'Active pulmonary finding' };

const insertReport = db.prepare(
  `INSERT INTO reports (report_number, report_type_id, template_version_id, facility_id,
    examinee_id_type, examinee_id_number, examinee_name_en, examinee_name_ar, examinee_dob,
    examinee_gender, examinee_nationality, examinee_phone, data_json, state, expiry_date,
    verification_hash, created_by, approved_by, approved_at, cancel_reason, cancelled_by, cancelled_at, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
);
const hist = db.prepare(
  "INSERT INTO report_state_history (report_id, from_state, to_state, actor_id, remarks, created_at) VALUES (?,?,?,?,?,?)"
);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().replace('T', ' ').slice(0, 19);
const dateDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const dateIn = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

let seq = 0;
const year = new Date().getFullYear();
const nextNo = () => `RPT-${year}-${String(++seq).padStart(6, '0')}`;

// 1. Draft (no report number yet)
const r1 = insertReport.run(null, type1, ver1, fac1,
  'national_id', '1012345678', 'Ahmed Ali Hassan', 'أحمد علي حسن', '1990-04-12', 'male', 'SA', '0501111111',
  JSON.stringify({ height: 180, weight: 82 }), 'draft', null, null, users.dataentry,
  null, null, null, null, null, daysAgo(2), daysAgo(2)).lastInsertRowid;
hist.run(r1, null, 'draft', users.dataentry, null, daysAgo(2));

// 2. Submitted
const no2 = nextNo();
const r2 = insertReport.run(no2, type2, ver2, fac1,
  'iqama', '2098765432', 'Mohammed Karim', 'محمد كريم', '1985-09-01', 'male', 'EG', '0502222222',
  JSON.stringify(goodData), 'submitted', null, null, users.dataentry,
  null, null, null, null, null, daysAgo(1), daysAgo(1)).lastInsertRowid;
hist.run(r2, null, 'draft', users.dataentry, null, daysAgo(1));
hist.run(r2, 'draft', 'submitted', users.dataentry, null, daysAgo(1));

// 3. Returned for Correction
const no3 = nextNo();
const r3 = insertReport.run(no3, type1, ver1, fac2,
  'national_id', '1023456789', 'Faisal Saad', 'فيصل سعد', '1992-02-20', 'male', 'SA', null,
  JSON.stringify({ ...goodData, blood_pressure: '125/82' }), 'returned', null, null, users.dataentry,
  null, null, null, null, null, daysAgo(3), daysAgo(1)).lastInsertRowid;
hist.run(r3, null, 'draft', users.dataentry, null, daysAgo(3));
hist.run(r3, 'draft', 'submitted', users.dataentry, null, daysAgo(3));
hist.run(r3, 'submitted', 'under_review', users.checker, null, daysAgo(2));
hist.run(r3, 'under_review', 'returned', users.checker, 'Please attach the missing lab results / يرجى إرفاق نتائج المختبر الناقصة', daysAgo(1));

// 4. Rejected (terminal)
const no4 = nextNo();
const r4 = insertReport.run(no4, type2, ver2, fac2,
  'passport', 'P8877665', 'John Peterson', 'جون بيترسون', '1979-11-30', 'male', 'PH', null,
  JSON.stringify(unfitData), 'rejected', null, null, users.dataentry,
  null, null, null, null, null, daysAgo(6), daysAgo(4)).lastInsertRowid;
hist.run(r4, null, 'draft', users.dataentry, null, daysAgo(6));
hist.run(r4, 'draft', 'submitted', users.dataentry, null, daysAgo(5));
hist.run(r4, 'submitted', 'under_review', users.checker, null, daysAgo(4));
hist.run(r4, 'under_review', 'rejected', users.checker, 'Duplicate submission created by mistake / تقرير مكرر أُنشئ بالخطأ', daysAgo(4));

// 5. Approved + shared (push to entity 1 succeeded, pull-visible to entity 2)
const no5 = nextNo();
const r5 = insertReport.run(no5, type1, ver1, fac1,
  'national_id', '1034567890', 'Noura Abdullah', 'نورة عبدالله', '1995-06-15', 'female', 'SA', '0503333333',
  JSON.stringify(goodData), 'approved', dateIn(85), verificationHash(no5), users.dataentry,
  users.checker, daysAgo(5), null, null, null, daysAgo(8), daysAgo(5)).lastInsertRowid;
hist.run(r5, null, 'draft', users.dataentry, null, daysAgo(8));
hist.run(r5, 'draft', 'submitted', users.dataentry, null, daysAgo(7));
hist.run(r5, 'submitted', 'under_review', users.checker, null, daysAgo(6));
hist.run(r5, 'under_review', 'approved', users.checker, null, daysAgo(5));
db.prepare("INSERT INTO report_shares (report_id, entity_id, event) VALUES (?,?, 'report.approved')").run(r5, ent1);
db.prepare("INSERT INTO share_log (report_id, entity_id, channel, event, status, attempts, created_at) VALUES (?,?,'push','report.approved','success',1,?)")
  .run(r5, ent1, daysAgo(5));

// 6. Cancelled (was approved and pushed; cancellation push logged)
const no6 = nextNo();
const r6 = insertReport.run(no6, type1, ver1, fac2,
  'iqama', '2011122334', 'Hassan Mahmoud', 'حسن محمود', '1988-01-25', 'male', 'SD', null,
  JSON.stringify(goodData), 'cancelled', dateIn(70), verificationHash(no6), users.dataentry,
  users.checker, daysAgo(20), 'Issued for the wrong examinee / صدر لمفحوص خاطئ', users.sysadmin, daysAgo(2), daysAgo(22), daysAgo(2)).lastInsertRowid;
hist.run(r6, null, 'draft', users.dataentry, null, daysAgo(22));
hist.run(r6, 'draft', 'submitted', users.dataentry, null, daysAgo(21));
hist.run(r6, 'submitted', 'under_review', users.checker, null, daysAgo(20));
hist.run(r6, 'under_review', 'approved', users.checker, null, daysAgo(20));
hist.run(r6, 'approved', 'cancelled', users.sysadmin, 'Issued for the wrong examinee / صدر لمفحوص خاطئ', daysAgo(2));
db.prepare("INSERT INTO report_shares (report_id, entity_id, event) VALUES (?,?, 'report.approved')").run(r6, ent1);
db.prepare("INSERT INTO share_log (report_id, entity_id, channel, event, status, attempts, created_at) VALUES (?,?,'push','report.approved','success',1,?)")
  .run(r6, ent1, daysAgo(20));
db.prepare("INSERT INTO share_log (report_id, entity_id, channel, event, status, attempts, created_at) VALUES (?,?,'push','report.cancelled','success',1,?)")
  .run(r6, ent1, daysAgo(2));

// 7. Approved but EXPIRED (approved 100 days ago with 90-day validity)
const no7 = nextNo();
const r7 = insertReport.run(no7, type1, ver1, fac1,
  'national_id', '1045678901', 'Salem Nasser', 'سالم ناصر', '1983-07-07', 'male', 'YE', null,
  JSON.stringify(goodData), 'approved', dateDaysAgo(10), verificationHash(no7), users.dataentry,
  users.checker, daysAgo(100), null, null, null, daysAgo(103), daysAgo(100)).lastInsertRowid;
hist.run(r7, null, 'draft', users.dataentry, null, daysAgo(103));
hist.run(r7, 'draft', 'submitted', users.dataentry, null, daysAgo(102));
hist.run(r7, 'submitted', 'under_review', users.checker, null, daysAgo(101));
hist.run(r7, 'under_review', 'approved', users.checker, null, daysAgo(100));
db.prepare("INSERT INTO report_shares (report_id, entity_id, event) VALUES (?,?, 'report.approved')").run(r7, ent1);
db.prepare("INSERT INTO share_log (report_id, entity_id, channel, event, status, attempts, created_at) VALUES (?,?,'push','report.approved','success',1,?)")
  .run(r7, ent1, daysAgo(100));

db.prepare('INSERT INTO report_number_seq (year, seq) VALUES (?,?)').run(year, seq);

console.log('Seed complete.');
console.log(`Users (password for all: ${PASSWORD}): dataentry, checker, sysmanager, sysadmin, builder, operations`);
console.log(`Pull credentials for MOH-PULL: client_id=${PULL_CLIENT_ID} client_secret=${PULL_CLIENT_SECRET}`);
