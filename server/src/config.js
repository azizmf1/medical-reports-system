import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(__dirname, '..');
export const DB_PATH = process.env.DB_PATH || path.join(SERVER_ROOT, 'data', 'mrms.db');
export const UPLOADS_DIR = path.join(SERVER_ROOT, 'uploads');
export const GENERATED_DIR = path.join(SERVER_ROOT, 'generated');
export const PORT = Number(process.env.PORT || 4000);
// ASSUMPTION: secrets default to dev values; override via env in real deployments.
export const JWT_SECRET = process.env.JWT_SECRET || 'mrms-dev-jwt-secret-change-me';
export const VERIFY_SECRET = process.env.VERIFY_SECRET || 'mrms-dev-verify-secret-change-me';
export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
// Base URL of the SPA, used inside QR codes so the verification page opens in the client app.
export const CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || 'http://localhost:5173';

export const ROLES = {
  DATA_ENTRY: 'data_entry',
  CHECKER: 'checker',
  SYSTEM_MANAGER: 'system_manager',
  SYS_ADMIN_MANAGER: 'sys_admin_manager',
  REPORT_BUILDER: 'report_builder',
  OPERATIONS: 'operations',
};
export const ALL_ROLES = Object.values(ROLES);
// Roles whose report access is scoped by assigned report types + facilities (roles 1-4).
export const SCOPED_ROLES = [ROLES.DATA_ENTRY, ROLES.CHECKER, ROLES.SYSTEM_MANAGER, ROLES.SYS_ADMIN_MANAGER];

export const REPORT_STATES = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  RETURNED: 'returned',
  REJECTED: 'rejected',
  APPROVED: 'approved',
  CANCELLED: 'cancelled',
};

export const TEMPLATE_STATES = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
  RETIRED: 'retired',
};

// BR-DUP: states of an existing report that block a new report of the same type
// for the same examinee when duplicate prevention is ON (approved handled
// separately because it must also still be valid).
export const DUPLICATE_BLOCKING_STATES = [
  REPORT_STATES.DRAFT,
  REPORT_STATES.SUBMITTED,
  REPORT_STATES.UNDER_REVIEW,
  REPORT_STATES.RETURNED,
];
