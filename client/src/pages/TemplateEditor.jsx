import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { ErrorAlert, Loading } from '../components/common.jsx';
import DynamicForm from '../components/DynamicForm.jsx';

const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'time', 'dropdown', 'radio', 'checkbox', 'boolean', 'file', 'table'];
const OPTION_TYPES = ['dropdown', 'radio', 'checkbox'];
let keyCounter = 0;
const genKey = (type) => `${type}_${Date.now().toString(36)}${(keyCounter++).toString(36)}`;

function newField(type = 'text') {
  return { key: genKey(type), type, label_en: '', label_ar: '', required: false, ...(OPTION_TYPES.includes(type) ? { options: [] } : {}), ...(type === 'table' ? { columns: [] } : {}) };
}

function OptionsEditor({ field, onChange, t }) {
  const opts = field.options || [];
  const set = (i, k, v) => onChange({ ...field, options: opts.map((o, idx) => (idx === i ? { ...o, [k]: v } : o)) });
  return (
    <div style={{ marginTop: 8 }}>
      <div className="flabel">{t('tpl_options')}</div>
      {opts.map((o, i) => (
        <div className="inline" key={i} style={{ marginBottom: 6 }}>
          <input style={{ width: 120 }} placeholder={t('tpl_option_value')} value={o.value ?? ''} onChange={(e) => set(i, 'value', e.target.value)} />
          <input style={{ width: 170 }} placeholder="Label EN" value={o.label_en ?? ''} onChange={(e) => set(i, 'label_en', e.target.value)} />
          <input style={{ width: 170 }} placeholder="التسمية AR" dir="rtl" value={o.label_ar ?? ''} onChange={(e) => set(i, 'label_ar', e.target.value)} />
          <button type="button" className="btn danger small" onClick={() => onChange({ ...field, options: opts.filter((_, idx) => idx !== i) })}>{t('remove')}</button>
        </div>
      ))}
      <button type="button" className="btn secondary small" onClick={() => onChange({ ...field, options: [...opts, { value: '', label_en: '', label_ar: '' }] })}>
        {t('tpl_add_option')}
      </button>
    </div>
  );
}

function FieldEditor({ field, onChange, onRemove, onMove, allFields, t, isColumn = false }) {
  const set = (k, v) => onChange({ ...field, [k]: v === '' ? undefined : v });
  const others = allFields.filter((f) => f.key !== field.key && f.type !== 'table');
  const cond = field.condition;

  return (
    <div className="fieldcard">
      <div className="head">
        <span className="t">{field.label_en || field.label_ar || field.key} <span className="hint">({field.type})</span></span>
        <span className="inline">
          {onMove && <button type="button" className="btn secondary small" onClick={() => onMove(-1)}>↑</button>}
          {onMove && <button type="button" className="btn secondary small" onClick={() => onMove(1)}>↓</button>}
          <button type="button" className="btn danger small" onClick={onRemove}>{t('remove')}</button>
        </span>
      </div>
      <div className="row">
        <label className="f"><span>{t('tpl_field_type')}</span>
          <select value={field.type} onChange={(e) => {
            const type = e.target.value;
            onChange({ ...newField(type), key: field.key, label_en: field.label_en, label_ar: field.label_ar, required: field.required, condition: field.condition });
          }}>
            {FIELD_TYPES.filter((x) => !isColumn || x !== 'table').map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="f"><span>{t('tpl_field_label_en')} <span className="req">*</span></span>
          <input value={field.label_en || ''} onChange={(e) => set('label_en', e.target.value)} />
        </label>
        <label className="f"><span>{t('tpl_field_label_ar')} <span className="req">*</span></span>
          <input dir="rtl" value={field.label_ar || ''} onChange={(e) => set('label_ar', e.target.value)} />
        </label>
      </div>
      <div className="inline">
        <label className="inline"><input type="checkbox" checked={!!field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} /> {t('tpl_mandatory')}</label>
        <span className="hint">{t('tpl_field_key')}: {field.key}</span>
      </div>

      {field.type === 'number' && (
        <div className="row" style={{ marginTop: 8 }}>
          <label className="f"><span>{t('tpl_min')}</span><input type="number" value={field.min ?? ''} onChange={(e) => set('min', e.target.value === '' ? '' : Number(e.target.value))} /></label>
          <label className="f"><span>{t('tpl_max')}</span><input type="number" value={field.max ?? ''} onChange={(e) => set('max', e.target.value === '' ? '' : Number(e.target.value))} /></label>
        </div>
      )}
      {(field.type === 'text' || field.type === 'textarea') && (
        <div className="row" style={{ marginTop: 8 }}>
          <label className="f"><span>{t('tpl_min_length')}</span><input type="number" value={field.minLength ?? ''} onChange={(e) => set('minLength', e.target.value === '' ? '' : Number(e.target.value))} /></label>
          <label className="f"><span>{t('tpl_max_length')}</span><input type="number" value={field.maxLength ?? ''} onChange={(e) => set('maxLength', e.target.value === '' ? '' : Number(e.target.value))} /></label>
          <label className="f"><span>{t('tpl_regex')}</span><input dir="ltr" value={field.regex ?? ''} onChange={(e) => set('regex', e.target.value)} /></label>
          {field.regex && (
            <>
              <label className="f"><span>{t('tpl_regex_msg_en')}</span><input value={field.regexMessageEn ?? ''} onChange={(e) => set('regexMessageEn', e.target.value)} /></label>
              <label className="f"><span>{t('tpl_regex_msg_ar')}</span><input dir="rtl" value={field.regexMessageAr ?? ''} onChange={(e) => set('regexMessageAr', e.target.value)} /></label>
            </>
          )}
        </div>
      )}
      {OPTION_TYPES.includes(field.type) && <OptionsEditor field={field} onChange={onChange} t={t} />}
      {field.type === 'table' && (
        <div style={{ marginTop: 8, paddingInlineStart: 12, borderInlineStart: '3px solid var(--border)' }}>
          <div className="flabel">{t('tpl_columns')}</div>
          {(field.columns || []).map((col, i) => (
            <FieldEditor key={col.key} field={col} isColumn allFields={field.columns || []} t={t}
              onChange={(c) => onChange({ ...field, columns: field.columns.map((x, idx) => (idx === i ? c : x)) })}
              onRemove={() => onChange({ ...field, columns: field.columns.filter((_, idx) => idx !== i) })} />
          ))}
          <button type="button" className="btn secondary small" onClick={() => onChange({ ...field, columns: [...(field.columns || []), newField('text')] })}>
            {t('tpl_add_column')}
          </button>
        </div>
      )}

      {!isColumn && (
        <div className="inline" style={{ marginTop: 10 }}>
          <span className="flabel" style={{ margin: 0 }}>{t('tpl_condition')}:</span>
          <select value={cond?.field || ''} onChange={(e) => {
            const v = e.target.value;
            onChange({ ...field, condition: v ? { field: v, op: cond?.op || 'eq', value: cond?.value ?? '' } : undefined });
          }}>
            <option value="">{t('tpl_cond_none')}</option>
            {others.map((f) => <option key={f.key} value={f.key}>{f.label_en || f.key}</option>)}
          </select>
          {cond?.field && (
            <>
              <select value={cond.op} onChange={(e) => onChange({ ...field, condition: { ...cond, op: e.target.value } })}>
                {['eq', 'neq', 'gt', 'lt'].map((op) => <option key={op} value={op}>{t(`tpl_op_${op}`)}</option>)}
              </select>
              <input style={{ width: 140 }} value={cond.value ?? ''} onChange={(e) => onChange({ ...field, condition: { ...cond, value: e.target.value } })} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TemplateEditor() {
  const { id } = useParams(); // absent for /templates/new
  const { t, pick } = useI18n();
  const navigate = useNavigate();
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [sections, setSections] = useState([]);
  const [settings, setSettings] = useState({ sharing: [], validity_days: '', duplicate_prevention: false });
  const [entities, setEntities] = useState([]);
  const [examineeSection, setExamineeSection] = useState(null);
  const [versionState, setVersionState] = useState('draft');
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(!id);
  const [preview, setPreview] = useState(false);
  const [previewValues, setPreviewValues] = useState({});

  useEffect(() => {
    api('GET', '/api/entities').then((r) => setEntities(r.entities));
    api('GET', '/api/templates/examinee-section').then((r) => setExamineeSection(r.section));
    if (id) {
      api('GET', `/api/templates/versions/${id}`).then((r) => {
        const v = r.version;
        setSections(v.schema.sections);
        setSettings({
          sharing: v.settings.sharing || [],
          validity_days: v.settings.validity_days ?? '',
          duplicate_prevention: !!v.settings.duplicate_prevention,
        });
        setVersionState(v.state);
        return api('GET', '/api/templates/report-types').then((rt) => {
          const type = rt.report_types.find((x) => x.id === v.report_type_id);
          if (type) { setNameEn(type.name_en); setNameAr(type.name_ar); }
          setLoaded(true);
        });
      }).catch(setError);
    }
  }, [id]);

  const editable = ['draft', 'rejected'].includes(versionState);
  const allFields = useMemo(() => sections.flatMap((s) => s.fields || []), [sections]);

  const setSection = (i, s) => setSections(sections.map((x, idx) => (idx === i ? s : x)));
  const moveSection = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    setSections(next);
  };
  const moveField = (si, fi, dir) => {
    const fields = [...sections[si].fields];
    const j = fi + dir;
    if (j < 0 || j >= fields.length) return;
    [fields[fi], fields[j]] = [fields[j], fields[fi]];
    setSection(si, { ...sections[si], fields });
  };

  const payload = () => ({
    name_en: nameEn, name_ar: nameAr,
    schema: { sections },
    settings: {
      sharing: settings.sharing,
      validity_days: settings.validity_days === '' ? null : Number(settings.validity_days),
      duplicate_prevention: settings.duplicate_prevention,
    },
  });

  const save = async (thenSubmit) => {
    setError(null);
    try {
      let versionId = id;
      if (versionId) {
        await api('PUT', `/api/templates/versions/${versionId}`, payload());
      } else {
        const r = await api('POST', '/api/templates', payload());
        versionId = r.version.id;
      }
      if (thenSubmit) await api('POST', `/api/templates/versions/${versionId}/submit`);
      navigate('/templates');
    } catch (e) { setError(e); }
  };

  if (!loaded || !examineeSection) return error ? <ErrorAlert error={error} /> : <Loading />;

  const previewSchema = { sections: [examineeSection, ...sections] };

  return (
    <div>
      <h1>{id ? `${nameEn || t('nav_templates')} — v` : t('tpl_new')}{versionState !== 'draft' && !editable ? ` (${t(`tpl_state_${versionState}`)})` : ''}</h1>
      <ErrorAlert error={error} onClose={() => setError(null)} />
      {versionState === 'rejected' && <div className="alert error">{t('tpl_state_rejected')}</div>}

      <div className="card">
        <div className="row">
          <label className="f"><span>{t('tpl_name_en')} <span className="req">*</span></span>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} disabled={!editable} />
          </label>
          <label className="f"><span>{t('tpl_name_ar')} <span className="req">*</span></span>
            <input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} disabled={!editable} />
          </label>
        </div>
      </div>

      {/* Fixed system-owned examinee section — displayed, never editable */}
      <div className="section-block">
        <h3><span>{pick(examineeSection, 'title')}</span><span className="locked">{t('tpl_examinee_locked')}</span></h3>
        <div className="fields hint">
          {examineeSection.fields.map((f) => pick(f, 'label')).join(' · ')}
        </div>
      </div>

      <h2>{t('tpl_sections')}</h2>
      {sections.map((section, si) => (
        <div className="section-block" key={section.id || si}>
          <h3>
            <span className="inline" style={{ flex: 1 }}>
              <input style={{ maxWidth: 220 }} placeholder={t('tpl_section_title_en')} value={section.title_en || ''}
                onChange={(e) => setSection(si, { ...section, title_en: e.target.value })} disabled={!editable} />
              <input style={{ maxWidth: 220 }} dir="rtl" placeholder={t('tpl_section_title_ar')} value={section.title_ar || ''}
                onChange={(e) => setSection(si, { ...section, title_ar: e.target.value })} disabled={!editable} />
            </span>
            {editable && (
              <span className="inline">
                <button type="button" className="btn secondary small" onClick={() => moveSection(si, -1)}>↑</button>
                <button type="button" className="btn secondary small" onClick={() => moveSection(si, 1)}>↓</button>
                <button type="button" className="btn danger small" onClick={() => setSections(sections.filter((_, idx) => idx !== si))}>{t('remove')}</button>
              </span>
            )}
          </h3>
          <div className="fields">
            {(section.fields || []).map((f, fi) => (
              editable ? (
                <FieldEditor key={f.key} field={f} allFields={allFields} t={t}
                  onChange={(nf) => setSection(si, { ...section, fields: section.fields.map((x, idx) => (idx === fi ? nf : x)) })}
                  onRemove={() => setSection(si, { ...section, fields: section.fields.filter((_, idx) => idx !== fi) })}
                  onMove={(dir) => moveField(si, fi, dir)} />
              ) : (
                <div key={f.key} className="fieldcard"><b>{f.label_en}</b> / <span dir="rtl">{f.label_ar}</span> <span className="hint">({f.type}{f.required ? ', *' : ''})</span></div>
              )
            ))}
            {editable && (
              <button type="button" className="btn secondary small" onClick={() => setSection(si, { ...section, fields: [...(section.fields || []), newField()] })}>
                {t('tpl_add_field')}
              </button>
            )}
          </div>
        </div>
      ))}
      {editable && (
        <button type="button" className="btn secondary" onClick={() => setSections([...sections, { id: genKey('sec'), title_en: '', title_ar: '', fields: [] }])}>
          {t('tpl_add_section')}
        </button>
      )}

      <h2>{t('tpl_settings')}</h2>
      <div className="card">
        <div className="flabel">{t('tpl_sharing')}</div>
        {settings.sharing.map((s, i) => {
          const ent = entities.find((e) => e.id === s.entity_id);
          const channels = ent ? [ent.push_enabled && 'push', ent.pull_enabled && 'pull', ent.push_enabled && ent.pull_enabled && 'both'].filter(Boolean) : [];
          return (
            <div className="inline" key={i} style={{ marginBottom: 8 }}>
              <select value={s.entity_id} disabled={!editable} onChange={(e) => {
                const next = [...settings.sharing];
                next[i] = { ...next[i], entity_id: Number(e.target.value) };
                setSettings({ ...settings, sharing: next });
              }}>
                {entities.map((e2) => <option key={e2.id} value={e2.id}>{pick(e2, 'name')}</option>)}
              </select>
              <select value={s.channel} disabled={!editable} onChange={(e) => {
                const next = [...settings.sharing];
                next[i] = { ...next[i], channel: e.target.value };
                setSettings({ ...settings, sharing: next });
              }}>
                {channels.map((c) => <option key={c} value={c}>{t(`channel_${c}`)}</option>)}
              </select>
              {editable && <button type="button" className="btn danger small" onClick={() => setSettings({ ...settings, sharing: settings.sharing.filter((_, idx) => idx !== i) })}>{t('remove')}</button>}
            </div>
          );
        })}
        {editable && entities.length > 0 && (
          <button type="button" className="btn secondary small" onClick={() => {
            const first = entities[0];
            setSettings({ ...settings, sharing: [...settings.sharing, { entity_id: first.id, channel: first.push_enabled ? 'push' : 'pull' }] });
          }}>{t('tpl_add_target')}</button>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <label className="f"><span>{t('tpl_validity')}</span>
            <input type="number" min="1" value={settings.validity_days} disabled={!editable}
              onChange={(e) => setSettings({ ...settings, validity_days: e.target.value })} />
            <span className="hint">{t('tpl_validity_hint')}</span>
          </label>
          <div className="f">
            <span className="flabel">{t('tpl_dup')}</span>
            <label className="inline">
              <input type="checkbox" checked={settings.duplicate_prevention} disabled={!editable}
                onChange={(e) => setSettings({ ...settings, duplicate_prevention: e.target.checked })} />
            </label>
          </div>
        </div>
      </div>

      <div className="inline" style={{ marginBottom: 20 }}>
        {editable && <button className="btn" onClick={() => save(false)}>{t('save')}</button>}
        {editable && <button className="btn success" onClick={() => save(true)}>{t('tpl_submit_approval')}</button>}
        <button className="btn secondary" onClick={() => setPreview(!preview)}>{t('tpl_preview')}</button>
      </div>

      {preview && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t('tpl_preview')}</h2>
          <DynamicForm schema={previewSchema} values={previewValues} onChange={setPreviewValues} />
        </div>
      )}
    </div>
  );
}
