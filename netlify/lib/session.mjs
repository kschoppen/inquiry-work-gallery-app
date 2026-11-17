/**
 * Sign-in session. A cookie holds the verified Google email, signed with SESSION_SECRET (HMAC-SHA256).
 * Web Crypto only, so the edge gate and the functions share this file. Same pattern as the GTM hub, its own cookie name.
 */
export const SESSION_COOKIE = 'iwg_session';
export const NEXT_COOKIE = 'iwg_next';
export const SESSION_DAYS = 14;

const enc = new TextEncoder();
export const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export const randomToken = (bytes = 24) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

/** Constant-time compare, so a wrong signature or token can't be guessed byte by byte. */
export function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Signs a value. `p` names its purpose so one kind of token can't stand in for another. `exp` is in seconds. */
export async function seal(secret, value) {
  const body = b64url(enc.encode(JSON.stringify(value)));
  return `${body}.${await hmac(secret, body)}`;
}

/** Returns the value if the signature matches, the purpose is right and it has not expired. */
export async function unseal(secret, token, purpose) {
  if (!secret || !token) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || !same(sig, await hmac(secret, body))) return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return v?.p === purpose && typeof v.exp === 'number' && v.exp * 1000 > Date.now() ? v : null;
  } catch { return null; }
}

export function readCookie(req, name) {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export const cookie = (name, value, maxAge, secure) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

/** { p: 'session', email, name, exp } for a signed-in request, or null. */
export const sessionFrom = (req, secret) => unseal(secret ?? '', readCookie(req, SESSION_COOKIE), 'session');
