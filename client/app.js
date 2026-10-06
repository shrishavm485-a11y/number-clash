const s = io(), $ = q => document.querySelector(q), $$ = q => [...document.querySelectorAll(q)];
let st = null, L = { reactions: [], trash: [], avatars: [] }, snd = true, av = '🗿', mode = '', ac, lockUntil = 0, curMax = 100, lastStatus = '', tmr;
// ---------- sound (WebAudio, no files, no autoplay music) ----------
function beep(f, d = .12, t = 'square') { if (!snd) return; try { ac = ac || new AudioContext(); const o = ac.createOscillator(), g = ac.createGain(); o.type = t; o.frequency.value = f; g.gain.value = .08; o.connect(g); g.connect(ac.destination); o.start(); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d); o.stop(ac.currentTime + d); } catch (e) {} }
const jingle = a => a.forEach((f, i) => setTimeout(() => beep(f, .16), i * 130));
$('#snd').onclick = () => { snd = !snd; $('#snd').textContent = snd ? '🔊 ON' : '🔇 OFF'; };
// ---------- helpers ----------
const show = id => { $$('main>section').forEach(e => e.hidden = e.id !== id); $('#react').hidden = !['lobby', 'game'].includes(id); };
const stage = h => { $('#stage').innerHTML = h; };
const banner = h => { $('#banner').innerHTML = h || ''; };
const toast = t => { const e = $('#toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(tmr); tmr = setTimeout(() => e.style.display = 'none', 2500); };
const save = (c, t) => sessionStorage.setItem('nc', JSON.stringify({ c, t }));
const fmt = n => n === null || n === undefined ? '—' : n.toFixed(2) + 's';
function confetti() { for (let i = 0; i < 45; i++) { const e = document.createElement('span'); e.className = 'cf'; e.textContent = pickOne(['🎉', '⚡', '⭐', '👑', '🔥']); e.style.left = Math.random() * 100 + 'vw'; e.style.animationDelay = Math.random() * .6 + 's'; $('#float').appendChild(e); setTimeout(() => e.remove(), 3000); } }
const pickOne = a => a[Math.random() * a.length | 0];
function floatText(from, text) {
  const e = document.createElement('div'); e.className = 'fl' + (text.length > 2 ? ' t' : ''); e.textContent = text;
  e.style.left = from === 0 ? '6vw' : 'auto'; if (from !== 0) e.style.right = '6vw'; $('#float').appendChild(e); setTimeout(() => e.remove(), 1700);
}
// ---------- socket events ----------
s.on('hello', d => { L = d; buildAvatars(); buildReact(); });
s.on('connect', () => { const x = JSON.parse(sessionStorage.getItem('nc') || 'null'); if (x) s.emit('rejoin', { code: x.c, token: x.t }, r => { if (!r.ok) { sessionStorage.removeItem('nc'); show('home'); } }); });
s.on('state', x => { st = x; render(); });
s.on('presence', p => {
  if (p.dc) { banner(`${p.dc} DISCONNECTED — RECONNECTING… 10s`); toast(p.dc + ' DISCONNECTED'); }
  if (p.back) banner('');
  if (p.gone || p.left) stage(`<div class="mid">OPPONENT LEFT</div><button class="btn big b" data-act="wait">WAIT</button><button class="btn big" data-act="leave">RETURN TO HOME</button>`);
});
s.on('intro', d => { banner(d.special ? `<span class="sp">${{ speed: '⚡ SPEED ROUND — 3s!', giant: '🦣 GIANT NUMBERS', small: '🐜 SMALL NUMBERS', double: '✨ DOUBLE POINTS', chaos: '🌀 CHAOS ROUND' }[d.special]}</span>` : `ROUND ${d.round}`); $('#stage').className = d.special === 'chaos' ? 'chaos' : ''; stage(`<div class="mid">GET READY</div>`); });
s.on('countdown', n => { beep(440); stage(`<div class="huge" aria-live="assertive">${n}</div>`); });
s.on('go', d => { beep(880, .3); curMax = d.max; stage(`<div class="huge">GO!</div>`); setTimeout(pickUI, 450); });
s.on('locked', l => { if (l[st.you]) stage(`<div class="mid">NUMBER LOCKED 🔒</div><div>WAITING FOR OPPONENT…</div>`); });
s.on('reveal', d => {
  beep(660, .2);
  const n = st.players; stage(`<div class="eq card y"><small>${n[0].avatar} ${n[0].name}</small>${d.a}<br>+<br><small>${n[1].avatar} ${n[1].name}</small>${d.b}<br>= ?</div>
  <div class="bar"><i id="tb" style="width:100%"></i></div>
  <input id="ans" class="big-in" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Your answer" placeholder="______"><button class="btn big g" data-act="ans">SUBMIT ANSWER</button>`);
  setTimeout(() => { const a = $('#ans'); a && a.focus(); }, 950);
  const t0 = Date.now() + 900; const iv = setInterval(() => { const b = $('#tb'); if (!b) return clearInterval(iv); b.style.width = Math.max(0, 100 - (Date.now() - t0) / (d.answerTime * 10)) + '%'; }, 100);
});
s.on('wrong', d => { beep(120, .3, 'sawtooth'); lockUntil = Date.now() + d.lockMs; const a = $('#ans'); if (a) { a.value = ''; a.classList.add('shake'); setTimeout(() => a.classList.remove('shake'), 400); } toast('WRONG! ❌' + (d.lockMs ? ' LOCKED ' + (d.lockMs / 1000) + 's' : '')); });
s.on('roundResult', r => {
  const me = r.winner === st.you; beep(me ? 988 : 200, .3);
  stage(r.winner < 0 ? `<div class="huge">⏰</div><div class="mid">TIME'S UP</div><div>${r.a} + ${r.b} = ${r.sum}</div>` :
    `<div class="huge">${r.emoji}</div><div class="mid">${r.name} WINS! ⚡</div><div class="eq">${r.a} + ${r.b} = ${r.sum}</div><div class="mid">+${r.points} POINT${r.points > 1 ? 'S' : ''} · ${r.time.toFixed(2)}s</div>`);
  if (me) { confetti(); jingle([523, 659, 784]); }
});
s.on('matchEnd', () => { confetti(); jingle([523, 659, 784, 1046]); });
s.on('reaction', r => floatText(r.from, r.text));
// ---------- rendering ----------
function render() {
  if (st.status === 'lobby') { lastStatus = 'lobby'; show('lobby'); lobby(); }
  else if (st.status === 'playing') { if (lastStatus !== 'playing') { show('game'); banner(''); } lastStatus = 'playing'; scoreboard(); }
  else if (st.status === 'ended') { lastStatus = 'ended'; show('end'); endScreen(); }
}
function scoreboard() {
  const [a, b] = st.players, top = Math.max(a.score, b ? b.score : 0), tie = b && a.score === b.score;
  const col = (p, i) => !p ? '<div></div>' : `<div class="p ${!tie && p.score === top ? 'lead' : ''}">${p.avatar} ${p.name}${i === st.you ? ' (YOU)' : ''}<div class="sc">${p.score}</div>
    <div class="${p.streak >= 5 ? 'fire5' : p.streak >= 3 ? 'fire3' : p.streak >= 2 ? 'fire2' : ''}">${['', '', 'DOUBLE STREAK 🔥', 'ON FIRE 🔥🔥', 'ON FIRE 🔥🔥'][Math.min(p.streak, 4)] || 'UNSTOPPABLE 💀'}</div>
    Fastest ${fmt(p.fastest)}<br>✔ ${p.correct} ✖ ${p.wrong}</div>`;
  $('#sb').innerHTML = col(a, 0) + `<div class="sc">:</div>` + col(b, 1) + `<div style="grid-column:1/4">ROUND ${st.round} · ${st.settings.mode === 'points' ? 'FIRST TO ' + st.settings.target : st.round + '/' + st.settings.target}</div>`;
}
function lobby() {
  const o = st.settings, host = st.you === 0, d = host ? '' : 'disabled', [a, b] = st.players;
  const slot = (p, i) => p ? `<div class="card ${i ? 'p' : 'y'}">${p.avatar}<br>${p.name}<br>${p.connected ? '🟢' : '🔴'} ${p.ready ? 'READY ✅' : 'NOT READY'}</div>` : `<div class="card">?<br>WAITING FOR PLAYER</div>`;
  const sel = (id, opts, v) => `<select id="${id}" ${d}>${opts.map(([k, t]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const keep = document.activeElement && document.activeElement.id;
  $('#lobby').innerHTML = `<div class="card y code" aria-label="Room code">ROOM: ${st.code}</div>
  <div class="row"><button class="btn" data-act="copy">COPY INVITE</button><button class="btn b" data-act="share">SHARE ROOM</button></div>
  <div class="slots">${slot(a, 0)}<b>VS</b>${slot(b, 1)}</div>
  <div class="card"><h2>SETTINGS ${host ? '' : '(HOST ONLY)'}</h2><div class="grid">
  <label>MODE${sel('s_mode', [['rounds', 'ROUNDS'], ['points', 'FIRST TO POINTS']], o.mode)}</label>
  <label>TARGET (5/10/20/CUSTOM)<input id="s_target" type="number" min="1" max="50" value="${o.target}" ${d} list="pre"><datalist id="pre"><option>5<option>10<option>20</datalist></label>
  <label>DIFFICULTY${sel('s_diff', [['easy', 'EASY 1–20'], ['medium', 'MEDIUM 1–100'], ['hard', 'HARD 1–500'], ['insane', 'INSANE 1–999'], ['random', 'RANDOM']], o.difficulty)}</label>
  <label>COUNTDOWN (s)${sel('s_cd', [1, 2, 3, 4, 5].map(x => [x, x]), o.countdown)}</label>
  <label>MAX ANSWER TIME (s)<input id="s_at" type="number" min="5" max="60" value="${o.answerTime}" ${d}></label>
  <label>WRONG-ANSWER LOCKOUT${sel('s_pen', [[0, 'NONE'], [0.25, '0.25s'], [0.5, '0.5s'], [1, '1s']], o.penalty)}</label>
  <label>SPECIAL ROUNDS${sel('s_sp', [[1, 'ON'], [0, 'OFF']], o.special ? 1 : 0)}</label></div></div>
  <button class="btn big ${st.players[st.you].ready ? 'g' : 'y'}" data-act="ready" ${b ? '' : 'disabled'}>${st.players[st.you].ready ? 'READY ✅ (TAP TO UNREADY)' : 'READY'}</button><button class="btn" data-act="leave">LEAVE ROOM</button>`;
  if (host) $$('#lobby select,#lobby input').forEach(e => e.onchange = sendSettings);
  if (keep) { const e = document.getElementById(keep); e && e.focus(); }
}
const sendSettings = () => s.emit('settings', { mode: $('#s_mode').value, target: $('#s_target').value, difficulty: $('#s_diff').value, countdown: $('#s_cd').value, answerTime: $('#s_at').value, penalty: $('#s_pen').value, special: $('#s_sp').value === '1' });
function endScreen() {
  const [a, b] = st.players; const w = a.score === b.score ? null : a.score > b.score ? a : b, l = w === a ? b : a, diff = Math.abs(a.score - b.score);
  const msg = !w ? 'ABSOLUTE CHAOS. RUN IT BACK.' : diff <= 1 ? 'THAT WAS WAY TOO CLOSE 😭' : (l.score === 0 || diff >= 5) ? "THIS WASN'T EVEN A COMPETITION 💀" : 'GG. REMATCH?';
  const card = (p, t) => `<div class="card ${t}">${p.avatar} <b>${p.name}</b><br>Score ${p.score} · Correct ${p.correct} · Wrong ${p.wrong}<br>Fastest ${fmt(p.fastest)} · Best streak ${p.bestStreak}</div>`;
  $('#end').innerHTML = `<h1 style="font-size:clamp(40px,12vw,80px)">${w ? '👑 ' + w.name + ' WINS 👑' : '🤝 DRAW 🤝'}</h1><div class="eq">${a.score} — ${b.score}</div><div class="mid">${msg}</div>
  <div class="card"><h2>MATCH STATISTICS</h2>Rounds played: ${st.round}</div>${card(a, 'y')}${card(b, 'p')}
  <button class="btn big g" data-act="rematch">${st.players[st.you].rematch ? 'WAITING FOR OPPONENT…' : 'REMATCH / PLAY AGAIN'}</button><button class="btn big b" data-act="newroom">NEW ROOM</button><button class="btn big" data-act="leave">HOME</button>`;
}
function pickUI() {
  if (!st || st.status !== 'playing') return;
  stage(`<div class="mid">CHOOSE YOUR NUMBER (1–${curMax})</div><div class="stepper"><button class="btn" data-act="dec" aria-label="Minus">−</button><input id="num" class="big-in" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Your number" value="${Math.ceil(curMax / 2)}"><button class="btn" data-act="inc" aria-label="Plus">+</button></div>
  <button class="btn" data-act="rand">🎲 RANDOM</button><button class="btn big y" data-act="lock">LOCK NUMBER</button>`);
  const n = $('#num'); n.focus(); n.select();
}
function buildReact() { $('#react').innerHTML = L.reactions.map(r => `<button class="btn" data-r="${r}">${r}</button>`).join('') + L.trash.map(r => `<button class="btn sm" data-r="${r}">${r}</button>`).join(''); }
function buildAvatars() { $('#avs').innerHTML = L.avatars.map(a => `<button role="radio" aria-checked="${a === av}" data-av="${a}" aria-label="Avatar ${a}">${a}</button>`).join(''); }
// ---------- clicks (event delegation) ----------
function enter(act) { const nm = $('#nick').value.trim(); if (!nm) return ($('#err').textContent = 'Enter a nickname first.'); const cb = r => { if (r.error) return ($('#err').textContent = r.error); save(r.code, r.token); }; s.emit(act, { name: nm, avatar: av, code: $('#code').value.trim().toUpperCase() }, cb); }
const invite = () => `Join my Number Clash game! Room: ${st.code} ${location.origin}/?room=${st.code}`;
document.addEventListener('click', e => {
  const r = e.target.closest('[data-r]'); if (r) return s.emit('react', r.dataset.r);
  const a = e.target.closest('[data-av]'); if (a) { av = a.dataset.av; return buildAvatars(); }
  const t = e.target.closest('[data-act]'); if (!t) return; const act = t.dataset.act, num = $('#num');
  const A = {
    mk: () => { mode = 'create'; $('#ft').textContent = 'CREATE ROOM'; $('#cl').hidden = true; $('#gob').textContent = 'CREATE ROOM'; show('form'); },
    jn: () => { mode = 'join'; $('#ft').textContent = 'JOIN ROOM'; $('#cl').hidden = false; $('#gob').textContent = 'JOIN GAME'; show('form'); },
    go: () => enter(mode), home: () => show('home'),
    copy: () => navigator.clipboard.writeText(invite()).then(() => toast('INVITE COPIED ✅')),
    share: () => navigator.share ? navigator.share({ text: invite() }).catch(() => {}) : navigator.clipboard.writeText(invite()).then(() => toast('INVITE COPIED ✅')),
    ready: () => s.emit('ready'), rematch: () => s.emit('rematch'),
    leave: () => { s.emit('leave'); sessionStorage.removeItem('nc'); lastStatus = ''; show('home'); },
    newroom: () => { s.emit('leave'); sessionStorage.removeItem('nc'); lastStatus = ''; A.mk(); },
    wait: () => toast('WAITING…'),
    inc: () => { num.value = Math.min(curMax, (+num.value || 0) + 1); }, dec: () => { num.value = Math.max(1, (+num.value || 2) - 1); },
    rand: () => { num.value = 1 + Math.floor(Math.random() * curMax); },
    lock: () => s.emit('lock', parseInt(num.value, 10)),
    ans: () => { if (Date.now() < lockUntil) return; const v = $('#ans').value.trim(); if (v !== '') s.emit('answer', parseInt(v, 10)); },
  };
  A[act] && A[act]();
});
document.addEventListener('keydown', e => { if (e.key !== 'Enter') return; if (e.target.id === 'num') $('[data-act=lock]').click(); else if (e.target.id === 'ans') $('[data-act=ans]').click(); else if (e.target.id === 'nick' || e.target.id === 'code') $('#gob').click(); });
const q = new URLSearchParams(location.search).get('room'); if (q) { $('#code').value = q.toUpperCase(); $('[data-act=jn]').click(); }
show('home');
