import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { requireAuth } from '../lib/auth.js';
import { UPLOADS_DIR } from '../config.js';

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// File-attachment fields store files locally under /server/uploads.
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-؀-ۿ]/g, '_');
    cb(null, `${crypto.randomBytes(6).toString('hex')}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: { en: 'No file uploaded', ar: 'لم يتم رفع أي ملف' } });
  res.json({ filename: req.file.filename, original: req.file.originalname, url: `/api/uploads/${req.file.filename}` });
});

router.get('/:name', (req, res) => {
  const name = path.basename(req.params.name);
  res.sendFile(path.join(UPLOADS_DIR, name));
});

export default router;
