import { db } from '../db.js';
import { ROLES } from '../config.js';
import { currentSettings } from './templates.js';
import { buildReportPayload } from './reportData.js';
import { notifyRole } from '../lib/notify.js';

async function postWebhook(entity, payload) {
  const res = await fetch(entity.push_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': entity.push_secret || '',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// Push with one automatic retry on failure (spec 3.7). Final status is logged
// to share_log for Operations; failures raise an in-app notification.
async function pushToEntity(report, entity, event) {
  let attempts = 0;
  let lastError = null;
  const payload = buildReportPayload(report, event);
  for (let i = 0; i < 2; i++) {
    attempts++;
    try {
      await postWebhook(entity, payload);
      lastError = null;
      break;
    } catch (e) {
      lastError = e.message;
    }
  }
  const status = lastError ? 'failed' : 'success';
  db.prepare(
    'INSERT INTO share_log (report_id, entity_id, channel, event, status, attempts, detail) VALUES (?,?,?,?,?,?,?)'
  ).run(report.id, entity.id, 'push', event, status, attempts, lastError);
  if (status === 'success' && event === 'report.approved') {
    // Record the delivery so cancellation notifications target only entities
    // that actually received the original push (spec 3.7).
    db.prepare('INSERT OR IGNORE INTO report_shares (report_id, entity_id, event) VALUES (?,?,?)')
      .run(report.id, entity.id, 'report.approved');
  }
  if (status === 'failed') {
    notifyRole(ROLES.OPERATIONS, 'push_failed', {
      report_number: report.report_number,
      entity_en: entity.name_en,
      entity_ar: entity.name_ar,
    });
  }
  return status;
}

// Fires automatically on approval, per the CURRENT sharing settings of the
// report's type (latest Published version). No manual sharing step exists.
export async function shareOnApproval(reportId) {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
  const settings = currentSettings(report.report_type_id);
  for (const target of settings.sharing) {
    if (!['push', 'both'].includes(target.channel)) continue;
    const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(target.entity_id);
    if (!entity || entity.status !== 'active' || !entity.push_enabled || !entity.push_url) continue;
    await pushToEntity(report, entity, 'report.approved');
  }
}

// Cancellation notifications go ONLY to entities that received the original push.
export async function shareOnCancellation(reportId) {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
  const shares = db.prepare(
    "SELECT e.* FROM report_shares rs JOIN entities e ON e.id = rs.entity_id WHERE rs.report_id = ? AND rs.event = 'report.approved'"
  ).all(report.id);
  for (const entity of shares) {
    if (entity.status !== 'active' || !entity.push_url) continue;
    await pushToEntity(report, entity, 'report.cancelled');
  }
}

// Pull visibility is computed DYNAMICALLY from current sharing settings at
// query time (never snapshotted): an entity newly added to a template
// immediately gains Pull access to all previously approved reports of the type.
export function entityPullTypeIds(entity) {
  if (!entity.pull_enabled || entity.status !== 'active') return [];
  const scope = db.prepare('SELECT report_type_id FROM entity_pull_scope WHERE entity_id = ?')
    .all(entity.id).map((r) => r.report_type_id);
  return scope.filter((typeId) => {
    const settings = currentSettings(typeId);
    return settings.sharing.some(
      (t) => t.entity_id === entity.id && ['pull', 'both'].includes(t.channel)
    );
  });
}
