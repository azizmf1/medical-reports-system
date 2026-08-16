import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Verify from './pages/Verify.jsx';
import MyReports from './pages/MyReports.jsx';
import ReportForm from './pages/ReportForm.jsx';
import ReportDetail from './pages/ReportDetail.jsx';
import ReviewQueue from './pages/ReviewQueue.jsx';
import Browse from './pages/Browse.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ExamineeHistory from './pages/ExamineeHistory.jsx';
import Templates from './pages/Templates.jsx';
import TemplateEditor from './pages/TemplateEditor.jsx';
import TemplateApprovals from './pages/TemplateApprovals.jsx';
import Users from './pages/Users.jsx';
import Facilities from './pages/Facilities.jsx';
import Entities from './pages/Entities.jsx';
import SharingLog from './pages/SharingLog.jsx';
import Simulator from './pages/Simulator.jsx';
import Notifications from './pages/Notifications.jsx';

const HOME = {
  data_entry: '/my-reports',
  checker: '/review-queue',
  system_manager: '/browse',
  sys_admin_manager: '/browse',
  report_builder: '/templates',
  operations: '/template-approvals',
};

// Client-side role guard (server enforces the same rules — BR-R3).
function Guard({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) return <Navigate to={HOME[user.role] || '/login'} replace />;
  return children;
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return null;

  return (
    <Routes>
      {/* Public pages */}
      <Route path="/verify/:reportNumber" element={<Verify />} />
      <Route path="/login" element={user ? <Navigate to={HOME[user.role]} replace /> : <Login />} />

      {!user && <Route path="*" element={<Navigate to="/login" replace />} />}
      {user && (
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to={HOME[user.role]} replace />} />
          <Route path="/my-reports" element={<Guard roles={['data_entry']}><MyReports /></Guard>} />
          <Route path="/new-report" element={<Guard roles={['data_entry']}><ReportForm /></Guard>} />
          <Route path="/reports/:id/edit" element={<Guard roles={['data_entry']}><ReportForm /></Guard>} />
          <Route path="/reports/:id" element={<ReportDetail />} />
          <Route path="/review-queue" element={<Guard roles={['checker']}><ReviewQueue /></Guard>} />
          <Route path="/browse" element={<Guard roles={['system_manager', 'sys_admin_manager']}><Browse /></Guard>} />
          <Route path="/dashboard" element={<Guard roles={['system_manager', 'sys_admin_manager']}><Dashboard /></Guard>} />
          <Route path="/examinee-history" element={<Guard roles={['data_entry', 'checker', 'system_manager', 'sys_admin_manager']}><ExamineeHistory /></Guard>} />
          <Route path="/templates" element={<Guard roles={['report_builder']}><Templates /></Guard>} />
          <Route path="/templates/versions/:id" element={<Guard roles={['report_builder']}><TemplateEditor /></Guard>} />
          <Route path="/templates/new" element={<Guard roles={['report_builder']}><TemplateEditor /></Guard>} />
          <Route path="/template-approvals" element={<Guard roles={['operations']}><TemplateApprovals /></Guard>} />
          <Route path="/users" element={<Guard roles={['operations']}><Users /></Guard>} />
          <Route path="/facilities" element={<Guard roles={['operations']}><Facilities /></Guard>} />
          <Route path="/entities" element={<Guard roles={['operations']}><Entities /></Guard>} />
          <Route path="/sharing-log" element={<Guard roles={['operations']}><SharingLog /></Guard>} />
          <Route path="/simulator" element={<Guard roles={['operations']}><Simulator /></Guard>} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="*" element={<Navigate to={HOME[user.role]} replace />} />
        </Route>
      )}
    </Routes>
  );
}
