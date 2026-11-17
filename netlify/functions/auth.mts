/**
 * Google sign-in: OAuth code flow with PKCE. Only verified inquired.com Google Workspace accounts get a session.
 *
 * GET /api/auth/login      sends the visitor to Google's account chooser (mock mode: signs in as the placeholder ISM)
 * GET /api/auth/callback   Google returns here; checks the ID token, sets the session cookie
 * GET /api/auth/logout     clears the session and goes back to the sign-in page
 *
 * Needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET.
 */
import type { Config } from '@netlify/functions';
import { NEXT_COOKIE, SESSION_COOKIE, SESSION_DAYS, b64url, cookie, randomToken, readCookie, same, seal, unseal } from '../lib/session.mjs';
import { SIGN_IN_DOMAIN as DOMAIN, isMock, sessionSecret } from '../lib/config.mjs';
import { MOCK_ISM } from '../lib/mock-data.mjs';
import { esc } from '../lib/http.mjs';

const OAUTH_COOKIE = 'iwg_oauth';
const now = () => Math.floor(Date.now() / 1000);
// Only same-site paths, so the sign-in can't be used to bounce people to another site.
const safeNext = (s: string | null | undefined) => (s && s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') && !s.startsWith('/api/') ? s : '/');
function nextFrom(req: Request) {
  try { return safeNext(decodeURIComponent(readCookie(req, NEXT_COOKIE) ?? '')); } catch { return '/'; }
}

function page(status: number, title: string, html: string, cookies: string[] = []) {
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  cookies.forEach((c) => headers.append('set-cookie', c));
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="audience" content="internal"><title>${esc(title)} | Inquiry Work Gallery</title>
<link rel="stylesheet" href="/css/tokens.css"><link rel="stylesheet" href="/css/app.css"></head>
<body data-brand="inquired"><div class="app"><main class="screen"><h1 class="h4">${esc(title)}</h1>${html}</main></div></body></html>`, { status, headers });
}
const tryAgain = '<p class="body"><a class="link" href="/api/auth/login">Sign in with Google &gt;&gt;</a></p>';

function signedIn(session: string, next: string, secure: boolean, extra: string[] = []) {
  const headers = new Headers({ location: next, 'cache-control': 'no-store' });
  headers.append('set-cookie', cookie(SESSION_COOKIE, session, SESSION_DAYS * 86400, secure));
  headers.append('set-cookie', cookie(NEXT_COOKIE, '', 0, secure));
  extra.forEach((c) => headers.append('set-cookie', c));
  return new Response(null, { status: 302, headers });
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const secure = url.protocol === 'https:';
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();

  if (route === 'logout') {
    return new Response(null, { status: 302, headers: { location: '/signin.html', 'set-cookie': cookie(SESSION_COOKIE, '', 0, secure), 'cache-control': 'no-store' } });
  }

  if (isMock()) {
    if (route !== 'login') return page(404, 'Not found', tryAgain);
    const session = await seal(sessionSecret()!, { p: 'session', email: MOCK_ISM.email, name: MOCK_ISM.name, exp: now() + 86400 });
    return signedIn(session, nextFrom(req), secure);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET, secret = process.env.SESSION_SECRET;
  if (!clientId || !clientSecret || !secret || secret.length < 32) return page(500, 'Sign-in is not set up yet', '<p class="body">GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET (32 characters or more) need to be set in Netlify.</p>');
  // Google only accepts redirect addresses registered on the sign-in client.
  const redirectUri = `${url.origin}/api/auth/callback`;

  if (route === 'login') {
    const state = randomToken(), nonce = randomToken(), verifier = randomToken(32);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const pending = await seal(secret, { p: 'oauth', state, nonce, verifier, next: nextFrom(req), exp: now() + 600 });
    const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    google.search = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
      state, nonce, code_challenge: challenge, code_challenge_method: 'S256', hd: DOMAIN, prompt: 'select_account',
    }).toString();
    return new Response(null, { status: 302, headers: { location: google.toString(), 'set-cookie': cookie(OAUTH_COOKIE, pending, 600, secure), 'cache-control': 'no-store' } });
  }

  if (route === 'callback') {
    const pending = await unseal(secret, readCookie(req, OAUTH_COOKIE), 'oauth');
    const clear = cookie(OAUTH_COOKIE, '', 0, secure);
    if (!pending) return page(400, 'Sign-in timed out', `<p class="body">That sign-in link is old or was opened in another browser.</p>${tryAgain}`, [clear]);
    if (url.searchParams.get('error')) return page(403, 'Sign-in was cancelled', tryAgain, [clear]);
    if (!same(url.searchParams.get('state') ?? '', pending.state)) return page(400, 'Sign-in did not match', tryAgain, [clear]);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code') ?? '', client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: pending.verifier }),
    });
    const idToken = res.ok ? ((await res.json()) as { id_token?: string }).id_token : undefined;
    if (!idToken) return page(502, 'Google sign-in failed', `<p class="body">Google did not confirm the sign-in (${res.status}).</p>${tryAgain}`, [clear]);

    // Google's checklist: signature, issuer, audience, expiry. Then our nonce, and hd (not the email ending) for the domain.
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    let claims: Record<string, unknown>;
    try {
      ({ payload: claims } = await jwtVerify(idToken, createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')), { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: clientId }));
    } catch { return page(401, 'Google sign-in could not be verified', tryAgain, [clear]); }
    const email = String(claims.email ?? '').toLowerCase();
    if (claims.nonce !== pending.nonce) return page(401, 'Sign-in did not match', tryAgain, [clear]);
    if (claims.hd !== DOMAIN || claims.email_verified !== true || !email.endsWith(`@${DOMAIN}`)) {
      console.log(`sign-in refused: ${email || 'no email'} (hd ${claims.hd ?? 'none'}, verified ${claims.email_verified})`);
      return page(403, 'inquirED accounts only', `<p class="body">You chose ${esc(email || 'an account')}. This app only accepts ${DOMAIN} Google accounts.</p>${tryAgain}`, [clear]);
    }

    console.log(`sign-in: ${email}`);
    const session = await seal(secret, { p: 'session', email, name: String(claims.name ?? email), exp: now() + SESSION_DAYS * 86400 });
    return signedIn(session, pending.next, secure, [clear]);
  }

  return page(404, 'Not found', tryAgain);
};

export const config: Config = { path: ['/api/auth/login', '/api/auth/callback', '/api/auth/logout'] };
