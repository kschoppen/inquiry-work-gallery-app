/** Student work: what may be shown, how a record becomes what a screen needs, and adding new work. */
import { GRADES, MAX_GALLERY, USABLE, WORK, WORK_BASE, WORK_FORMULA_NAMES as N, WORK_TABLE } from './config.mjs';
import { createRecord, fq, getRecord, listRecords, uploadAttachment } from './airtable.mjs';

const yes = (v) => String(v ?? '').trim().toLowerCase() === 'yes';

/** The one rule for showing a piece anywhere in the app: cleared by the reviewer, no student face, no full student name. */
export const mayShow = (rec) => rec.fields[WORK.usability] === USABLE && !yes(rec.fields[WORK.studentFace]) && !yes(rec.fields[WORK.studentFullName]);

export const gradeLabel = (g) => (g === 'Kindergarten' ? 'Kindergarten' : `Grade ${parseInt(g, 10)}`);
const gradeOrder = (g) => { const i = GRADES.indexOf(g); return i < 0 ? 99 : i; };

/** What the teacher agreed to, in the words the screens use. */
export function sharingLabel(w) {
  if (w.shareAcross) return 'Any district can see';
  if (w.shareDistrict) return 'This district only';
  return 'Not for sharing';
}

/** One Airtable record as the JSON a screen gets. Photo addresses come straight from Airtable and stop working
 *  after a couple of hours, so they are sent fresh with each answer and never stored. */
export function toWork(rec) {
  const f = rec.fields;
  const grades = (Array.isArray(f[WORK.grades]) ? f[WORK.grades] : []).slice().sort((a, b) => gradeOrder(a) - gradeOrder(b));
  const photos = (Array.isArray(f[WORK.photos]) ? f[WORK.photos] : [])
    .filter((a) => !a.type || a.type.startsWith('image/'))
    .map((a) => ({ thumb: a.thumbnails?.large?.url ?? a.url, large: a.thumbnails?.full?.url ?? a.thumbnails?.large?.url ?? a.url }))
    .filter((p) => p.thumb);
  const w = {
    id: rec.id,
    title: f[WORK.unit] || 'Student work',
    unit: f[WORK.unit] || '',
    grades: grades.map(gradeLabel),
    district: f[WORK.companyName] || f[WORK.school] || '',
    school: f[WORK.school] || '',
    gsid: f[WORK.gsid] || '',
    workType: String(f[WORK.workType] ?? '').replace(/\s*Product\s*$/, '').trim(),
    challenge: f[WORK.challenge] || '',
    description: f[WORK.description] || '',
    teacher: f[WORK.teacherName] || '',
    shareDistrict: f[WORK.shareDistrict] === true,
    shareAcross: f[WORK.shareAcross] === true,
    photos,
  };
  w.sharing = sharingLabel(w);
  return w;
}

const usableFormula = `{${N.usability}}=${fq(USABLE)}`;
const newestFirst = { field: WORK.submitted, direction: 'desc' };
const lower = (v) => String(v ?? '').trim().toLowerCase();

/** A district's cleared work. Matched on the Gainsight ID, and on the district's name where a row has no ID. */
export async function districtWork(company) {
  const name = lower(company.name);
  const belongs = (r) => r.fields[WORK.gsid] === company.gsid || (!r.fields[WORK.gsid] && (lower(r.fields[WORK.school]) === name || lower(r.fields[WORK.companyName]) === name));
  const formula = `AND(${usableFormula},OR({${N.gsid}}=${fq(company.gsid)},LOWER({${N.school}})=${fq(name)},LOWER({${N.companyName}})=${fq(name)}))`;
  const rows = await listRecords(WORK_BASE, WORK_TABLE, { byId: true, formula, sort: newestFirst, max: 500, where: (r) => mayShow(r) && belongs(r) });
  return rows.map(toWork);
}

/** The gallery: cleared work whose teacher said any district can see it. Newest first, up to MAX_GALLERY. */
export async function galleryWork() {
  const formula = `AND(${usableFormula},{${N.shareAcross}}=1)`;
  const rows = await listRecords(WORK_BASE, WORK_TABLE, { byId: true, formula, sort: newestFirst, max: MAX_GALLERY + 1, where: (r) => mayShow(r) && r.fields[WORK.shareAcross] === true });
  return { works: rows.slice(0, MAX_GALLERY).map(toWork), more: rows.length > MAX_GALLERY };
}

/** One cleared piece, or null. A piece that is not cleared reads as "not found", the same as one that does not exist. */
export async function oneWork(id) {
  const rec = await getRecord(WORK_BASE, WORK_TABLE, id, { byId: true });
  return rec && mayShow(rec) ? toWork(rec) : null;
}

/** Adds a row for the reviewer. Usability is left empty on purpose: nothing shows until it is cleared. */
export async function addWork({ teacherName, teacherEmail, company, school, unit, grades, description, personId, contest }) {
  const fields = {
    [WORK.school]: school || company.name,
    [WORK.teacherName]: teacherName,
    [WORK.teacherEmail]: teacherEmail,
    [WORK.unit]: unit,
    [WORK.grades]: grades,
    [WORK.description]: description,
    [WORK.gsid]: company.gsid,
    [WORK.companyName]: company.name,
    [WORK.shareDistrict]: true, // "The teacher said yes to sharing" is required to submit
  };
  if (personId) fields[WORK.internalSubmitter] = [personId];
  if (contest) fields[contest.tagFieldId] = contest.tagValue;
  return createRecord(WORK_BASE, WORK_TABLE, fields, { byId: true });
}

export const addPhoto = (recordId, n, base64) => uploadAttachment(WORK_BASE, recordId, WORK.photos, { contentType: 'image/jpeg', filename: `photo-${n}.jpg`, file: base64 });
