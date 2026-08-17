import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { fmtDate } from '../components/common.jsx';
import { API_BASE } from '../api.js';

// Public verification page (no login). Shows only validity metadata — never
// medical field data; examinee ID is masked server-side.
export default function Verify() {
  const { reportNumber } = useParams();
  const [params] = useSearchParams();
  const { t, toggle, lang } = useI18n();
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/public/verify/${encodeURIComponent(reportNumber)}?h=${encodeURIComponent(params.get('h') || '')}`)
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult({ result: 'Invalid' }));
  }, [reportNumber, params]);

  return (
    <div className="verify-wrap">
      <div className="verify-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>{t('verify_title')}</h1>
          <button className="btn secondary small" onClick={toggle}>{t('language')}</button>
        </div>
        {!result ? <div className="hint">{t('loading')}</div> : (
          <>
            <div className={`verify-result ${result.result === 'Invalid hash' ? 'Invalid' : result.result}`}>
              {t(`verify_result_${result.result}`)}
            </div>
            <div className="kv"><span className="k">{t('report_number')}</span><b>{result.report_number}</b></div>
            {result.template_name_en && (
              <>
                <div className="kv"><span className="k">{t('report_type')}</span><span>{lang === 'ar' ? result.template_name_ar : result.template_name_en}</span></div>
                <div className="kv"><span className="k">{t('facility')}</span><span>{lang === 'ar' ? result.facility_ar : result.facility_en}</span></div>
                <div className="kv"><span className="k">{t('approved_at')}</span><span>{fmtDate(result.approval_date)}</span></div>
                {result.expiry_date && <div className="kv"><span className="k">{t('expiry_date')}</span><span>{result.expiry_date}</span></div>}
                <div className="kv"><span className="k">{t('verify_id_masked')}</span><span>{result.examinee_id_masked}</span></div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
