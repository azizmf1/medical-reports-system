# Deployment — النشر

The system is a full-stack app: a long-lived Node/Express server with a file-based SQLite
database and Chromium PDF generation, plus a static React SPA. Vercel's serverless platform
cannot host the server part (no persistent filesystem, no long-lived process), so the
recommended split is:

| Part | Host | Why |
|------|------|-----|
| `client/` (React SPA) | **Vercel** | static build, free, fast CDN |
| `server/` (API + SQLite + PDF) | **Render** (or Railway/VPS) | persistent process, can run Chromium |

## 1. Backend on Render — الخادم على Render

1. Push this repository to GitHub.
2. In Render: **New → Blueprint** and pick this repo — `render.yaml` configures everything
   (root `server/`, health check, generated secrets, auto-seed).
3. After the first deploy, note the service URL, e.g. `https://mrms-server.onrender.com`.

Free-plan note: no persistent disk — the demo database resets on restart and `AUTO_SEED`
re-creates the seed data. For real persistence use a paid instance with a disk mounted at
`/data` and set `DB_PATH=/data/mrms.db`.

## 2. Frontend on Vercel — الواجهة على Vercel

1. In Vercel: **Add New → Project**, import the same GitHub repo.
2. Set **Root Directory** = `client` (framework auto-detected: Vite).
3. Add environment variable:
   - `VITE_API_URL` = the Render URL, e.g. `https://mrms-server.onrender.com`
4. Deploy. `client/vercel.json` already handles SPA route rewrites (deep links like
   `/verify/RPT-2026-000004` work).

## 3. Connect them back — الربط

In Render, set the environment variable `CLIENT_BASE_URL` to your Vercel URL
(e.g. `https://mrms.vercel.app`) and redeploy — QR codes and verification links in generated
PDFs will then open the deployed SPA.

## Local development

Unchanged: `npm install && npm run seed && npm run dev` (client proxies `/api` to `:4000`;
`VITE_API_URL` stays unset).
