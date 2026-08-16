import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { Loading, fmtDate } from '../components/common.jsx';

export default function Notifications() {
  const { t } = useI18n();
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api('GET', '/api/notifications').then(setData);
  }, []);
  useEffect(load, [load]);

  if (!data) return <Loading />;

  return (
    <div>
      <h1>{t('notif_title')}</h1>
      <button className="btn secondary small" style={{ marginBottom: 12 }}
        onClick={() => api('POST', '/api/notifications/read-all', {}).then(load)}>
        {t('notif_mark_all')}
      </button>
      <div className="card" style={{ padding: 0 }}>
        {!data.notifications.length && <div className="notif-item hint">{t('notif_empty')}</div>}
        {data.notifications.map((n) => (
          <div key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`}
            onClick={() => !n.read && api('POST', `/api/notifications/${n.id}/read`, {}).then(load)}>
            <div>{t(`notif_${n.type}`, n.params)}</div>
            <div className="time">{fmtDate(n.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
