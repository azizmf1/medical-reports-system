import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { StatePill, Loading, fmtDate } from '../components/common.jsx';

const STATES = ['', 'draft', 'submitted', 'under_review', 'returned', 'rejected', 'approved', 'cancelled'];

export default function MyReports() {
  const { t, pick } = useI18n();
  const [reports, setReports] = useState(null);
  const [state, setState] = useState('');

  useEffect(() => {
    api('GET', `/api/reports${state ? `?state=${state}` : ''}`).then((r) => setReports(r.reports));
  }, [state]);

  return (
    <div>
      <h1>{t('nav_my_reports')}</h1>
      <div className="inline" style={{ marginBottom: 14 }}>
        <select value={state} onChange={(e) => setState(e.target.value)} style={{ maxWidth: 240 }}>
          {STATES.map((s) => <option key={s} value={s}>{s ? t(`state_${s}`) : t('all')}</option>)}
        </select>
        <Link className="btn" to="/new-report">{t('new_report')}</Link>
      </div>
      {!reports ? <Loading /> : (
        <table className="grid">
          <thead>
            <tr>
              <th>{t('report_number')}</th><th>{t('report_type')}</th><th>{t('facility')}</th>
              <th>{t('examinee')}</th><th>{t('state')}</th><th>{t('updated_at')}</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/reports/${r.id}`}>{r.report_number || `#${r.id}`}</Link></td>
                <td>{pick(r, 'type')}</td>
                <td>{pick(r, 'facility')}</td>
                <td>{pick(r, 'examinee_name')} ({r.examinee_id_number})</td>
                <td><StatePill state={r.state} /></td>
                <td>{fmtDate(r.updated_at)}</td>
              </tr>
            ))}
            {!reports.length && <tr><td colSpan={6} className="hint">{t('no_results')}</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
