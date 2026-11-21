// Run: node tests/formation.test.mjs  (opstelling veranderen door te slepen)
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const store = await import('../js/store.js');
const M = await import('../js/match.js');

let fakeNow = 2_000_000;
Date.now = () => fakeNow;
const team = store.newTeam();
const ids = team.players.map((p) => p.id);
const keeperId = team.keeper ? ids[ids.length - 1] : null;
const count = (pos) => { const c = { A: 0, M: 0, V: 0 }; for (const k in pos) c[pos[k]]++; return c; };
const slotsOk = (slots, lines) => { for (const l of ['A', 'M', 'V']) for (let i = 0; i < lines[l]; i++) assert.ok(slots[l + i], 'plek ' + l + i + ' gevuld'); };
const cardsOk = (match) => {
  const { cards } = M.timeline(match, team);
  for (const c of cards) {
    const lines = c.lines || M.linesOf(match, team);
    assert.deepEqual(count(c.pos), { A: lines.A, M: lines.M, V: lines.V }, 'posities passen bij de opstelling op ' + c.t);
    slotsOk(c.slots, lines);
  }
  return cards;
};

// helpers
assert.equal(M.formationText({ A: 2, M: 1, V: 2 }), '2-1-2');
assert.deepEqual(M.formationAfter({ A: 2, M: 1, V: 2 }, 'V', 'M'), { A: 2, M: 2, V: 1 });
assert.equal(M.formationAfter({ A: 2, M: 1, V: 2 }, 'M', 'V'), null, 'laatste middenvelder kan niet weg');
assert.equal(M.formationAfter({ A: 2, M: 1, V: 2 }, 'V', 'V'), null);
assert.equal(M.formationLabel({ A: 2, M: 1, V: 2 }, 'V', 'M'), 'Naar het midden · 2-2-1');
{
  const s = M.moveSlot({ A0: 'a', A1: 'b', M0: 'c', V0: 'd', V1: 'e' }, 'd', 'V', 'M', { A: 2, M: 2, V: 1 }, 0);
  assert.deepEqual(s, { A0: 'a', A1: 'b', M0: 'd', M1: 'c', V0: 'e' });
  const t = M.moveSlot({ A0: 'a', A1: 'b', M0: 'c', V0: 'd', V1: 'e' }, 'e', 'V', 'M', { A: 2, M: 2, V: 1 }, 1);
  assert.deepEqual(t, { A0: 'a', A1: 'b', M0: 'c', M1: 'e', V0: 'd' });
}

// verhaal van een wissel in coachtaal
assert.equal(M.posName('V', 1, 2).kort, 'rechtsvoor');
assert.equal(M.posName('A', 0, 2).op, 'op linksachter');
assert.equal(M.posName('M', 0, 1).naar, 'naar het midden');
assert.equal(M.posName('V', 1, 3).kort, 'midvoor');
assert.equal(M.posName('A', 2, 4).kort, 'centraal achter rechts');
{
  const slots = { A0: 'a', A1: 'b', M0: 'c', V0: 'd', V1: 'e' };
  const L = { A: 2, M: 1, V: 2 };
  assert.deepEqual(M.swapStory(slots, L, [{ out: 'e', in: 'x' }]), [{ in: 'x', out: 'e', inPos: M.posName('V', 1, 2) }]);
  const st = M.swapStory(slots, L, [{ out: 'e', in: 'x', shift: { id: 'c', to: 'V' } }])[0];
  assert.equal(st.shift, 'c'); assert.equal(st.shiftPos.kort, 'rechtsvoor'); assert.equal(st.inPos.op, 'in het midden');
}

// klaargezette wedstrijd: aanvaller naar het middenveld
const match = M.createMatch(team, { opponent: 'Test', present: ids, keeperId, priority: 'eerlijk' });
const base = { ...team.lines };
const ev0 = match.events[0];
const att = Object.keys(ev0.pos).find((id) => ev0.pos[id] === 'V');
const lines = M.changeFormation(match, team, att, 'M', 0);
assert.deepEqual(lines, M.formationAfter(base, 'V', 'M'));
assert.deepEqual(match.lines, lines);
assert.equal(match.events[0].pos[att], 'M');
assert.equal(match.events[0].slots.M0, att, 'staat op de plek waar hij is neergezet');
assert.ok(match.plan.steps.length >= 0);
cardsOk(match);
assert.deepEqual(team.lines, base, 'teamopstelling zelf blijft gelijk');
console.log('concept:', M.formationText(base), '→', M.formationText(lines), '· plan', match.plan.ok ? 'ok' : 'niet ok');

// lopende wedstrijd: na 5 minuten een verdediger naar voren, daarna ongedaan maken
M.startClock(match);
fakeNow += 300_000;
const d = M.derive(match, team, M.gameTime(match, team));
const def = Object.keys(d.state.pos).find((id) => d.state.pos[id] === 'A');
const before = { ...match.lines };
const l2 = M.changeFormation(match, team, def, 'V');
assert.ok(l2, 'verdediger mag naar voren');
assert.equal(match.events.at(-1).type, 'formation');
const d2 = M.derive(match, team, M.gameTime(match, team));
assert.equal(d2.state.pos[def], 'V');
assert.deepEqual(count(d2.state.pos), { A: l2.A, M: l2.M, V: l2.V });
slotsOk(d2.state.slots, l2);
const cards = cardsOk(match);
assert.ok(cards.some((c) => c.past) && cards.some((c) => !c.past));
// de geplande wissels houden zich aan de nieuwe opstelling
for (const s of match.plan.steps) if (s.pos) assert.deepEqual(count(s.pos), { A: l2.A, M: l2.M, V: l2.V });
const u = M.lastUndoable(match);
assert.equal(u.ev.type, 'formation');
M.undo(match, team);
assert.deepEqual(match.lines, before, 'ongedaan: oude opstelling terug');
assert.equal(M.derive(match, team, M.gameTime(match, team)).state.pos[def], 'A');
cardsOk(match);

// hele wedstrijd doorspelen met een andere opstelling vanaf minuut 5
M.changeFormation(match, team, def, 'M', 1);
const L = M.periodLen(team);
let swaps = 0;
for (let p = 0; p < team.periods; p++) {
  if (p > 0) {
    const prop = M.breakProposal(match, team);
    if (prop) { assert.deepEqual(count(prop.pos), { A: match.lines.A, M: match.lines.M, V: match.lines.V }); M.applyLineup(match, team, prop); } else M.keepLineup(match, team);
    M.startClock(match);
  }
  for (;;) {
    const step = M.nextSwap(match, team);
    const T = M.gameTime(match, team);
    if (!step || step.type !== 'swap' || step.t >= (p + 1) * L) break;
    fakeNow += Math.max(0, step.t - T) * 1000; // een te late wissel gebeurt nu (de klok loopt nooit terug)
    M.doSwap(match, team, step.out, step.in, step.shift);
    swaps++;
    const ds = M.derive(match, team, M.gameTime(match, team)).state;
    assert.deepEqual(count(ds.pos), { A: match.lines.A, M: match.lines.M, V: match.lines.V }, 'na elke wissel klopt de opstelling');
  }
  fakeNow += ((p + 1) * L - M.gameTime(match, team)) * 1000;
  M.endPeriod(match, team);
}
assert.ok(match.finished);
const sum = M.summary(match, team);
const mins = ids.filter((id) => id !== keeperId).map((id) => sum.state.played[id] / 60);
console.log('opstelling', M.formationText(match.lines), '·', swaps, 'wissels · speeltijd', Math.min(...mins).toFixed(1), '-', Math.max(...mins).toFixed(1), 'min');
cardsOk(match);
console.log('Opstellingstest geslaagd');
