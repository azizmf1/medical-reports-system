import crypto from 'crypto';
import { VERIFY_SECRET } from '../config.js';

// Tamper-evident hash embedded in the QR verification URL and used to guard
// the public PDF download link.
export function verificationHash(reportNumber) {
  return crypto.createHmac('sha256', VERIFY_SECRET).update(String(reportNumber)).digest('hex').slice(0, 24);
}

export function checkHash(reportNumber, hash) {
  const expected = verificationHash(reportNumber);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(hash || '')));
  } catch {
    return false;
  }
}
