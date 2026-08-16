// End-to-end exercise of the Definition of Done flows against a running,
// freshly seeded server (npm run seed && npm run dev). Usage: node scripts/e2e.mjs
const BASE = process.env.BASE_URL || 'http://localhost:4000';

let passed = 0; let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${extra}`); }
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* binary */ }
  return { status: res.status, json };
}

async function login(username) {
  const { status, json } = await api(null, 'POST', '/api/auth/login', { username, password: 'Passw0rd!' });
  if (status !== 200) throw new Error(`login failed for ${username}`);
  return json.token;
}

const goodData = {
  height: 170, weight: 70, blood_pressure: '118/76', pulse: 68,
  lab_results: [{ test_name: 'CBC', result_value: '14', unit: 'g/dL', within_range: true }],
  chest_xray: 'normal', final_result: 'fit',
};

const examinee = (idNumber) => ({
  id_type: 'national_id', id_number: idNumber, full_name_en: 'Test Person', full_name_ar: 'شخص تجريبي',
  dob: '1991-01-01', gender: 'male', nationality: 'SA', phone: '0500000000',
});

const t = {};
for (const u of ['dataentry', 'checker', 'sysmanager', 'sysadmin', 'builder', 'operations']) {
  t[u] = await login(u);
}
console.log('\n== Auth ==');
check('all six roles can log in', true);

// ---------------- Template lifecycle ----------------
console.log('\n== Template lifecycle (Builder → Operations) ==');
const entities = (await api(t.operations, 'GET', '/api/entities')).json.entities;
const pushEntity = entities.find((e) => e.code === 'SIM-PUSH');
const pullEntity = entities.find((e) => e.code === 'MOH-PULL');

const badShare = await api(t.builder, 'POST', '/api/templates', {
  name_en: 'X', name_ar: 'س',
  schema: { sections: [{ id: 's1', title_en: 'S', title_ar: 'ق', fields: [{ key: 'f1', type: 'text', label_en: 'F', label_ar: 'ح' }] }] },
  settings: { sharing: [{ entity_id: pullEntity.id, channel: 'push' }] },
});
check('sharing channel outside entity enabled channels is rejected', badShare.status === 400);

const tpl = await api(t.builder, 'POST', '/api/templates', {
  name_en: 'Food Handler Examination', name_ar: 'فحص متداولي الأغذية',
  schema: {
    sections: [{
      id: 'sec1', title_en: 'Screening', title_ar: 'الفحص',
      fields: [
        { key: 'temp', type: 'number', label_en: 'Temperature', label_ar: 'الحرارة', required: true, min: 30, max: 45 },
        {
          key: 'fit_food', type: 'radio', label_en: 'Fit for food handling', label_ar: 'لائق لتداول الأغذية', required: true,
          options: [
            { value: 'yes', label_en: 'Yes', label_ar: 'نعم' },
            { value: 'no', label_en: 'No', label_ar: 'لا' },
          ],
        },
        {
          key: 'no_reason', type: 'text', label_en: 'Reason', label_ar: 'السبب', required: true,
          condition: { field: 'fit_food', op: 'eq', value: 'no' },
        },
      ],
    }],
  },
  settings: { sharing: [{ entity_id: pushEntity.id, channel: 'push' }], validity_days: 30, duplicate_prevention: true },
});
check('builder creates template draft', tpl.status === 201, JSON.stringify(tpl.json));
const verId = tpl.json.version.id;
const typeId = tpl.json.version.report_type_id;

check('data entry cannot create templates', (await api(t.dataentry, 'POST', '/api/templates', {})).status === 403);
check('submit for approval', (await api(t.builder, 'POST', `/api/templates/versions/${verId}/submit`)).status === 200);
check('operations sees pending template', (await api(t.operations, 'GET', '/api/templates/pending')).json.versions.some((v) => v.id === verId));
const rej = await api(t.operations, 'POST', `/api/templates/versions/${verId}/reject`, { reason: 'Add more fields' });
check('operations rejects with reason', rej.status === 200);
const reEdit = await api(t.builder, 'PUT', `/api/templates/versions/${verId}`, {
  name_en: 'Food Handler Examination', name_ar: 'فحص متداولي الأغذية',
  schema: tpl.json.version.schema, settings: tpl.json.version.settings,
});
check('editing rejected version moves it back to draft', reEdit.status === 200 && reEdit.json.version.state === 'draft');
await api(t.builder, 'POST', `/api/templates/versions/${verId}/submit`);
check('operations approves → published', (await api(t.operations, 'POST', `/api/templates/versions/${verId}/approve`)).status === 200);

// Give dataentry/checker/sysadmin scope over the new type.
const usersList = (await api(t.operations, 'GET', '/api/users')).json.users;
for (const uname of ['dataentry', 'checker', 'sysadmin']) {
  const u = usersList.find((x) => x.username === uname);
  const upd = await api(t.operations, 'PUT', `/api/users/${u.id}`, {
    full_name_en: u.full_name_en, full_name_ar: u.full_name_ar, role: u.role, active: true,
    report_type_ids: [...u.report_type_ids, typeId], facility_ids: u.facility_ids,
  });
  check(`operations extends ${uname} scope to new type`, upd.status === 200);
}

// ---------------- Report happy path ----------------
console.log('\n== Report happy path ==');
const facilities = (await api(t.dataentry, 'GET', '/api/facilities')).json.facilities;
check('data entry sees only in-scope facilities', facilities.length === 2);
const fac = facilities[0];

const create = await api(t.dataentry, 'POST', '/api/reports', {
  report_type_id: typeId, facility_id: fac.id, examinee: examinee('1099999999'),
  data: { temp: 36.6 },
});
check('data entry creates draft', create.status === 201, JSON.stringify(create.json));
const rid = create.json.report.id;
check('draft has no report number yet', create.json.report.report_number === null);

const badSubmit = await api(t.dataentry, 'POST', `/api/reports/${rid}/submit`);
check('submit blocked while mandatory fields missing', badSubmit.status === 400);

await api(t.dataentry, 'PUT', `/api/reports/${rid}`, { data: { temp: 36.6, fit_food: 'yes' } });
const submit = await api(t.dataentry, 'POST', `/api/reports/${rid}/submit`);
check('submit succeeds with full data', submit.status === 200);
const rptNo = submit.json.report.report_number;
check('report number assigned at first submission', /^RPT-\d{4}-\d{6}$/.test(rptNo || ''), rptNo);

check('creator cannot edit a submitted report', (await api(t.dataentry, 'PUT', `/api/reports/${rid}`, { data: { temp: 37 } })).status === 400);

const claim = await api(t.checker, 'POST', `/api/reports/${rid}/claim`);
check('checker claims → under review', claim.status === 200 && claim.json.report.state === 'under_review');
check('decision without remarks is rejected on return', (await api(t.checker, 'POST', `/api/reports/${rid}/return`, {})).status === 400);
const ret = await api(t.checker, 'POST', `/api/reports/${rid}/return`, { remarks: 'Temperature seems off — please re-check' });
check('checker returns with remarks', ret.status === 200 && ret.json.report.state === 'returned');

await api(t.dataentry, 'PUT', `/api/reports/${rid}`, { data: { temp: 36.8, fit_food: 'yes' } });
await api(t.dataentry, 'POST', `/api/reports/${rid}/submit`);
await api(t.checker, 'POST', `/api/reports/${rid}/claim`);
const approve = await api(t.checker, 'POST', `/api/reports/${rid}/approve`);
check('checker approves', approve.status === 200 && approve.json.report.state === 'approved');
check('expiry date set from validity period', !!approve.json.report.expiry_date);
check('PDF generated on approval', approve.json.pdf_generated === true);

const detail = (await api(t.dataentry, 'GET', `/api/reports/${rid}`)).json.report;
check('approved report is read-only (no edit)', (await api(t.dataentry, 'PUT', `/api/reports/${rid}`, { data: {} })).status === 400);
check('audit trail recorded', detail.history.length >= 6);

// Duplicate prevention: same examinee, same type, active approved report.
const dup = await api(t.dataentry, 'POST', '/api/reports', {
  report_type_id: typeId, facility_id: fac.id, examinee: examinee('1099999999'), data: {},
});
check('duplicate prevention blocks and names blocking report',
  dup.status === 400 && dup.json.error.blocking_report_number === rptNo, JSON.stringify(dup.json));

// Push delivered to simulator
const sim = (await api(null, 'GET', '/api/simulator/messages')).json.messages;
const pushed = sim.find((m) => m.body?.report?.report_number === rptNo && m.body?.event === 'report.approved');
check('simulator received report.approved push with secret header',
  !!pushed && pushed.headers['x-webhook-secret'] === 'sim-secret-123');

// Share log
const slog = (await api(t.operations, 'GET', '/api/share-log')).json.log;
check('share log records the push', slog.some((l) => l.report_number === rptNo && l.status === 'success'));

// Public verification
const verify = (await api(null, 'GET', `/api/public/verify/${rptNo}?h=${detail.verification_hash}`)).json;
check('public verification shows Valid', verify.result === 'Valid', JSON.stringify(verify));
check('verification masks examinee ID', /^\d\*+\d{2}$/.test(verify.examinee_id_masked || ''), verify.examinee_id_masked);
const badVerify = (await api(null, 'GET', `/api/public/verify/${rptNo}?h=deadbeef`)).json;
check('wrong hash → Invalid hash', badVerify.result === 'Invalid hash');

// ---------------- Inquiry API (Pull) ----------------
console.log('\n== Inquiry API ==');
const basic = Buffer.from('ent_moh_pull_demo:pull-demo-secret-12345').toString('base64');
const pull = await fetch(`${BASE}/api/external/v1/reports?reportNumber=RPT-${new Date().getFullYear()}-000004`, {
  headers: { Authorization: `Basic ${basic}` },
});
const pullJson = await pull.json();
check('pull entity retrieves seeded approved report', pull.status === 200 && pullJson.validity_status === 'Valid', JSON.stringify(pullJson).slice(0, 200));
check('pull response carries bilingual field labels', JSON.stringify(pullJson).includes('label_ar'));

const pullNew = await fetch(`${BASE}/api/external/v1/reports?reportNumber=${rptNo}`, { headers: { Authorization: `Basic ${basic}` } });
check('report of a type NOT pull-shared with entity → 404', pullNew.status === 404);

const badAuth = await fetch(`${BASE}/api/external/v1/reports?reportNumber=${rptNo}`, { headers: { Authorization: 'Basic aaa' } });
check('invalid credentials → 401', badAuth.status === 401);

const expiredNo = `RPT-${new Date().getFullYear()}-000006`;
const pullExpired = await (await fetch(`${BASE}/api/external/v1/reports?reportNumber=${expiredNo}`, { headers: { Authorization: `Basic ${basic}` } })).json();
check('expired report shows Expired in Inquiry API', pullExpired.validity_status === 'Expired', JSON.stringify(pullExpired).slice(0, 150));

const byId = await (await fetch(`${BASE}/api/external/v1/reports?idType=national_id&idNumber=1034567890`, { headers: { Authorization: `Basic ${basic}` } })).json();
check('inquiry by examinee ID returns reports', byId.count >= 1);

// ---------------- Reject / Cancel paths ----------------
console.log('\n== Exception paths ==');
const create2 = await api(t.dataentry, 'POST', '/api/reports', {
  report_type_id: typeId, facility_id: fac.id, examinee: examinee('1088888888'),
  data: { temp: 36.5, fit_food: 'no', no_reason: 'High risk finding' },
});
const rid2 = create2.json.report.id;
await api(t.dataentry, 'POST', `/api/reports/${rid2}/submit`);
await api(t.checker, 'POST', `/api/reports/${rid2}/claim`);
const reject = await api(t.checker, 'POST', `/api/reports/${rid2}/reject`, { reason: 'Fraudulent document' });
check('checker rejects (terminal)', reject.status === 200 && reject.json.report.state === 'rejected');
const afterReject = await api(t.dataentry, 'POST', '/api/reports', {
  report_type_id: typeId, facility_id: fac.id, examinee: examinee('1088888888'), data: {},
});
check('rejected report does not block duplicates', afterReject.status === 201);

check('checker cannot cancel approved report', (await api(t.checker, 'POST', `/api/reports/${rid}/cancel`, { reason: 'x' })).status === 403);
check('cancel without reason rejected', (await api(t.sysadmin, 'POST', `/api/reports/${rid}/cancel`, {})).status === 400);
const cancel = await api(t.sysadmin, 'POST', `/api/reports/${rid}/cancel`, { reason: 'Issued in error' });
check('sys admin manager cancels approved report', cancel.status === 200 && cancel.json.report.state === 'cancelled');

const sim2 = (await api(null, 'GET', '/api/simulator/messages')).json.messages;
check('simulator received report.cancelled push',
  sim2.some((m) => m.body?.report?.report_number === rptNo && m.body?.event === 'report.cancelled'));
const verify2 = (await api(null, 'GET', `/api/public/verify/${rptNo}?h=${detail.verification_hash}`)).json;
check('verification page shows Cancelled', verify2.result === 'Cancelled');
const afterCancel = await api(t.dataentry, 'POST', '/api/reports', {
  report_type_id: typeId, facility_id: fac.id, examinee: examinee('1099999999'), data: {},
});
check('cancelled report stops blocking duplicates', afterCancel.status === 201);

// ---------------- Scope enforcement ----------------
console.log('\n== Scope enforcement ==');
const mk = await api(t.operations, 'POST', '/api/users', {
  username: 'limited', password: 'Passw0rd!', full_name_en: 'Limited User', full_name_ar: 'مستخدم محدود',
  role: 'data_entry', report_type_ids: [typeId], facility_ids: [],
});
check('operations creates scoped user', mk.status === 201);
const tLimited = await login('limited');
const limList = (await api(tLimited, 'GET', '/api/reports')).json.reports;
check('user with no facility scope sees zero reports', limList.length === 0);
check('direct report ID access outside scope → 403', (await api(tLimited, 'GET', `/api/reports/${rid}`)).status === 403);
check('data entry cannot read another creator\'s report', (await api(tLimited, 'GET', '/api/reports/1')).status === 403);
check('report builder has no report access', (await api(t.builder, 'GET', `/api/reports/${rid}`)).status === 403);
check('dashboard denied to data entry', (await api(t.dataentry, 'GET', '/api/dashboard')).status === 403);
const dash = await api(t.sysadmin, 'GET', '/api/dashboard');
check('sys admin manager dashboard works', dash.status === 200 && dash.json.total > 0);
check('operations cannot browse reports', (await api(t.operations, 'GET', `/api/reports/${rid}`)).status === 403);

// Notifications
console.log('\n== Notifications ==');
const notifDE = (await api(t.dataentry, 'GET', '/api/notifications')).json;
check('creator notified (returned/approved/rejected/cancelled)',
  ['report_returned', 'report_approved', 'report_rejected', 'report_cancelled']
    .every((type) => notifDE.notifications.some((n) => n.type === type)));
const notifB = (await api(t.builder, 'GET', '/api/notifications')).json;
check('builder notified of publish + reject', ['template_published', 'template_rejected'].every((type) => notifB.notifications.some((n) => n.type === type)));
const notifC = (await api(t.checker, 'GET', '/api/notifications')).json;
check('checkers in scope notified of submissions', notifC.notifications.some((n) => n.type === 'report_submitted'));
const notifO = (await api(t.operations, 'GET', '/api/notifications')).json;
check('operations notified of template submission', notifO.notifications.some((n) => n.type === 'template_submitted'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
