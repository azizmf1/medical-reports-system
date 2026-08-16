import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { Loading } from '../components/common.jsx';

function Bars({ items, labelOf }) {
  const max = Math.max(1, ...items.map((x) => x.count));
  return (
    <div>
      {items.map((x, i) => (
        <div className="bar-row" key={i}>
          <div className="lbl">{labelOf(x)}</div>
          <div className="bar" style={{ width: `${(x.count / max) * 60}%` }} />
          <div className="val">{x.count}</div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { t, lang } = useI18n();
  const [d, setD] = useState(null);

  useEffect(() => { api('GET', '/api/dashboard').then(setD); }, []);
  if (!d) return <Loading />;

  const states = Object.entries(d.by_state).map(([state, count]) => ({ state, count }));

  return (
    <div>
      <h1>{t('nav_dashboard')}</h1>
      <div className="stat-row">
        <div className="stat"><div className="n">{d.total}</div><div className="l">{t('dashboard_total')}</div></div>
        <div className="stat"><div className="n">{d.expired_count}</div><div className="l">{t('dashboard_expired')}</div></div>
        <div className="stat">
          <div className="n">{d.avg_submit_to_approve_hours == null ? '—' : d.avg_submit_to_approve_hours.toFixed(1)}</div>
          <div className="l">{t('dashboard_avg')} ({t('hours')})</div>
        </div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('dashboard_by_state')}</h2>
        <Bars items={states} labelOf={(x) => t(`state_${x.state}`)} />
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('dashboard_by_type')}</h2>
        <Bars items={d.by_type} labelOf={(x) => (lang === 'ar' ? x.name_ar : x.name_en)} />
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('dashboard_by_facility')}</h2>
        <Bars items={d.by_facility} labelOf={(x) => (lang === 'ar' ? x.name_ar : x.name_en)} />
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('dashboard_by_month')}</h2>
        <Bars items={d.by_month} labelOf={(x) => x.month} />
      </div>
    </div>
  );
}
