import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { Loading, ErrorAlert, fmtDate } from '../components/common.jsx';

// Report Builder: templates (report types) with their versions.
export default function Templates() {
  const { t, pick } = useI18n();
  const navigate = useNavigate();
  const [types, setTypes] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api('GET', '/api/templates/report-types').then((r) => setTypes(r.report_types)).catch(setError);
  }, []);
  useEffect(load, [load]);

  const newVersion = async (typeId) => {
    setError(null);
    try {
      const r = await api('POST', `/api/templates/report-types/${typeId}/new-version`);
      navigate(`/templates/versions/${r.version.id}`);
    } catch (e) { setError(e); }
  };

  if (!types) return <Loading />;

  return (
    <div>
      <h1>{t('nav_templates')}</h1>
      <ErrorAlert error={error} onClose={() => setError(null)} />
      <Link className="btn" to="/templates/new" style={{ marginBottom: 16, display: 'inline-block' }}>{t('tpl_new')}</Link>
      {types.map((type) => (
        <div className="card" key={type.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>{pick(type, 'name')}</h2>
            {type.versions.some((v) => v.state === 'published') &&
              !type.versions.some((v) => ['draft', 'submitted', 'rejected'].includes(v.state)) && (
              <button className="btn secondary small" onClick={() => newVersion(type.id)}>{t('tpl_new_version')}</button>
            )}
          </div>
          <table className="grid" style={{ marginTop: 10 }}>
            <thead>
              <tr><th>{t('tpl_versions')}</th><th>{t('state')}</th><th>{t('created_at')}</th><th>{t('tpl_rejection_reason')}</th><th>{t('actions')}</th></tr>
            </thead>
            <tbody>
              {type.versions.map((v) => (
                <tr key={v.id}>
                  <td>v{v.version_no}</td>
                  <td><span className={`pill ${v.state === 'published' ? 'approved' : v.state === 'rejected' ? 'rejected' : v.state}`}>{t(`tpl_state_${v.state}`)}</span></td>
                  <td>{fmtDate(v.created_at)}</td>
                  <td>{v.rejection_reason || '—'}</td>
                  <td><Link to={`/templates/versions/${v.id}`}>{['draft', 'rejected'].includes(v.state) ? t('user_edit') : t('tpl_preview')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
