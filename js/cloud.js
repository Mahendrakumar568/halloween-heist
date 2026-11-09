/* Operation: Best Human — optional player accounts (username + password) with cloud saves.
   Talks to /api/account and /api/save (Vercel functions backed by private Vercel Blob storage). */
(() => {
  'use strict';
  const KEY = 'obh_session_v1';
  const listeners = [];
  let user = null, token = null;

  function setSession(s) {
    token = s ? s.token : null;
    user = s ? { uid: s.username.toLowerCase(), displayName: s.username } : null;
    try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* ignore */ }
    listeners.forEach(cb => cb(user));
  }
  async function call(url, opts) {
    let r;
    try { r = await fetch(url, opts); } catch { throw new Error('Could not reach the server. Check your connection.'); }
    let data = {};
    try { data = await r.json(); } catch { /* not json */ }
    if (r.status === 401 && token && url.endsWith('/api/save')) setSession(null);
    if (!r.ok) throw new Error(data.error || (r.status === 404 ? 'Accounts are only available on the live site.' : 'Something went wrong. Please try again.'));
    return data;
  }
  const auth = (action, username, password) => call('/api/account', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, username, password }),
  }).then(d => { setSession({ token: d.token, username: d.username }); return user; });
  const save = (method, data) => call('/api/save', {
    method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined,
  });

  window.HeistCloud = {
    enabled: true,
    get user() { return user; },
    onChange(cb) { listeners.push(cb); },
    init() {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* ignore */ }
      if (s && s.token && s.username) setSession(s); else listeners.forEach(cb => cb(null));
    },
    register: (u, p) => auth('register', u, p),
    login: (u, p) => auth('login', u, p),
    logout() { setSession(null); },
    async pull() { return user ? save('GET') : null; },
    async push(data) { if (user) await save('PUT', data); },
  };
})();
