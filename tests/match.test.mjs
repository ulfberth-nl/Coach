// Run: node tests/match.test.mjs  (simuleert een wedstrijd met een nep-klok)
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const store = await import('../js/store.js').catch((e) => { console.error(e); process.exit(1); });
const M = await import('../js/match.js');

let fakeNow = 1_000_000;
const realNow = Date.now;
Date.now = () => fakeNow;
const team = store.newTeam();
const ids = team.players.map((p) => p.id);
const keeperId = ids[5];
const match = M.createMatch(team, { opponent: 'Test', present: ids, keeperId, priority: 'eerlijk' });
assert.equal(match.events.length, 1);
assert.ok(match.plan.steps.length > 0, 'er moet een plan zijn');
console.log('plan:', match.plan.steps.filter((s) => s.type === 'swap').length, 'wissels, ok', match.plan.ok);

M.startClock(match);
// stabiliteit: een goal verschuift het volgende wisselmoment niet
{
  const before = M.nextSwap(match, team);
  fakeNow += 30_000;
  M.goal(match, team, null);
  const after = M.nextSwap(match, team);
  assert.equal(after.t, before.t, 'wisselmoment blijft staan na een goal');
  M.undo(match, team);
  fakeNow -= 30_000;
  // 1 min later
  fakeNow += 30_000;
  M.delay(match, team, 60);
  const later = M.nextSwap(match, team);
  assert.ok(Math.abs(later.t - (M.gameTime(match, team) + 60)) <= 1, '1 min later klopt');
  match.firstAt = null; M.replan(match, team);
  fakeNow -= 30_000;
}
let swaps = 0;
const L = M.periodLen(team);
for (let p = 0; p < team.periods; p++) {
  if (p > 0) {
    const prop = M.breakProposal(match, team);
    if (prop) M.applyLineup(match, team, prop); else M.keepLineup(match, team);
    M.startClock(match);
  }
  // loop door de periode en voer elke geplande wissel uit op het moment zelf
  for (;;) {
    const step = M.nextSwap(match, team);
    const T = M.gameTime(match, team);
    if (!step || step.type !== 'swap' || step.t >= (p + 1) * L) break;
    fakeNow += (step.t - T) * 1000;
    M.doSwap(match, team, step.out, step.in, step.shift);
    swaps++;
    if (swaps === 3) { M.goal(match, team, step.in); M.oppGoal(match, team); M.oppGoal(match, team); }
  }
  fakeNow += ((p + 1) * L - M.gameTime(match, team)) * 1000;
  M.endPeriod(match, team);
}
assert.ok(match.finished);
const s = M.summary(match, team);
const field = ids.filter((id) => id !== keeperId);
const mins = field.map((id) => s.state.played[id] / 60);
console.log('wissels uitgevoerd', swaps, 'stand', s.score, 'speeltijd', Math.min(...mins).toFixed(1), '-', Math.max(...mins).toFixed(1), 'min');
console.log('bankbeurten', field.map((id) => s.state.turns[id]).join(','));
assert.ok(Math.max(...mins) - Math.min(...mins) <= 5.5, 'speeltijd binnen marge');
assert.equal(s.score.us, 1); assert.equal(s.score.them, 2);
const total = Object.values(s.state.played).reduce((a, b) => a + b, 0);
assert.ok(Math.abs(total - 5 * team.periods * L) < 5, 'totaal veldminuten klopt');

// ongedaan maken en uitschakelen
const m2 = M.createMatch(team, { opponent: 'X', present: ids, keeperId, priority: 'eerlijk' });
M.startClock(m2);
fakeNow += 60_000;
M.oppGoal(m2, team);
assert.equal(M.derive(m2, team, M.gameTime(m2, team)).score.them, 1);
M.undo(m2, team);
assert.equal(M.derive(m2, team, M.gameTime(m2, team)).score.them, 0);
const benchKid = M.derive(m2, team, M.gameTime(m2, team)).state.bench[0];
M.disablePlayer(m2, team, benchKid, 'wedstrijd');
assert.ok(m2.plan.steps.filter((x) => x.type === 'swap').every((x) => x.in !== benchKid), 'uitgeschakelde speler komt niet meer in');
M.enablePlayer(m2, team, benchKid);
assert.ok(!M.derive(m2, team, M.gameTime(m2, team)).state.disabled[benchKid]);
// startopstelling aanpassen
const m3 = M.createMatch(team, { opponent: 'Y', present: ids, keeperId, priority: 'eerlijk' });
const ev = m3.events[0];
const a = Object.keys(ev.pos)[0], b = ev.bench[0];
M.swapInStartLineup(m3, team, a, b);
assert.ok(b in m3.events[0].pos && m3.events[0].bench.includes(a));
Date.now = realNow;
console.log('Alle wedstrijdtests geslaagd');

// een onverwachte vroege wissel mag het plan niet laten ontploffen
{
  let now = 5_000_000;
  const saved = Date.now;
  Date.now = () => now;
  const m = M.createMatch(team, { opponent: 'Z', present: ids, keeperId, priority: 'eerlijk' });
  const base = m.baseline;
  M.startClock(m);
  now += 60_000;
  const d = M.derive(m, team, M.gameTime(m, team));
  M.doSwap(m, team, Object.keys(d.state.pos)[0], d.state.bench[0], null);
  const after = m.plan.steps.filter((s) => s.type === 'swap').length + 1;
  console.log(`plan: ${base} wissels; na een extra wissel in minuut 1: ${after} (ruimer: ${m.plan.relaxed})`);
  assert.ok(after <= base + 3, 'niet ineens veel meer wissels');
  Date.now = saved;
}
console.log('Afwijkingstest geslaagd');
