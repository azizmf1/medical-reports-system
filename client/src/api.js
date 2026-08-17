// Backend base URL. Empty in local dev (Vite proxies /api to :4000); set
// VITE_API_URL to the deployed server URL when hosting the client separately.
export const API_BASE = import.meta.env.VITE_API_URL || '';

let token = localStorage.getItem('mrms_token') || null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('mrms_token', t);
  else localStorage.removeItem('mrms_token');
}

export function getToken() {
  return token;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.en || 'Request failed');
    this.status = status;
    this.body = body;
  }
}

export async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}

export async function downloadPdf(reportId, reportNumber) {
  const res = await fetch(`${API_BASE}/api/reports/${reportId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${reportNumber}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/api/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}
