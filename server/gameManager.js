// SERVER-AUTHORITATIVE game logic. Clients only send intents (lock number, submit answer);
// the server generates ranges, validates answers, times them with ITS clock, scores and advances rounds.
const R = require('./roomManager');
const AVATARS = ['🗿', '👽', '🤖', '👾', '🥷', '🧠', '🐸', '🔥'];
const MAX = { easy: 20, medium: 100, hard: 500, insane: 999 };
const REACTIONS = ['😂', '💀', '😭', '🔥', '😎', '🤡', '🗿', '👑', '🥶', 'WHAT?!', 'NO WAY!', 'EZ', 'BRUH'];
const TRASH = ['BRO WHAT WAS THAT 💀', 'CALCULATOR DIFF', 'MY GRANDMA IS FASTER', 'YOU HAD ONE JOB 😭', 'TOO EASY 🗿', 'BRAIN.EXE STOPPED',
  'NAH BRO 💀', "I'M BUILT DIFFERENT", 'SKILL ISSUE', 'WHO INVITED THIS GUY?', 'MATH DIFF', 'ABSOLUTELY COOKED 🔥'];
const ALLOWED = new Set([...REACTIONS, ...TRASH]);
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.random() * a.length | 0];
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const clamp = (v, a, b, d) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, Math.round(+v))) : d);
const fresh = () => ({ score: 0, streak: 0, bestStreak: 0, fastest: null, correct: 0, wrong: 0, number: null, locked: false, lockedUntil: 0 });
const later = (room, ms, fn) => room.timers.push(setTimeout(fn, ms));
const clear = room => { room.timers.forEach(clearTimeout); room.timers = []; };

function mkPlayer(sid, name, avatar) {
  const n = String(name || '').toUpperCase().replace(/[^A-Z0-9_\- ]/g, '').trim().slice(0, 12) || 'PLAYER'; // sanitised: safe for innerHTML
  return { token: uid(), sid, name: n, avatar: AVATARS.includes(avatar) ? avatar : '🗿', connected: true, ready: false, rematch: false, lastReact: 0, dc: null, ...fresh() };
}
function push(io, room) {
  const pub = room.players.map(p => ({ name: p.name, avatar: p.avatar, ready: p.ready, connected: p.connected, rematch: p.rematch,
    score: p.score, streak: p.streak, bestStreak: p.bestStreak, fastest: p.fastest, correct: p.correct, wrong: p.wrong }));
  room.players.forEach((p, i) => p.connected && io.to(p.sid).emit('state', { you: i, code: room.code, settings: room.settings, status: room.status, round: room.round, players: pub }));
}

function startMatch(io, room) {
  clear(room); room.round = 0; room.status = 'playing';
  room.players.forEach(p => { Object.assign(p, fresh()); p.ready = false; p.rematch = false; });
  push(io, room);
  later(room, 600, () => startRound(io, room));
}

function startRound(io, room) {
  clear(room); room.round++; room.phase = 'countdown';
  const s = room.settings, d = s.difficulty === 'random' ? pick(Object.keys(MAX)) : s.difficulty;
  const cfg = { max: MAX[d], special: null, countdown: s.countdown, answerTime: s.answerTime, points: 1 };
  if (s.special && room.round > 1 && Math.random() < 0.35) {
    cfg.special = pick(['speed', 'giant', 'small', 'double', 'chaos']);
    if (cfg.special === 'speed') cfg.answerTime = 3;
    if (cfg.special === 'giant') cfg.max = 999;
    if (cfg.special === 'small') { cfg.max = 20; cfg.countdown = 1; }
    if (cfg.special === 'double') cfg.points = 2;
  }
  room.cfg = cfg;
  room.players.forEach(p => { p.number = null; p.locked = false; p.lockedUntil = 0; });
  io.to(room.code).emit('intro', { round: room.round, special: cfg.special, points: cfg.points });
  push(io, room);
  let n = cfg.countdown;
  const tick = () => {
    if (n > 0) { io.to(room.code).emit('countdown', n--); later(room, 1000, tick); return; }
    room.phase = 'picking';
    io.to(room.code).emit('go', { max: cfg.max, seconds: 12 });
    later(room, 12000, () => { room.players.forEach(p => { if (!p.locked) { p.number = rnd(1, cfg.max); p.locked = true; } }); reveal(io, room); });
  };
  later(room, 1200, tick);
}

function lock(io, room, i, num) {
  const p = room.players[i];
  if (room.phase !== 'picking' || p.locked || !Number.isInteger(num) || num < 1 || num > room.cfg.max) return;
  p.number = num; p.locked = true;
  // Only reveal WHO has locked, never the value, until both are in.
  io.to(room.code).emit('locked', room.players.map(q => q.locked));
  if (room.players.every(q => q.locked)) reveal(io, room);
}

function reveal(io, room) {
  if (room.phase !== 'picking') return;
  clear(room); room.phase = 'answering';
  const [a, b] = room.players.map(p => p.number);
  room.sum = a + b;
  room.startAt = Date.now() + 900; // short reveal animation; answers before this are ignored
  io.to(room.code).emit('reveal', { a, b, answerTime: room.cfg.answerTime, special: room.cfg.special });
  later(room, 900 + room.cfg.answerTime * 1000, () => endRound(io, room, -1, 0));
}

function answer(io, room, i, val) {
  const p = room.players[i], now = Date.now(); // authoritative timestamp; Node processes events one at a time, so ordering is fair
  if (room.phase !== 'answering' || now < room.startAt) return;
  if (now < p.lockedUntil) return io.to(p.sid).emit('wrong', { lockMs: p.lockedUntil - now });
  if (Number.isInteger(val) && val === room.sum) return endRound(io, room, i, (now - room.startAt) / 1000);
  p.wrong++;
  p.lockedUntil = now + room.settings.penalty * 1000;
  io.to(p.sid).emit('wrong', { lockMs: room.settings.penalty * 1000 });
  push(io, room);
}

function endRound(io, room, w, time) {
  if (room.phase !== 'answering') return;
  clear(room); room.phase = 'between';
  room.players.forEach((p, i) => { if (i !== w) p.streak = 0; });
  if (w >= 0) {
    const p = room.players[w];
    p.score += room.cfg.points; p.streak++; p.correct++; p.bestStreak = Math.max(p.bestStreak, p.streak);
    p.fastest = p.fastest === null ? time : Math.min(p.fastest, time);
  }
  io.to(room.code).emit('roundResult', { winner: w, name: w >= 0 ? room.players[w].name : null, a: room.players[0].number, b: room.players[1].number,
    sum: room.sum, time, points: w >= 0 ? room.cfg.points : 0, emoji: pick(['🗿', '💀', '😂', '🔥', '🧠', '🤡', '👑', '⚡', '🥶', '😭']) });
  push(io, room);
  later(room, 3000, () => {
    const s = room.settings, top = Math.max(...room.players.map(p => p.score));
    const over = s.mode === 'points' ? top >= s.target : room.round >= s.target;
    if (!over) return startRound(io, room);
    room.status = 'ended'; room.phase = null; room.players.forEach(p => (p.rematch = false));
    push(io, room); io.to(room.code).emit('matchEnd');
  });
}

function attach(io, s) {
  s.emit('hello', { reactions: REACTIONS, trash: TRASH, avatars: AVATARS });
  const ctx = () => { const room = R.get(s.data.code); return room ? { room, i: room.players.findIndex(p => p.token === s.data.token) } : {}; };

  s.on('create', (d, cb) => {
    const room = R.create(), p = mkPlayer(s.id, d && d.name, d && d.avatar);
    room.players.push(p); s.data = { code: room.code, token: p.token }; s.join(room.code);
    cb({ ok: true, code: room.code, token: p.token }); push(io, room);
  });
  s.on('join', (d, cb) => {
    const room = R.get(d && d.code);
    if (!room) return cb({ error: 'Room not found. Check the code.' });
    if (room.players.length >= 2 || room.status !== 'lobby') return cb({ error: 'Room is full or already playing.' });
    const p = mkPlayer(s.id, d.name, d.avatar);
    room.players.push(p); s.data = { code: room.code, token: p.token }; s.join(room.code);
    cb({ ok: true, code: room.code, token: p.token }); push(io, room);
  });
  // Reconnect: identified by secret token, so a dropped player gets their seat (and score) back.
  s.on('rejoin', (d, cb) => {
    const room = R.get(d && d.code), p = room && room.players.find(x => x.token === d.token);
    if (!p) return cb({ ok: false });
    clearTimeout(p.dc); p.sid = s.id; p.connected = true; s.data = { code: room.code, token: p.token }; s.join(room.code);
    cb({ ok: true }); push(io, room); io.to(room.code).emit('presence', { back: p.name });
    if (room.status === 'playing' && room.paused && room.players.every(x => x.connected)) { // resume by replaying the interrupted round
      room.paused = false; room.round--; later(room, 1500, () => startRound(io, room));
    }
  });
  s.on('settings', d => {
    const { room, i } = ctx(); if (!room || i !== 0 || room.status !== 'lobby' || !d) return;
    const o = room.settings;
    o.mode = d.mode === 'points' ? 'points' : 'rounds'; o.target = clamp(d.target, 1, 50, 10);
    o.difficulty = [...Object.keys(MAX), 'random'].includes(d.difficulty) ? d.difficulty : 'medium';
    o.countdown = clamp(d.countdown, 1, 5, 3); o.answerTime = clamp(d.answerTime, 5, 60, 20);
    o.penalty = [0, 0.25, 0.5, 1].includes(+d.penalty) ? +d.penalty : 0.5; o.special = !!d.special;
    push(io, room);
  });
  s.on('ready', () => {
    const { room, i } = ctx(); if (!room || room.status !== 'lobby') return;
    room.players[i].ready = !room.players[i].ready; push(io, room);
    if (room.players.length === 2 && room.players.every(p => p.ready)) startMatch(io, room); // both ready -> server starts
  });
  s.on('lock', n => { const { room, i } = ctx(); if (room) lock(io, room, i, n); });
  s.on('answer', n => { const { room, i } = ctx(); if (room) answer(io, room, i, n); });
  s.on('react', t => {
    const { room, i } = ctx(); if (!room || !ALLOWED.has(t)) return;
    const p = room.players[i], now = Date.now();
    if (now - p.lastReact < 1200) return; // anti-spam cooldown
    p.lastReact = now; io.to(room.code).emit('reaction', { from: i, text: t });
  });
  s.on('rematch', () => {
    const { room, i } = ctx(); if (!room || room.status !== 'ended') return;
    room.players[i].rematch = true;
    if (room.players.length === 2 && room.players.every(p => p.rematch)) { room.status = 'lobby'; room.players.forEach(p => { p.rematch = false; p.ready = false; }); }
    push(io, room);
  });
  s.on('leave', () => {
    const { room, i } = ctx(); if (!room) return;
    clear(room); s.leave(room.code); room.players.splice(i, 1);
    if (!room.players.length) R.remove(room.code);
    else { room.status = 'lobby'; room.round = 0; room.players.forEach(p => { Object.assign(p, fresh()); p.ready = false; }); io.to(room.code).emit('presence', { left: true }); push(io, room); }
    s.data = {};
  });
  s.on('disconnect', () => {
    const { room, i } = ctx(); if (!room || i < 0) return;
    const p = room.players[i]; p.connected = false;
    if (room.status === 'playing') { clear(room); room.paused = true; }
    io.to(room.code).emit('presence', { dc: p.name, secs: 10 }); push(io, room);
    p.dc = setTimeout(() => { // grace period over
      if (p.connected) return;
      if (room.status === 'lobby') { room.players = room.players.filter(x => x !== p); if (!room.players.length) R.remove(room.code); else push(io, room); }
      else io.to(room.code).emit('presence', { gone: p.name });
    }, 10000);
  });
}
module.exports = { attach };
