// Run: node tests/ownplan.test.mjs  (eigen plan: de coach plant zelf, advies op verzoek)
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const store = await import('../js/store.js');
const M = await import('../js/match.js');
let fakeNow = 5_000_000;
Date.now = () => fakeNow;
const team = store.newTeam();
const ids = team.players.map((p) => p.id);
const keeperId = team.keeper ? ids[ids.length - 1] : null;
const L = M.periodLen(team);
const swaps = (m) => m.plan.steps.filter((s) => s.type === 'swap');
const count = (pos) => { const c = { A: 0, M: 0, V: 0 }; for (const k in pos) c[pos[k]]++; return c; };

const match = M.createMatch(team, { opponent: 'Eigen', present: ids, keeperId, priority: 'eerlijk' });
assert.ok(swaps(match).length > 4, 'app-plan heeft wissels');
// overstappen naar eigen plan, leeg beginnen
M.setPlanMode(match, team, 'eigen');
assert.ok(M.isOwn(match, team));
assert.equal(swaps(match).length, 0, 'leeg eigen plan: geen wissels');
assert.ok(match.plan.own);
// eerste wissel zelf plannen op 5:00
const ev0 = match.events[0];
const out1 = Object.keys(ev0.pos).find((id) => ev0.pos[id] === 'V');
const in1 = ev0.bench[0];
M.pinMoment(match, team, 300, [{ out: out1, in: in1 }]);
assert.equal(swaps(match).length, 1);
assert.equal(swaps(match)[0].in, in1);
assert.equal(swaps(match)[0].pos[in1], 'V', 'erin op de plek van wie eruit gaat');
// met doorschuiver: speler naar de plek van wie eruit gaat, de nieuwe op zijn plek
const st = M.planStateAt(match, team, 600);
const out2 = Object.keys(st.pos).find((id) => st.pos[id] === 'A');
const sh = Object.keys(st.pos).find((id) => st.pos[id] === 'M');
const in2 = st.bench.find((id) => id !== out1);
M.pinMoment(match, team, 600, [{ out: out2, in: in2, shift: { id: sh, to: 'A' } }]);
const s2 = swaps(match).find((s) => s.t === 600);
assert.equal(s2.pos[sh], 'A'); assert.equal(s2.pos[in2], 'M');
// advies op verzoek
const adv = M.adviseAt(match, team, 900, out1 === in1 ? null : Object.keys(M.planStateAt(match, team, 900).pos)[0]);
assert.ok(adv && adv.in && adv.why, 'advies voor wie eruit gaat');
const advIn = M.adviseAt(match, team, 900, null, M.planStateAt(match, team, 900).bench[0]);
assert.ok(advIn && advIn.out);
const full = M.adviseAt(match, team, 900);
assert.ok(full && full.out && full.in);
console.log('advies:', M.nickOf(team, adv.in), 'erin —', adv.why, '| hele wissel:', M.nickOf(team, full.in), 'voor', M.nickOf(team, full.out));
// rest van de periode aanvullen
const added = M.ownFillPeriod(match, team, 600);
assert.ok(added > 0, 'aangevuld');
assert.ok(swaps(match).every((s) => s.t < L || s.t >= L), 'binnen het plan');
assert.ok(swaps(match).filter((s) => s.t > 600).every((s) => s.t < L), 'alleen deze periode');
// opstelling 2e helft: zoals de start van de 1e helft
const opts = M.periodOptions(match, team, 1);
assert.ok(opts.start && opts.eind && opts.advies);
M.setPeriodLineup(match, team, 1, opts.start);
const lu2 = match.plan.steps.find((s) => s.type === 'lineup' && s.period === 1);
assert.deepEqual(lu2.pos, opts.start.pos);
assert.deepEqual(count(lu2.pos), count(ev0.pos));
// gevolgen worden berekend
assert.ok(match.plan.fair && match.plan.fair.maxPlayed > 0);
console.log('eigen plan:', swaps(match).length, 'wissels · speeltijd', Math.round(match.plan.fair.minPlayed / 60), '-', Math.round(match.plan.fair.maxPlayed / 60), 'min · ok', match.plan.ok, match.plan.why.join(','));

// spelen: de wedstrijd volgt het eigen plan
M.startClock(match);
for (let p = 0; p < team.periods; p++) {
  if (p > 0) {
    assert.ok(M.lineupPending(match, team));
    const prop = M.breakProposal(match, team);
    assert.deepEqual(prop.pos, opts.start.pos, 'in de rust: jouw plan');
    M.applyLineup(match, team, prop); M.startClock(match);
  }
  for (;;) {
    const g = M.nextGroup(match, team); const T = M.gameTime(match, team);
    if (!g.length || g[0].t >= (p + 1) * L) break;
    fakeNow += Math.max(0, g[0].t - T) * 1000;
    M.doSwapGroup(match, team, g.map((s) => ({ out: s.out, in: s.in, shift: s.shift })));
  }
  fakeNow += ((p + 1) * L - M.gameTime(match, team)) * 1000;
  M.endPeriod(match, team);
}
assert.ok(match.finished);
// iemand valt uit: geplande wissel kan niet meer → gemeld
const m2 = M.createMatch(team, { opponent: 'X', present: ids, keeperId, priority: 'eerlijk', planMode: 'eigen' });
assert.ok(M.isOwn(m2, team));
const b0 = m2.events[0].bench[0];
M.pinMoment(m2, team, 400, [{ out: Object.keys(m2.events[0].pos)[0], in: b0 }]);
M.startClock(m2); fakeNow += 20_000;
M.disablePlayer(m2, team, b0, 'wedstrijd');
assert.equal(m2.plan.broken.length, 1);
// terug naar de app, met het app-plan als begin bij een nieuw eigen plan
const m3 = M.createMatch(team, { opponent: 'Y', present: ids, keeperId, priority: 'eerlijk' });
const n3 = swaps(m3).length;
M.setPlanMode(m3, team, 'eigen', true);
assert.equal(swaps(m3).length, n3, 'plan van de app overgenomen');

// terug naar de app bewaart het eigen plan; weer zelf plannen haalt het terug
const before3 = swaps(m3).map((x) => x.t + x.out + x.in).join();
M.setPlanMode(m3, team, 'app');
assert.ok(!M.isOwn(m3, team));
assert.ok(m3.ownStash && m3.ownStash.pins.length, 'eigen plan bewaard');
assert.equal((m3.pins || []).length, 0, 'app plant zonder jouw momenten');
M.setPlanMode(m3, team, 'eigen');
assert.equal(swaps(m3).map((x) => x.t + x.out + x.in).join(), before3, 'eigen plan terug');

// eigen startopstelling blijft staan als de app de wedstrijd opnieuw opbouwt
const m4 = M.createMatch(team, { opponent: 'Z', present: ids, keeperId, priority: 'eerlijk', planMode: 'eigen' });
const e4 = m4.events[0];
const a4 = Object.keys(e4.pos)[0], b4 = e4.bench[0];
M.swapInStartLineup(m4, team, a4, b4);
assert.ok(b4 in m4.events[0].pos && m4.periodLineups[0], 'start in eigen plan bewaard');
const r4 = M.createMatch(team, { opponent: 'Z', present: ids, keeperId, priority: 'eerlijk', planMode: 'eigen', periodLineups: m4.periodLineups });
assert.ok(b4 in r4.events[0].pos && !(a4 in r4.events[0].pos), 'opnieuw opgebouwd: eigen start staat er nog');
// met een speler minder klopt hij niet meer: dan de start van de app
const fewer = ids.filter((id) => id !== b4);
const r5 = M.createMatch(team, { opponent: 'Z', present: fewer, keeperId, priority: 'eerlijk', planMode: 'eigen', periodLineups: m4.periodLineups });
assert.ok(!(b4 in r5.events[0].pos));

// advies voor een extra wissel op een moment: niet met spelers die daar al wisselen
const m6 = M.createMatch(team, { opponent: 'Q', present: ids, keeperId, priority: 'eerlijk', planMode: 'eigen' });
const e6 = m6.events[0];
const o6 = Object.keys(e6.pos)[0], i6 = e6.bench[0];
M.pinMoment(m6, team, 420, [{ out: o6, in: i6 }]);
const ad6 = M.adviseAt(m6, team, 420, null, null, [o6, i6]);
assert.ok(ad6 && ad6.out !== o6 && ad6.in !== i6 && ad6.out !== i6 && ad6.in !== o6, 'extra wissel met andere spelers');

// eigen plan: na de rust kiest de coach altijd de opstelling, ook zonder 'nieuwe opstelling na de rust'
const t7 = JSON.parse(JSON.stringify(team));
t7.rules.newLineupAtBreak = false;
const m7 = M.createMatch(t7, { opponent: 'R', present: ids, keeperId, priority: 'eerlijk', planMode: 'eigen' });
M.startClock(m7); fakeNow += L * 1000 + 1000; M.endPeriod(m7, t7);
assert.ok(M.lineupPending(m7, t7), 'rust: opstelling kiezen in eigen plan');
const bo = M.breakOptions(m7, t7);
assert.ok(bo.own && bo.advies && Object.keys(bo.advies.pos).length === Object.keys(bo.eind.pos).length, 'advies na de rust');
m7.planMode = 'app';
assert.ok(!M.lineupPending(m7, t7), 'app zonder nieuwe opstelling: geen keuze');
console.log('Eigen-plantest geslaagd');
