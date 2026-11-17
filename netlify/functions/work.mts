/**
 * Student work.
 *   GET  /api/work              the gallery: cleared work any district can see
 *   GET  /api/work?gsid=...     one district's cleared work
 *   GET  /api/work?id=rec...    one cleared piece
 *   POST /api/work              add work for a teacher { teacherName, teacherEmail, gsid, school, unit, grades, description, checks, contest, photos }
 *   POST /api/work { upload, photos }   more photos for a row just added (when they did not fit in the first call)
 */
import type { Config } from '@netlify/functions';
import { GRADES, MAX_PHOTOS, MAX_PHOTO_BYTES } from '../lib/config.mjs';
import { companyByGsid, openContest, personRecordId, unitChoices } from '../lib/companies.mjs';
import { addPhoto, addWork, districtWork, galleryWork, oneWork } from '../lib/work.mjs';
import { seal, unseal } from '../lib/session.mjs';
import { sessionSecret } from '../lib/config.mjs';
import { fail, isEmail, json, readJson, safely, text, whoIs } from '../lib/http.mjs';

const now = () => Math.floor(Date.now() / 1000);
/** Photos arrive as base64 JPEG, already made smaller in the browser. Anything else is refused. */
function photosFrom(body: any): string[] | null {
  const list = Array.isArray(body?.photos) ? body.photos : [];
  if (list.length > MAX_PHOTOS) return null;
  for (const p of list) if (typeof p !== 'string' || p.length > MAX_PHOTO_BYTES * 1.4 || !p.startsWith('/9j/') || !/^[A-Za-z0-9+/]+=*$/.test(p)) return null;
  return list;
}
async function upload(recordId: string, from: number, photos: string[]) {
  const results = await Promise.allSettled(photos.map((p, i) => addPhoto(recordId, from + i + 1, p)));
  results.forEach((r) => { if (r.status === 'rejected') console.error(`photo upload for ${recordId}: ${r.reason?.message}`); });
  return results.filter((r) => r.status === 'fulfilled').length;
}

export default safely(async (req: Request) => {
  const who = await whoIs(req);
  if (!who) return fail(401, 'Sign in first');
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const id = url.searchParams.get('id'), gsid = url.searchParams.get('gsid');
    if (id) { const work = await oneWork(id); return work ? json({ work }) : fail(404, 'That piece is not in the gallery.'); }
    if (gsid) {
      const company = await companyByGsid(gsid);
      if (!company) return fail(404, 'That district is not in the Gainsight list.');
      return json({ district: { gsid: company.gsid, name: company.name, state: company.state }, works: await districtWork(company) });
    }
    return json(await galleryWork());
  }
  if (req.method !== 'POST') return fail(405, 'Not allowed');

  const body = await readJson(req);
  if (!body) return fail(400, 'Nothing was sent.');
  const photos = photosFrom(body);
  if (!photos) return fail(400, `Photos must be JPEG, and no more than ${MAX_PHOTOS}.`);

  // More photos for a row this person just added. The upload pass names the row and runs out after 15 minutes.
  if (body.upload) {
    const pass = await unseal(sessionSecret()!, text(body.upload, 600), 'upload');
    if (!pass || pass.email !== who.email) return fail(403, 'That upload has timed out. The row was saved; add the rest of the photos in Airtable.');
    const from = Number.isInteger(body.from) && body.from >= 0 && body.from < MAX_PHOTOS ? body.from : 0;
    if (from + photos.length > MAX_PHOTOS) return fail(400, `No more than ${MAX_PHOTOS} photos.`);
    return json({ photosSaved: await upload(pass.id, from, photos) });
  }

  const teacherName = text(body.teacherName, 200), teacherEmail = text(body.teacherEmail, 254).toLowerCase(), unit = text(body.unit, 300);
  const grades = Array.isArray(body.grades) ? body.grades.filter((g: unknown) => GRADES.includes(g as string)) : [];
  const checks = body.checks ?? {};
  if (!teacherName) return fail(400, 'Add the teacher name.');
  if (!isEmail(teacherEmail)) return fail(400, 'Add the teacher email.');
  if (!grades.length) return fail(400, 'Pick at least one grade.');
  if (!photos.length) return fail(400, 'Add at least one photo.');
  if (checks.noFaces !== true || checks.noNames !== true || checks.teacherYes !== true) return fail(400, 'Tick all three boxes under "Before you submit".');
  const [company, units, contestOpen] = await Promise.all([companyByGsid(text(body.gsid, 100)), unitChoices(), openContest()]);
  if (!company) return fail(400, 'Pick the district from the list.');
  if (!units.includes(unit)) return fail(400, 'Pick the unit from the list.');
  // The contest tag is set only when a contest is open today and the person said yes to that one.
  const contest = contestOpen && body.contest === contestOpen.name ? contestOpen : null;

  const personId = await personRecordId(who.email).catch(() => null);
  const rec = await addWork({ teacherName, teacherEmail, company, school: text(body.school, 200), unit, grades, description: text(body.description, 5000), personId, contest });
  const photosSaved = await upload(rec.id, 0, photos);
  const uploadPass = await seal(sessionSecret()!, { p: 'upload', id: rec.id, email: who.email, exp: now() + 900 });
  console.log(`work added by ${who.email}: ${rec.id} (${photosSaved}/${photos.length} photos${contest ? `, contest ${contest.name}` : ''})`);
  return json({ id: rec.id, photosSaved, upload: uploadPass, contest: contest?.name ?? null });
});

export const config: Config = { path: '/api/work' };
