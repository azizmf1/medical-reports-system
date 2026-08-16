// Server-side validation of report data against a template schema, mirroring
// the client-side rules: mandatory, type checks, min/max, length, regex,
// option membership, repeating-table columns, and conditional visibility
// (a hidden field is never required and its value is ignored).

export const FIELD_TYPES = [
  'text', 'textarea', 'number', 'date', 'time', 'dropdown', 'radio',
  'checkbox', 'boolean', 'file', 'table',
];

function isEmpty(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export function isFieldVisible(field, values) {
  const c = field.condition;
  if (!c || !c.field) return true;
  const other = values[c.field];
  const cmp = (a, b) => {
    const na = Number(a); const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && a !== '' && b !== '') return na - nb;
    return String(a ?? '') < String(b ?? '') ? -1 : String(a ?? '') === String(b ?? '') ? 0 : 1;
  };
  switch (c.op) {
    case 'eq': return String(other ?? '') === String(c.value ?? '');
    case 'neq': return String(other ?? '') !== String(c.value ?? '');
    case 'gt': return !isEmpty(other) && cmp(other, c.value) > 0;
    case 'lt': return !isEmpty(other) && cmp(other, c.value) < 0;
    default: return true;
  }
}

function err(field, en, ar) {
  return { key: field.key, label_en: field.label_en, label_ar: field.label_ar, en, ar };
}

function validateScalar(field, value, errors) {
  switch (field.type) {
    case 'text':
    case 'textarea': {
      const s = String(value);
      if (field.minLength != null && s.length < field.minLength) {
        errors.push(err(field, `Minimum length is ${field.minLength}`, `الحد الأدنى للطول هو ${field.minLength}`));
      }
      if (field.maxLength != null && s.length > field.maxLength) {
        errors.push(err(field, `Maximum length is ${field.maxLength}`, `الحد الأقصى للطول هو ${field.maxLength}`));
      }
      if (field.regex) {
        try {
          if (!new RegExp(field.regex).test(s)) {
            errors.push(err(field,
              field.regexMessageEn || 'Invalid format',
              field.regexMessageAr || 'صيغة غير صحيحة'));
          }
        } catch { /* invalid regex in template — ignore rather than block entry */ }
      }
      break;
    }
    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) {
        errors.push(err(field, 'Must be a number', 'يجب أن يكون رقمًا'));
        break;
      }
      if (field.min != null && n < field.min) errors.push(err(field, `Minimum is ${field.min}`, `الحد الأدنى هو ${field.min}`));
      if (field.max != null && n > field.max) errors.push(err(field, `Maximum is ${field.max}`, `الحد الأقصى هو ${field.max}`));
      break;
    }
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) errors.push(err(field, 'Invalid date', 'تاريخ غير صحيح'));
      break;
    case 'time':
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(String(value))) errors.push(err(field, 'Invalid time', 'وقت غير صحيح'));
      break;
    case 'dropdown':
    case 'radio': {
      const ok = (field.options || []).some((o) => String(o.value) === String(value));
      if (!ok) errors.push(err(field, 'Value is not one of the allowed options', 'القيمة ليست من الخيارات المسموح بها'));
      break;
    }
    case 'checkbox': {
      const arr = Array.isArray(value) ? value : [value];
      const allowed = new Set((field.options || []).map((o) => String(o.value)));
      if (!arr.every((v) => allowed.has(String(v)))) {
        errors.push(err(field, 'Value is not one of the allowed options', 'القيمة ليست من الخيارات المسموح بها'));
      }
      break;
    }
    case 'boolean':
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        errors.push(err(field, 'Must be true or false', 'يجب أن تكون نعم أو لا'));
      }
      break;
    case 'file':
      if (typeof value !== 'string') errors.push(err(field, 'Invalid file reference', 'مرجع ملف غير صحيح'));
      break;
    default:
      break;
  }
}

function validateFields(fields, values, errors, requireMandatory) {
  for (const field of fields) {
    const visible = isFieldVisible(field, values);
    const value = values[field.key];
    if (!visible) continue; // hidden fields are neither required nor validated
    if (isEmpty(value)) {
      if (field.required && requireMandatory) {
        errors.push(err(field, 'This field is mandatory', 'هذا الحقل إلزامي'));
      }
      continue;
    }
    if (field.type === 'table') {
      if (!Array.isArray(value)) {
        errors.push(err(field, 'Invalid table data', 'بيانات جدول غير صحيحة'));
        continue;
      }
      for (const row of value) {
        validateFields(field.columns || [], row || {}, errors, requireMandatory);
      }
    } else {
      validateScalar(field, value, errors);
    }
  }
}

// requireMandatory=false for draft saves (partial data allowed), true on submission.
export function validateReportData(schema, values, { requireMandatory = true } = {}) {
  const errors = [];
  for (const section of schema.sections || []) {
    validateFields(section.fields || [], values || {}, errors, requireMandatory);
  }
  return errors;
}

// ---- Template schema validation (Form Builder save) ----

export function validateTemplateSchema(schema) {
  const errors = [];
  const push = (en, ar) => errors.push({ en, ar });
  if (!schema || !Array.isArray(schema.sections) || schema.sections.length === 0) {
    push('Template must contain at least one section', 'يجب أن يحتوي القالب على قسم واحد على الأقل');
    return errors;
  }
  const keys = new Set();
  const checkField = (f, where) => {
    if (!f.key || typeof f.key !== 'string') push(`Field in ${where} is missing a key`, `حقل في ${where} بدون معرّف`);
    if (keys.has(f.key)) push(`Duplicate field key "${f.key}"`, `معرّف حقل مكرر "${f.key}"`);
    keys.add(f.key);
    if (!FIELD_TYPES.includes(f.type)) push(`Unknown field type "${f.type}"`, `نوع حقل غير معروف "${f.type}"`);
    if (!f.label_en || !f.label_ar) {
      push(`Field "${f.key}": both English and Arabic labels are mandatory`, `الحقل "${f.key}": التسمية بالإنجليزية والعربية إلزامية`);
    }
    if (['dropdown', 'radio', 'checkbox'].includes(f.type)) {
      if (!Array.isArray(f.options) || f.options.length === 0) {
        push(`Field "${f.key}" needs at least one option`, `الحقل "${f.key}" يحتاج خيارًا واحدًا على الأقل`);
      } else {
        for (const o of f.options) {
          if (o.value === undefined || o.value === '' || !o.label_en || !o.label_ar) {
            push(`Field "${f.key}": every option needs a value plus EN and AR labels`, `الحقل "${f.key}": كل خيار يحتاج قيمة وتسمية إنجليزية وعربية`);
            break;
          }
        }
      }
    }
    if (f.type === 'table') {
      if (!Array.isArray(f.columns) || f.columns.length === 0) {
        push(`Table "${f.key}" needs at least one column`, `الجدول "${f.key}" يحتاج عمودًا واحدًا على الأقل`);
      } else {
        for (const col of f.columns) {
          if (col.type === 'table') {
            push(`Table "${f.key}": nested tables are not supported`, `الجدول "${f.key}": لا يمكن تداخل الجداول`);
          } else {
            checkField(col, `table "${f.key}"`);
          }
        }
      }
    }
  };
  for (const s of schema.sections) {
    if (s.system || s.id === '__examinee__') {
      push('The Examinee section is system-owned and cannot be included in the template schema', 'قسم بيانات المفحوص مملوك للنظام ولا يمكن تضمينه في القالب');
      continue;
    }
    if (!s.title_en || !s.title_ar) push('Every section needs EN and AR titles', 'كل قسم يحتاج عنوانًا بالإنجليزية والعربية');
    if (!Array.isArray(s.fields) || s.fields.length === 0) {
      push(`Section "${s.title_en || '?'}" needs at least one field`, `القسم "${s.title_ar || '؟'}" يحتاج حقلًا واحدًا على الأقل`);
      continue;
    }
    for (const f of s.fields) checkField(f, `section "${s.title_en}"`);
  }
  return errors;
}
