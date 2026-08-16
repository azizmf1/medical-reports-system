import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { Loading, ErrorAlert, fmtDate } from '../components/common.jsx';
import DynamicForm from '../components/DynamicForm.jsx';

// Operations: approve (→ Published) or reject (mandatory reason) templates.
export default function TemplateApprovals() {
  const { t, lang, pick } = useI18n();
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [previewing, setPreviewing] = useState(null);
  const [previewValues, setPreviewValues] = useState({});
  const [examineeSection, setExamineeSection] = useState(null);

  const load = useCallback(() => {
    api('GET', '/api/templates/pending').then((r) => setVersions(r.versions)).catch(setError);
    api('GET', '/api/templates/examinee-section').then((r) => setExamineeSection(r.section));
  }, []);
  useEffect(load, [load]);

  const act = async (id, action, body) => {
    setError(null);
    try {
      await api('POST', `/api/templates/versions/${id}/${action}`, body);
      setRejecting(null); setReason('');
      load();
    } catch (e) { setError(e); }
  };

  if (!versions) return <Loading />;

  return (
    <div>
      <h1>{t('nav_template_approvals')}</h1>
      <ErrorAlert error={error} onClose={() => setError(null)} />
      {!versions.length && <div className="hint">{t('no_results')}</div>}
      {versions.map((v) => (
        <div className="card" key={v.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <b>{lang === 'ar' ? v.name_ar : v.name_en}</b> — v{v.version_no}
              <div className="hint">{fmtDate(v.submitted_at)}</div>
              <div className="hint">
                {t('tpl_validity')}: {v.settings.validity_days ?? t('none')} · {t('tpl_dup')}: {v.settings.duplicate_prevention ? '✓' : '✗'} · {t('tpl_sharing')}: {v.settings.sharing.length}
              </div>
            </div>
            <div className="inline">
              <button className="btn secondary small" onClick={() => { setPreviewing(previewing === v.id ? null : v.id); setPreviewValues({}); }}>{t('tpl_preview')}</button>
              <button className="btn success" onClick={() => act(v.id, 'approve')}>{t('approve_template')}</button>
              <button className="btn danger" onClick={() => setRejecting(rejecting === v.id ? null : v.id)}>{t('reject_template')}</button>
            </div>
          </div>
          {rejecting === v.id && (
            <div style={{ marginTop: 12 }}>
              <label className="f"><span>{t('reason')} <span className="req">*</span></span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <button className="btn danger" disabled={!reason.trim()} onClick={() => act(v.id, 'reject', { reason })}>{t('confirm')}</button>
            </div>
          )}
          {previewing === v.id && examineeSection && (
            <div style={{ marginTop: 12 }}>
              <DynamicForm schema={{ sections: [examineeSection, ...v.schema.sections] }} values={previewValues} onChange={setPreviewValues} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
