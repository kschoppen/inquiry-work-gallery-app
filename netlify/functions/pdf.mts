/**
 * GET /api/pdf?id=rec...    one piece as a PDF
 * GET /api/pdf?gsid=...     a district's work as one PDF: only pieces whose teacher agreed to share with the district
 * The browser hands the file to the phone's share sheet. Nothing is posted online.
 */
import type { Config } from '@netlify/functions';
import { MAX_PDF_PIECES } from '../lib/config.mjs';
import { companyByGsid } from '../lib/companies.mjs';
import { districtWork, oneWork } from '../lib/work.mjs';
import { buildPdf } from '../lib/pdf.mjs';
import { fail, safely, whoIs } from '../lib/http.mjs';

const fileName = (s: string) => `${s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'student-work'}.pdf`;
const pdf = (bytes: Uint8Array, name: string, extra: Record<string, string> = {}) => new Response(bytes, {
  headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store', ...extra },
});

export default safely(async (req: Request) => {
  const who = await whoIs(req);
  if (!who) return fail(401, 'Sign in first');
  if (req.method !== 'GET') return fail(405, 'Not allowed');
  const url = new URL(req.url);
  const id = url.searchParams.get('id'), gsid = url.searchParams.get('gsid');

  if (id) {
    const work = await oneWork(id);
    if (!work) return fail(404, 'That piece is not in the gallery.');
    if (!work.shareDistrict && !work.shareAcross) return fail(403, 'The teacher has not agreed to share this piece.');
    const bytes = await buildPdf([work], { title: work.title, subtitle: `Student work from ${work.district}`, sharedBy: who.name, origin: url.origin, photosPerPiece: 6 });
    return pdf(bytes, fileName(`${work.district} ${work.title}`));
  }
  if (gsid) {
    const company = await companyByGsid(gsid);
    if (!company) return fail(404, 'That district is not in the Gainsight list.');
    const agreed = (await districtWork(company)).filter((w) => w.shareDistrict);
    const works = agreed.slice(0, MAX_PDF_PIECES);
    const subtitle = agreed.length > works.length ? `The newest ${works.length} of ${agreed.length} pieces` : `${works.length} ${works.length === 1 ? 'piece' : 'pieces'}`;
    const bytes = await buildPdf(works, { title: `Student work from ${company.name}`, subtitle, sharedBy: who.name, origin: url.origin });
    return pdf(bytes, fileName(`${company.name} student work`), { 'x-pieces': String(works.length) });
  }
  return fail(400, 'Say which piece or district.');
});

export const config: Config = { path: '/api/pdf' };
