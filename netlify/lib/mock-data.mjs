/**
 * Fixture tables for mock mode (MOCK=1). Placeholders only: no real districts, teachers, students or quotes.
 * Shaped like Airtable's own records, so the code that reads them is the code that reads the real tables.
 */
import { COMPANY, COMPANY_TABLE, CONSENT, CONSENT_WORDING, PEOPLE, PEOPLE_TABLE, T, TESTIMONIAL_TABLE, T_VALUES, USABLE, WORK, WORK_TABLE } from './config.mjs';

export const MOCK_ISM = { email: 'ism@example.com', name: '[ISM NAME]' };
/** A consent link that is waiting on its speaker, for trying the consent page: /consent/?t=<this> */
export const MOCK_CONSENT_TOKEN = 'mockTOKEN0000000000000000000000000000000001';
const PHOTO = '/assets/mock/student-work-photo.png';

const company = (n, letter, state, csm) => ({
  id: `recCOMPANY${String(n).padStart(7, '0')}`, createdTime: '2026-01-01T00:00:00.000Z',
  fields: { [COMPANY.gsid]: `GSID-MOCK-${letter}`, [COMPANY.name]: `[DISTRICT ${letter}]`, [COMPANY.state]: state, [COMPANY.csm]: csm, [COMPANY.csmName]: csm === MOCK_ISM.email ? MOCK_ISM.name : '[OTHER ISM]' },
});

let workN = 0;
function work(letter, grades, o = {}) {
  workN += 1;
  const photo = (i) => ({ id: `attMOCK${workN}${i}`, filename: `photo-${i}.png`, type: 'image/png', size: 20000, url: PHOTO, thumbnails: { small: { url: PHOTO }, large: { url: PHOTO }, full: { url: PHOTO } } });
  return {
    id: `recWORK${String(workN).padStart(10, '0')}`, createdTime: `2026-10-${String(28 - workN).padStart(2, '0')}T15:00:00.000Z`,
    fields: {
      [WORK.school]: o.school ?? '[SCHOOL]',
      [WORK.photos]: Array.from({ length: o.photos ?? 1 }, (_, i) => photo(i + 1)),
      [WORK.unit]: o.unit ?? '[WORK TITLE]',
      [WORK.workType]: o.type ?? '2D Product',
      [WORK.challenge]: '[INQUIRY CHALLENGE STATEMENT]',
      [WORK.grades]: grades,
      [WORK.description]: '[TEACHER REFLECTION FROM THE SUBMISSION]',
      [WORK.usability]: o.usability ?? USABLE,
      [WORK.studentFace]: o.face ?? 'No',
      [WORK.studentFullName]: o.fullName ?? 'No',
      [WORK.shareDistrict]: o.shareDistrict ?? true,
      [WORK.shareAcross]: o.shareAcross ?? false,
      ...(o.noGsid ? {} : { [WORK.gsid]: `GSID-MOCK-${letter}` }),
      [WORK.companyName]: `[DISTRICT ${letter}]`,
      [WORK.teacherName]: '[TEACHER NAME]',
      [WORK.teacherEmail]: 'teacher@example.com',
    },
  };
}

const testimonial = (n, o) => ({
  id: `recTESTIMONIAL${String(n).padStart(3, '0')}`, createdTime: `2026-11-0${n}T15:00:00.000Z`,
  fields: {
    [T.excerpt]: o.quote, [T.full]: o.quote, [T.name]: '[SPEAKER NAME]', [T.email]: 'speaker@example.com', [T.role]: '[ROLE]',
    [T.district]: `[DISTRICT ${o.letter}]`, [T.gsid]: `GSID-MOCK-${o.letter}`, [T.state]: 'California', [T.format]: [T_VALUES.format], [T.source]: T_VALUES.source,
    [T.approval]: T_VALUES.approval, [T.product]: o.product, [T.whoRequested]: MOCK_ISM.name, [T.date]: `2026-11-0${n}`,
    [T.addedBy]: o.addedBy ?? MOCK_ISM.email, [T.consentStatus]: o.status, [T.districtApproval]: !!o.districtApproval,
    ...(o.status === CONSENT.signed ? { [T.permission]: T_VALUES.permissionYes, [T.requestedBy]: T_VALUES.inPerson, [T.consentSignedName]: '[SPEAKER NAME]', [T.consentSignedAt]: `2026-11-0${n}T16:30:00.000Z`, [T.consentWording]: CONSENT_WORDING } : {}),
    ...(o.status === CONSENT.waiting ? { [T.requestedBy]: T_VALUES.byEmail, [T.consentToken]: o.token, [T.consentSentAt]: `2026-11-0${n}T16:00:00.000Z` } : {}),
  },
});

function build() {
  return {
    [COMPANY_TABLE]: [
      company(1, 'A', 'CA', MOCK_ISM.email), company(2, 'B', 'CA', MOCK_ISM.email), company(3, 'C', 'OH', 'other.ism@example.com'),
      company(4, 'D', 'TX', 'other.ism@example.com'), company(5, 'E', 'CO', 'other.ism@example.com'), company(6, 'F', 'IL', 'other.ism@example.com'),
    ],
    [PEOPLE_TABLE]: [{ id: 'recPEOPLE00000001', createdTime: '2026-01-01T00:00:00.000Z', fields: { [PEOPLE.email]: MOCK_ISM.email } }],
    [WORK_TABLE]: [
      work('A', ['2nd Grade'], { shareAcross: true, photos: 2 }),
      work('A', ['2nd Grade'], {}),
      work('A', ['4th Grade'], { shareAcross: true, type: '3D Product' }),
      work('A', ['5th Grade'], { shareDistrict: false }), // teacher has not agreed to share: shown to staff, never in a PDF
      work('A', ['4th Grade'], { noGsid: true, school: '[district a]' }), // no Gainsight ID: found by its name
      work('A', ['2nd Grade'], { usability: 'For Discussion' }), // not cleared: must never show
      work('A', ['2nd Grade'], { face: 'Yes' }), // student face: must never show
      work('A', ['2nd Grade'], { fullName: 'Yes' }), // full student name: must never show
      work('B', ['1st Grade'], { shareAcross: true, type: 'Written Product' }),
      work('B', ['Kindergarten', '1st Grade'], { photos: 0 }), // no photo: shows the grey box
      work('C', ['6th Grade'], { shareAcross: true, type: 'Presentation Product' }),
      work('D', ['3rd Grade'], { shareAcross: true }),
    ],
    [TESTIMONIAL_TABLE]: [
      testimonial(1, { quote: '[QUOTE]', letter: 'A', product: ['Inquiry Journeys'], status: CONSENT.signed }),
      testimonial(2, { quote: '[QUOTE HEARD IN A SESSION]', letter: 'B', product: ['Inkwell'], status: CONSENT.needs }),
      testimonial(3, { quote: '[QUOTE AS THE ISM WROTE IT. THE SPEAKER CAN EDIT IT HERE.]', letter: 'A', product: ['Inquiry Journeys'], status: CONSENT.waiting, token: MOCK_CONSENT_TOKEN, districtApproval: true }),
      testimonial(4, { quote: '[QUOTE ADDED BY SOMEONE ELSE]', letter: 'C', product: ['Inquiry Journeys'], status: CONSENT.signed, addedBy: 'other.ism@example.com' }),
    ],
    __choices: { [WORK.unit]: ['[UNIT NAME 1]', '[UNIT NAME 2]', '[UNIT NAME 3]', '[WORK TITLE]'] },
  };
}

let tables;
export const mockTables = () => (tables ??= build());
