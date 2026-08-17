import express from 'express';
import cors from 'cors';
import { PORT } from './config.js';
import './db.js';
import { errorHandler } from './lib/errors.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import facilityRoutes from './routes/facilities.js';
import entityRoutes from './routes/entities.js';
import templateRoutes from './routes/templates.js';
import reportRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import shareLogRoutes from './routes/shareLog.js';
import externalRoutes from './routes/external.js';
import publicRoutes from './routes/publicRoutes.js';
import simulatorRoutes from './routes/simulator.js';
import uploadRoutes from './routes/uploads.js';

// Convenience for hosted demos (e.g. Render free tier without a persistent
// disk): seed automatically when the database is empty and AUTO_SEED=true.
if (process.env.AUTO_SEED === 'true') {
  const { db } = await import('./db.js');
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count === 0) {
    console.log('AUTO_SEED: empty database — seeding…');
    await import('./seed.js');
  }
}

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/share-log', shareLogRoutes);
app.use('/api/external/v1', externalRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/simulator', simulatorRoutes);
app.use('/api/uploads', uploadRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`MRMS server listening on http://localhost:${PORT}`);
});
