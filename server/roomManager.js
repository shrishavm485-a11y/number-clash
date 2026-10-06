// Room storage. Each room owns its own independent game state.
const rooms = new Map();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike chars (0/O, 1/I)
function newCode() {
  let c;
  do { c = Array.from({ length: 5 }, () => ALPHABET[Math.random() * ALPHABET.length | 0]).join(''); } while (rooms.has(c));
  return c;
}
function create() {
  const room = {
    code: newCode(), players: [], status: 'lobby', phase: null, round: 0, timers: [], cfg: null, sum: null, startAt: 0,
    settings: { mode: 'rounds', target: 10, difficulty: 'medium', countdown: 3, answerTime: 20, penalty: 0.5, special: true },
  };
  rooms.set(room.code, room);
  return room;
}
module.exports = { create, get: c => rooms.get(String(c || '').toUpperCase()), remove: c => rooms.delete(c) };
