import { Router } from 'express';
import { db } from '../db.js';

// Built-in Entity Simulator: a local webhook endpoint that stores whatever it
// receives so Push delivery is demonstrable end-to-end on the /simulator page.
const router = Router();

router.post('/webhook', (req, res) => {
  const headers = {
    'x-webhook-secret': req.headers['x-webhook-secret'] || null,
    'content-type': req.headers['content-type'] || null,
  };
  db.prepare('INSERT INTO simulator_messages (headers_json, body_json) VALUES (?,?)')
    .run(JSON.stringify(headers), JSON.stringify(req.body ?? {}));
  res.json({ received: true });
});

router.get('/messages', (req, res) => {
  const rows = db.prepare('SELECT * FROM simulator_messages ORDER BY id DESC LIMIT 100').all();
  res.json({
    messages: rows.map((m) => ({
      id: m.id, received_at: m.received_at,
      headers: JSON.parse(m.headers_json), body: JSON.parse(m.body_json),
    })),
  });
});

router.delete('/messages', (req, res) => {
  db.prepare('DELETE FROM simulator_messages').run();
  res.json({ ok: true });
});

export default router;
