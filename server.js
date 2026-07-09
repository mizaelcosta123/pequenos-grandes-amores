// Pequenos Grandes Amores - standalone backend (no Puter dependency)
// Express + JSON file store + custom username/password auth (scrypt + session tokens).
// Deploy on any Node host (Render, Railway, Fly, a VPS, etc.).

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;

// ---------- storage ----------
function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const d = JSON.parse(raw);
    return Object.assign({ users: {}, profiles: {}, likes: {}, matches: {}, messages: {}, sessions: {} }, d);
  } catch (e) {
    return { users: {}, profiles: {}, likes: {}, matches: {}, messages: {}, sessions: {} };
  }
}
let db = load();
let saveTimer = null;
function save() {
  // debounce writes a little to avoid clobbering under burst
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }, 10);
}

// ---------- auth helpers ----------
function makeSalt() { return crypto.randomBytes(16).toString('hex'); }
function hashPassword(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
function verifyPassword(password, salt, hash) { return hashPassword(password, salt) === hash; }
function newToken(username) { const t = crypto.randomBytes(32).toString('hex'); db.sessions[t] = username; return t; }
function usernameFromReq(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return db.sessions[m[1]] || null;
}
function auth(req, res, next) {
  const username = usernameFromReq(req);
  if (!username) return res.status(401).json({ error: 'not_authenticated' });
  req.username = username;
  next();
}

// ---------- geo helpers ----------
const PROFILE_PREFIX = 'profile:';
function hasCoords(p) {
  return p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng);
}
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function matchKey(a, b) { return [a, b].sort().join('|'); }

// ---------- app ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));

// health
app.get('/', (req, res) => res.json({ ok: true, service: 'pequenos-grandes-amores' }));
app.get('/health', (req, res) => res.json({ ok: true }));

// ---------- auth ----------
app.post('/auth/signup', (req, res) => {
  const username = (req.body.username || '').toString().trim();
  const password = (req.body.password || '').toString();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'invalid_username' });
  if (password.length < 4) return res.status(400).json({ error: 'weak_password' });
  if (db.users[username]) return res.status(409).json({ error: 'username_taken' });
  const salt = makeSalt();
  db.users[username] = { username, salt, hash: hashPassword(password, salt), created: Date.now() };
  const token = newToken(username);
  save();
  res.json({ ok: true, token, user: { username } });
});

app.post('/auth/login', (req, res) => {
  const username = (req.body.username || '').toString().trim();
  const password = (req.body.password || '').toString();
  const u = db.users[username];
  if (!u || !verifyPassword(password, u.salt, u.hash)) return res.status(401).json({ error: 'bad_credentials' });
  const token = newToken(username);
  save();
  res.json({ ok: true, token, user: { username } });
});

app.get('/auth/me', auth, (req, res) => res.json({ user: { username: req.username } }));

app.post('/auth/logout', auth, (req, res) => {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) delete db.sessions[m[1]];
  save();
  res.json({ ok: true });
});

// ---------- profile ----------
app.post('/profile', auth, (req, res) => {
  const username = req.username;
  const body = req.body || {};
  const existing = db.profiles[username] || {};
  const lat = (body.lat !== undefined && body.lat !== null && body.lat !== '') ? parseFloat(body.lat) : (existing.lat ?? null);
  const lng = (body.lng !== undefined && body.lng !== null && body.lng !== '') ? parseFloat(body.lng) : (existing.lng ?? null);
  const profile = {
    username,
    name: (body.name || '').toString().slice(0, 40),
    age: parseInt(body.age) || null,
    height: parseInt(body.height) || null,
    city: (body.city || '').toString().slice(0, 60),
    gender: (body.gender || '').toString().slice(0, 20),
    seeking: (body.seeking || '').toString().slice(0, 20),
    bio: (body.bio || '').toString().slice(0, 500),
    interests: Array.isArray(body.interests) ? body.interests.slice(0, 12).map(s => s.toString().slice(0, 24)) : [],
    photo: (body.photo || '').toString().slice(0, 2000000),
    lat: (typeof lat === 'number' && !isNaN(lat)) ? lat : null,
    lng: (typeof lng === 'number' && !isNaN(lng)) ? lng : null,
    maxDistance: parseInt(body.maxDistance) || existing.maxDistance || 50,
    updated: Date.now(),
    active: true
  };
  db.profiles[username] = profile;
  save();
  res.json({ ok: true, profile });
});

app.post('/location', auth, (req, res) => {
  const username = req.username;
  const lat = parseFloat(req.body && req.body.lat);
  const lng = parseFloat(req.body && req.body.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'bad_coords' });
  const p = db.profiles[username] || { username };
  p.lat = lat; p.lng = lng; p.updated = Date.now();
  db.profiles[username] = p;
  save();
  res.json({ ok: true, profile: p });
});

app.get('/profile/me', auth, (req, res) => res.json({ profile: db.profiles[req.username] || null }));

// ---------- discover ----------
app.get('/discover', auth, (req, res) => {
  const username = req.username;
  const radiusParam = parseInt(req.query.radius);
  const radius = (!isNaN(radiusParam) && radiusParam > 0) ? radiusParam : null;

  const meProfile = db.profiles[username] || null;
  const myHasLoc = hasCoords(meProfile);

  const decided = new Set(
    Object.keys(db.likes)
      .filter(k => k.startsWith(username + ':'))
      .map(k => k.split(':')[1])
  );

  const results = [];
  for (const key of Object.keys(db.profiles)) {
    const p = db.profiles[key];
    if (!p || !p.username) continue;
    if (p.username === username) continue;
    if (decided.has(p.username)) continue;

    let dist = null;
    if (myHasLoc && hasCoords(p)) {
      dist = distanceKm(meProfile.lat, meProfile.lng, p.lat, p.lng);
      if (radius !== null && dist > radius) continue;
    } else if (radius !== null) {
      continue;
    }
    const out = Object.assign({}, p);
    delete out.lat; delete out.lng;
    out.distance = dist !== null ? Math.round(dist) : null;
    results.push(out);
  }

  if (myHasLoc) {
    results.sort((a, b) => {
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });
  } else {
    for (let i = results.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [results[i], results[j]] = [results[j], results[i]];
    }
  }
  res.json({ profiles: results, hasLocation: myHasLoc });
});

// ---------- swipe ----------
app.post('/swipe', auth, (req, res) => {
  const username = req.username;
  const target = (req.body.target || '').toString();
  const action = req.body.action === 'like' ? 'like' : 'pass';
  if (!target || target === username) return res.status(400).json({ error: 'bad_target' });

  db.likes[username + ':' + target] = action;

  let matched = false;
  let targetProfile = null;
  if (action === 'like') {
    if (db.likes[target + ':' + username] === 'like') {
      matched = true;
      const key = matchKey(username, target);
      if (!db.matches[key]) db.matches[key] = { users: [username, target], ts: Date.now() };
      const tp = db.profiles[target];
      if (tp) { targetProfile = Object.assign({}, tp); delete targetProfile.lat; delete targetProfile.lng; }
    }
  }
  save();
  res.json({ ok: true, matched, targetProfile });
});

// ---------- matches ----------
app.get('/matches', auth, (req, res) => {
  const username = req.username;
  const matches = [];
  for (const key of Object.keys(db.matches)) {
    const m = db.matches[key];
    if (!m.users || !m.users.includes(username)) continue;
    const other = m.users.find(u => u !== username);
    if (!other) continue;
    const op = db.profiles[other];
    if (!op) continue;
    const oProfile = Object.assign({}, op);
    delete oProfile.lat; delete oProfile.lng;
    const arr = db.messages[key] || [];
    const last = arr.length ? arr[arr.length - 1] : null;
    matches.push({ profile: oProfile, ts: m.ts, lastMessage: last });
  }
  matches.sort((a, b) => {
    const at = a.lastMessage ? a.lastMessage.ts : a.ts;
    const bt = b.lastMessage ? b.lastMessage.ts : b.ts;
    return bt - at;
  });
  res.json({ matches });
});

// ---------- messages ----------
app.get('/messages', auth, (req, res) => {
  const username = req.username;
  const other = (req.query.with || '').toString();
  if (!other) return res.status(400).json({ error: 'missing_with' });
  const key = matchKey(username, other);
  if (!db.matches[key]) return res.status(403).json({ error: 'not_matched' });
  res.json({ messages: db.messages[key] || [] });
});

app.post('/messages', auth, (req, res) => {
  const username = req.username;
  const other = (req.body.to || '').toString();
  const text = (req.body.text || '').toString().slice(0, 1000).trim();
  if (!other || !text) return res.status(400).json({ error: 'bad_input' });
  const key = matchKey(username, other);
  if (!db.matches[key]) return res.status(403).json({ error: 'not_matched' });
  const arr = db.messages[key] || [];
  const msg = { from: username, text, ts: Date.now() };
  arr.push(msg);
  if (arr.length > 500) arr.splice(0, arr.length - 500);
  db.messages[key] = arr;
  save();
  res.json({ ok: true, message: msg });
});

app.listen(PORT, () => console.log('Pequenos Grandes Amores backend listening on :' + PORT));
