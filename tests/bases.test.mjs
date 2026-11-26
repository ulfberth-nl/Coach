// Run: node tests/bases.test.mjs  (basisopstellingen: bewaren en toepassen)
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const store = await import('../js/store.js');
const M = await import('../js/match.js');

const team = store.newTeam();
const ids = team.players.map((p) => p.id);
const keeperId = team.keeper ? ids[ids.length - 1] : null;
const F = team.lines.A + team.lines.M + team.lines.V;

// ---------- bewaren en terugzetten ----------
{
  const m = M.createMatch(team, { opponent: 'A', present: ids, keeperId });
  const field = Object.keys(m.events[0].pos);
  const benchId = m.events[0].bench[0];
  M.swapInStartLineup(m, team, field[0], benchId);
  const base = M.baseFromMatch(m, team, 'Sterk begin');
  assert.equal(base.name, 'Sterk begin');
  assert.equal(Object.values(base.slots).filter(Boolean).length, F, 'alle plekken in de basis gevuld');
  assert.ok(M.baseFits(team, base));
  assert.ok(Object.values(base.slots).indexOf(benchId) !== -1, 'de ingewisselde speler staat in de basis');

  const m2 = M.createMatch(team, { opponent: 'B', present: ids, keeperId });
  const res = M.applyBase(m2, team, base);
  assert.deepEqual(res.missing, []);
  assert.deepEqual(m2.events[0].slots, base.slots, 'zelfde spelers op dezelfde plekken');
  assert.equal(m2.baseId, base.id);
  assert.ok(m2.plan && m2.plan.steps, 'plan opnieuw berekend');
}

// ---------- afwezige speler: plek gevuld door wie het best past ----------
{
  const m = M.createMatch(team, { opponent: 'A', present: ids, keeperId });
  const base = M.baseFromMatch(m, team, '');
  assert.ok(/^Basis \d-\d-\d$/.test(base.name), 'standaardnaam met opstelling');
  const gone = base.slots.V0 || base.slots.M0;
  const slot = Object.keys(base.slots).find((k) => base.slots[k] === gone);
  const p = team.players.find((x) => x.id === ids.find((id) => id !== gone && id !== keeperId && Object.values(base.slots).indexOf(id) === -1));
  p.main = slot[0]; p.kracht = 60;
  const present = ids.filter((id) => id !== gone);
  const m2 = M.createMatch(team, { opponent: 'C', present, keeperId });
  const res = M.applyBase(m2, team, base);
  assert.deepEqual(res.missing, [gone]);
  assert.equal(m2.events[0].slots[slot], p.id, 'speler met die dominante rol neemt de lege plek');
  assert.equal(Object.keys(m2.events[0].pos).length, F);
  p.main = null;
}

// ---------- andere spelvorm past niet ----------
{
  const m = M.createMatch(team, { opponent: 'A', present: ids, keeperId });
  const base = M.baseFromMatch(m, team);
  const odd = { ...base, lines: { V: 3, M: 3, A: 3 } };
  assert.equal(M.baseFits(team, odd), false);
  assert.equal(M.applyBase(m, team, odd), null);
}

// ---------- zelf plannen: de basis wordt het startblok en loopt door op een leeg bord ----------
{
  const m = M.createMatch(team, { opponent: 'A', present: ids, keeperId });
  const base = M.baseFromMatch(m, team, 'Gp');
  const m2 = M.createMatch(team, { opponent: 'D', present: ids, keeperId, planMode: 'eigen' });
  M.applyBase(m2, team, base);
  const gp = m2.gameplan;
  assert.ok(gp && gp.base, 'bord heeft een basis');
  const want = {};
  for (const k in base.slots) if (base.slots[k]) want[base.slots[k]] = k[0];
  assert.deepEqual(gp.grid[0], want, 'startblok = basis');
  assert.deepEqual(gp.grid[gp.grid.length - 1], want, 'loopt door tot het eind');
}

console.log('bases ok');
