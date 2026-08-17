import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n/index.jsx';
import { api } from '../api.js';

// Sidebar navigation per role (spec §4).
const NAV = {
  data_entry: [
    ['/my-reports', 'nav_my_reports'],
    ['/new-report', 'nav_new_report'],
    ['/examinee-history', 'nav_examinee_history'],
  ],
  checker: [
    ['/review-queue', 'nav_review_queue'],
    ['/examinee-history', 'nav_examinee_history'],
  ],
  system_manager: [
    ['/browse', 'nav_browse'],
    ['/dashboard', 'nav_dashboard'],
    ['/examinee-history', 'nav_examinee_history'],
  ],
  sys_admin_manager: [
    ['/browse', 'nav_browse'],
    ['/dashboard', 'nav_dashboard'],
    ['/examinee-history', 'nav_examinee_history'],
  ],
  report_builder: [
    ['/templates', 'nav_templates'],
  ],
  operations: [
    ['/template-approvals', 'nav_template_approvals'],
    ['/users', 'nav_users'],
    ['/facilities', 'nav_facilities'],
    ['/entities', 'nav_entities'],
    ['/sharing-log', 'nav_sharing_log'],
    ['/simulator', 'nav_simulator'],
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { t, toggle, pick } = useI18n();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => api('GET', '/api/notifications').then((r) => alive && setUnread(r.unread)).catch(() => {});
    load();
    const iv = setInterval(load, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="mark">✚</span><span>{t('app_title')}</span></div>
        <nav>
          {(NAV[user.role] || []).map(([to, key]) => (
            <NavLink key={to} to={to}>{t(key)}</NavLink>
          ))}
          <NavLink to="/notifications">{t('nav_notifications')}{unread > 0 ? ` (${unread})` : ''}</NavLink>
        </nav>
        <div className="whoami">
          <b>{pick(user, 'full_name')}</b>
          {t(`role_${user.role}`)}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="title">{t('app_title')}</div>
          <div className="tools">
            <button className="iconbtn" title={t('nav_notifications')} onClick={() => navigate('/notifications')}>
              🔔{unread > 0 && <span className="badge-dot">{unread}</span>}
            </button>
            <button className="btn secondary small" onClick={toggle}>{t('language')}</button>
            <button className="btn secondary small" onClick={() => { logout(); navigate('/login'); }}>{t('logout')}</button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
