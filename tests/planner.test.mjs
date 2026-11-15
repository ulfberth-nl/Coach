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
