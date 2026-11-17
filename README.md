# Inquiry Work Gallery

A phone-first web app for inquirED's Implementation Success Managers (ISMs). Signed-in staff can:

- see the districts assigned to them in Gainsight, search every district and star favorites
- browse a district's student work, or the gallery of work any district can see, by district and grade
- share one piece, or a district's work, as a PDF from their own phone
- add work for a teacher after a visit (it goes to a reviewer before it shows anywhere)
- capture a testimonial and get the speaker's consent, by email or on the spot

Only verified inquired.com Google accounts get in. The one page open to everyone is the consent form a speaker reaches from the link in their email.

**Status: built on a branch, checked in mock mode only. It has never talked to the real Google sign-in, Airtable or mailbox. Nothing is deployed until the branch is merged to `main`.**

## Run it locally (mock mode)

Needs Node 22 or newer.

```bash
npm install
npm run dev        # http://localhost:8888
npm run check      # 65 end-to-end checks against the same local server
```

Mock mode (`MOCK=1`, which both commands set) uses placeholder data held in memory, signs you in as "[ISM NAME]" when you tap Sign in, and never touches Google, Airtable or email. Emails it would have sent are written to `.mock-outbox/` and logged. Restart the server to reset the data. To try the consent page: `http://localhost:8888/consent/?t=mockTOKEN0000000000000000000000000000000001`.

Mock mode cannot turn on in a deployed function: it is ignored whenever the code is running on Netlify.

To see the contest question locally, put one contest whose dates include today in `contests.json`. To try favorites stored on the server instead of in the browser, start with `FAVORITES_BASE_ID=appMOCK FAVORITES_TABLE_ID=tblMOCK npm run dev`.

## How it is put together

```
public/                 what Netlify publishes, as it is (no build step)
  index.html, js/app.js   the signed-in app: one page, screens picked by the address after "#"
  signin.html             the sign-in page
  consent/                the consent form a speaker opens from their email (no sign-in)
  css/, fonts/, assets/, icons/, manifest.json
  sw.js                   only clears the old app's offline copy from phones, then removes itself
netlify/
  edge-functions/gate.ts  the sign-in gate in front of every page, script and API call
  functions/*.mts         auth, home, favorites, work, pdf, testimonials, consent
  lib/*.mjs               config.mjs holds every table, field and choice name; airtable.mjs is the only file that calls Airtable
scripts/dev-server.mjs  the local server (same handlers, same gate, same headers as netlify.toml)
scripts/check.mjs       the mock-mode checks
contests.json           contest windows (see below)
tools/generate-icons.html   regenerates the home-screen icons
```

What is open without sign-in: `/signin.html`, `/api/auth/*`, `/consent/*`, `/api/consent`, and files with no data in them (`/css/*`, `/fonts/*`, `/assets/*`, `/icons/*`, `/manifest.json`, `/sw.js`). Everything else, the app's JavaScript included, needs a session. Each function checks the session again itself.

The app no longer works offline. The old version saved its pages on the phone; a saved copy of a signed-in page could be shown to someone signed out, so that is gone. "Add to Home Screen" still works.

### What is shown

A piece of student work appears only when its Usability is "Able to Use in Gallery" and neither Student Face nor Student Full Name is "Yes". That rule is in one function (`mayShow` in `netlify/lib/work.mjs`) and every list, single piece and PDF goes through it. The gallery adds "teacher said other districts can see it". A district PDF holds only pieces where the teacher agreed to share with the district. Photo addresses come fresh from Airtable with each answer and load straight from Airtable in the browser; they are never stored.

### Function calls per screen

Every call to `/api/*` is one function run plus one gate run. Pages and scripts are one gate run each (the browser caches scripts for the visit).

| Screen | API calls |
|---|---|
| Sign in | 1 (`/api/auth/login`), 2 with Google's return |
| Opening the app (any screen) | 1 (`/api/home`), kept for the visit |
| Your districts, search, star | 0 more (1 per star once the favorites table exists) |
| One district | 1 the first time, 0 on return |
| Gallery, and every filter or search in it | 1 the first time, 0 after |
| One piece | 0 when reached from a list, 1 when opened directly |
| Share as PDF | 1 |
| Add work | 1 to submit (more only if the photos add up to more than about 2.7 MB) |
| Testimonials | 1 |
| Add a testimonial | 1 to save, email or sign; 1 for "See the email" |
| Consent page (the speaker) | 1 to open, 1 to answer |

## Environment variables

Set these in Netlify (Site configuration, Environment variables). None of them belong in the repo.

| Variable | What it is |
|---|---|
| `GOOGLE_CLIENT_ID` | The Google sign-in client's ID |
| `GOOGLE_CLIENT_SECRET` | Its secret |
| `SESSION_SECRET` | A long random string (32 characters or more) that signs the session cookie. Must be available to both Functions and Edge Functions |
| `AIRTABLE_TOKEN` | An Airtable token. Scopes: `data.records:read`, `data.records:write`, `schema.bases:read`. Bases: the student work base and the testimonials base (and the favorites base, when it exists) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | The learn@inquired.com mailbox's outgoing mail settings. Port 465 uses TLS from the start; anything else (587 by default) uses STARTTLS |
| `MAIL_FROM` | Optional. Default `inquirED <learn@inquired.com>` |
| `FAVORITES_BASE_ID`, `FAVORITES_TABLE_ID` | Optional. Until both are set, each person's starred districts are kept in their own browser and do not follow them to another phone |
| `MOCK` | Local only. `1` turns on mock mode. Never set it in Netlify |

## Airtable: what must exist before go-live

Already there, and used as they are: the Student Work, GS Company and inquirED People tables in the student work base (`appCFzMGzInAUPRTA`), and the Testimonials table (`tblpKpOcRDnAOlx2Q`) in the testimonials base (`appSy6XOpR1GCUlZw`) with its current fields, including Gainsight Company ID.

**Fields to create in the Testimonials table.** The names are in one place, `T` in `netlify/lib/config.mjs`; if a name is created differently, change it there.

| Field | Type |
|---|---|
| Consent Status | Single select: `Needs consent`, `Waiting on speaker`, `Signed`, `Declined` |
| Consent Token | Single line text |
| Consent Form Sent At | Date, with time |
| Consent Signed Name | Single line text |
| Consent Signed At | Date, with time |
| Consent Wording | Long text |
| District Approval Needed | Checkbox |
| Added By | Email |

Until these exist, saving a testimonial fails with a message; nothing else in the app depends on them.

**Favorites table (optional, any base the token can reach).** Fields: `Key` (single line text, "email|GSID"), `Email` (email), `Company GSID` (single line text), `Company Name` (single line text). Then set `FAVORITES_BASE_ID` and `FAVORITES_TABLE_ID`.

## Testimonials and consent

A new testimonial is saved with Format "Written Quote", Source "PE (Survey, Stepback, or Convo)", Approval Status "Queue", the ISM's name in Who Requested Permission, and Consent Status "Needs consent". Permission to Share is set to "Yes" in exactly one place: when the speaker signs (`sign` in `netlify/lib/testimonials.mjs`). Declining sets it to "Not at this time". Until then the list marks the testimonial "Not for use".

- **Email the form** sends the speaker their words and a link. The link holds a 43-character random token; the consent API shows only that one testimonial's words, name, role and district, takes one answer, and then stops showing the words. Sending again makes a new link and the old one stops working.
- **Sign here now**: the speaker ticks "I agree" and types their full name on the ISM's phone.
- Either way the name typed, the time, and the exact wording agreed to are saved on the record, and the speaker is emailed a copy with the ISM copied in.
- If the speaker changes the wording when signing, the first wording is kept in Internal Notes.

**The consent wording** is `CONSENT_WORDING` in `netlify/lib/config.mjs`. It has had no legal review.

## Contests

`contests.json` is a list. When today (US Central time) is inside a contest's window, the add-work form asks "Enter this in the [name] too?" with a link to the rules, and a Yes sets that contest's tag on the new row. Outside every window the question does not appear. The file is an empty list now. An entry looks like this (the fall 2026 contest, which has closed):

```json
[
  {
    "name": "fall 2026 contest",
    "opens": "2026-09-01",
    "closes": "2026-10-31",
    "rulesUrl": "https://example.com/contest-rules",
    "tagFieldId": "fldA0fxdD7VRnDvXQ",
    "tagValue": "iw_f26"
  }
]
```

`name` is dropped into the question as written. `tagFieldId` is a single-select field in the Student Work table and `tagValue` must already be one of its choices. The dates and the rules address above are examples.

## Brand system

The signed-in app is an internal tool and uses the brand tokens (`public/css/tokens.css`, copied from the inquirED Brand System's foundation and inquirED token files) and the approved art board's layout.

Three things go outside inquirED: the consent page, the emails, and the shared PDF. The brand system's rule is that anything external comes out of its renderers, and it has no renderer for a web page, an app's emails or a generated PDF. So those three are plain on purpose (system or standard fonts, black and grey, no logo) with the reviewed wording. Giving them the brand's look is a decision for Elizabeth, the brand system's owner.

## Go-live

1. Create the Testimonials fields above (and the favorites table, if wanted).
2. In the Google sign-in client, add the site's callback address as an authorized redirect URI: `https://<the site's address>/api/auth/callback`.
3. Set the environment variables in Netlify.
4. Merge this branch to `main`. That is the one production deploy: Netlify publishes `main` on push. Do not push anything else to `main` first.
5. Sign in on a phone and walk the screens against real data. Check first: a district's work shows up (see below), a test submission lands in Airtable with its photos, and a consent email arrives and signs.

Things to check against real data, because mock mode cannot:

- **District matching.** A district's work is found by GS Company GSID, and for rows without one, by a case-insensitive match of School or District or GS Company Name against the Gainsight company name. How many rows have the GSID filled is not known.
- **The unit list** is read from the Unit field's choices, which needs the token's `schema.bases:read` scope. Without it the add-work form says the list could not be loaded.
- **Airtable formulas use field names.** If one of these is renamed, the matching screen shows an error (it cannot show the wrong records): Usability, Teacher Selects Ok to share across other districts, GS Company GSID, GS Company Name, School or District (Student Work); Email (inquirED People); Added By, Consent Token (Testimonials).

## Regenerate icons

Open `tools/generate-icons.html` in a browser, click both download buttons, and replace the files in `public/icons/`.
