import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { Loading, ErrorAlert } from '../components/common.jsx';

const EMPTY = { code: '', name_en: '', name_ar: '', status: 'active', push_enabled: false, pull_enabled: false, push_url: '', push_secret: '', pull_type_ids: [] };

export default function Entities() {
  const { t, pick } = useI18n();
  const [entities, setEntities] = useState(null);
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState(null);
  const [creds, setCreds] = useState(null); // {entity, client_id, client_secret} shown once
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api('GET', '/api/entities').then((r) => setEntities(r.entities)).catch(setError);
    api('GET', '/api/templates/report-types').then((r) => setTypes(r.report_types));
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    setError(null);
    try {
      if (form.id) await api('PUT', `/api/entities/${form.id}`, form);
      else await api('POST', '/api/entities', form);
      setForm(null);
      load();
    } catch (e) { setError(e); }
  };

  const generate = async (entity) => {
    setError(null);
    try {
      const r = await api('POST', `/api/entities/${entity.id}/credentials`);
      setCreds({ entity, ...r });
      load();
    } catch (e) { setError(e); }
  };

  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  if (!entities) return <Loading />;

  return (
    <div>
      <h1>{t('nav_entities')}</h1>
      <ErrorAlert error={error} onClose={() => setError(null)} />

      {creds && (
        <div className="alert ok">
          <b>{pick(creds.entity, 'name')}</b> — {t('ent_secret_once')}
          <div style={{ marginTop: 6, direction: 'ltr', textAlign: 'left' }}>
            <div><b>{t('ent_client_id')}:</b> <code>{creds.client_id}</code></div>
            <div><b>{t('ent_client_secret')}:</b> <code>{creds.client_secret}</code></div>
          </div>
          <button className="btn secondary small" style={{ marginTop: 8 }} onClick={() => setCreds(null)}>{t('close')}</button>
        </div>
      )}

      {!form && <button className="btn" style={{ marginBottom: 14 }} onClick={() => setForm({ ...EMPTY })}>{t('ent_new')}</button>}
      {form && (
        <div className="card">
          <div className="row">
            <label className="f"><span>{t('ent_code')} <span className="req">*</span></span>
              <input value={form.code} disabled={!!form.id} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </label>
            <label className="f"><span>{t('fac_name_en')} <span className="req">*</span></span>
              <input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            </label>
            <label className="f"><span>{t('fac_name_ar')} <span className="req">*</span></span>
              <input dir="rtl" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
            </label>
            <label className="f"><span>{t('fac_status')}</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">{t('status_active')}</option>
                <option value="inactive">{t('status_inactive')}</option>
              </select>
            </label>
          </div>
          <div className="f">
            <span className="flabel">{t('ent_channels')}</span>
            <fieldset className="chk">
              <label><input type="checkbox" checked={form.push_enabled} onChange={(e) => setForm({ ...form, push_enabled: e.target.checked })} /> {t('ent_push')}</label>
              <label><input type="checkbox" checked={form.pull_enabled} onChange={(e) => setForm({ ...form, pull_enabled: e.target.checked })} /> {t('ent_pull')}</label>
            </fieldset>
          </div>
          {form.push_enabled && (
            <div className="row">
              <label className="f"><span>{t('ent_push_url')} <span className="req">*</span></span>
                <input dir="ltr" value={form.push_url || ''} onChange={(e) => setForm({ ...form, push_url: e.target.value })} placeholder="http://localhost:4000/api/simulator/webhook" />
              </label>
              <label className="f"><span>{t('ent_push_secret')}</span>
                <input dir="ltr" value={form.push_secret || ''} onChange={(e) => setForm({ ...form, push_secret: e.target.value })} />
              </label>
            </div>
          )}
          {form.pull_enabled && (
            <div className="f">
              <span className="flabel">{t('ent_pull_scope')}</span>
              <fieldset className="chk">
                {types.map((x) => (
                  <label key={x.id}>
                    <input type="checkbox" checked={form.pull_type_ids.includes(x.id)}
                      onChange={() => setForm({ ...form, pull_type_ids: toggleIn(form.pull_type_ids, x.id) })} />
                    {pick(x, 'name')}
                  </label>
                ))}
              </fieldset>
            </div>
          )}
          <div className="inline">
            <button className="btn" onClick={save}>{t('save')}</button>
            <button className="btn secondary" onClick={() => setForm(null)}>{t('cancel')}</button>
          </div>
        </div>
      )}

      <table className="grid">
        <thead>
          <tr>
            <th>{t('ent_code')}</th><th>{t('fac_name_en')}</th><th>{t('ent_channels')}</th>
            <th>{t('fac_status')}</th><th>{t('ent_client_id')}</th><th>{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {entities.map((e) => (
            <tr key={e.id}>
              <td>{e.code}</td>
              <td>{pick(e, 'name')}</td>
              <td>{[e.push_enabled && t('ent_push'), e.pull_enabled && t('ent_pull')].filter(Boolean).join(' + ') || '—'}</td>
              <td>{e.status === 'active' ? t('status_active') : t('status_inactive')}</td>
              <td dir="ltr">{e.client_id || '—'}</td>
              <td className="inline">
                <button className="btn secondary small" onClick={() => setForm({ ...EMPTY, ...e, push_secret: '' })}>{t('user_edit')}</button>
                {e.pull_enabled && (
                  <button className="btn secondary small" onClick={() => generate(e)}>
                    {e.client_id ? t('ent_regenerate') : t('ent_generate')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
