import { db } from '../db.js';

export function audit(actorType, actorId, action, details, ip) {
  db.prepare('INSERT INTO audit_log (actor_type, actor_id, action, details_json, ip) VALUES (?,?,?,?,?)')
    .run(actorType, actorId ?? null, action, details ? JSON.stringify(details) : null, ip ?? null);
}
