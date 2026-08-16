import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n/index.jsx';
import { StatePill, Loading, fmtDate } from '../components/common.jsx';

export default function ReviewQueue() {
  const { t, pick } = useI18n();
  const { user } = useAuth();
  const [reports, setReports] = useState(null);

  useEffect(() => {
    api('GET', '/api/reports?queue=1').then((r) => setReports(r.reports));
  }, []);

  return (
    <div>
      <h1>{t('nav_review_queue')}</h1>
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
                <td><Link to={`/reports/${r.id}`}>{r.report_number}</Link></td>
                <td>{pick(r, 'type')}</td>
                <td>{pick(r, 'facility')}</td>
                <td>{pick(r, 'examinee_name')} ({r.examinee_id_number})</td>
                <td>
                  <StatePill state={r.state} />{' '}
                  {r.state === 'under_review' && r.claimed_by !== user.id && (
                    <span className="hint">{t('under_review_by', { name: pick(r, 'claimed_by') })}</span>
                  )}
                </td>
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
