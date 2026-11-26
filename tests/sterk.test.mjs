// Run: node tests/sterk.test.mjs  (Sterkste ploeg: dragende spelers op hun plek en niet korter dan zwakkere spelers)
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const store = await import('../js/store.js');
const M = await import('../js/match.js');
const P = await import('../js/profiles.js');

const team = store.newTeam();
const lv = (n) => (n - 1) * 12.5;
// 8 spelers, 2-1-2 met keeper: drie dragende spelers met een vaste rol, een allrounder en beginners
const defs = [
  ['s1', 7, 'V', ['V', 'M']], ['s2', 9, 'A', ['A', 'M']], ['s3', 4, null, ['V', 'M', 'A']], ['s4', 7, 'M', ['M', 'A']],
  ['s5', 3, null, ['A', 'M', 'V']], ['s6', 2, null, ['V', 'M']], ['s7', 3, 'A', ['A', 'V', 'M']], ['s8', 2, null, ['V', 'M']],
];
team.players = defs.map(([id, l, main, prefs]) => ({ id, name: id, nick: id, kracht: lv(l), main, prefs, strengths: [], active: true }));
team.rules.profile = 'sterk';
const ids = team.players.map((p) => p.id);
const tuned = P.tune(team, 'sterk', ids, 's6');
const m = M.createMatch(team, { opponent: 'T', present: ids, keeperId: 's6', rules: tuned.rules });
const cards = M.timeline(m, team).cards;
const END = team.periods * M.periodLen(team);
const pl = {}, where = {};
for (const id of ids) { pl[id] = 0; where[id] = { V: 0, M: 0, A: 0 }; }
cards.forEach((c, i) => { const t1 = i + 1 < cards.length ? cards[i + 1].t : END; for (const id in c.pos) { pl[id] += t1 - c.t; where[id][c.pos[id]] += t1 - c.t; } });

assert.ok(m.plan.ok, 'plan binnen de regels');
assert.equal(where.s1.M + where.s1.A, 0, 'dragende aanvaller blijft voorin');
assert.equal(where.s4.V + where.s4.A, 0, 'dragende middenvelder blijft in het midden');
const kr = Object.fromEntries(team.players.map((p) => [p.id, p.kracht]));
const field = ids.filter((id) => id !== 's6');
for (const a of field) for (const b of field) {
  if (kr[a] - kr[b] >= 25) assert.ok(pl[a] >= pl[b] - 30, `${a} (sterker) speelt niet korter dan ${b}`);
}
assert.ok(pl.s1 > pl.s3, 'dragende aanvaller speelt langer dan de allrounder');
console.log('sterkste ploeg ok');

// ---------- focus: zonder dragende verdediger valt eerst een dragende middenvelder achterin in ----------
{
  const { assignLines, FIT_W } = await import('../js/planner.js');
  const pm = M.playersMap(team);
  for (const id in pm) pm[id].w = FIT_W.bezetting;
  const lines = { V: 2, M: 1, A: 2 };
  // s2 (dragende verdediger) is er niet
  const ids5 = ['s1', 's3', 's4', 's5', 's7'];
  const def = assignLines(ids5, lines, pm, 'verdedigen');
  assert.equal(def.s4, 'A', 'dragende middenvelder valt achterin in');
  assert.equal(def.s1, 'V', 'dragende aanvaller blijft voorin');
  // middenvelder zonder voorkeur achter: nog steeds liever hij dan de aanvaller
  pm.s4 = { ...pm.s4, prefs: ['M'] };
  const def2 = assignLines(ids5, lines, pm, 'verdedigen');
  assert.equal(def2.s4, 'A', 'ook zonder voorkeur achter: eerst de middenvelder');
  // balans: iedereen op zijn eigen plek
  const bal = assignLines(ids5, lines, pm, 'balans');
  assert.equal(bal.s1, 'V'); assert.equal(bal.s4, 'M');
  // wel een dragende verdediger: die staat achter, de rest op zijn plek
  const ids5b = ['s1', 's2', 's3', 's4', 's5'];
  const def3 = assignLines(ids5b, lines, pm, 'verdedigen');
  assert.equal(def3.s2, 'A'); assert.equal(def3.s4, 'M'); assert.equal(def3.s1, 'V');
}
console.log('focus met invallers ok');
