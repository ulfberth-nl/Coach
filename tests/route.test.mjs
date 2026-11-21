// Run: node tests/route.test.mjs  (Jouw plan als route: speelstijl, ritme, vooruitkijkend advies, rapport)
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const store = await import('../js/store.js');
const M = await import('../js/match.js');
const OP = await import('../js/ownplanner.js');

// logische momenten: 25/50/75%, afgerond op hele minuten, afhankelijk van de periodelengte
assert.deepEqual(M.naturalMoments(1500, 0).map(M.fmt), ['6:00', '13:00', '19:00']);
assert.deepEqual(M.naturalMoments(900, 1).map((t) => M.fmt(t - 900)), ['4:00', '8:00', '11:00']);
assert.deepEqual(M.naturalMoments(600, 0).map(M.fmt), ['3:00', '5:00', '8:00']);

// in hun kracht: dominant gaat voor, dan voorkeur; vast = alleen de dominante plek
assert.equal(OP.fitOf({ main: 'A', prefs: ['M'] }, 'A'), 'dominant');
assert.equal(OP.fitOf({ main: 'A', prefs: ['M'] }, 'M'), 'voorkeur');
assert.equal(OP.fitOf({ main: 'A', prefs: ['M'] }, 'V'), 'buiten');
assert.equal(OP.fitOf({ main: 'A', flex: false, prefs: ['M'] }, 'M'), 'buiten');
assert.equal(OP.fitOf({ prefs: [] }, 'V'), 'neutraal');

const team = store.newTeam();
const ids = team.players.map((p) => p.id);
const keeperId = ids[8];

for (const style of ['balans', 'sterk']) {
  const m = M.createMatch(team, { opponent: 'R', present: ids, keeperId, planMode: 'eigen', planStyle: style });
  assert.equal(M.planStyle(m, team), style);
  // ritme: met 3 op de bank is de hele bank per moment het advies (iedereen ±31 min, kort aan de kant)
  const ro = M.rhythmOptions(m, team);
  assert.equal(ro.recommended, 3, style + ': hele bank aanbevolen');
  const rec = ro.opts.find((o) => o.k === 3);
  assert.ok(rec.maxPlayed - rec.minPlayed <= 120 && rec.maxStretch <= 600, style + ': eerlijk en kort aan de kant');
  // route volgen met advies: opstelling, vullen, opstelling na de rust, vullen
  M.setPeriodLineup(m, team, 0, M.ownAdviseLineup(m, team, 0));
  M.markStep(m, 'op:0', 'ws:0');
  assert.ok(M.ownAutoFill(m, team, 0) > 0);
  M.setPeriodLineup(m, team, 1, M.ownAdviseLineup(m, team, 1));
  M.markStep(m, 'op:1', 'ws:1');
  assert.ok(M.ownAutoFill(m, team, 1) > 0);
  const rep = M.ownReport(m, team);
  assert.ok(rep.kpi.time.spread <= 180, style + ': speeltijd binnen 3 min (' + M.mins(rep.kpi.time.min) + '–' + M.mins(rep.kpi.time.max) + ')');
  assert.ok(rep.kpi.bench.ok, style + ': binnen de bankregel');
  assert.ok(rep.kpi.kracht.pct >= 0.9, style + ': in hun kracht');
  assert.equal(rep.verdict, 'goed');
  // kandidaten na een tik: drie, met een reden
  const t = 9 * 60;
  const st = M.planStateAt(m, team, t);
  const out = Object.keys(st.pos)[0];
  const c = M.ownCandidates(m, team, t, { out });
  assert.ok(c.length >= 1 && c.length <= 3 && c.every((x) => x.out === out && x.why.length), 'kandidaten met reden');
  const r = M.ownCandidates(m, team, t, { inn: st.bench[0] });
  assert.ok(r.length && r.every((x) => x.in === st.bench[0]));
}

// 'zoals eind' na de rust (opstelling bekeken, niets gekozen): het vullen houdt daar rekening mee
const m2 = M.createMatch(team, { opponent: 'S', present: ids, keeperId, planMode: 'eigen', planStyle: 'balans' });
M.setPeriodLineup(m2, team, 0, M.ownAdviseLineup(m2, team, 0));
M.ownAutoFill(m2, team, 0);
const cmp = M.ownCompareLineup(m2, team, 1, M.planStateAt(m2, team, M.periodLen(team)).pos);
assert.ok(cmp && cmp.adv.maxPlayed - cmp.adv.minPlayed <= cmp.cur.maxPlayed - cmp.cur.minPlayed, 'advies na de rust is minstens zo eerlijk');
M.markStep(m2, 'op:1');
M.ownAutoFill(m2, team, 1);
assert.ok(!m2.plan.steps.some((s) => s.type === 'lineup' && s.period === 1), 'geen opstelling gekozen = zoals eind');

// voorstel voor één moment: geeft paren en de uitkomst, zonder te plannen
const m3 = M.createMatch(team, { opponent: 'T', present: ids, keeperId, planMode: 'eigen' });
const before = (m3.pins || []).length;
const sug = M.ownSuggestAt(m3, team, 6 * 60);
assert.ok(sug.pairs.length >= 1 && sug.final.maxPlayed > 0);
assert.equal((m3.pins || []).length, before, 'voorstel plant nog niets');

// route-stappen volgen het aantal periodes van het team
const t4 = JSON.parse(JSON.stringify(team)); t4.periods = 4;
assert.deepEqual(M.ownSteps(t4), ['aanpak', 'op:0', 'ws:0', 'op:1', 'ws:1', 'op:2', 'ws:2', 'op:3', 'ws:3', 'rapport']);
console.log('Routetest geslaagd');
