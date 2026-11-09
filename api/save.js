// GET /api/save -> the player's saved progress ({} if none)
// PUT /api/save -> replace it.   Auth: "Authorization: Bearer <session token from /api/account>"
import { put } from '@vercel/blob';
import { body, configured, readJson, readToken } from './_lib.js';

const MAX_BYTES = 256 * 1024;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!configured()) return res.status(503).json({ error: 'Cloud saves are not set up on this server.' });
  const key = readToken(req);
  if (!key) return res.status(401).json({ error: 'Please log in again.' });
  const path = `saves/${key}.json`;

  if (req.method === 'GET') return res.status(200).json((await readJson(path)) || {});

  if (req.method === 'PUT') {
    const b = body(req);
    const data = { save: b.save ?? null, achievements: b.achievements || {}, settings: b.settings || {}, updatedAt: Date.now() };
    const json = JSON.stringify(data);
    if (json.length > MAX_BYTES) return res.status(413).json({ error: 'Save too large' });
    await put(path, json, { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
    return res.status(200).json({ ok: true, updatedAt: data.updatedAt });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}
