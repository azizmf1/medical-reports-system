import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { Loading, ErrorAlert } from '../components/common.jsx';

const EMPTY = { code: '', name_en: '', name_ar: '', city: '', status: 'active' };

export default function Facilities() {
  const { t } = useI18n();
  const [facilities, setFacilities] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api('GET', '/api/facilities').then((r) => setFacilities(r.facilities)).catch(setError);
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    setError(null);
    try {
      if (form.id) await api('PUT', `/api/facilities/${form.id}`, form);
      else await api('POST', '/api/facilities', form);
      setForm(null);
      load();
    } catch (e) { setError(e); }
  };

  if (!facilities) return <Loading />;

  return (
    <div>
      <h1>{t('nav_facilities')}</h1>
      <ErrorAlert error={error} onClose={() => setError(null)} />
      {!form && <button className="btn" style={{ marginBottom: 14 }} onClick={() => setForm({ ...EMPTY })}>{t('fac_new')}</button>}
      {form && (
        <div className="card">
          <div className="row">
            <label className="f"><span>{t('fac_code')} <span className="req">*</span></span>
              <input value={form.code} disabled={!!form.id} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </label>
            <label className="f"><span>{t('fac_name_en')} <span className="req">*</span></span>
              <input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            </label>
            <label className="f"><span>{t('fac_name_ar')} <span className="req">*</span></span>
              <input dir="rtl" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
            </label>
            <label className="f"><span>{t('fac_city')}</span>
              <input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </label>
            <label className="f"><span>{t('fac_status')}</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">{t('status_active')}</option>
                <option value="inactive">{t('status_inactive')}</option>
              </select>
            </label>
          </div>
          <div className="inline">
            <button className="btn" onClick={save}>{t('save')}</button>
            <button className="btn secondary" onClick={() => setForm(null)}>{t('cancel')}</button>
          </div>
        </div>
      )}
      <table className="grid">
        <thead>
          <tr><th>{t('fac_code')}</th><th>{t('fac_name_en')}</th><th>{t('fac_name_ar')}</th><th>{t('fac_city')}</th><th>{t('fac_status')}</th><th>{t('actions')}</th></tr>
        </thead>
        <tbody>
          {facilities.map((f) => (
            <tr key={f.id}>
              <td>{f.code}</td><td>{f.name_en}</td><td dir="rtl">{f.name_ar}</td><td>{f.city}</td>
              <td>{f.status === 'active' ? t('status_active') : t('status_inactive')}</td>
              <td><button className="btn secondary small" onClick={() => setForm({ ...f })}>{t('user_edit')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
