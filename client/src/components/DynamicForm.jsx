import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { uploadFile } from '../api.js';

// Renders a template schema (sections/fields) and mirrors the server-side
// validation rules: conditional visibility, mandatory, min/max, regex, options.

export function isFieldVisible(field, values) {
  const c = field.condition;
  if (!c || !c.field) return true;
  const other = values[c.field];
  const num = (x) => (x === '' || x === null || x === undefined ? NaN : Number(x));
  switch (c.op) {
    case 'eq': return String(other ?? '') === String(c.value ?? '');
    case 'neq': return String(other ?? '') !== String(c.value ?? '');
    case 'gt': return !Number.isNaN(num(other)) && !Number.isNaN(num(c.value)) ? num(other) > num(c.value) : String(other ?? '') > String(c.value ?? '');
    case 'lt': return !Number.isNaN(num(other)) && !Number.isNaN(num(c.value)) ? num(other) < num(c.value) : String(other ?? '') < String(c.value ?? '');
    default: return true;
  }
}

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export function validateValues(schema, values, { requireMandatory, lang, t }) {
  const errors = {};
  const msg = (en, ar) => (lang === 'ar' ? ar : en);
  const checkField = (f, vals, keyPrefix = '') => {
    if (!isFieldVisible(f, vals)) return;
    const v = vals[f.key];
    const ekey = keyPrefix + f.key;
    if (isEmpty(v)) {
      if (f.required && requireMandatory) errors[ekey] = t('field_required');
      return;
    }
    if (f.type === 'text' || f.type === 'textarea') {
      const s = String(v);
      if (f.minLength != null && s.length < f.minLength) errors[ekey] = msg(`Minimum length is ${f.minLength}`, `الحد الأدنى للطول هو ${f.minLength}`);
      if (f.maxLength != null && s.length > f.maxLength) errors[ekey] = msg(`Maximum length is ${f.maxLength}`, `الحد الأقصى للطول هو ${f.maxLength}`);
      if (f.regex) {
        try {
          if (!new RegExp(f.regex).test(s)) errors[ekey] = msg(f.regexMessageEn || 'Invalid format', f.regexMessageAr || 'صيغة غير صحيحة');
        } catch { /* bad template regex */ }
      }
    } else if (f.type === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) errors[ekey] = msg('Must be a number', 'يجب أن يكون رقمًا');
      else {
        if (f.min != null && n < f.min) errors[ekey] = msg(`Minimum is ${f.min}`, `الحد الأدنى هو ${f.min}`);
        if (f.max != null && n > f.max) errors[ekey] = msg(`Maximum is ${f.max}`, `الحد الأقصى هو ${f.max}`);
      }
    } else if (f.type === 'table' && Array.isArray(v)) {
      v.forEach((row, i) => {
        for (const col of f.columns || []) checkField(col, row || {}, `${f.key}.${i}.`);
      });
    }
  };
  for (const s of schema.sections || []) {
    for (const f of s.fields || []) checkField(f, values);
  }
  return errors;
}

function FieldInput({ field, value, onChange, error, disabled, values, errKey }) {
  const { pick, t } = useI18n();
  const label = (
    <span className="flabel">
      {pick(field, 'label')} {field.required && <span className="req">*</span>}
    </span>
  );
  const err = error ? <div className="ferr">{error}</div> : null;

  const common = { disabled };

  switch (field.type) {
    case 'text':
      return <label className="f">{label}<input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...common} />{err}</label>;
    case 'textarea':
      return <label className="f">{label}<textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...common} />{err}</label>;
    case 'number':
      return <label className="f">{label}<input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} {...common} />{err}</label>;
    case 'date':
      return <label className="f">{label}<input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...common} />{err}</label>;
    case 'time':
      return <label className="f">{label}<input type="time" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...common} />{err}</label>;
    case 'dropdown':
      return (
        <label className="f">{label}
          <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...common}>
            <option value="">{t('none')}</option>
            {(field.options || []).map((o) => <option key={o.value} value={o.value}>{pick(o, 'label')}</option>)}
          </select>{err}
        </label>
      );
    case 'radio':
      return (
        <div className="f">{label}
          <fieldset className="chk">
            {(field.options || []).map((o) => (
              <label key={o.value}>
                <input type="radio" name={errKey} checked={String(value) === String(o.value)}
                  onChange={() => onChange(o.value)} disabled={disabled} />
                {pick(o, 'label')}
              </label>
            ))}
          </fieldset>{err}
        </div>
      );
    case 'checkbox': {
      const arr = Array.isArray(value) ? value : [];
      const toggleOpt = (v) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
      return (
        <div className="f">{label}
          <fieldset className="chk">
            {(field.options || []).map((o) => (
              <label key={o.value}>
                <input type="checkbox" checked={arr.includes(o.value)} onChange={() => toggleOpt(o.value)} disabled={disabled} />
                {pick(o, 'label')}
              </label>
            ))}
          </fieldset>{err}
        </div>
      );
    }
    case 'boolean':
      return (
        <div className="f">{label}
          <label className="inline">
            <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
          </label>{err}
        </div>
      );
    case 'file':
      return (
        <div className="f">{label}
          {value && <div className="hint">📎 {String(value).split('/').pop()}</div>}
          {!disabled && (
            <input type="file" onChange={async (e) => {
              const f = e.target.files[0];
              if (f) {
                const r = await uploadFile(f);
                onChange(r.url);
              }
            }} />
          )}
          {err}
        </div>
      );
    case 'table': {
      const rows = Array.isArray(value) ? value : [];
      const setRow = (i, colKey, v) => {
        const next = rows.map((r, idx) => (idx === i ? { ...r, [colKey]: v } : r));
        onChange(next);
      };
      return (
        <div className="f">{label}
          <table className="subtable">
            <thead>
              <tr>
                {(field.columns || []).map((c) => <th key={c.key}>{pick(c, 'label')}{c.required && <span className="req">*</span>}</th>)}
                {!disabled && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {(field.columns || []).map((c) => (
                    <td key={c.key}>
                      <FieldInput field={{ ...c, required: false }} value={row?.[c.key]}
                        onChange={(v) => setRow(i, c.key, v)} disabled={disabled}
                        values={row || {}} errKey={`${field.key}.${i}.${c.key}`} />
                    </td>
                  ))}
                  {!disabled && (
                    <td><button type="button" className="btn danger small" onClick={() => onChange(rows.filter((_, idx) => idx !== i))}>{t('remove')}</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!disabled && <button type="button" className="btn secondary small" style={{ marginTop: 6 }} onClick={() => onChange([...rows, {}])}>{t('add_row')}</button>}
          {err}
        </div>
      );
    }
    default:
      return null;
  }
}

export default function DynamicForm({ schema, values, onChange, errors = {}, disabled = false, lockedTitleKey }) {
  const { pick, t } = useI18n();
  const setValue = (key, v) => onChange({ ...values, [key]: v });
  return (
    <div>
      {(schema.sections || []).map((section, si) => (
        <div className="section-block" key={section.id || si}>
          <h3>
            <span>{pick(section, 'title')}</span>
            {section.system && <span className="locked">{t(lockedTitleKey || 'tpl_examinee_locked')}</span>}
          </h3>
          <div className="fields">
            {(section.fields || []).map((f) => (
              isFieldVisible(f, values) && (
                <FieldInput key={f.key} field={f} value={values[f.key]} values={values}
                  onChange={(v) => setValue(f.key, v)} error={errors[f.key]} disabled={disabled} errKey={f.key} />
              )
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
