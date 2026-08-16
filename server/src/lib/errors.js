// All user-facing server messages are bilingual (EN + AR).
export class ApiError extends Error {
  constructor(status, en, ar, extra = {}) {
    super(en);
    this.status = status;
    this.body = { error: { en, ar, ...extra } };
  }
}

export const forbidden = (en = 'Access denied', ar = 'تم رفض الوصول') => new ApiError(403, en, ar);
export const notFound = (en = 'Not found', ar = 'غير موجود') => new ApiError(404, en, ar);
export const badRequest = (en, ar, extra) => new ApiError(400, en, ar, extra);

export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json(err.body);
  }
  console.error(err);
  return res.status(500).json({ error: { en: 'Internal server error', ar: 'خطأ داخلي في الخادم' } });
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
