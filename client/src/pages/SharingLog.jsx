import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { Loading, fmtDate } from '../components/common.jsx';

export default function SharingLog() {
  const { t, pick } = useI18n();
  const [log, setLog] = useState(null);

  useEffect(() => {
    api('GET', '/api/share-log').then((r) => setLog(r.log));
  }, []);

  if (!log) return <Loading />;

  return (
    <div>
      <h1>{t('nav_sharing_log')}</h1>
      <table className="grid">
        <thead>
          <tr>
            <th>{t('report_number')}</th><th>{t('log_entity')}</th><th>{t('log_channel')}</th>
            <th>{t('log_event')}</th><th>{t('log_status')}</th><th>{t('log_attempts')}</th><th>{t('log_time')}</th>
          </tr>
        </thead>
        <tbody>
          {log.map((l) => (
            <tr key={l.id}>
              <td>{l.report_number}</td>
              <td>{pick(l, 'entity')}</td>
              <td>{t(`channel_${l.channel}`)}</td>
              <td dir="ltr">{l.event}</td>
              <td>
                <span className={`pill ${l.status === 'success' ? 'approved' : 'rejected'}`}>
                  {l.status === 'success' ? t('log_success') : t('log_failed')}
                </span>
                {l.detail && <div className="hint">{l.detail}</div>}
              </td>
              <td>{l.attempts}</td>
              <td>{fmtDate(l.created_at)}</td>
            </tr>
          ))}
          {!log.length && <tr><td colSpan={7} className="hint">{t('no_results')}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
