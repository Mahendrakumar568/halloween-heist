// Shared helpers for player accounts (files starting with _ are not exposed as endpoints).
import crypto from 'node:crypto';
import { get } from '@vercel/blob';

// Session tokens are signed with a key derived from the Blob store's server-only token,
// so no extra secret has to be configured.
const KEY = crypto.createHmac('sha256', process.env.SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN || '')
  .update('obh-session-v1').digest();
const SESSION_DAYS = 30;

export const configured = () => !!process.env.BLOB_READ_WRITE_TOKEN;
export const userKey = name => String(name || '').trim().toLowerCase();
export const validName = name => /^[a-zA-Z0-9_]{3,20}$/.test(String(name || '').trim());
export const validPassword = pw => typeof pw === 'string' && pw.length >= 6 && pw.length <= 200;

const b64u = buf => Buffer.from(buf).toString('base64url');

export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt: b64u(salt), hash: b64u(hash) };
}
export function checkPassword(password, rec) {
  const salt = Buffer.from(rec.salt, 'base64url');
  const want = Buffer.from(rec.hash, 'base64url');
  const got = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

export function makeToken(key) {
  const body = b64u(JSON.stringify({ u: key, exp: Date.now() + SESSION_DAYS * 864e5 }));
  const sig = b64u(crypto.createHmac('sha256', KEY).update(body).digest());
  return `${body}.${sig}`;
}
export function readToken(req) {
  const auth = req.headers.authorization || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const [body, sig] = tok.split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', KEY).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() && typeof p.u === 'string' ? p.u : null;
  } catch { return null; }
}

export async function readJson(path) {
  const blob = await get(path, { access: 'private', useCache: false });
  if (!blob || !blob.stream) return null;
  try { return JSON.parse(await new Response(blob.stream).text()); } catch { return null; }
}
export function body(req) {
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { return {}; } }
  return req.body || {};
}
