/**
 * GET /api/home: everything the app needs when it opens, in one call. Who is signed in, every district (with the ones
 * assigned to them in Gainsight marked), their favorites, the unit list, and the contest that is open today, if any.
 * The browser keeps this for the visit, so moving between screens does not call it again.
 */
import type { Config } from '@netlify/functions';
import { GRADES, TESTIMONIAL_PRODUCTS, CONSENT_WORDING, MAX_PHOTOS } from '../lib/config.mjs';
import { allCompanies, favoriteGsids, openContest, unitChoices } from '../lib/companies.mjs';
import { gradeLabel } from '../lib/work.mjs';
import { fail, json, safely, whoIs } from '../lib/http.mjs';

export default safely(async (req: Request) => {
  const who = await whoIs(req);
  if (!who) return fail(401, 'Sign in first');
  if (req.method !== 'GET') return fail(405, 'Not allowed');
  const [companies, favorites, units, contest] = await Promise.all([allCompanies(), favoriteGsids(who.email), unitChoices(), openContest()]);
  return json({
    me: { name: who.name, email: who.email },
    districts: companies.map((c) => ({ gsid: c.gsid, name: c.name, state: c.state, assigned: c.csm === who.email.toLowerCase() })),
    favorites, // null: no favorites table yet, so the browser keeps them itself
    units,
    grades: GRADES.map((g) => ({ value: g, label: gradeLabel(g) })),
    products: TESTIMONIAL_PRODUCTS,
    consentWording: CONSENT_WORDING,
    maxPhotos: MAX_PHOTOS,
    contest: contest ? { name: contest.name, rulesUrl: /^https:\/\//.test(contest.rulesUrl ?? '') ? contest.rulesUrl : '' } : null,
  });
});

export const config: Config = { path: '/api/home' };
