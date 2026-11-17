/**
 * Every table, field and choice name the app uses, in one place. Change a name here and nowhere else.
 * No secrets live in this file: tokens and passwords come from environment variables.
 */

/** Mock mode: fixture data, no Google, no Airtable, no email. Never on in a deployed function (see README). */
const env = (k) => { try { return typeof process !== 'undefined' && process.env ? process.env[k] : undefined; } catch { return undefined; } };
export const isMock = () => env('MOCK') === '1' && !env('AWS_LAMBDA_FUNCTION_NAME') && !env('NETLIFY') && typeof globalThis.Deno === 'undefined';
export const MOCK_SESSION_SECRET = 'mock-mode-only-not-a-real-secret-0000';
export const sessionSecret = () => env('SESSION_SECRET') || (isMock() ? MOCK_SESSION_SECRET : undefined);

export const SIGN_IN_DOMAIN = 'inquired.com';

// ---------- Student work base ----------
export const WORK_BASE = 'appCFzMGzInAUPRTA';
export const WORK_TABLE = 'tblCsnd10MJYUY63d';
/** Field IDs: records are read and written by ID, so renaming a field in Airtable can't break the app. */
export const WORK = {
  school: 'flduegKIAQddddEha', // School or District
  photos: 'fldVqE8zmOpNKJFJC', // Student Work (attachments)
  unit: 'fld4j0NnmdSo31VQB',
  workType: 'fld8Jy2oVscwNlVZ5', // "Product": 2D, 3D, written, presentation
  challenge: 'fld1Y7iouDvllxInu', // Inquiry Challenge Statement
  grades: 'fldl128cbR4MAvf3E',
  description: 'fldbtv2quXqVkY8PE', // Description for Gallery*
  usability: 'fldemyUyruSQ9Rzei',
  studentFace: 'fldf3nUr2TMxDEHGK',
  studentFirstName: 'fldyX0pdt3Gv8Hsr9',
  studentFullName: 'fldxY1qaTuOdIX4PX',
  shareDistrict: 'fldkPfsRtIdzld2jv', // Teacher Selects Ok to share with district
  shareAcross: 'fldPHYEa8C1Vlm6xb', // Teacher Selects Ok to share across other districts
  gsid: 'fldqrIHZV1P9zfjw4', // GS Company GSID
  companyName: 'fldvGvg9OuEUBozen', // GS Company Name
  teacherName: 'fldH5Owm5o9QBKIv8', // Name from Form
  teacherEmail: 'fldY4KoPimUfUjgkg', // Submitter from Form
  internalSubmitter: 'fld8SGyobEFRkpEWi', // link to inquirED People
  submitted: 'fld1tHSVw0bklzthO', // Submission Date (created time)
  notes: 'fldeePVX0Wj2BURVk', // Internal Notes
};
/** Airtable formulas can only name fields by name. These are used to narrow what Airtable sends back; the
 *  code checks every record again by field ID, so a renamed field shows as an error, never as a leak. */
export const WORK_FORMULA_NAMES = { usability: 'Usability', shareAcross: 'Teacher Selects Ok to share across other districts', gsid: 'GS Company GSID', companyName: 'GS Company Name', school: 'School or District' };
export const USABLE = 'Able to Use in Gallery';
export const GRADES = ['Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade'];

export const COMPANY_TABLE = 'tblPXEHIRKKPkQ6g3'; // "GS Company", the Gainsight company list
export const COMPANY = { gsid: 'fldlaCbyBPJtDkZHY', name: 'fldJnqwKvIIgh4oxX', state: 'fldH4Zwdxe6f6PwUX', csm: 'fldVfx2viCQkUM1yW', csmName: 'fldT0NIgVovdbXULL' };

export const PEOPLE_TABLE = 'tblLKyXPGwwqHSTSJ'; // "inquirED People"
export const PEOPLE = { email: 'fldEbD0jfBWWXicFc' };
export const PEOPLE_EMAIL_NAME = 'Email'; // the same field's name, for the lookup formula

// ---------- Favorites (table not made yet; see README) ----------
export const favoritesTable = () => {
  const base = env('FAVORITES_BASE_ID'), table = env('FAVORITES_TABLE_ID');
  return base && table ? { base, table } : null;
};
export const FAVORITE = { key: 'Key', email: 'Email', gsid: 'Company GSID', name: 'Company Name' };

// ---------- Testimonials base (fields by name) ----------
export const TESTIMONIAL_BASE = 'appSy6XOpR1GCUlZw';
export const TESTIMONIAL_TABLE = 'tblpKpOcRDnAOlx2Q';
export const T = {
  // These exist today.
  excerpt: 'Quote Excerpt',
  full: 'Full Testimonial',
  name: 'Full Name',
  email: 'Email',
  role: 'Role Title',
  district: 'District',
  state: 'State',
  format: 'Format',
  source: 'Source',
  permission: 'Permission to Share',
  requestedBy: 'Permission Requested By',
  whoRequested: 'Who Requested Permission',
  date: 'Testimonial Date',
  approval: 'Approval Status',
  product: 'Product',
  notes: 'Internal Notes',
  gsid: 'Gainsight Company ID',
  // These do NOT exist yet. Create them before go-live (README, "Airtable fields to create").
  consentStatus: 'Consent Status', // single select: the four CONSENT values below
  consentToken: 'Consent Token', // single line text
  consentSentAt: 'Consent Form Sent At', // date with time
  consentSignedName: 'Consent Signed Name', // single line text
  consentSignedAt: 'Consent Signed At', // date with time
  consentWording: 'Consent Wording', // long text
  districtApproval: 'District Approval Needed', // checkbox
  addedBy: 'Added By', // email
};
export const CONSENT = { needs: 'Needs consent', waiting: 'Waiting on speaker', signed: 'Signed', declined: 'Declined' };
export const T_VALUES = {
  format: 'Written Quote',
  source: 'PE (Survey, Stepback, or Convo)',
  approval: 'Queue',
  byEmail: 'Email',
  inPerson: 'In person',
  permissionYes: 'Yes',
  permissionNo: 'Not at this time',
};
export const TESTIMONIAL_PRODUCTS = ['Inquiry Journeys', 'Inkwell', 'Great First Eight', 'World History'];

/** The words a speaker agrees to. Saved with every signature. No legal review yet (README). */
export const CONSENT_WORDING = 'I give inquirED permission to use my words, name, role and district in its marketing and communications, in any format. I can ask inquirED to stop using them at any time by emailing learn@inquired.com.';

export const MAIL_FROM_DEFAULT = 'inquirED <learn@inquired.com>';

export const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

// Limits
export const MAX_GALLERY = 300; // newest pieces the gallery loads in one call
export const MAX_PHOTOS = 8; // per submission
export const MAX_PHOTO_BYTES = 4_500_000; // Airtable's upload endpoint takes 5 MB a file
export const MAX_PDF_PIECES = 24; // pieces in one district PDF
