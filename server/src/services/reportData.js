import { db } from '../db.js';
import { EXAMINEE_SECTION } from '../lib/examinee.js';
import { isFieldVisible } from '../lib/formValidation.js';
import { validityStatus } from './templates.js';
import { verificationHash } from './verification.js';
import { PUBLIC_BASE_URL } from '../config.js';

export function getReportSchema(report) {
  const version = db.prepare('SELECT * FROM template_versions WHERE id = ?').get(report.template_version_id);
  return JSON.parse(version.schema_json);
}

export function examineeValues(report) {
  return {
    id_type: report.examinee_id_type,
    id_number: report.examinee_id_number,
    full_name_en: report.examinee_name_en,
    full_name_ar: report.examinee_name_ar,
    dob: report.examinee_dob,
    gender: report.examinee_gender,
    nationality: report.examinee_nationality,
    phone: report.examinee_phone,
  };
}

function optionLabels(field, value) {
  const find = (v) => (field.options || []).find((o) => String(o.value) === String(v));
  if (Array.isArray(value)) {
    const found = value.map(find).filter(Boolean);
    return { en: found.map((o) => o.label_en).join(', '), ar: found.map((o) => o.label_ar).join('، ') };
  }
  const o = find(value);
  return o ? { en: o.label_en, ar: o.label_ar } : { en: String(value ?? ''), ar: String(value ?? '') };
}

function renderField(field, values) {
  const value = values[field.key];
  const out = {
    key: field.key,
    type: field.type,
    label_en: field.label_en,
    label_ar: field.label_ar,
    value: value ?? null,
    visible: isFieldVisible(field, values),
  };
  if (['dropdown', 'radio', 'checkbox'].includes(field.type) && value != null && value !== '') {
    const labels = optionLabels(field, value);
    out.display_en = labels.en;
    out.display_ar = labels.ar;
  } else if (field.type === 'boolean') {
    out.display_en = value === true || value === 'true' ? 'Yes' : 'No';
    out.display_ar = value === true || value === 'true' ? 'نعم' : 'لا';
  } else if (field.type === 'table' && Array.isArray(value)) {
    out.columns = (field.columns || []).map((c) => ({ key: c.key, label_en: c.label_en, label_ar: c.label_ar }));
    out.rows = value.map((row) => (field.columns || []).map((c) => renderField(c, row || {})));
  }
  return out;
}

// Full field data (keys with EN/AR labels) — used by the Push payload, the
// Inquiry API response, and PDF rendering. Includes the fixed examinee section.
export function renderReportSections(report) {
  const schema = getReportSchema(report);
  const values = JSON.parse(report.data_json || '{}');
  const sections = [];
  const exValues = examineeValues(report);
  sections.push({
    title_en: EXAMINEE_SECTION.title_en,
    title_ar: EXAMINEE_SECTION.title_ar,
    fields: EXAMINEE_SECTION.fields.map((f) => renderField(f, exValues)),
  });
  for (const s of schema.sections || []) {
    sections.push({
      title_en: s.title_en,
      title_ar: s.title_ar,
      fields: (s.fields || []).map((f) => renderField(f, values)),
    });
  }
  return sections;
}

export function reportMeta(report) {
  const type = db.prepare('SELECT * FROM report_types WHERE id = ?').get(report.report_type_id);
  const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(report.facility_id);
  const version = db.prepare('SELECT version_no FROM template_versions WHERE id = ?').get(report.template_version_id);
  return {
    report_number: report.report_number,
    report_type: { id: type.id, name_en: type.name_en, name_ar: type.name_ar },
    template_version: version.version_no,
    facility: { code: facility.code, name_en: facility.name_en, name_ar: facility.name_ar },
    state: report.state,
    approved_at: report.approved_at,
    expiry_date: report.expiry_date,
    validity_status: validityStatus(report),
  };
}

export function pdfDownloadUrl(report) {
  return `${PUBLIC_BASE_URL}/api/public/reports/${report.report_number}/pdf?h=${verificationHash(report.report_number)}`;
}

// Payload POSTed to entity webhooks and returned by the Inquiry API.
export function buildReportPayload(report, event) {
  return {
    event,
    sent_at: new Date().toISOString(),
    report: {
      ...reportMeta(report),
      examinee: examineeValues(report),
      sections: renderReportSections(report),
      pdf_url: pdfDownloadUrl(report),
      ...(report.state === 'cancelled' ? { cancel_reason: report.cancel_reason, cancelled_at: report.cancelled_at } : {}),
    },
  };
}
