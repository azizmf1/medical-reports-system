import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { JWT_SECRET, ROLES, SCOPED_ROLES } from '../config.js';
import { ApiError, forbidden } from './errors.js';

export function signToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Authentication required', 'يجب تسجيل الدخول'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(payload.uid);
    if (!user) throw new Error('inactive');
    req.user = user;
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired session', 'جلسة غير صالحة أو منتهية'));
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};

// Scope of the current user: assigned report types + facilities.
// BR-R2 / BR-R3: every report list, search, dashboard figure and detail is
// filtered by these. System Administration Manager always has ALL facilities.
export function getUserScope(user) {
  if (!SCOPED_ROLES.includes(user.role)) return { reportTypes: null, facilities: null };
  const reportTypes = db.prepare('SELECT report_type_id FROM user_report_type_scope WHERE user_id = ?')
    .all(user.id).map((r) => r.report_type_id);
  let facilities;
  if (user.role === ROLES.SYS_ADMIN_MANAGER) {
    facilities = 'ALL'; // implicit, always
  } else {
    facilities = db.prepare('SELECT facility_id FROM user_facility_scope WHERE user_id = ?')
      .all(user.id).map((r) => r.facility_id);
  }
  return { reportTypes, facilities };
}

export function reportInScope(user, report) {
  const scope = getUserScope(user);
  if (scope.reportTypes === null) return false; // builder/operations have no report access
  if (!scope.reportTypes.includes(report.report_type_id)) return false;
  if (scope.facilities !== 'ALL' && !scope.facilities.includes(report.facility_id)) return false;
  return true;
}

// SQL fragment + params limiting a query on `reports r` to the user's scope.
export function scopeFilterSql(user) {
  const scope = getUserScope(user);
  if (scope.reportTypes === null) return { sql: '1=0', params: [] };
  if (!scope.reportTypes.length) return { sql: '1=0', params: [] };
  let sql = `r.report_type_id IN (${scope.reportTypes.map(() => '?').join(',')})`;
  const params = [...scope.reportTypes];
  if (scope.facilities !== 'ALL') {
    if (!scope.facilities.length) return { sql: '1=0', params: [] };
    sql += ` AND r.facility_id IN (${scope.facilities.map(() => '?').join(',')})`;
    params.push(...scope.facilities);
  }
  return { sql, params };
}
