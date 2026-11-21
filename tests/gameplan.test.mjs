// Run: node tests/gameplan.test.mjs  (game plan: liniebord met blokken, omgezet naar het plan en live uitgevoerd)
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const store = await import('../js/store.js');
const M = await import('../js/match.js');
let fakeNow = 5_000_000;
Date.now = () => fakeNow;
const team = store.newTeam();
team.players[0].main = 'A'; team.players[1].main = 'M'; team.players[2].main = 'V';
const ids = team.players.map((p) => p.id);
const keeperId = team.keeper ? ids[ids.length - 1] : null;
const L = M.periodLen(team);
const sameLines = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((id) => a[id] === b[id]);

// ---------- gpDiff: wissels met doorschuiver en plekwissels ----------
{
  const A = { a: 'V', b: 'V', c: 'M', d: 'A', e: 'A' };
  // f erin voor a, zelfde linie
  let d = M.gpDiff(A, { f: 'V', b: 'V', c: 'M', d: 'A', e: 'A' });
  assert.deepEqual(d.pairs, [{ out: 'a', in: 'f' }]);
  assert.equal(d.moves.length, 0);
  // f erin achter, d schuift naar voor (doorschuiver)
  d = M.gpDiff(A, { d: 'V', b: 'V', c: 'M', f: 'A', e: 'A' });
  assert.equal(d.pairs.length, 1);
  assert.equal(d.pairs[0].out, 'a');
  assert.deepEqual(d.pairs[0].shift, { id: 'd', to: 'V' });
  assert.equal(d.moves.length, 0);
  // alleen twee spelers ruilen van linie
  d = M.gpDiff(A, { a: 'M', b: 'V', c: 'V', d: 'A', e: 'A' });
  assert.equal(d.pairs.length, 0);
  assert.equal(d.moves.length, 1);
  // niets veranderd
  d = M.gpDiff(A, { ...A });
  assert.equal(d.pairs.length + d.moves.length, 0);
}

// ---------- leeg bord → startopstelling loopt door ----------
const match = M.createMatch(team, { opponent: 'Bord', present: ids, keeperId, planMode: 'eigen' });
assert.ok(M.isOwn(match, team));
const field = M.gpFieldIds(match);
const lines = M.linesOf(match, team);
const F = Object.values(lines).reduce((a, b) => a + b, 0);
M.gpEnsure(match, team, 4);
let blocks = M.gpBlocks(match, team);
assert.equal(blocks.length, 4 * team.periods);
assert.ok(blocks.every((b) => b.t % 30 === 0), 'blokgrenzen op halve minuten');
if (team.periods > 1) assert.equal(blocks[4].t, L, 'tweede periode begint met een nieuw blok');
// startopstelling half neerzetten: nog geen basis
const start = {};
let k = 0;
for (const l of ['V', 'M', 'A']) for (let i = 0; i < (lines[l] || 0); i++) start[field[k++]] = l;
const half = { ...start }; delete half[field[0]];
M.gpSetBlock(match, team, 0, half);
assert.equal(match.gameplan.base, false, 'onvolledig: nog geen basis');
assert.equal(match.gameplan.grid[1], null);
M.gpSetBlock(match, team, 0, start);
assert.equal(match.gameplan.base, true, 'vol: basis');
assert.ok(match.gameplan.grid.every((p) => sameLines(p, start)), 'eerste blok loopt door tot het eind');
assert.equal(match.plan.steps.filter((s) => s.type === 'swap').length, 0, 'zelfde blokken: geen wissels');
assert.ok(sameLines(match.events[0].pos, start), 'startopstelling = eerste blok');

// ---------- een blok aanpassen werkt niet door ----------
const bench = field.filter((id) => !(id in start));
const outV = Object.keys(start).find((id) => start[id] === 'V');
const b1 = { ...start }; delete b1[outV]; b1[bench[0]] = 'V';
M.gpSetBlock(match, team, 1, b1);
assert.ok(sameLines(match.gameplan.grid[2], start), 'blok 3 blijft zoals het was');
let st = M.gpStats(match, team);
assert.equal(st.blocks[1].swaps, 1);
assert.equal(st.blocks[2].swaps, 1, 'terug naar de basis is ook een wissel');
let sw = match.plan.steps.filter((s) => s.type === 'swap');
assert.deepEqual(sw.map((s) => [s.t, s.out, s.in]), [[blocks[1].t, outV, bench[0]], [blocks[2].t, bench[0], outV]]);
// doortrekken tot het eind van de periode
const n = M.gpExtend(match, team, 1, false);
assert.equal(n, 2);
assert.ok(sameLines(match.gameplan.grid[3], b1));
st = M.gpStats(match, team);
assert.equal(st.blocks[2].swaps + st.blocks[3].swaps, 0);
assert.equal(st.kids[bench[0]].blocks, 3, 'drie blokken gespeeld');

// ---------- onvolledig blok telt als ongewijzigd ----------
const inc = { ...b1 }; delete inc[bench[0]];
M.gpSetBlock(match, team, 2, inc);
st = M.gpStats(match, team);
assert.equal(st.blocks[2].ok, false);
assert.ok(!match.plan.steps.some((s) => s.type === 'swap' && s.t === blocks[2].t), 'geen wissel naar een onvolledig blok');

// ---------- plekwissel zonder wissel ----------
M.gpSetBlock(match, team, 2, b1);
const x = Object.keys(b1).find((id) => b1[id] === 'V'), y = Object.keys(b1).find((id) => b1[id] === 'A');
const b3 = { ...b1, [x]: b1[y], [y]: b1[x] };
M.gpSetBlock(match, team, 3, b3);
const moves = match.plan.steps.filter((s) => s.type === 'move');
assert.equal(moves.length, 1, 'plekwissel staat in het plan');
assert.equal(moves[0].t, blocks[3].t);

// ---------- voorzet: eerlijk, coachblokken blijven staan ----------
const m2 = M.createMatch(team, { opponent: 'Voorzet', present: ids, keeperId, planMode: 'eigen' });
const rec = M.gpRecommend(m2, team);
assert.ok(M.GP_SIZES.indexOf(rec.recommended) !== -1);
M.gpEnsure(m2, team, rec.recommended);
const filled = M.gpFill(m2, team);
assert.equal(filled, M.gpBlocks(m2, team).length);
const s2 = M.gpStats(m2, team);
assert.ok(s2.blocks.every((b) => b.ok), 'voorzet vult elk blok');
assert.ok(s2.max - s2.min <= 5 * 60, 'voorzet is eerlijk binnen 5 min');
assert.ok(m2.gameplan.src.every((s) => s === 'ai'));
// coach zet blok 1 vast, vul aan laat dat staan
const fixed = { ...m2.gameplan.grid[1] };
M.gpSetBlock(m2, team, 1, fixed);
const again = M.gpFill(m2, team);
assert.equal(again, M.gpBlocks(m2, team).length - 1);
assert.ok(sameLines(m2.gameplan.grid[1], fixed));
assert.equal(m2.gameplan.src[1], 'coach');

// ---------- live: Wissel nu volgt het bord precies ----------
M.startClock(m2);
const B = M.gpBlocks(m2, team);
for (let b = 1; b < Math.min(4, B.length); b++) {
  if (B[b].i === 0) break;
  fakeNow += (B[b].t - M.gameTime(m2, team)) * 1000;
  const grp = M.nextGroup(m2, team);
  if (!grp.length) continue;
  M.doPlannedMoment(m2, team);
  const d = M.derive(m2, team, M.gameTime(m2, team));
  assert.ok(sameLines(d.state.pos, m2.gameplan.grid[b]), `live na moment ${b} = blok ${b + 1}`);
}
// één keer ongedaan maken haalt het hele moment terug
const before = M.derive(m2, team, M.gameTime(m2, team)).state.pos;
M.undo(m2, team);
const after = M.derive(m2, team, M.gameTime(m2, team)).state.pos;
assert.ok(!sameLines(before, after), 'ongedaan maken draait het moment terug');

// ---------- afwezig na het plannen: bord wordt opgeschoond ----------
const m3 = M.createMatch(team, { opponent: 'Weg', present: ids, keeperId, planMode: 'eigen' });
M.gpEnsure(m3, team, 4); M.gpFill(m3, team);
const gone = M.gpFieldIds(m3)[0];
const m4 = M.createMatch(team, { opponent: 'Weg', present: ids.filter((id) => id !== gone), keeperId, planMode: 'eigen', gameplan: m3.gameplan });
assert.ok(m4.gameplan.grid.every((p) => !p || !(gone in p)), 'afwezige speler is van het bord');

console.log('gameplan ok');

// ---------- andere opstelling in een blok (een verdediger erbij) ----------
{
  const mf = M.createMatch(team, { opponent: 'Formatie', present: ids, keeperId, planMode: 'eigen' });
  M.gpEnsure(mf, team, 4); M.gpFill(mf, team);
  const B = M.gpBlocks(mf, team);
  const b = 2;
  const pos = { ...mf.gameplan.grid[b] };
  const v = Object.keys(pos).find((id) => pos[id] === 'V' && Object.values(pos).filter((x) => x === 'V').length > 1);
  assert.ok(v, 'een voorspeler om naar achteren te halen');
  pos[v] = 'A';
  assert.ok(M.gpComplete(mf, team, pos), 'andere verdeling is ook vol');
  M.gpSetBlock(mf, team, b, pos);
  const single = mf.plan.steps.filter((s) => s.type === 'move' && s.to);
  assert.ok(single.some((s) => s.t === B[b].t), 'losse verplaatsing in het plan: ' + JSON.stringify(mf.pins.find((p) => p.t === B[b].t)));
  const card = M.timeline(mf, team).cards.find((c) => c.t === B[b].t);
  assert.equal(card.lines.A, (mf.gameplan.lines.A || 0) + 1, 'kaart heeft de nieuwe opstelling');
  // live: het moment uitvoeren verandert de opstelling, ongedaan maken zet hem terug
  M.startClock(mf);
  let guard = 0;
  while (M.gameTime(mf, team) < B[b].t && guard++ < 10) {
    const nx = M.nextSwap(mf, team), mo = M.nextMovesOnly(mf, team);
    const t = Math.min(nx ? nx.t : Infinity, mo ? mo.t : Infinity);
    if (t === Infinity) break;
    fakeNow += (t - M.gameTime(mf, team)) * 1000;
    if (mo && mo.t <= t) M.doPlannedMoves(mf, team); else M.doPlannedMoment(mf, team);
  }
  const d = M.derive(mf, team, M.gameTime(mf, team));
  assert.ok(sameLines(d.state.pos, mf.gameplan.grid[b]), 'live staat zoals blok ' + (b + 1));
  assert.equal(M.linesOf(mf, team).A, (mf.gameplan.lines.A || 0) + 1, 'live opstelling met een verdediger erbij');
  M.undo(mf, team);
  assert.equal(M.linesOf(mf, team).A, mf.gameplan.lines.A || 0, 'ongedaan: opstelling terug');
}

// ---------- alleen een plekwissel: eigen moment live ----------
{
  const mm = M.createMatch(team, { opponent: 'Plek', present: ids, keeperId, planMode: 'eigen' });
  M.gpEnsure(mm, team, 4);
  const f2 = M.gpFieldIds(mm); const ln = M.linesOf(mm, team);
  const st0 = {}; let q = 0; for (const l of ['V', 'M', 'A']) for (let i = 0; i < (ln[l] || 0); i++) st0[f2[q++]] = l;
  M.gpSetBlock(mm, team, 0, st0);
  const xv = Object.keys(st0).find((id) => st0[id] === 'V'), xa = Object.keys(st0).find((id) => st0[id] === 'A');
  M.gpSetBlock(mm, team, 3, { ...st0, [xv]: 'A', [xa]: 'V' });
  M.startClock(mm);
  const mo = M.nextMovesOnly(mm, team);
  assert.ok(mo && mo.t === M.gpBlocks(mm, team)[3].t, 'plekwissel is een eigen moment');
  fakeNow += (mo.t - M.gameTime(mm, team)) * 1000;
  assert.equal(M.doPlannedMoves(mm, team), 1);
  const d2 = M.derive(mm, team, M.gameTime(mm, team));
  assert.equal(d2.state.pos[xv], 'A');
  assert.equal(M.nextMovesOnly(mm, team), null);
}

// ---------- standaardplan overnemen als game plan ----------
{
  const ms = M.createMatch(team, { opponent: 'Over', present: ids, keeperId });
  assert.ok(!M.isOwn(ms, team));
  const res = M.gpFromPlan(ms, team);
  assert.ok(res.n >= 2 && res.n <= 6);
  assert.ok(M.isOwn(ms, team) && ms.gameplan.base);
  assert.ok(M.gpStats(ms, team).blocks.every((b) => b.ok), 'alle blokken vol');
}
console.log('gameplan formatie ok');

// ---------- oplossingen per punt in de controle ----------
{
  const mf = M.createMatch(team, { opponent: 'Fix', present: ids, keeperId, planMode: 'eigen' });
  M.gpEnsure(mf, team, 4);
  const fi = M.gpFieldIds(mf); const ln = M.linesOf(mf, team);
  const st0 = {}; let q = 0; for (const l of ['V', 'M', 'A']) for (let i = 0; i < (ln[l] || 0); i++) st0[fi[q++]] = l;
  // dezelfde vijf in alle blokken: de rest zit de hele wedstrijd
  for (let b = 0; b < 4; b++) M.gpSetBlock(mf, team, b, st0);
  const rep = M.ownReport(mf, team);
  const ins = rep.insights.find((x) => x.kind === 'bench' || x.kind === 'time');
  assert.ok(ins && ins.id, 'er is een punt over de bank of speeltijd');
  const fx = M.gpFixes(mf, team, ins);
  assert.ok(fx.length >= 1 && fx.length <= 3, 'hooguit drie oplossingen');
  assert.ok(fx.every((f) => f.gain > 0 && f.what.in === ins.id), 'elke oplossing helpt en zet de speler erin');
  const before = M.gpStats(mf, team).kids[ins.id].sec;
  M.gpApplyFix(mf, team, fx[0]);
  assert.ok(M.gpStats(mf, team).kids[ins.id].sec > before, 'na de oplossing speelt hij meer');
  assert.equal(mf.gameplan.src[fx[0].b], 'coach');
}
console.log('gameplan oplossingen ok');

// ---------- wat de coach roept: eindplek per kind, tussenstappen weg ----------
{
  const lines = { V: 2, M: 1, A: 2 };
  const slots = { V0: 'a1', V1: 'y1', M0: 'k1', A0: 'p1', A1: 'h1' };
  const c = M.callStory(slots, lines, [{ out: 'a1', in: 'l1' }, { out: 'y1', in: 'x1' }], [{ a: 'h1', b: 'k1' }, { a: 'k1', b: 'x1' }]);
  assert.deepEqual(c.out, ['a1', 'y1']);
  const at = Object.fromEntries(c.tell.map((x) => [x.id, x.pos.kort]));
  assert.equal(at.l1, 'linksvoor');
  assert.equal(at.x1, 'rechtsachter', 'wie twee keer schuift, staat er één keer in met zijn eindplek');
  assert.equal(at.k1, 'rechtsvoor');
  assert.equal(at.h1, 'midden');
  assert.equal(c.tell.length, 4);
  assert.ok(c.tell[0].in && c.tell[1].in, 'erin eerst');
  assert.equal(M.callStory(slots, lines, [], [{ a: 'h1', b: 'k1' }, { a: 'k1', b: 'h1' }]).tell.length, 0, 'terug op eigen plek = niets te zeggen');
}

// ---------- gevolgen, betere zetten en gratis verbeteringen ----------
{
  const pl = (id) => team.players.find((p) => p.id === id);
  const mg = M.createMatch(team, { opponent: 'Winst', present: ids, keeperId, planMode: 'eigen' });
  M.gpEnsure(mg, team, 4);
  const fi = M.gpFieldIds(mg); const ln = M.linesOf(mg, team);
  // twee spelers met een duidelijke kant, verkeerd om neergezet
  const [va, aa] = fi.filter((id) => !['V', 'M', 'A'].includes(pl(id).main)).slice(0, 2);
  pl(va).main = 'V'; pl(va).flex = true; pl(va).prefs = ['V'];
  pl(aa).main = 'A'; pl(aa).flex = true; pl(aa).prefs = ['A'];
  const rest = fi.filter((id) => id !== va && id !== aa);
  const st0 = { [va]: 'A', [aa]: 'V' }; let q = 0;
  const need = { V: (ln.V || 0) - 1, M: ln.M || 0, A: (ln.A || 0) - 1 };
  for (const l of ['V', 'M', 'A']) for (let i = 0; i < need[l]; i++) st0[rest[q++]] = l;
  for (let b = 0; b < 4; b++) M.gpSetBlock(mg, team, b, st0);
  const wins = M.gpPureWins(mg, team, 9);
  const w = wins.find((x) => [x.what.a, x.what.b].includes(va) && [x.what.a, x.what.b].includes(aa));
  assert.ok(w && w.pure, 'de linieruil is gratis winst');
  assert.equal(w.bs.length, M.gpBlocks(mg, team, 4).length, 'dezelfde ruil in alle blokken na elkaar is één voorstel');
  const k0 = M.gpKracht(mg, team, M.gpStats(mg, team));
  const before = M.gpStats(mg, team);
  M.gpApplyFix(mg, team, w);
  const after = M.gpStats(mg, team);
  assert.ok(M.gpKracht(mg, team, after) > k0);
  const cmp = M.gpCompare(mg, team, before, after);
  assert.ok(cmp.pure && !cmp.worse.length, 'niets slechter, iets beter');
  for (let b = 0; b < 4; b++) assert.equal(mg.gameplan.grid[b][va], 'V');
  // betere zetten na een wijziging laten het blok van de coach staan
  const benchKid = fi.find((id) => !(id in mg.gameplan.grid[1]));
  const np = { ...mg.gameplan.grid[1] }; const outK = Object.keys(np)[0]; const lane = np[outK]; delete np[outK]; np[benchKid] = lane;
  const st1 = M.gpStats(mg, team);
  M.gpSetBlock(mg, team, 1, np, 'coach');
  const imp = M.gpImprove(mg, team, { lock: [1], focus: [benchKid, outK], max: 3 });
  assert.ok(imp.length <= 3 && imp.every((f) => f.b !== 1), 'het gewijzigde blok blijft van de coach');
  assert.ok(M.gpCompare(mg, team, st1, M.gpStats(mg, team)).worse.length >= 0);
}
console.log('gameplan roepen en winst ok');
