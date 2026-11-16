// Run: node tests/planner.test.mjs
import { initialState, planRest, lineStatus } from '../js/planner.js';
import assert from 'node:assert/strict';

const kr = { 1: 70, 2: 90, 3: 70, 4: 75, 5: 30, 7: 35, 8: 50, 9: 30, 10: 55, 11: 60, 12: 65, 13: 45, 14: 40 };
const pr = { 1: ['A', 'M'], 2: ['M', 'V'], 3: ['V', 'M'], 4: ['M', 'A'], 5: ['A'], 7: ['A', 'V'], 8: ['V'], 9: ['V', 'A'], 10: ['M', 'A'], 11: ['V'], 12: ['M', 'V'], 13: ['A'], 14: ['V', 'A'] };
const players = {};
for (const k of Object.keys(kr)) players[k] = { kracht: kr[k], prefs: pr[k] };
const rules = { evenOften: true, equalTime: true, marge: 5, priority: 'eerlijk', newLineupAtBreak: true, minInterval: 2 };
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function run(name, ids, lines, extra = {}) {
  const ctx = { players, lines, periodLen: 25 * 60, periods: 2, rules: { ...rules, ...(extra.rules || {}) }, stand: extra.stand || 'balans' };
  const start = initialState(ids.map(String), ctx);
  const r = planRest(start, ctx, 0);
  const swaps = r.steps.filter((s) => s.type === 'swap');
  const lineups = r.steps.filter((s) => s.type === 'lineup');
  console.log(`\n${name}: ${swaps.length} wissels + ${lineups.length} rust-opstelling, ok=${r.ok}, speeltijd ${fmt(r.fair.minPlayed)}–${fmt(r.fair.maxPlayed)}, bankbeurten-verschil ${r.fair.turnsDiff}`);
  console.log('  start', JSON.stringify(start.pos), 'bank', start.bench.join(','));
  for (const s of r.steps.slice(0, 6)) console.log('  ', fmt(s.t), s.type === 'swap' ? `${s.out} eruit, ${s.in} erin (${s.line})${s.shift ? `, ${s.shift.id} → ${s.shift.to}` : ''}` : `opstelling ${JSON.stringify(s.pos)}`);
  console.log('  played', Object.fromEntries(Object.entries(r.final.played).map(([k, v]) => [k, fmt(v)])), 'turns', r.final.turns);
  return r;
}

const r6 = run('6-tal, 8 veldspelers', [1, 2, 3, 4, 5, 7, 8, 9], { V: 2, M: 1, A: 2 });
assert.ok(r6.ok, '6-tal moet binnen de regels passen');
assert.ok(r6.fair.spread <= 300);
assert.equal(r6.fair.turnsDiff, 0);
for (const s of r6.steps.filter((x) => x.type === 'swap')) assert.equal(Object.keys(s.pos).length, 5);

const r11 = run('11-tal, 13 veldspelers', [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14], { V: 3, M: 3, A: 4 });
assert.ok(r11.fair.spread <= 300);

const r7 = run('6-tal, 7 veldspelers', [1, 2, 3, 4, 5, 8, 9], { V: 2, M: 1, A: 2 });
assert.ok(r7.fair.spread <= 300);

const rNoBreak = run('6-tal zonder nieuwe opstelling in de rust', [1, 2, 3, 4, 5, 7, 8, 9], { V: 2, M: 1, A: 2 }, { rules: { newLineupAtBreak: false } });
assert.ok(rNoBreak.fair.spread <= 300);

// halverwege herplannen na een afwijking (iemand niet gewisseld)
{
  const ctx = { players, lines: { V: 2, M: 1, A: 2 }, periodLen: 1500, periods: 2, rules, stand: 'balans' };
  const start = initialState(['1', '2', '3', '4', '5', '7', '8', '9'], ctx);
  const state = JSON.parse(JSON.stringify(start));
  // 10 minuten gespeeld zonder wissels
  for (const id of Object.keys(state.pos)) state.played[id] += 600;
  const r = planRest(state, ctx, 600);
  console.log(`\nherplan na 10 min zonder wissels: ${r.steps.filter((s) => s.type === 'swap').length} wissels, speeltijd ${fmt(r.fair.minPlayed)}–${fmt(r.fair.maxPlayed)}, ok=${r.ok}`);
  assert.ok(r.steps.every((s) => s.t >= 600));
}

// iemand uitgeschakeld voor de wedstrijd
{
  const ctx = { players, lines: { V: 2, M: 1, A: 2 }, periodLen: 1500, periods: 2, rules, stand: 'balans' };
  const start = initialState(['1', '2', '3', '4', '5', '7', '8', '9'], ctx);
  start.disabled = { [start.bench[0]]: 'wedstrijd' };
  const r = planRest(start, ctx, 0);
  assert.ok(r.steps.filter((s) => s.type === 'swap').every((s) => s.in !== start.bench[0]));
  console.log(`\nmet ${start.bench[0]} uitgeschakeld: ${r.steps.filter((s) => s.type === 'swap').length} wissels, ok=${r.ok}`);
}

console.log('\nlijnstatus', JSON.stringify(lineStatus(r6.steps[0].pos || {}, players)));
console.log('\nAlle tests geslaagd');

// dominante rol: vast = altijd op die linie, flexibel = voorrang
{
  const pl = JSON.parse(JSON.stringify(players));
  pl['2'].main = 'V'; pl['2'].flex = false;   // sterkste speler vast voorin
  pl['1'].main = 'A'; pl['1'].flex = true;
  const ctx = { players: pl, lines: { V: 2, M: 1, A: 2 }, periodLen: 1500, periods: 2, rules, stand: 'balans' };
  const start = initialState(['1', '2', '3', '4', '5', '7', '8', '9'], ctx);
  const r = planRest(start, ctx, 0);
  const all = [start.pos].concat(r.steps.map((s) => s.pos));
  for (const pos of all) if ('2' in pos) assert.equal(pos['2'], 'V', 'vaste rol wordt altijd gevolgd');
  const onA = all.filter((pos) => '1' in pos).map((pos) => pos['1']);
  console.log('dominant: speler 2 altijd voor; speler 1 achter in', onA.filter((l) => l === 'A').length, 'van', onA.length, 'momenten; ok =', r.ok);
}
console.log('Dominante-roltest geslaagd');

// vast aantal wissels per kind (bijv. 1× per helft = 2 per wedstrijd)
for (const [name, ids, lines, k] of [['6-tal 8 kids', [1, 2, 3, 4, 5, 7, 8, 9], { V: 2, M: 1, A: 2 }, 1], ['6-tal 8 kids', [1, 2, 3, 4, 5, 7, 8, 9], { V: 2, M: 1, A: 2 }, 2], ['11-tal 13 kids', [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14], { V: 3, M: 3, A: 4 }, 1]]) {
  const ctx = { players, lines, periodLen: 1500, periods: 2, rules: { ...rules, maxBenchOn: true, maxBench: 10, turnsTarget: k * 2, minInterval: k > 1 ? 1 : 2 }, stand: 'balans' };
  const start = initialState(ids.map(String), ctx);
  const r = planRest(start, ctx, 0);
  console.log(`${name}, ${k}× per helft: ${r.steps.filter((s) => s.type === 'swap').length} wissels, ${r.fair.minTurns}–${r.fair.maxTurns}× gewisseld, ${fmt(r.fair.minPlayed)}–${fmt(r.fair.maxPlayed)}, ok=${r.ok}`);
  assert.equal(r.fair.minTurns, k * 2);
  assert.equal(r.fair.maxTurns, k * 2);
}
{
  // past niet: 2× per helft met minimaal 2 min tussen wissels
  const ctx = { players, lines: { V: 2, M: 1, A: 2 }, periodLen: 1500, periods: 2, rules: { ...rules, turnsTarget: 4, minInterval: 2 }, stand: 'balans' };
  const r = planRest(initialState(['1', '2', '3', '4', '5', '7', '8', '9'], ctx), ctx, 0);
  assert.equal(r.ok, false);
  assert.ok(r.why.indexOf('turns') !== -1);
}
console.log('Vast-aantal-test geslaagd');

// stand: verdedigen = dragende speler achterin, aanvallen = dragende speler voorin
{
  const { standPenalty, KEY_KRACHT } = await import('../js/planner.js');
  for (const [stand, line] of [['verdedigen', 'A'], ['aanvallen', 'V']]) {
    const ctx = { players, lines: { V: 2, M: 1, A: 2 }, periodLen: 1500, periods: 2, rules, stand };
    const start = initialState(['1', '2', '3', '4', '5', '7', '8', '9'], ctx);
    const r = planRest(start, ctx, 0);
    const all = [start.pos].concat(r.steps.map((s) => s.pos));
    const bad = all.filter((pos) => standPenalty(pos, players, stand) > 0).length;
    const keyIn = all.filter((pos) => Object.keys(pos).some((id) => pos[id] === line && players[id].kracht >= KEY_KRACHT)).length;
    console.log(`${stand}: ${keyIn} van ${all.length} momenten een dragende speler ${line === 'A' ? 'achterin' : 'voorin'} (overtredingen: ${bad})`);
    assert.equal(bad, 0);
  }
}
console.log('Standtest geslaagd');

// meerdere spelers per wisselmoment
{
  for (const k of [2, 3, 5]) {
    const r2 = { ...rules, perMoment: k };
    const ctx = { players, lines: { V: 2, M: 1, A: 2 }, periodLen: 1500, periods: 2, rules: r2, stand: 'balans' };
    const start = initialState(['1', '2', '3', '4', '5', '7', '8', '9'], ctx);
    const r = planRest(start, ctx, 0);
    const groups = {};
    for (const s of r.steps.filter((x) => x.type === 'swap')) (groups[s.t] = groups[s.t] || []).push(s);
    const sizes = Object.values(groups).map((g) => g.length);
    for (const g of Object.values(groups)) {
      const ids = g.map((s) => s.out).concat(g.map((s) => s.in));
      assert.equal(new Set(ids).size, ids.length, 'niemand in én uit op hetzelfde moment');
      assert.ok(g.length <= k);
    }
    console.log(`${k} per moment: ${sizes.length} momenten (${sizes.join(',')}), speeltijd ${Math.round(r.fair.minPlayed / 60)}–${Math.round(r.fair.maxPlayed / 60)} min, ok=${r.ok}`);
  }
}
console.log('Groepstest geslaagd');
