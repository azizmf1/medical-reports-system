import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { StatePill, ValidityPill, ErrorAlert, fmtDate } from '../components/common.jsx';

const ID_TYPES = [
  { value: 'national_id', en: 'National ID', ar: 'الهوية الوطنية' },
  { value: 'iqama', en: 'Iqama', ar: 'الإقامة' },
  { value: 'passport', en: 'Passport', ar: 'جواز السفر' },
];

// All reports for a given ID Type + ID Number within the viewer's scope.
export default function ExamineeHistory() {
  const { t, lang, pick } = useI18n();
  const [idType, setIdType] = useState('national_id');
  const [idNumber, setIdNumber] = useState('');
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);

  const search = async () => {
    setError(null);
    try {
      const r = await api('GET', `/api/reports/examinee-history?id_type=${idType}&id_number=${encodeURIComponent(idNumber)}`);
      setReports(r.reports);
    } catch (e) { setError(e); }
  };

  return (
    <div>
      <h1>{t('nav_examinee_history')}</h1>
      <div className="card">
        <p className="hint">{t('history_search_hint')}</p>
        <div className="row">
          <label className="f"><span>{t('id_type')}</span>
            <select value={idType} onChange={(e) => setIdType(e.target.value)}>
              {ID_TYPES.map((x) => <option key={x.value} value={x.value}>{lang === 'ar' ? x.ar : x.en}</option>)}
            </select>
          </label>
          <label className="f"><span>{t('id_number')}</span>
            <input type="text" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          </label>
        </div>
        <button className="btn" disabled={!idNumber.trim()} onClick={search}>{t('search')}</button>
      </div>
      <ErrorAlert error={error} onClose={() => setError(null)} />
      {reports && (
        <table className="grid">
          <thead>
            <tr>
              <th>{t('report_number')}</th><th>{t('report_type')}</th><th>{t('facility')}</th>
              <th>{t('state')}</th><th>{t('validity')}</th><th>{t('created_at')}</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/reports/${r.id}`}>{r.report_number || `#${r.id}`}</Link></td>
                <td>{pick(r, 'type')}</td>
                <td>{pick(r, 'facility')}</td>
                <td><StatePill state={r.state} /></td>
                <td>{r.state === 'approved' ? <ValidityPill status={r.validity_status} /> : '—'}</td>
                <td>{fmtDate(r.created_at)}</td>
              </tr>
            ))}
            {!reports.length && <tr><td colSpan={6} className="hint">{t('no_results')}</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
