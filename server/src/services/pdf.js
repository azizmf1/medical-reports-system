import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { db } from '../db.js';
import { GENERATED_DIR, CLIENT_BASE_URL } from '../config.js';
import { renderReportSections, reportMeta } from './reportData.js';
import { verificationHash } from './verification.js';

fs.mkdirSync(GENERATED_DIR, { recursive: true });

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fieldValueHtml(f) {
  if (!f.visible || f.value == null || f.value === '') return '<span class="empty">—</span>';
  if (f.type === 'table' && f.rows) {
    const head = f.columns.map((c) => `<th>${esc(c.label_en)}<br/><span class="ar">${esc(c.label_ar)}</span></th>`).join('');
    const rows = f.rows.map((cells) =>
      `<tr>${cells.map((cell) => `<td>${cell.display_en != null ? esc(cell.display_en) + ' / ' + esc(cell.display_ar) : esc(cell.value ?? '')}</td>`).join('')}</tr>`
    ).join('');
    return `<table class="inner"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  if (f.display_en != null) return `${esc(f.display_en)} <span class="ar">/ ${esc(f.display_ar)}</span>`;
  if (f.type === 'file') return `<span class="file">📎 ${esc(String(f.value).split('/').pop())}</span>`;
  return esc(f.value);
}

function buildHtml(report, qrDataUrl, checkerName) {
  const meta = reportMeta(report);
  const sections = renderReportSections(report);
  const sectionHtml = sections.map((s) => `
    <h2><span>${esc(s.title_en)}</span><span class="ar">${esc(s.title_ar)}</span></h2>
    <table class="fields">
      ${s.fields.filter((f) => f.visible).map((f) => `
        <tr>
          <td class="label"><div>${esc(f.label_en)}</div><div class="ar">${esc(f.label_ar)}</div></td>
          <td class="value">${fieldValueHtml(f)}</td>
        </tr>`).join('')}
    </table>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 20mm 15mm; }
    body { font-family: 'Noto Sans', 'Noto Naskh Arabic', 'DejaVu Sans', Arial, sans-serif; font-size: 11px; color: #1a1a2e; }
    .ar { direction: rtl; unicode-bidi: embed; }
    header { border-bottom: 3px double #2e5578; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start; }
    header .sys { font-size: 16px; font-weight: bold; color: #2e5578; }
    header .sys .ar { font-size: 14px; display: block; }
    header .meta { text-align: right; font-size: 10px; line-height: 1.7; }
    .rptno { font-size: 14px; font-weight: bold; letter-spacing: 1px; }
    h2 { background: #eef4f9; border-inline-start: 4px solid #2e5578; padding: 5px 8px; font-size: 12px; display: flex; justify-content: space-between; margin: 14px 0 6px; }
    table.fields { width: 100%; border-collapse: collapse; }
    table.fields td { border: 1px solid #d7dde5; padding: 5px 8px; vertical-align: top; }
    td.label { width: 34%; background: #f8fafc; font-weight: 600; }
    td.label .ar { font-weight: 400; color: #555; }
    table.inner { width: 100%; border-collapse: collapse; font-size: 10px; }
    table.inner th, table.inner td { border: 1px solid #cfd6df; padding: 3px 6px; text-align: center; }
    table.inner th { background: #eef4f9; }
    .empty { color: #999; }
    footer { margin-top: 22px; border-top: 2px solid #2e5578; padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-end; }
    footer .appr { font-size: 10px; line-height: 1.8; }
    footer img { width: 92px; height: 92px; }
    .qrhint { font-size: 8px; color: #666; text-align: center; }
  </style></head><body>
    <header>
      <div class="sys">Medical Reports Management System<span class="ar">نظام إدارة التقارير الطبية</span></div>
      <div class="meta">
        <div class="rptno">${esc(meta.report_number)}</div>
        <div>${esc(meta.report_type.name_en)} — <span class="ar">${esc(meta.report_type.name_ar)}</span></div>
        <div>${esc(meta.facility.name_en)} (${esc(meta.facility.code)}) — <span class="ar">${esc(meta.facility.name_ar)}</span></div>
      </div>
    </header>
    ${sectionHtml}
    <footer>
      <div class="appr">
        <div><b>Approved / تاريخ الاعتماد:</b> ${esc(meta.approved_at || '')}</div>
        <div><b>Checker / المدقق:</b> ${esc(checkerName || '')}</div>
        ${meta.expiry_date ? `<div><b>Valid until / صالح حتى:</b> ${esc(meta.expiry_date)}</div>` : ''}
      </div>
      <div>
        <img src="${qrDataUrl}" alt="QR"/>
        <div class="qrhint">Scan to verify / امسح للتحقق</div>
      </div>
    </footer>
  </body></html>`;
}

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import('playwright');
      try {
        return await chromium.launch();
      } catch (e) {
        // Fallback for environments with a pre-installed Chromium binary.
        const candidates = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
        for (const p of candidates) {
          if (fs.existsSync(p)) {
            try { return await chromium.launch({ executablePath: p }); } catch { /* try next */ }
          }
        }
        throw e;
      }
    })();
    browserPromise.catch(() => { browserPromise = null; });
  }
  return browserPromise;
}

export function pdfPathFor(reportNumber) {
  return path.join(GENERATED_DIR, `${reportNumber}.pdf`);
}

// Regeneration is idempotent: always writes to the same path for the report number.
export async function generateReportPdf(reportId) {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
  const checker = report.approved_by
    ? db.prepare('SELECT full_name_en, full_name_ar FROM users WHERE id = ?').get(report.approved_by)
    : null;
  const checkerName = checker ? `${checker.full_name_en} / ${checker.full_name_ar}` : '';
  const verifyUrl = `${CLIENT_BASE_URL}/verify/${report.report_number}?h=${verificationHash(report.report_number)}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 240 });
  const html = buildHtml(report, qrDataUrl, checkerName);
  const outPath = pdfPathFor(report.report_number);
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path: outPath, format: 'A4', printBackground: true });
    await page.close();
  } catch (e) {
    // ASSUMPTION: if no Chromium is available, keep the printable HTML next to
    // the expected PDF path so the flow still works; README documents
    // `npx playwright install chromium`.
    console.error('PDF generation via Chromium failed, storing printable HTML fallback:', e.message);
    fs.writeFileSync(outPath.replace(/\.pdf$/, '.html'), html);
    throw e;
  }
  return outPath;
}
