import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { StatePill, ValidityPill, Loading, fmtDate } from '../components/common.jsx';

const STATES = ['', 'draft', 'submitted', 'under_review', 'returned', 'rejected', 'approved', 'cancelled'];

// Read-only browse/search for System Manager + System Administration Manager.
export default function Browse() {
  const { t, pick } = useI18n();
  const [types, setTypes] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [filters, setFilters] = useState({ q: '', state: '', report_type_id: '', facility_id: '', from: '', to: '', validity: '' });
  const [reports, setReports] = useState(null);

  useEffect(() => {
    api('GET', '/api/templates/report-types').then((r) => setTypes(r.report_types));
    api('GET', '/api/facilities').then((r) => setFacilities(r.facilities));
  }, []);

  const search = useCallback(() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    api('GET', `/api/reports?${params}`).then((r) => setReports(r.reports));
  }, [filters]);
  useEffect(search, []); // initial load

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <div>
      <h1>{t('nav_browse')}</h1>
      <div className="card">
        <div className="row">
          <label className="f"><span>{t('search')}</span><input type="text" value={filters.q} onChange={set('q')} placeholder="RPT- / ID / name" /></label>
          <label className="f"><span>{t('state')}</span>
            <select value={filters.state} onChange={set('state')}>
              {STATES.map((s) => <option key={s} value={s}>{s ? t(`state_${s}`) : t('all')}</option>)}
            </select>
          </label>
          <label className="f"><span>{t('validity')}</span>
            <select value={filters.validity} onChange={set('validity')}>
              <option value="">{t('all')}</option>
              <option value="expired">{t('validity_Expired')}</option>
            </select>
          </label>
          <label className="f"><span>{t('report_type')}</span>
            <select value={filters.report_type_id} onChange={set('report_type_id')}>
              <option value="">{t('all')}</option>
              {types.map((x) => <option key={x.id} value={x.id}>{pick(x, 'name')}</option>)}
            </select>
          </label>
          <label className="f"><span>{t('facility')}</span>
            <select value={filters.facility_id} onChange={set('facility_id')}>
              <option value="">{t('all')}</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{pick(f, 'name')}</option>)}
            </select>
          </label>
          <label className="f"><span>{t('from_date')}</span><input type="date" value={filters.from} onChange={set('from')} /></label>
          <label className="f"><span>{t('to_date')}</span><input type="date" value={filters.to} onChange={set('to')} /></label>
        </div>
        <button className="btn" onClick={search}>{t('search')}</button>
      </div>
      {!reports ? <Loading /> : (
        <table className="grid">
          <thead>
            <tr>
              <th>{t('report_number')}</th><th>{t('report_type')}</th><th>{t('facility')}</th>
              <th>{t('examinee')}</th><th>{t('state')}</th><th>{t('validity')}</th><th>{t('updated_at')}</th>
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
                <td>{r.state === 'approved' ? <ValidityPill status={r.validity_status} /> : '—'}</td>
                <td>{fmtDate(r.updated_at)}</td>
              </tr>
            ))}
            {!reports.length && <tr><td colSpan={7} className="hint">{t('no_results')}</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
