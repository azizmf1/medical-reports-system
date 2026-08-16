import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n/index.jsx';
import { ErrorAlert } from '../components/common.jsx';

export default function Login() {
  const { login } = useAuth();
  const { t, toggle } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={submit}>
        <h1>{t('app_title')}</h1>
        <ErrorAlert error={error} onClose={() => setError(null)} />
        <label className="f"><span>{t('username')}</span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label className="f"><span>{t('password')}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn" style={{ width: '100%' }} disabled={busy}>{t('login')}</button>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button type="button" className="btn secondary small" onClick={toggle}>{t('language')}</button>
        </div>
      </form>
    </div>
  );
}
