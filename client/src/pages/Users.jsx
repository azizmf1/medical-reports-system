import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { Loading, ErrorAlert } from '../components/common.jsx';

const ROLES = ['data_entry', 'checker', 'system_manager', 'sys_admin_manager', 'report_builder', 'operations'];
const SCOPED = ['data_entry', 'checker', 'system_manager', 'sys_admin_manager'];

const EMPTY = { username: '', password: '', full_name_en: '', full_name_ar: '', role: 'data_entry', active: true, report_type_ids: [], facility_ids: [] };

export default function Users() {
  const { t, pick } = useI18n();
  const [users, setUsers] = useState(null);
  const [types, setTypes] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [form, setForm] = useState(null); // {id?} editing / creating
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api('GET', '/api/users').then((r) => setUsers(r.users)).catch(setError);
    api('GET', '/api/templates/report-types').then((r) => setTypes(r.report_types));
    api('GET', '/api/facilities').then((r) => setFacilities(r.facilities));
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    setError(null);
    try {
      if (form.id) await api('PUT', `/api/users/${form.id}`, form);
      else await api('POST', '/api/users', form);
      setForm(null);
      load();
    } catch (e) { setError(e); }
  };

  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  if (!users) return <Loading />;

  return (
    <div>
      <h1>{t('nav_users')}</h1>
      <ErrorAlert error={error} onClose={() => setError(null)} />
      {!form && <button className="btn" style={{ marginBottom: 14 }} onClick={() => setForm({ ...EMPTY })}>{t('user_new')}</button>}

      {form && (
        <div className="card">
          <div className="row">
            <label className="f"><span>{t('username')} <span className="req">*</span></span>
              <input value={form.username} disabled={!!form.id} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </label>
            <label className="f"><span>{t('password')} {!form.id && <span className="req">*</span>}</span>
              <input type="password" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
            <label className="f"><span>{t('user_full_name_en')} <span className="req">*</span></span>
              <input value={form.full_name_en} onChange={(e) => setForm({ ...form, full_name_en: e.target.value })} />
            </label>
            <label className="f"><span>{t('user_full_name_ar')} <span className="req">*</span></span>
              <input dir="rtl" value={form.full_name_ar} onChange={(e) => setForm({ ...form, full_name_ar: e.target.value })} />
            </label>
            <label className="f"><span>{t('user_role')}</span>
              {/* BR-R1: exactly one role per user */}
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{t(`role_${r}`)}</option>)}
              </select>
            </label>
            <div className="f">
              <span className="flabel">{t('user_active')}</span>
              <label className="inline"><input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /></label>
            </div>
          </div>
          {SCOPED.includes(form.role) && (
            <div className="row">
              <div className="f">
                <span className="flabel">{t('user_report_types')}</span>
                <fieldset className="chk">
                  {types.map((x) => (
                    <label key={x.id}>
                      <input type="checkbox" checked={form.report_type_ids.includes(x.id)}
                        onChange={() => setForm({ ...form, report_type_ids: toggleIn(form.report_type_ids, x.id) })} />
                      {pick(x, 'name')}
                    </label>
                  ))}
                </fieldset>
              </div>
              <div className="f">
                <span className="flabel">{t('user_facilities')}</span>
                {form.role === 'sys_admin_manager' ? (
                  <div className="hint">{t('user_all_facilities')}</div>
                ) : (
                  <fieldset className="chk">
                    {facilities.map((f) => (
                      <label key={f.id}>
                        <input type="checkbox" checked={form.facility_ids.includes(f.id)}
                          onChange={() => setForm({ ...form, facility_ids: toggleIn(form.facility_ids, f.id) })} />
                        {pick(f, 'name')}
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>
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
          <tr><th>{t('username')}</th><th>{t('user_full_name_en')}</th><th>{t('user_role')}</th><th>{t('user_active')}</th><th>{t('actions')}</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{pick(u, 'full_name')}</td>
              <td>{t(`role_${u.role}`)}</td>
              <td>{u.active ? '✓' : '✗'}</td>
              <td><button className="btn secondary small" onClick={() => setForm({ ...u, password: '' })}>{t('user_edit')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
