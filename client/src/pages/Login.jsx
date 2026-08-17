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
    <div className="login-split">
      {/* Form side — appears on the right in RTL (first flex child) */}
      <div className="login-form-side">
        <div className="login-form-top">
          <button type="button" className="btn secondary small" onClick={toggle}>{t('language')}</button>
        </div>
        <form className="login-form" onSubmit={submit}>
          <h1>{t('login')}</h1>
          <div className="login-divider" />
          <ErrorAlert error={error} onClose={() => setError(null)} />
          <label className="f"><span>{t('username')}</span>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          </label>
          <label className="f"><span>{t('password')}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <button className="btn login-submit" disabled={busy}>{t('login_button')}</button>
        </form>
      </div>

      {/* Hero side — building imagery effect with blue overlay */}
      <div className="login-hero">
        <div className="login-brand">
          <span className="login-brand-name">{t('app_title')}</span>
          <span className="login-brand-mark">✚</span>
        </div>
        <div className="login-hero-card">
          <h2>{t('login_tagline_title')}</h2>
          <p>{t('login_tagline_text')}</p>
        </div>
        <div className="login-hero-dots">
          <span /><span className="on" /><span />
        </div>
        <div className="login-hero-footer">
          <div className="login-hero-links">
            <a href="#" onClick={(e) => e.preventDefault()}>{t('login_link_guide')}</a>
            <a href="#" onClick={(e) => e.preventDefault()}>{t('login_link_privacy')}</a>
          </div>
          {t('login_footer')}
        </div>
      </div>
    </div>
  );
}
