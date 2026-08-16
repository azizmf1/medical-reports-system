import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { Loading, fmtDate } from '../components/common.jsx';

// Built-in Entity Simulator page: shows payloads received by the local
// webhook endpoint so Push delivery is demonstrable end-to-end.
export default function Simulator() {
  const { t } = useI18n();
  const [messages, setMessages] = useState(null);

  const load = useCallback(() => {
    api('GET', '/api/simulator/messages').then((r) => setMessages(r.messages));
  }, []);
  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [load]);

  if (!messages) return <Loading />;

  return (
    <div>
      <h1>{t('sim_title')}</h1>
      <div className="inline" style={{ marginBottom: 14 }}>
        <button className="btn secondary small" onClick={load}>{t('sim_refresh')}</button>
        <button className="btn danger small" onClick={() => api('DELETE', '/api/simulator/messages', {}).then(load)}>{t('sim_clear')}</button>
        <span className="hint" dir="ltr">POST http://localhost:4000/api/simulator/webhook</span>
      </div>
      {!messages.length && <div className="alert info">{t('sim_empty')}</div>}
      {messages.map((m) => (
        <div className="card" key={m.id}>
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <b dir="ltr">{m.body?.event || '—'} · {m.body?.report?.report_number || ''}</b>
            <span className="hint">{fmtDate(m.received_at)} · X-Webhook-Secret: <code>{m.headers['x-webhook-secret'] || '—'}</code></span>
          </div>
          <pre className="payload">{JSON.stringify(m.body, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}
