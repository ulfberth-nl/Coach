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

// ---------- focus: zonder dragende verdediger valt een andere dragende speler achterin in ----------
{
  const { assignLines, FIT_W } = await import('../js/planner.js');
  const pm = M.playersMap(team);
  for (const id in pm) pm[id].w = FIT_W.bezetting;
  // s2 (dragende verdediger) is er niet
  const ids5 = ['s1', 's3', 's4', 's5', 's7'];
  // één middenvelder (2-1-2): het midden blijft heel, de dragende aanvaller valt achterin in
  const one = { V: 2, M: 1, A: 2 };
  const def = assignLines(ids5, one, pm, 'verdedigen');
  assert.equal(def.s1, 'A', 'dragende aanvaller valt achterin in');
  assert.equal(def.s4, 'M', 'enige middenvelder blijft in het midden, ook met voorkeur achter');
  // is er geen dragende aanvaller, dan schuift toch de middenvelder
  const def1 = assignLines(['s3', 's4', 's5', 's7', 's8'], one, pm, 'verdedigen');
  assert.equal(def1.s4, 'A', 'zonder dragende aanvaller valt de middenvelder in');
  // twee middenvelders (2-2-2): eerst de dragende middenvelder
  const two = { V: 2, M: 2, A: 2 };
  const ids6 = ['s1', 's3', 's4', 's5', 's7', 's8'];
  const def2 = assignLines(ids6, two, pm, 'verdedigen');
  assert.equal(def2.s4, 'A', 'dragende middenvelder valt achterin in');
  assert.equal(def2.s1, 'V', 'dragende aanvaller blijft voorin');
  // middenvelder zonder voorkeur achter: bij twee middenvelders nog steeds liever hij dan de aanvaller
  const pmNo = { ...pm, s4: { ...pm.s4, prefs: ['M'] } };
  const def3 = assignLines(ids6, two, pmNo, 'verdedigen');
  assert.equal(def3.s4, 'A', 'ook zonder voorkeur achter: eerst de middenvelder');
  // een dragende aanvaller met voorkeur achter gaat altijd eerst
  const pmPref = { ...pm, s1: { ...pm.s1, prefs: ['V', 'A'] } };
  const def4 = assignLines(ids6, two, pmPref, 'verdedigen');
  assert.equal(def4.s1, 'A', 'voorkeur achter gaat voor'); assert.equal(def4.s4, 'M');
  // balans: iedereen op zijn eigen plek
  const bal = assignLines(ids5, one, pm, 'balans');
  assert.equal(bal.s1, 'V'); assert.equal(bal.s4, 'M');
  // wel een dragende verdediger: die staat achter, de rest op zijn plek
  const ids5b = ['s1', 's2', 's3', 's4', 's5'];
  const def5 = assignLines(ids5b, one, pm, 'verdedigen');
  assert.equal(def5.s2, 'A'); assert.equal(def5.s4, 'M'); assert.equal(def5.s1, 'V');
}
console.log('focus met invallers ok');

// ---------- focus: een Vaste Waarde (niveau 6) achterin is goed genoeg ----------
{
  const { assignLines, FIT_W } = await import('../js/planner.js');
  const pm = M.playersMap(team);
  for (const id in pm) pm[id].w = FIT_W.bezetting;
  const lines = { V: 2, M: 1, A: 2 };
  const ids5 = ['s1', 's3', 's4', 's5', 's7'];
  // s7 wordt een Vaste Waarde met vaste rol achter
  pm.s7 = { ...pm.s7, kracht: lv(6) };
  const def = assignLines(ids5, lines, pm, 'verdedigen');
  assert.equal(def.s7, 'A', 'Vaste Waarde staat achter');
  assert.equal(def.s4, 'M', 'dragende middenvelder blijft in het midden');
  assert.equal(def.s1, 'V', 'dragende aanvaller blijft voorin');
  // Vaste Waarde zonder vaste rol maar met voorkeur achter: ook goed genoeg
  pm.s7 = { ...pm.s7, main: null, prefs: ['A', 'M'] };
  const def2 = assignLines(ids5, lines, pm, 'verdedigen');
  assert.equal(def2.s7, 'A'); assert.equal(def2.s4, 'M'); assert.equal(def2.s1, 'V');
}
console.log('focus met Vaste Waarde ok');

// ---------- 9 spelers (8 in het veld, 5 tegelijk): geen duidelijk sterkere speler korter dan een zwakkere ----------
{
  const t9 = store.newTeam();
  const d9 = [
    ['s1', 7, 'V', ['V', 'M']], ['s2', 9, 'A', ['A', 'M']], ['s3', 5, null, ['V', 'M', 'A']], ['s4', 7, 'M', ['M', 'A']],
    ['s5', 3, null, ['A', 'M', 'V']], ['s6', 2, null, ['V', 'M']], ['s7', 3, 'A', ['A', 'V', 'M']], ['s8', 2, null, ['V', 'M']], ['s9', 2, null, ['M']],
  ];
  t9.players = d9.map(([id, l, main, prefs]) => ({ id, name: id, nick: id, kracht: lv(l), main, prefs, strengths: [], active: true }));
  t9.rules.profile = 'sterk';
  const ids9 = t9.players.map((p) => p.id);
  const tu = P.tune(t9, 'sterk', ids9, 's8');
  const m9 = M.createMatch(t9, { opponent: 'T', present: ids9, keeperId: 's8', rules: tu.rules });
  const c9 = M.timeline(m9, t9).cards;
  const E9 = t9.periods * M.periodLen(t9);
  const p9 = {};
  c9.forEach((c, i) => { const t1 = i + 1 < c9.length ? c9[i + 1].t : E9; for (const id in c.pos) p9[id] = (p9[id] || 0) + t1 - c.t; });
  const k9 = Object.fromEntries(t9.players.map((p) => [p.id, p.kracht]));
  assert.ok(m9.plan.ok, 'plan binnen de regels');
  for (const a in p9) for (const b in p9) if (k9[a] - k9[b] >= 25) assert.ok(p9[a] >= p9[b] - 30, `${a} (sterker) speelt niet korter dan ${b}`);
}
console.log('9 spelers ok');
