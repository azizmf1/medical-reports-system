import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, downloadPdf } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n/index.jsx';
import { StatePill, ValidityPill, ErrorAlert, Loading, fmtDate } from '../components/common.jsx';

function FieldValue({ f, lang }) {
  if (!f.visible || f.value === null || f.value === '' || f.value === undefined) return <span className="hint">—</span>;
  if (f.type === 'table' && f.rows) {
    return (
      <table className="subtable">
        <thead><tr>{f.columns.map((c) => <th key={c.key}>{lang === 'ar' ? c.label_ar : c.label_en}</th>)}</tr></thead>
        <tbody>
          {f.rows.map((cells, i) => (
            <tr key={i}>{cells.map((cell, j) => (
              <td key={j}>{cell.display_en !== undefined ? (lang === 'ar' ? cell.display_ar : cell.display_en) : String(cell.value ?? '')}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (f.display_en !== undefined) return <span>{lang === 'ar' ? f.display_ar : f.display_en}</span>;
  if (f.type === 'file') return <a href={f.value} target="_blank" rel="noreferrer">📎 {String(f.value).split('/').pop()}</a>;
  return <span>{String(f.value)}</span>;
}

export default function ReportDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, lang, pick } = useI18n();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [actionText, setActionText] = useState('');
  const [pendingAction, setPendingAction] = useState(null); // 'return' | 'reject' | 'cancel'

  const load = useCallback(() => {
    api('GET', `/api/reports/${id}`).then((r) => setReport(r.report)).catch(setError);
  }, [id]);
  useEffect(load, [load]);

  if (error && !report) return <ErrorAlert error={error} />;
  if (!report) return <Loading />;

  const isCreator = report.created_by === user.id;
  const canEdit = user.role === 'data_entry' && isCreator && ['draft', 'returned'].includes(report.state);
  const isChecker = user.role === 'checker';
  const claimedByMe = report.claimed_by === user.id;
  const canClaim = isChecker && report.state === 'submitted';
  const canDecide = isChecker && report.state === 'under_review' && claimedByMe;
  const canCancel = user.role === 'sys_admin_manager' && report.state === 'approved';
  const showPdf = ['approved', 'cancelled'].includes(report.state);

  const act = async (path, body) => {
    setError(null);
    try {
      await api('POST', `/api/reports/${id}/${path}`, body);
      setPendingAction(null); setActionText('');
      load();
    } catch (e) { setError(e); }
  };

  return (
    <div>
      <h1>
        {report.report_number || `#${report.id}`} — {pick(report, 'type')}{' '}
        <StatePill state={report.state} />{' '}
        {report.state === 'approved' && <ValidityPill status={report.validity_status} />}
      </h1>
      <ErrorAlert error={error} onClose={() => setError(null)} />

      {report.state === 'under_review' && !claimedByMe && (
        <div className="alert info">{t('under_review_by', { name: pick(report, 'claimed_by') })}</div>
      )}
      {report.cancel_reason && (
        <div className="alert error"><b>{t('cancel_reason')}:</b> {report.cancel_reason}</div>
      )}

      <div className="inline" style={{ marginBottom: 16 }}>
        {canEdit && <Link className="btn" to={`/reports/${id}/edit`}>{t('user_edit')}</Link>}
        {canClaim && <button className="btn" onClick={() => act('claim')}>{t('claim_review')}</button>}
        {canDecide && (
          <>
            <button className="btn success" onClick={() => act('approve')}>{t('approve')}</button>
            <button className="btn warn" onClick={() => setPendingAction('return')}>{t('return_with_remarks')}</button>
            <button className="btn danger" onClick={() => setPendingAction('reject')}>{t('reject')}</button>
            <button className="btn secondary" onClick={() => act('release')}>{t('release_claim')}</button>
          </>
        )}
        {canCancel && <button className="btn danger" onClick={() => setPendingAction('cancel')}>{t('cancel_report')}</button>}
        {showPdf && <button className="btn secondary" onClick={() => downloadPdf(report.id, report.report_number).catch(setError)}>{t('download_pdf')}</button>}
        {showPdf && report.verification_hash && (
          <a className="btn secondary" href={`/verify/${report.report_number}?h=${report.verification_hash}`} target="_blank" rel="noreferrer">
            {t('verification_link')}
          </a>
        )}
      </div>

      {pendingAction && (
        <div className="card">
          <label className="f">
            <span>{pendingAction === 'return' ? t('remarks') : pendingAction === 'cancel' ? t('cancel_reason') : t('reason')} <span className="req">*</span></span>
            <textarea value={actionText} onChange={(e) => setActionText(e.target.value)} />
          </label>
          <div className="inline">
            <button className="btn" disabled={!actionText.trim()} onClick={() => {
              if (pendingAction === 'return') act('return', { remarks: actionText });
              else if (pendingAction === 'reject') act('reject', { reason: actionText });
              else act('cancel', { reason: actionText });
            }}>{t('confirm')}</button>
            <button className="btn secondary" onClick={() => setPendingAction(null)}>{t('cancel')}</button>
          </div>
        </div>
      )}

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="kv"><span className="k">{t('facility')}</span><span>{pick(report, 'facility')}</span></div>
          <div className="kv"><span className="k">{t('template_version')}</span><span>v{report.template_version_no}</span></div>
          <div className="kv"><span className="k">{t('created_at')}</span><span>{fmtDate(report.created_at)}</span></div>
          {report.approved_at && <div className="kv"><span className="k">{t('approved_at')}</span><span>{fmtDate(report.approved_at)}</span></div>}
          {report.expiry_date && <div className="kv"><span className="k">{t('expiry_date')}</span><span>{report.expiry_date}</span></div>}
        </div>
      </div>

      <h2>{t('report_data')}</h2>
      {report.sections.map((s, i) => (
        <div className="section-block" key={i}>
          <h3><span>{lang === 'ar' ? s.title_ar : s.title_en}</span></h3>
          <div className="fields">
            <table className="subtable">
              <tbody>
                {s.fields.filter((f) => f.visible).map((f) => (
                  <tr key={f.key}>
                    <td style={{ width: '35%', fontWeight: 600 }}>{lang === 'ar' ? f.label_ar : f.label_en}</td>
                    <td><FieldValue f={f} lang={lang} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <h2>{t('history')}</h2>
      <table className="grid">
        <thead><tr><th>{t('state')}</th><th>{t('actions')}</th><th>{t('remarks')}</th><th>{t('log_time')}</th></tr></thead>
        <tbody>
          {report.history.map((h) => (
            <tr key={h.id}>
              <td><StatePill state={h.to_state} /></td>
              <td>{lang === 'ar' ? h.actor_ar : h.actor_en}</td>
              <td>{h.remarks || '—'}</td>
              <td>{fmtDate(h.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
