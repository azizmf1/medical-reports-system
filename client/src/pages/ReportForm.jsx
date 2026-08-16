import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import DynamicForm, { validateValues } from '../components/DynamicForm.jsx';
import { ErrorAlert, Loading } from '../components/common.jsx';

// New Report (pick Published template + facility, duplicate check runs on
// create) and Edit Report (Draft / Returned for Correction).
export default function ReportForm() {
  const { id } = useParams(); // present when editing
  const { t, pick, lang } = useI18n();
  const navigate = useNavigate();

  const [types, setTypes] = useState(null);
  const [facilities, setFacilities] = useState(null);
  const [examineeSection, setExamineeSection] = useState(null);
  const [typeId, setTypeId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [started, setStarted] = useState(false);
  const [schema, setSchema] = useState(null);
  const [examinee, setExaminee] = useState({});
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [reportState, setReportState] = useState(null);
  const [remarksHistory, setRemarksHistory] = useState([]);

  useEffect(() => {
    api('GET', '/api/templates/examinee-section').then((r) => setExamineeSection(r.section));
    if (!id) {
      api('GET', '/api/templates/report-types').then((r) => setTypes(r.report_types.filter((rt) => rt.versions.length)));
      api('GET', '/api/facilities').then((r) => setFacilities(r.facilities.filter((f) => f.status === 'active')));
    } else {
      api('GET', `/api/reports/${id}`).then((r) => {
        setSchema({ sections: r.report.schema.sections });
        setExaminee(r.report.examinee);
        setData(r.report.data);
        setReportState(r.report.state);
        setRemarksHistory(r.report.history.filter((h) => h.remarks && h.to_state === 'returned'));
        setStarted(true);
      }).catch(setError);
    }
  }, [id]);

  const examineeSchema = useMemo(
    () => (examineeSection ? { sections: [examineeSection] } : null),
    [examineeSection]
  );

  const start = () => {
    const type = types.find((x) => x.id === Number(typeId));
    if (!type) return;
    const latest = type.versions[type.versions.length - 1];
    setSchema({ sections: latest.schema.sections });
    setStarted(true);
  };

  const validate = (requireMandatory) => {
    const exErr = validateValues(examineeSchema, examinee, { requireMandatory, lang, t });
    const dtErr = schema ? validateValues(schema, data, { requireMandatory, lang, t }) : {};
    return { exErr, dtErr };
  };

  const save = async (submit) => {
    setError(null);
    // Examinee is always fully mandatory; report data only on submission.
    const { exErr, dtErr } = validate(submit);
    if (Object.keys(exErr).length || (submit && Object.keys(dtErr).length)) {
      setErrors({ ...dtErr, ...Object.fromEntries(Object.entries(exErr).map(([k, v]) => [`ex_${k}`, v])) });
      setError({ body: { error: { en: t('fix_errors'), ar: t('fix_errors') } } });
      return;
    }
    setErrors({});
    try {
      let reportId = id;
      if (!reportId) {
        const created = await api('POST', '/api/reports', {
          report_type_id: Number(typeId), facility_id: Number(facilityId), examinee, data,
        });
        reportId = created.report.id;
      } else {
        await api('PUT', `/api/reports/${reportId}`, { examinee, data });
      }
      if (submit) await api('POST', `/api/reports/${reportId}/submit`);
      navigate(`/reports/${reportId}`);
    } catch (e) {
      setError(e);
    }
  };

  if (error && !started && id) return <ErrorAlert error={error} />;
  if (!examineeSection || (!id && (!types || !facilities))) return <Loading />;

  return (
    <div>
      <h1>{id ? `${t('user_edit')} ${reportState === 'returned' ? '— ' + t('state_returned') : ''}` : t('new_report')}</h1>
      <ErrorAlert error={error} onClose={() => setError(null)} />

      {!id && !started && (
        <div className="card">
          <div className="row">
            <label className="f"><span>{t('pick_template')}</span>
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                <option value="">—</option>
                {types.map((x) => <option key={x.id} value={x.id}>{pick(x, 'name')}</option>)}
              </select>
            </label>
            <label className="f"><span>{t('pick_facility')}</span>
              <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
                <option value="">—</option>
                {facilities.map((f) => <option key={f.id} value={f.id}>{pick(f, 'name')}</option>)}
              </select>
            </label>
          </div>
          <button className="btn" disabled={!typeId || !facilityId} onClick={start}>{t('start')}</button>
        </div>
      )}

      {started && schema && (
        <>
          {remarksHistory.length > 0 && (
            <div className="alert info">
              {remarksHistory.map((h, i) => <div key={i}><b>{t('remarks')}:</b> {h.remarks}</div>)}
            </div>
          )}
          <DynamicForm schema={examineeSchema} values={examinee} onChange={setExaminee}
            errors={Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith('ex_')).map(([k, v]) => [k.slice(3), v]))} />
          <DynamicForm schema={schema} values={data} onChange={setData} errors={errors} />
          <div className="inline">
            <button className="btn secondary" onClick={() => save(false)}>{t('save_draft')}</button>
            <button className="btn success" onClick={() => save(true)}>{t('submit_report')}</button>
          </div>
        </>
      )}
    </div>
  );
}
