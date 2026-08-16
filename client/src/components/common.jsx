import React from 'react';
import { useI18n } from '../i18n/index.jsx';

export function StatePill({ state }) {
  const { t } = useI18n();
  return <span className={`pill ${state}`}>{t(`state_${state}`)}</span>;
}

export function ValidityPill({ status }) {
  const { t } = useI18n();
  if (!status) return null;
  return <span className={`pill ${status}`}>{t(`validity_${status}`)}</span>;
}

export function ErrorAlert({ error, onClose }) {
  const { lang, t } = useI18n();
  if (!error) return null;
  const msg = error.body?.error ? (lang === 'ar' ? error.body.error.ar : error.body.error.en) : t('error_generic');
  const details = error.body?.error?.details;
  return (
    <div className="alert error" onClick={onClose}>
      <div>{msg}</div>
      {Array.isArray(details) && (
        <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
          {details.map((d, i) => (
            <li key={i}>
              {(lang === 'ar' ? d.label_ar : d.label_en) ? `${lang === 'ar' ? d.label_ar : d.label_en}: ` : ''}
              {lang === 'ar' ? d.ar : d.en}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Loading() {
  const { t } = useI18n();
  return <div className="hint" style={{ padding: 20 }}>{t('loading')}</div>;
}

export function fmtDate(s) {
  return s ? String(s).slice(0, 16) : '—';
}
