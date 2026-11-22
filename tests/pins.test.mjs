// Run: node tests/pins.test.mjs  (speldjes: vastgezette momenten in de planner)
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const store = await import('../js/store.js');
const M = await import('../js/match.js');

let fakeNow = 3_000_000;
Date.now = () => fakeNow;
const team = store.newTeam();
const ids = team.players.map((p) => p.id);
const keeperId = team.keeper ? ids[ids.length - 1] : null;
const swapsOf = (m) => m.plan.steps.filter((s) => s.type === 'swap');
const moments = (m) => [...new Set(swapsOf(m).map((s) => s.t))];

const match = M.createMatch(team, { opponent: 'Test', present: ids, keeperId, priority: 'eerlijk' });
const before = moments(match);
const free = swapsOf(match);
assert.ok(before.length >= 4, 'genoeg momenten om te testen');
// moment 3: zet een andere wissel vast dan de app voorstelde
const t3 = before[2];
const { cards } = M.timeline(match, team);
const at3 = cards.find((c) => c.t === t3 && c.kind === 'swap');
const prev3 = cards[cards.indexOf(at3) - 1];
const planned = free.find((s) => s.t === t3);
const altIn = prev3.bench.find((id) => id !== planned.in);
const altOut = Object.keys(prev3.pos).find((id) => id !== planned.out);
M.pinMoment(match, team, t3, [{ out: altOut, in: altIn }]);
const after = moments(match);
assert.deepEqual(after.slice(0, 3), before.slice(0, 3), 'momenten tot en met het speldje blijven op hun tijd');
const s3 = swapsOf(match).find((s) => s.t === t3);
assert.equal(s3.out, altOut); assert.equal(s3.in, altIn); assert.ok(s3.pinned && s3.fixed);
assert.ok(M.isPinned(match, t3));
const tl = M.timeline(match, team).cards;
assert.ok(tl.find((c) => c.t === t3).pinned, 'kaart heeft een speldje');
assert.deepEqual(match.plan.broken, []);
console.log('speldje op moment 3:', M.nickOf(team, altOut), '→', M.nickOf(team, altIn), '· plan', match.plan.ok ? 'ok' : 'niet ok', match.plan.fair.minPlayed / 60, '-', match.plan.fair.maxPlayed / 60);

// tweede speldje later, en weer los
const t5 = moments(match)[4];
const cs = M.timeline(match, team).cards;
const p5 = cs[cs.findIndex((c) => c.t === t5) - 1];
M.pinMoment(match, team, t5, [{ out: Object.keys(p5.pos)[0], in: p5.bench[0] }]);
assert.ok(M.isPinned(match, t3) && M.isPinned(match, t5));
assert.equal(swapsOf(match).filter((s) => s.pinned).length, 2);
M.unpinMoment(match, team, t5);
assert.ok(!M.isPinned(match, t5) && M.isPinned(match, t3));

// iemand valt uit: het speldje kan niet meer, de app meldt het (en wist het niet stilletjes)
M.startClock(match);
fakeNow += 30_000;
M.disablePlayer(match, team, altIn, 'wedstrijd');
assert.equal(match.plan.broken.length, 1, 'kapot speldje gemeld');
assert.equal(match.plan.broken[0].in, altIn);
assert.ok(M.isPinned(match, t3), 'speldje blijft staan tot de coach het losmaakt');
M.undo(match, team);
assert.deepEqual(match.plan.broken, []);

// wedstrijd doorspelen: speldjes worden opgebruikt, de vastgezette wissel gebeurt
const L = M.periodLen(team);
let did3 = false;
for (let p = 0; p < team.periods; p++) {
  if (p > 0) { const prop = M.breakProposal(match, team); if (prop) M.applyLineup(match, team, prop); else M.keepLineup(match, team); M.startClock(match); }
  for (;;) {
    const group = M.nextGroup(match, team);
    const T = M.gameTime(match, team);
    if (!group.length || group[0].t >= (p + 1) * L) break;
    fakeNow += Math.max(0, group[0].t - T) * 1000;
    if (group[0].t === t3) { did3 = true; assert.equal(group[0].out, altOut); assert.equal(group[0].in, altIn); }
    M.doSwapGroup(match, team, group.map((s) => ({ out: s.out, in: s.in, shift: s.shift })));
  }
  fakeNow += ((p + 1) * L - M.gameTime(match, team)) * 1000;
  M.endPeriod(match, team);
}
assert.ok(did3, 'het vastgezette moment is uitgevoerd');
assert.equal((match.pins || []).length, 0, 'alle speldjes opgebruikt');
assert.ok(match.finished);
const sum = M.summary(match, team);
const mins = ids.filter((id) => id !== keeperId).map((id) => sum.state.played[id] / 60);
console.log('gespeeld', Math.min(...mins).toFixed(1), '-', Math.max(...mins).toFixed(1), 'min');

// 1 min later schuift een vastgezet volgend moment mee
const m2 = M.createMatch(team, { opponent: 'X', present: ids, keeperId, priority: 'eerlijk' });
M.startClock(m2);
const n0 = M.nextSwap(m2, team);
M.fixSwap(m2, team, n0.out, n0.in);
assert.ok(M.isPinned(m2, n0.t));
fakeNow += 10_000;
M.delay(m2, team, 60);
const n1 = M.nextSwap(m2, team);
assert.ok(Math.abs(n1.t - (M.gameTime(m2, team) + 60)) <= 1 && n1.pinned, 'vastgezet moment schuift mee');
M.clearFixed(m2, team);
assert.ok(!M.isPinned(m2, M.nextSwap(m2, team).t));
console.log('Speldjestest geslaagd');

// ---------- standaardplan: plekwissel en andere opstelling vastzetten op een later moment ----------
{
  const team2 = store.newTeam('P2', true);
  const ids2 = team2.players.map((p) => p.id);
  const k2 = ids2[ids2.length - 1];
  const mp = M.createMatch(team2, { opponent: 'Pin', present: ids2, keeperId: k2 });
  const first = mp.plan.steps.find((s) => s.type === 'swap');
  const st = M.timeline(mp, team2).cards.find((c) => c.t === first.t);
  const fieldIds = Object.keys(st.pos);
  const a = fieldIds.find((id) => st.pos[id] === 'V'), b = fieldIds.find((id) => st.pos[id] === 'A');
  M.pinMoment(mp, team2, first.t, st.pairs || [{ out: first.out, in: first.in }], 'terug', [{ a, b }]);
  const mvs = mp.plan.steps.filter((s) => s.type === 'move' && s.t === first.t);
  assert.ok(mvs.some((s) => s.a === a && s.b === b), 'de plekwissel staat in het plan');
  const after = M.timeline(mp, team2).cards.find((c) => c.t === first.t);
  assert.equal(after.pos[a], 'A'); assert.equal(after.pos[b], 'V');
  // andere opstelling vanaf dit moment (de enige middenvelder naar voren)
  const mid = Object.keys(after.pos).find((id) => after.pos[id] === 'M');
  M.pinMoment(mp, team2, first.t, st.pairs || [{ out: first.out, in: first.in }], 'terug', [{ a, b }, { a: mid, to: 'V' }]);
  const c2 = M.timeline(mp, team2).cards.find((c) => c.t === first.t);
  assert.equal(Object.values(c2.pos).filter((x) => x === 'M').length, 0, 'midden leeg vanaf dit moment');
  assert.equal(Object.values(c2.pos).filter((x) => x === 'V').length, 3);
  // een bankwissel op hetzelfde moment houdt de plekwissels
  M.pinMoment(mp, team2, first.t, st.pairs || [{ out: first.out, in: first.in }]);
  assert.equal(mp.pins.find((pp) => pp.t === first.t).moves.length, 2);
}
console.log('speldjes met plekwissels ok');
