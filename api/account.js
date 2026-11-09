// POST /api/account  { action: "register" | "login", username, password }
// -> { token, username }   Passwords are stored only as salted scrypt hashes.
import { put } from '@vercel/blob';
import { body, checkPassword, configured, hashPassword, makeToken, readJson, userKey, validName, validPassword } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!configured()) return res.status(503).json({ error: 'Accounts are not set up on this server.' });
  const { action, username, password } = body(req);
  if (!validName(username)) return res.status(400).json({ error: 'Usernames are 3 to 20 letters, numbers or underscores.' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Passwords need at least 6 characters.' });
  const key = userKey(username);
  const path = `users/${key}.json`;

  if (action === 'register') {
    if (await readJson(path)) return res.status(409).json({ error: 'That username is taken. Try another one.' });
    const rec = { username: String(username).trim(), ...hashPassword(password), createdAt: Date.now() };
    try {
      await put(path, JSON.stringify(rec), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false });
    } catch {
      return res.status(409).json({ error: 'That username is taken. Try another one.' });
    }
    return res.status(200).json({ token: makeToken(key), username: rec.username });
  }

  if (action === 'login') {
    const rec = await readJson(path);
    if (!rec || !checkPassword(password, rec)) return res.status(401).json({ error: 'Wrong username or password.' });
    return res.status(200).json({ token: makeToken(key), username: rec.username });
  }

  return res.status(400).json({ error: 'Unknown action.' });
}
