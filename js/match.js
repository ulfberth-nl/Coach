// Wedstrijdlogica: klok, gebeurtenissen, afgeleide stand en (her)planning.
import { planRest, planPinned, initialState, LINES, lineStatus, isDisabled, placeIn } from './planner.js';
import { uid } from './store.js';

export const periodLen = (team) => team.periodMin * 60;
// Opstelling van deze wedstrijd (de coach kan hem per wedstrijd veranderen door te slepen); anders die van het team.
export const linesOf = (match, team) => (match && match.lines) || team.lines;
export const formationText = (lines) => `${lines.A || 0}-${lines.M || 0}-${lines.V || 0}`;
// opstelling na het verplaatsen van één speler van linie 'from' naar 'to' (null als dat niet kan)
export function formationAfter(lines, from, to) {
  if (!from || !to || from === to || !((lines[from] || 0) > 1)) return null;
  return { ...lines, [from]: lines[from] - 1, [to]: (lines[to] || 0) + 1 };
}
const TOWARD = { V: 'Naar voren', M: 'Naar het midden', A: 'Naar achteren' };
export const formationLabel = (lines, from, to) => { const n = formationAfter(lines, from, to); return n ? `${TOWARD[to]} · ${formationText(n)}` : null; };
export const matchEnd = (team) => team.periods * periodLen(team);

export function playersMap(team) {
  const map = {};
  for (const p of team.players) map[p.id] = { kracht: p.kracht, prefs: p.prefs || [], main: p.main || null, flex: p.flex !== false, nick: p.nick || p.name, name: p.name };
  return map;
}

export function nickOf(team, id) {
  const p = team.players.find((x) => x.id === id);
  return p ? (p.nick || p.name) : '?';
}

// ---------- klok ----------
export function elapsedInPeriod(match, ms = Date.now()) {
  const c = match.clock;
  return c.accum + (c.running ? (ms - c.startedAt) / 1000 : 0);
}

// Wedstrijdtijd in seconden; blijft binnen de huidige periode, ook als de klok doorloopt.
export function gameTime(match, team, ms = Date.now()) {
  const L = periodLen(team);
  if (match.finished) return match.endT != null ? match.endT : matchEnd(team);
  return match.clock.period * L + Math.min(elapsedInPeriod(match, ms), L - 1);
}

export function periodLabel(team, p) {
  if (team.periods === 2) return p === 0 ? '1e helft' : '2e helft';
  if (team.periods === 4) return (p + 1) + 'e kwart';
  return 'Periode ' + (p + 1);
}

export function periodWord(team) {
  return team.periods === 2 ? 'helft' : team.periods === 4 ? 'kwart' : 'periode';
}

export const fmt = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
export const mins = (sec) => Math.round(Math.max(0, sec) / 60);

// ---------- vaste plekken op het veld per linie ----------
export function makeSlots(pos, lines, players) {
  const slots = {};
  for (const l of LINES) {
    const ids = Object.keys(pos).filter((id) => pos[id] === l)
      .sort((a, b) => (players[b] ? players[b].kracht : 0) - (players[a] ? players[a].kracht : 0));
    const n = lines[l] || 0;
    const mid = Math.floor((n - 1) / 2);
    const seq = [mid];
    for (let d = 1; seq.length < n; d++) { if (mid + d < n) seq.push(mid + d); if (mid - d >= 0 && seq.length < n) seq.push(mid - d); }
    const order = [];
    ids.forEach((id, i) => { if (i < n) order[seq[i]] = id; });
    for (let i = 0; i < n; i++) slots[l + i] = order[i] || null;
  }
  return slots;
}

export function slotOf(slots, id) {
  return Object.keys(slots).find((k) => slots[k] === id);
}

// Pas een wissel toe op de vaste plekken (wie erin komt neemt de plek; bij doorschuiven ruilen de plekken).
// Plek op het veld in coachtaal: linksvoor, rechtsachter, centraal midden, … (links = links op het scherm,
// het team speelt naar boven). Bij één speler in een linie: voorin, in het midden, achterin.
const BASE = { V: 'voor', M: 'midden', A: 'achter' };
export function posName(line, i, n) {
  if (!line) return null;
  if (n <= 1) return { V: { op: 'voorin', naar: 'naar voren', kort: 'voorin' }, M: { op: 'in het midden', naar: 'naar het midden', kort: 'midden' }, A: { op: 'achterin', naar: 'naar achteren', kort: 'achterin' } }[line];
  const mid = (n - 1) / 2;
  let name;
  if (i === 0) name = 'links' + BASE[line];
  else if (i === n - 1) name = 'rechts' + BASE[line];
  else if (i === mid) name = line === 'V' ? 'midvoor' : 'centraal ' + BASE[line];
  else name = 'centraal ' + BASE[line] + (i < mid ? ' links' : ' rechts');
  return { op: 'op ' + name, naar: 'naar ' + name, kort: name };
}
const posOf = (slots, lines, id) => { const k = slotOf(slots, id); return k ? posName(k[0], +k.slice(1), lines[k[0]] || 0) : null; };

// Het verhaal van een wisselmoment: per paar wie erin komt voor wie, waar hij gaat spelen en wie doorschuift
// (en waarheen). Paren gaan na elkaar, zoals de wissels zelf.
export function swapStory(slots, lines, pairs) {
  let cur = { ...slots };
  return pairs.map((p) => {
    const shift = p.shift && slotOf(cur, p.shift.id) ? p.shift.id : null;
    const out = posOf(cur, lines, p.out);
    const line = shift ? { in: p.in, out: p.out, shift, shiftPos: out, inPos: posOf(cur, lines, shift) } : { in: p.in, out: p.out, inPos: out };
    cur = slotSwap(cur, p.out, p.in, shift ? p.shift : null);
    return line;
  });
}

// Plekken na een rij wissels (voor het verhaal van het moment daarna).
export function slotsAfter(slots, pairs) {
  let cur = { ...slots };
  for (const p of pairs) cur = slotSwap(cur, p.out, p.in, p.shift && slotOf(cur, p.shift.id) ? p.shift : null);
  return cur;
}

export function slotSwap(slots, out, inn, shift) {
  const next = { ...slots };
  const outSlot = slotOf(next, out);
  if (shift && slotOf(next, shift.id)) {
    const shiftSlot = slotOf(next, shift.id);
    next[outSlot] = shift.id;
    next[shiftSlot] = inn;
  } else if (outSlot) {
    next[outSlot] = inn;
  }
  return next;
}

// Keeper wisselen: nieuwe keeper komt van de bank of uit het veld; de oude keeper gaat naar de bank
// (mode 'bank' of 'klaar') of neemt de veldplek over (mode 'veld'). Bij een veldspeler als nieuwe keeper
// vult ev.fill (een bankspeler) zo nodig de lege plek.
export function applyKeeperChange(s, ev) {
  const old = s.keeper, nw = ev.to;
  if (!nw || nw === old) return;
  if (nw in s.pos) {
    const line = s.pos[nw];
    const slot = slotOf(s.slots, nw);
    const pos = { ...s.pos };
    delete pos[nw];
    const slots = { ...s.slots };
    let bench = s.bench.slice();
    if (ev.mode === 'veld' && old) { pos[old] = line; slots[slot] = old; }
    else {
      if (ev.fill && bench.indexOf(ev.fill) !== -1) { bench = bench.filter((x) => x !== ev.fill); pos[ev.fill] = line; slots[slot] = ev.fill; }
      else slots[slot] = null;
      if (old) bench.push(old);
    }
    s.pos = pos; s.slots = slots; s.bench = bench;
  } else {
    s.bench = s.bench.filter((x) => x !== nw).concat(old ? [old] : []);
  }
  s.keeper = nw;
}

// ---------- afgeleide stand uit de gebeurtenissen ----------
export function derive(match, team, T) {
  const players = playersMap(team);
  const L = periodLen(team);
  const st = { pos: {}, bench: [], played: {}, turns: {}, since: {}, disabled: {}, slots: {}, keeper: match.keeperId || null };
  const score = { us: 0, them: 0 };
  const goals = {};
  const lineTime = {};
  const late = [];
  const init = (id) => { st.played[id] = 0; st.turns[id] = 0; st.since[id] = 0; lineTime[id] = { A: 0, M: 0, V: 0, K: 0 }; };
  for (const id of match.present) init(id);
  let last = 0;
  const advance = (to) => {
    const dt = Math.max(0, to - last);
    if (dt > 0) {
      for (const id of Object.keys(st.pos)) { st.played[id] += dt; lineTime[id][st.pos[id]] += dt; }
      if (st.keeper && lineTime[st.keeper]) lineTime[st.keeper].K += dt;
    }
    last = Math.max(last, to);
  };
  let first = true;
  for (const ev of match.events) {
    if (ev.t > T + 0.5) break;
    advance(ev.t);
    if (ev.type === 'lineup') {
      if (!first) {
        for (const id of Object.keys(st.pos)) if (!(id in ev.pos)) { st.turns[id] += 1; st.since[id] = ev.t; }
        for (const id of Object.keys(ev.pos)) if (!(id in st.pos)) st.since[id] = ev.t;
      }
      st.pos = { ...ev.pos };
      st.bench = ev.bench.slice();
      st.slots = ev.slots ? { ...ev.slots } : makeSlots(ev.pos, linesOf(match, team), players);
      first = false;
    } else if (ev.type === 'formation') {
      if (st.pos[ev.playerId]) {
        st.slots = moveSlot(st.slots, ev.playerId, ev.from, ev.to, ev.lines, ev.at);
        st.pos = { ...st.pos, [ev.playerId]: ev.to };
      }
    } else if (ev.type === 'swap') {
      st.slots = slotSwap(st.slots, ev.out, ev.in, ev.shift);
      const newPos = { ...st.pos };
      delete newPos[ev.out];
      if (ev.shift && ev.shift.id in newPos) {
        newPos[ev.in] = newPos[ev.shift.id];
        newPos[ev.shift.id] = ev.shift.to;
      } else {
        newPos[ev.in] = st.pos[ev.out];
      }
      st.pos = newPos;
      st.bench = st.bench.filter((id) => id !== ev.in).concat([ev.out]);
      st.turns[ev.out] += 1;
      st.since[ev.out] = ev.t;
      st.since[ev.in] = ev.t;
    } else if (ev.type === 'goal') {
      score.us += 1;
      if (ev.scorer) goals[ev.scorer] = (goals[ev.scorer] || 0) + 1;
    } else if (ev.type === 'oppgoal') {
      score.them += 1;
    } else if (ev.type === 'disable') {
      st.disabled[ev.playerId] = ev.mode;
    } else if (ev.type === 'enable') {
      delete st.disabled[ev.playerId];
    } else if (ev.type === 'periodEnd') {
      last = Math.max(last, (ev.period + 1) * L);
    } else if (ev.type === 'keeper') {
      const old = st.keeper;
      applyKeeperChange(st, ev);
      if (old) { st.since[old] = ev.t; if (late.indexOf(old) === -1) late.push(old); if (ev.mode === 'klaar') st.disabled[old] = 'wedstrijd'; }
      if (ev.fill) st.since[ev.fill] = ev.t;
    } else if (ev.type === 'move') {
      const la = st.pos[ev.a], lb = st.pos[ev.b];
      if (la && lb) {
        st.pos = { ...st.pos, [ev.a]: lb, [ev.b]: la };
        const sa = slotOf(st.slots, ev.a), sb = slotOf(st.slots, ev.b);
        st.slots = { ...st.slots, [sa]: ev.b, [sb]: ev.a };
      }
    } else if (ev.type === 'join') {
      if (!(ev.playerId in st.played)) init(ev.playerId);
      if (st.bench.indexOf(ev.playerId) === -1 && !(ev.playerId in st.pos)) st.bench.push(ev.playerId);
      st.since[ev.playerId] = ev.t;
      late.push(ev.playerId);
    }
  }
  advance(T);
  for (const id of Object.keys(st.disabled)) {
    if (st.disabled[id] !== 'wedstrijd' && !isDisabled(st, id, T, { periodLen: L })) delete st.disabled[id];
  }
  return { state: st, score, goals, lineTime, late };
}

// ---------- opstellingsstand ----------
export function currentStand(match, team, score) {
  const r = team.rules;
  if (match.standMode === 'manual' || !r.autoStand) return match.manualStand || 'balans';
  const d = score.us - score.them;
  return d < 0 ? r.standAchter : d > 0 ? r.standVoor : r.standGelijk;
}

// Regels die voor deze wedstrijd gelden: de teamregels, aangevuld met wat het wisselprofiel
// voor de spelers van deze wedstrijd heeft uitgerekend (match.rules).
// Eerlijkheid voor deze wedstrijd (planner): strenger of ruimer dan het profiel van het team.
export const FAIR_ADJ = {
  strenger: (r) => ({ equalTime: true, marge: Math.max(2, (r.marge || 5) - 2), maxBenchOn: true, maxBench: Math.max(6, (r.maxBench || 10) - 2) }),
  ruimer: (r) => ({ marge: (r.marge || 5) + 3, maxBench: (r.maxBench || 10) + 4, turnsSlack: 1 })
};
export function effRules(match, team) {
  const r = match && match.rules ? { ...team.rules, ...match.rules } : team.rules;
  const adj = match && FAIR_ADJ[match.fairness];
  return adj ? { ...r, ...adj(r) } : r;
}

export function setFairness(match, team, v) {
  match.fairness = FAIR_ADJ[v] ? v : null;
  replan(match, team);
}

// Aantal keer gewisseld per kind voor de hele wedstrijd (null = de app kiest zelf).
export function turnsTarget(team, match = null) {
  const k = effRules(match, team).turnsPerPeriod;
  return k ? k * team.periods : null;
}

export function makeCtx(match, team, stand) {
  const r = effRules(match, team);
  return {
    players: playersMap(team),
    lines: linesOf(match, team),
    periodLen: periodLen(team),
    periods: team.periods,
    rules: { ...r, priority: match.priority || r.priority, turnsTarget: turnsTarget(team, match), turnsSlack: r.turnsSlack || 0 },
    stand
  };
}

export function lineupPending(match, team) {
  const p = match.clock.period;
  return !match.finished && p > 0 && !match.clock.running && match.clock.accum === 0 &&
    !!team.rules.newLineupAtBreak && !match.events.some((e) => e.type === 'lineup' && e.period === p);
}

// Ankerpunt van het plan: de laatste wissel of opstelling in deze periode. Zo verschuift het plan niet bij een goal.
function planAnchor(match, team, T) {
  const L = periodLen(team);
  const pStart = Math.floor(T / L) * L;
  let anchor = pStart;
  for (const e of match.events) {
    if (e.t > T + 0.5) break;
    if ((e.type === 'swap' || e.type === 'lineup' || e.type === 'join' || e.type === 'keeper') && e.t >= anchor) anchor = e.t;
  }
  return Math.min(anchor, T);
}

// Vastgezette momenten die nog gelden (vanaf het ankerpunt tot het einde), op tijd.
function activePins(match, anchor, end) {
  const list = (match.pins || []).map((p) => ({ ...p, pairs: p.pairs.slice() }));
  const fx = match.fixed;
  if (fx && !list.some((p) => p.t === fx.t)) list.push({ t: fx.t, pairs: fx.pairs || [{ out: fx.out, in: fx.in }], after: fx.after });
  return list.filter((p) => p.t >= anchor && p.t < end - 1 && p.pairs && p.pairs.length).sort((a, b) => a.t - b.t);
}

// Een moment vastzetten (speldje): op tijd t gebeuren precies deze wissels. Vervangt een speldje op dat moment.
export function pinMoment(match, team, t, pairs, after = 'terug') {
  const list = (match.pins || []).filter((p) => p.t !== t);
  if (match.fixed && match.fixed.t === t) match.fixed = null;
  list.push({ t, pairs: pairs.map((p) => ({ out: p.out, in: p.in })), after });
  match.pins = list.sort((a, b) => a.t - b.t);
  match.firstAt = null;
  replan(match, team);
}

// Speldje weghalen: de app kiest op dat moment weer zelf.
export function unpinMoment(match, team, t) {
  match.pins = (match.pins || []).filter((p) => p.t !== t);
  if (match.fixed && match.fixed.t === t) match.fixed = null;
  replan(match, team);
}

export const isPinned = (match, t) => (match.pins || []).some((p) => p.t === t) || !!(match.fixed && match.fixed.t === t);

// Na een uitgevoerde wissel: speldjes die nu aan de beurt (of voorbij) zijn vervallen; deed de coach de wissel
// van het eerstvolgende speldje alvast, dan is dat paar gebeurd.
function consumePins(match, T, pairs) {
  if (!match.pins || !match.pins.length) return;
  let list = match.pins.filter((p) => p.t > T + 0.5).sort((a, b) => a.t - b.t);
  if (list.length) {
    const done = new Set(pairs.map((p) => p.out + '>' + p.in));
    const rest = list[0].pairs.filter((p) => !done.has(p.out + '>' + p.in));
    if (rest.length !== list[0].pairs.length) list = rest.length ? [{ ...list[0], pairs: rest }].concat(list.slice(1)) : list.slice(1);
  }
  match.pins = list;
}

export function replan(match, team, ms = Date.now()) {
  const T = gameTime(match, team, ms);
  const d = derive(match, team, T);
  const stand = currentStand(match, team, d.score);
  const ctx = makeCtx(match, team, stand);
  const anchor = planAnchor(match, team, T);
  const st = d.state;
  if (T > anchor) for (const id of Object.keys(st.pos)) st.played[id] -= T - anchor;
  ctx.lineupPending = lineupPending(match, team);
  ctx.firstAt = match.firstAt && match.firstAt > anchor ? match.firstAt : null;
  ctx.excludeFair = d.late;
  // speldjes: momenten die de coach heeft vastgezet (ook de 'bewaarde wissel'); de rest rekent de app zelf
  const pins = activePins(match, anchor, matchEnd(team));
  const plan = (c) => {
    const free = planRest(st, c, anchor);
    if (!pins.length) return free;
    const grid = free.steps.filter((x) => x.type === 'swap').map((x) => x.t);
    return { ...planPinned(st, c, anchor, pins, grid), free };
  };
  let r = plan(ctx);
  const swapsOf = (x) => x.steps.filter((s) => s.type === 'swap').length;
  // met speldjes: past de rest niet meer precies binnen de regels, dan mag het verschil 1 beurt zijn in plaats
  // van ineens veel meer wissels
  if (pins.length && (!r.ok || swapsOf(r) > swapsOf(r.free) + 1)) {
    const r2 = plan({ ...ctx, rules: { ...ctx.rules, turnsSlack: 1 } });
    if ((r2.ok && !r.ok) || swapsOf(r2) < swapsOf(r)) r = { ...r2, relaxed: true };
  }
  if (!match.started) {
    match.baseline = swapsOf(r.free || r);
  } else if (match.baseline != null) {
    // na een afwijking (extra of vroege wissel) niet ineens veel meer wissels: dan mag het verschil 1 beurt zijn
    const end = matchEnd(team);
    const expected = Math.ceil(match.baseline * (end - anchor) / end) + 1;
    if (!r.ok || swapsOf(r) > expected + 1) {
      const r2 = plan({ ...ctx, rules: { ...ctx.rules, turnsSlack: 1 } });
      if (r2.ok && swapsOf(r2) < swapsOf(r)) r = { ...r2, relaxed: true };
    }
  }
  match.plan = {
    at: anchor,
    stand,
    steps: r.steps,
    ok: r.ok,
    why: r.why || [],
    relaxed: !!r.relaxed,
    broken: r.broken || [],
    fair: r.fair,
    finalPlayed: r.final.played,
    finalTurns: r.final.turns
  };
  return match;
}

// ---------- wedstrijd aanmaken ----------
export function createMatch(team, opts) {
  const players = playersMap(team);
  const present = opts.present.slice();
  const keeperId = team.keeper ? opts.keeperId || null : null;
  const fieldIds = present.filter((id) => id !== keeperId);
  const match = {
    id: uid(),
    teamId: team.id,
    opponent: opts.opponent || '',
    date: opts.date || new Date().toISOString().slice(0, 10),
    present,
    keeperId,
    priority: opts.priority || (opts.rules && opts.rules.priority) || team.rules.priority,
    rules: opts.rules || null,
    lines: opts.lines || null,
    // speldjes, eerlijkheid en focus voor deze wedstrijd blijven staan als de app de wedstrijd opnieuw opbouwt
    pins: opts.pins ? opts.pins.map((p) => ({ ...p, pairs: p.pairs.slice() })) : [],
    fairness: opts.fairness || null,
    standMode: opts.standMode || 'auto',
    manualStand: opts.manualStand || 'balans',
    clock: { period: 0, running: false, startedAt: 0, accum: 0 },
    started: false,
    finished: false,
    firstAt: null,
    events: [],
    plan: null
  };
  const ctx = makeCtx(match, team, 'balans');
  const st = initialState(fieldIds, ctx);
  match.events.push({ id: uid(), type: 'lineup', t: 0, period: 0, pos: st.pos, bench: st.bench, slots: makeSlots(st.pos, linesOf(match, team), players) });
  replan(match, team);
  return match;
}

// Vooraf: hoeveel wissels levert deze selectie op?
export function previewPlan(team, present, keeperId, priority) {
  const field = present.filter((id) => id !== keeperId);
  const F = Object.values(team.lines).reduce((a, b) => a + b, 0);
  if (field.length < F) return null;
  return createMatch(team, { present, keeperId, priority }).plan;
}

// Twee spelers ruilen in een opstelling (veld↔veld of veld↔bank). Geeft een nieuwe opstelling terug.
export function swapInLineup(lu, a, b) {
  const slots = { ...lu.slots };
  const pos = { ...lu.pos };
  let bench = lu.bench.slice();
  const sa = slotOf(slots, a), sb = slotOf(slots, b);
  if (sa && sb) {
    slots[sa] = b; slots[sb] = a;
    const la = pos[a]; pos[a] = pos[b]; pos[b] = la;
  } else if (sa && !sb) {
    slots[sa] = b; pos[b] = pos[a]; delete pos[a];
    bench = bench.map((x) => (x === b ? a : x));
  } else if (!sa && sb) {
    slots[sb] = a; pos[a] = pos[b]; delete pos[b];
    bench = bench.map((x) => (x === a ? b : x));
  }
  return { pos, bench, slots };
}

export function swapInStartLineup(match, team, a, b) {
  const ev = match.events[0];
  const players = playersMap(team);
  const lu = swapInLineup({ pos: ev.pos, bench: ev.bench, slots: ev.slots || makeSlots(ev.pos, linesOf(match, team), players) }, a, b);
  match.events[0] = { ...ev, ...lu };
  replan(match, team);
}

// ---------- acties (muteren een concept van de wedstrijd) ----------
export function startClock(match) {
  if (match.clock.running || match.finished) return;
  match.started = true;
  match.clock.running = true;
  match.clock.startedAt = Date.now();
}

export function pauseClock(match) {
  if (!match.clock.running) return;
  match.clock.accum += (Date.now() - match.clock.startedAt) / 1000;
  match.clock.running = false;
}

export function endPeriod(match, team) {
  pauseClock(match);
  const L = periodLen(team);
  const p = match.clock.period;
  match.events.push({ id: uid(), type: 'periodEnd', t: p * L + Math.min(match.clock.accum, L), period: p });
  match.firstAt = null;
  match.fixed = null;
  if (p + 1 >= team.periods) {
    match.finished = true;
    match.endT = p * L + Math.min(match.clock.accum, L);
    match.plan = { ...(match.plan || {}), steps: [] };
  } else {
    match.clock.period = p + 1;
    match.clock.accum = 0;
    replan(match, team);
  }
}

// Wedstrijd nu afsluiten (bijvoorbeeld als hij eerder stopt). Niet gespeelde tijd telt niet mee.
export function finishNow(match, team) {
  pauseClock(match);
  const L = periodLen(team);
  const p = match.clock.period;
  const T = p * L + Math.min(match.clock.accum, L);
  match.events.push({ id: uid(), type: 'periodEnd', t: T, period: p });
  match.finished = true;
  match.started = true;
  match.endT = T;
  match.firstAt = null;
  match.fixed = null;
  match.plan = { ...(match.plan || {}), steps: [] };
}

// Klok van deze periode op een tijd zetten (in seconden). Latere gebeurtenissen schuiven mee terug.
export function setClock(match, team, sec) {
  const L = periodLen(team);
  const p = match.clock.period;
  const s = Math.max(0, Math.min(L, Math.round(sec)));
  if (match.clock.running) { match.clock.startedAt = Date.now() - s * 1000; match.clock.accum = 0; } else match.clock.accum = s;
  const newT = p * L + Math.min(s, L - 1);
  for (const ev of match.events) if (ev.type !== 'periodEnd' && ev.t > newT && ev.t >= p * L) ev.t = newT;
  const happened = match.events.some((e) => e.type !== 'lineup' || e.t > 0);
  if (p === 0 && s === 0 && !happened) {
    match.clock.running = false;
    match.clock.accum = 0;
    match.started = false;
  }
  match.firstAt = null;
  replan(match, team);
}

export function adjustClock(match, team, delta) {
  setClock(match, team, elapsedInPeriod(match) + delta);
}

export function applyLineup(match, team, lu) {
  const T = gameTime(match, team);
  const players = playersMap(team);
  const cur = linesOf(match, team);
  const ev = { id: uid(), type: 'lineup', t: T, period: match.clock.period, pos: lu.pos, bench: lu.bench, slots: lu.slots || makeSlots(lu.pos, lu.lines || cur, players) };
  // andere opstelling in de rust (bijv. 2-2-1): geldt vanaf nu voor de rest van de wedstrijd
  if (lu.lines && formationText(lu.lines) !== formationText(cur)) { ev.lines = { ...lu.lines }; ev.prevLines = { ...cur }; match.lines = { ...lu.lines }; }
  match.events.push(ev);
  match.firstAt = null;
  match.fixed = null;
  replan(match, team);
}

export function doSwap(match, team, out, inn, shift) {
  const T = gameTime(match, team);
  const d = derive(match, team, T);
  const line = shift ? d.state.pos[shift.id] : d.state.pos[out];
  match.events.push({ id: uid(), type: 'swap', t: T, out, in: inn, line, shift: shift || null });
  match.firstAt = null;
  match.fixed = null;
  consumePins(match, T, [{ out, in: inn }]);
  replan(match, team);
}

// Meerdere wissels tegelijk: telkens de beste plek, één keer herplannen; ongedaan maken haalt de hele groep weg.
export function doSwapGroup(match, team, pairs) {
  if (pairs.length === 1) return doSwap(match, team, pairs[0].out, pairs[0].in, pairs[0].shift || null);
  const T = gameTime(match, team);
  const d = derive(match, team, T);
  const stand = currentStand(match, team, d.score);
  const players = playersMap(team);
  let pos = { ...d.state.pos };
  const g = uid();
  for (const pr of pairs) {
    if (!(pr.out in pos)) continue;
    const placed = placeIn(pos, pr.out, pr.in, players, stand);
    const line = placed.shift ? pos[placed.shift.id] : pos[pr.out];
    match.events.push({ id: uid(), type: 'swap', t: T, out: pr.out, in: pr.in, line, shift: placed.shift || null, g });
    pos = placed.pos;
  }
  match.firstAt = null;
  match.fixed = null;
  consumePins(match, T, pairs);
  replan(match, team);
}

// Paren voor een groepswissel met de plek van elke nieuwe speler (na elkaar toegepast)
export function placeGroup(match, team, pairs) {
  const d = derive(match, team, gameTime(match, team));
  const stand = currentStand(match, team, d.score);
  const players = playersMap(team);
  let pos = { ...d.state.pos };
  return pairs.map((pr) => {
    if (!(pr.out in pos)) return { ...pr, line: null, shift: null };
    const placed = placeIn(pos, pr.out, pr.in, players, stand);
    pos = placed.pos;
    return { ...pr, line: placed.line, shift: placed.shift };
  });
}

// Aangepaste wissel bewaren voor het moment waarop de volgende wissel gepland stond.
export function fixSwap(match, team, out, inn, after = 'terug') {
  return fixGroup(match, team, [{ out, in: inn }], after);
}

export function fixGroup(match, team, pairs, after = 'terug') {
  const next = nextSwap(match, team);
  if (!next) return false;
  pinMoment(match, team, next.t, pairs, after);
  return isPinned(match, next.t);
}

export function changeKeeper(match, team, to, mode) {
  const T = gameTime(match, team);
  const d = derive(match, team, T);
  let fill = null;
  if (to in d.state.pos && mode !== 'veld') {
    const players = playersMap(team);
    fill = d.state.bench.filter((id) => !d.state.disabled[id]).sort((a, b) => (d.state.played[a] - d.state.played[b]) ||
      (Math.abs(players[a].kracht - players[to].kracht) - Math.abs(players[b].kracht - players[to].kracht)))[0] || null;
  }
  match.events.push({ id: uid(), type: 'keeper', t: T, from: d.state.keeper, to, mode, fill });
  match.firstAt = null;
  replan(match, team);
}

// Plek in een linie aanpassen: speler weg uit zijn linie (de rest schuift aan), erbij in de nieuwe linie
// (aan de kant waar hij vandaan kwam). Andere linies blijven zoals ze zijn.
export function moveSlot(slots, id, from, to, lines, at = null) {
  const ids = (l) => Object.keys(slots).filter((k) => k[0] === l).sort((a, b) => +a.slice(1) - +b.slice(1)).map((k) => slots[k]).filter(Boolean);
  const src = ids(from);
  const rest = src.filter((x) => x !== id);
  const dst = ids(to).filter((x) => x !== id);
  // op de plek waar de coach hem neerzette; anders aan de kant waar hij vandaan kwam
  if (at != null) dst.splice(Math.max(0, Math.min(dst.length, at)), 0, id);
  else if (src.indexOf(id) < (src.length - 1) / 2) dst.unshift(id);
  else dst.push(id);
  const out = {};
  for (const l of LINES) {
    const list = l === from ? rest : l === to ? dst : ids(l);
    for (let i = 0; i < (lines[l] || 0); i++) out[l + i] = list[i] || null;
  }
  return out;
}

// Opstelling veranderen door een veldspeler naar een andere linie te slepen (bijv. een aanvaller naar het
// middenveld: van 2-1-2 naar 2-2-1). Geldt voor deze wedstrijd; het plan rekent daarna opnieuw.
export function changeFormation(match, team, id, to, at = null) {
  const cur = linesOf(match, team);
  if (!match.started) {
    const ev = match.events[0];
    const from = ev && ev.pos[id];
    const lines = formationAfter(cur, from, to);
    if (!lines) return null;
    const slots = moveSlot(ev.slots || makeSlots(ev.pos, cur, playersMap(team)), id, from, to, lines, at);
    match.events[0] = { ...ev, pos: { ...ev.pos, [id]: to }, slots };
    match.lines = lines;
    replan(match, team);
    return lines;
  }
  const T = gameTime(match, team);
  const from = derive(match, team, T).state.pos[id];
  const lines = formationAfter(cur, from, to);
  if (!lines) return null;
  match.events.push({ id: uid(), type: 'formation', t: T, playerId: id, from, to, at, lines, prev: { ...cur } });
  match.lines = lines;
  replan(match, team);
  return lines;
}

// Twee veldspelers ruilen van plek tijdens de wedstrijd.
export function movePlayers(match, team, a, b) {
  match.events.push({ id: uid(), type: 'move', t: gameTime(match, team), a, b });
  replan(match, team);
}

export function clearFixed(match, team) {
  const next = nextSwap(match, team);
  match.fixed = null;
  if (next) match.pins = (match.pins || []).filter((p) => p.t !== next.t);
  replan(match, team);
}

export function delay(match, team, sec = 60) {
  const next = nextSwap(match, team);
  const T = gameTime(match, team);
  if (next && isPinned(match, next.t)) {
    // het vastgezette moment schuift mee
    if (match.fixed && match.fixed.t === next.t) match.fixed = { ...match.fixed, t: T + sec };
    match.pins = (match.pins || []).map((p) => (p.t === next.t ? { ...p, t: T + sec } : p)).sort((a, b) => a.t - b.t);
  } else match.firstAt = T + sec;
  replan(match, team);
}

export function disablePlayer(match, team, playerId, mode) {
  const T = gameTime(match, team);
  const p = Math.min(team.periods - 1, Math.floor(T / periodLen(team)));
  match.events.push({ id: uid(), type: 'disable', t: T, playerId, mode: mode === 'wedstrijd' ? 'wedstrijd' : 'periode:' + p });
  replan(match, team);
}

export function enablePlayer(match, team, playerId) {
  match.events.push({ id: uid(), type: 'enable', t: gameTime(match, team), playerId });
  replan(match, team);
}

export function joinPlayer(match, team, playerId) {
  if (match.present.indexOf(playerId) === -1) match.present.push(playerId);
  match.events.push({ id: uid(), type: 'join', t: gameTime(match, team), playerId });
  replan(match, team);
}

export function goal(match, team, scorer) {
  match.events.push({ id: uid(), type: 'goal', t: gameTime(match, team), scorer: scorer || null });
  replan(match, team);
}

export function oppGoal(match, team) {
  match.events.push({ id: uid(), type: 'oppgoal', t: gameTime(match, team) });
  replan(match, team);
}

// Stand handmatig aanpassen: haal het laatste doelpunt van deze speler (null = onbekend) of de laatste tegengoal weg.
export function removeGoal(match, team, scorer, opp = false) {
  for (let i = match.events.length - 1; i >= 0; i--) {
    const e = match.events[i];
    if (opp ? e.type === 'oppgoal' : e.type === 'goal' && (e.scorer || null) === (scorer || null)) {
      match.events.splice(i, 1);
      replan(match, team);
      return true;
    }
  }
  return false;
}

export function setScorer(match, eventId, scorer) {
  const ev = match.events.find((e) => e.id === eventId);
  if (ev) ev.scorer = scorer || null;
}

const UNDOABLE = ['swap', 'goal', 'oppgoal', 'disable', 'enable', 'join', 'move', 'keeper', 'formation'];

export function lastUndoable(match) {
  for (let i = match.events.length - 1; i >= 0; i--) {
    const e = match.events[i];
    if (UNDOABLE.indexOf(e.type) !== -1) return { index: i, ev: e };
    if (e.type === 'lineup' || e.type === 'periodEnd') return null;
  }
  return null;
}

export function undo(match, team) {
  const u = lastUndoable(match);
  if (!u) return null;
  match.events.splice(u.index, 1);
  if (u.ev.g) match.events = match.events.filter((e) => e.g !== u.ev.g);
  if (u.ev.type === 'join') match.present = match.present.filter((id) => id !== u.ev.playerId);
  if (u.ev.type === 'formation') match.lines = u.ev.prev;
  replan(match, team);
  return u.ev;
}

export function setStand(match, team, mode, value) {
  match.standMode = mode;
  if (value) match.manualStand = value;
  replan(match, team);
}

// ---------- hulpfuncties voor de schermen ----------
export function nextSwap(match, team) {
  if (!match.plan || match.finished) return null;
  const end = (match.clock.period + 1) * periodLen(team);
  const s = match.plan.steps[0];
  return s && s.type === 'swap' && s.t < end ? s : null;
}

// Alle wissels van het eerstvolgende moment (1 of meer spelers tegelijk)
export function nextGroup(match, team) {
  const first = nextSwap(match, team);
  if (!first) return [];
  const out = [];
  for (const s of match.plan.steps) { if (s.type !== 'swap' || s.t !== first.t) break; out.push(s); }
  return out;
}

// telt wisselmomenten (een groep wissels tegelijk = 1 moment)
export function swapCounts(match) {
  const moments = (list) => { let n = 0, last = null; for (const s of list) { if (s.type !== 'swap') { last = null; continue; } const key = s.g || s.t; if (key !== last) n++; last = key; } return n; };
  const done = moments(match.events.filter((e) => e.type === 'swap'));
  const planned = match.plan ? moments(match.plan.steps) : 0;
  return { done, planned, total: done + planned };
}

// Beste bankspeler voor een snelle wissel van deze veldspeler.
export function suggestIn(match, team, outId) {
  const d = derive(match, team, gameTime(match, team));
  const players = playersMap(team);
  const eligible = d.state.bench.filter((id) => !d.state.disabled[id]);
  return eligible.sort((a, b) => (d.state.played[a] - d.state.played[b]) ||
    (Math.abs(players[a].kracht - players[outId].kracht) - Math.abs(players[b].kracht - players[outId].kracht)))[0] || null;
}

// Beste veldspeler om te wisselen als deze bankspeler erin moet.
export function suggestOut(match, team, inId) {
  const d = derive(match, team, gameTime(match, team));
  const players = playersMap(team);
  return Object.keys(d.state.pos).sort((a, b) => (d.state.turns[a] - d.state.turns[b]) || (d.state.played[b] - d.state.played[a]) ||
    (Math.abs(players[a].kracht - players[inId].kracht) - Math.abs(players[b].kracht - players[inId].kracht)))[0] || null;
}

// Waar komt de nieuwe speler te staan (en schuift er iemand door)?
export function placement(match, team, out, inn) {
  const d = derive(match, team, gameTime(match, team));
  const stand = currentStand(match, team, d.score);
  return placeIn(d.state.pos, out, inn, playersMap(team), stand);
}

// Wat gebeurt er als we deze wissel nu doen? Voor het gevolgen-paneel.
export function previewSwap(match, team, swap) {
  const copy = JSON.parse(JSON.stringify(match));
  if (swap && swap.pairs) doSwapGroup(copy, team, swap.pairs);
  else if (swap) doSwap(copy, team, swap.out, swap.in, swap.shift || null);
  else delay(copy, team, 60);
  const d = derive(copy, team, gameTime(copy, team));
  const players = playersMap(team);
  const stand = currentStand(copy, team, d.score);
  const counted = Object.keys(d.state.pos).concat(d.state.bench).filter((id) => d.state.disabled[id] !== 'wedstrijd' && d.late.indexOf(id) === -1);
  const turns = counted.map((id) => copy.plan.finalTurns[id] || 0);
  return {
    lines: lineStatus(d.state.pos, players, stand),
    plan: copy.plan,
    minTurns: turns.length ? Math.min(...turns) : 0,
    maxTurns: turns.length ? Math.max(...turns) : 0
  };
}

// Opstellingen voor de rust (iedereen staat aan de kant, je begint opnieuw): aanbevolen (het plan), of zoals
// de start of het eind van de vorige periode. Wie niet meer kan (klaar, keeper geworden) wordt vervangen door
// wie het minst speelde; dat staat in 'repl'.
const linesFromSlots = (slots) => { const l = { A: 0, M: 0, V: 0 }; for (const k in slots) if (slots[k]) l[k[0]]++; return l; };
export function breakOptions(match, team) {
  const T = gameTime(match, team);
  const st = derive(match, team, T).state;
  const keeper = st.keeper;
  const pool = Object.keys(st.pos).concat(st.bench).filter((id) => id !== keeper && st.disabled[id] !== 'wedstrijd');
  const fix = (lu) => {
    if (!lu) return null;
    const src = lu.slots || makeSlots(lu.pos, linesOf(match, team), playersMap(team));
    const inUse = new Set(Object.values(src).filter(Boolean));
    const spare = pool.filter((id) => !inUse.has(id)).sort((a, b) => (st.played[a] || 0) - (st.played[b] || 0));
    const slots = {}, used = new Set(), repl = [];
    for (const k of Object.keys(src)) {
      let id = src[k];
      if (!id) continue;
      if (pool.indexOf(id) === -1 || used.has(id)) { const r = spare.shift(); if (r) repl.push({ out: id, in: r }); id = r; }
      if (id) { slots[k] = id; used.add(id); }
    }
    const pos = {};
    for (const k in slots) pos[slots[k]] = k[0];
    return { pos, slots, bench: pool.filter((id) => !used.has(id)), lines: linesFromSlots(slots), repl };
  };
  const p = match.clock.period;
  const prevStart = match.events.filter((e) => e.type === 'lineup' && (e.period || 0) === p - 1).pop() || match.events.find((e) => e.type === 'lineup');
  const prop = breakProposal(match, team);
  const eind = fix({ pos: st.pos, slots: st.slots });
  return {
    aanbevolen: prop ? { ...fix(prop), repl: [] } : eind,
    start: fix(prevStart),
    eind,
    played: st.played,
    keeper
  };
}

export function breakProposal(match, team) {
  const step = match.plan && match.plan.steps.find((s) => s.type === 'lineup');
  if (!step) return null;
  return { pos: step.pos, bench: step.bench, slots: makeSlots(step.pos, linesOf(match, team), playersMap(team)) };
}

export function summary(match, team) {
  const T = gameTime(match, team);
  return { ...derive(match, team, T), T };
}

// Alle momenten van de wedstrijd (gedaan + gepland) met opstelling, voor het wedstrijdplan.
export function timeline(match, team) {
  const players = playersMap(team);
  const cards = [];
  let slots = null, pos = null, bench = null, keeper = match.keeperId || null;
  // opstelling aan het begin: terugrekenen vanaf de huidige via de opstellingswijzigingen
  let lines = linesOf(match, team);
  for (let k = match.events.length - 1; k >= 0; k--) {
    const e = match.events[k];
    if (e.type === 'formation') lines = e.prev;
    else if (e.type === 'lineup' && e.prevLines) lines = e.prevLines;
  }
  for (const ev of match.events) {
    if (ev.type === 'formation' && pos && pos[ev.playerId]) {
      lines = ev.lines;
      slots = moveSlot(slots, ev.playerId, ev.from, ev.to, ev.lines, ev.at);
      pos = { ...pos, [ev.playerId]: ev.to };
      if (cards.length) cards[cards.length - 1] = { ...cards[cards.length - 1], slots, pos, lines };
      continue;
    }
    if (ev.type === 'keeper' && pos) {
      const s = { pos, bench, slots, keeper };
      applyKeeperChange(s, ev);
      ({ pos, bench, slots, keeper } = s);
      if (cards.length) cards[cards.length - 1] = { ...cards[cards.length - 1], slots, pos, bench, keeper };
      continue;
    }
    if (ev.type === 'lineup') {
      if (ev.lines) lines = ev.lines;
      slots = ev.slots ? { ...ev.slots } : makeSlots(ev.pos, lines, players);
      pos = { ...ev.pos }; bench = ev.bench.slice();
      cards.push({ kind: 'lineup', t: ev.t, period: ev.period, slots, pos, bench, keeper, lines, past: true });
    } else if (ev.type === 'swap' && slots) {
      slots = slotSwap(slots, ev.out, ev.in, ev.shift);
      const np = { ...pos }; delete np[ev.out];
      if (ev.shift && ev.shift.id in np) { np[ev.in] = np[ev.shift.id]; np[ev.shift.id] = ev.shift.to; } else np[ev.in] = pos[ev.out];
      pos = np; bench = bench.filter((x) => x !== ev.in).concat([ev.out]);
      const prev = cards[cards.length - 1];
      if (ev.g && prev && prev.kind === 'swap' && prev.g === ev.g) {
        cards[cards.length - 1] = { ...prev, outs: prev.outs.concat([ev.out]), ins: prev.ins.concat([ev.in]), pairs: prev.pairs.concat([{ out: ev.out, in: ev.in, shift: ev.shift || null }]), shift: prev.shift || ev.shift, slots, pos, bench };
      } else cards.push({ kind: 'swap', t: ev.t, out: ev.out, in: ev.in, outs: [ev.out], ins: [ev.in], pairs: [{ out: ev.out, in: ev.in, shift: ev.shift || null }], g: ev.g || null, shift: ev.shift, slots, pos, bench, keeper, lines, past: true });
    } else if (ev.type === 'join' && bench) {
      bench = bench.concat([ev.playerId]);
    } else if (ev.type === 'move' && pos && pos[ev.a] && pos[ev.b]) {
      pos = { ...pos, [ev.a]: pos[ev.b], [ev.b]: pos[ev.a] };
      const sa = slotOf(slots, ev.a), sb = slotOf(slots, ev.b);
      slots = { ...slots, [sa]: ev.b, [sb]: ev.a };
      if (cards.length) cards[cards.length - 1] = { ...cards[cards.length - 1], slots, pos };
    }
  }
  const nowIndex = cards.length - 1;
  if (!match.finished) {
    for (const s of (match.plan ? match.plan.steps : [])) {
      if (s.type === 'lineup') {
        slots = makeSlots(s.pos, lines, players);
        pos = { ...s.pos }; bench = s.bench.slice();
        cards.push({ kind: 'lineup', t: s.t, period: s.period, slots, pos, bench, keeper, lines, past: false });
      } else {
        slots = slotSwap(slots, s.out, s.in, s.shift);
        pos = { ...s.pos }; bench = bench.filter((x) => x !== s.in).concat([s.out]);
        const prev = cards[cards.length - 1];
        if (prev && !prev.past && prev.kind === 'swap' && prev.t === s.t) {
          cards[cards.length - 1] = { ...prev, outs: prev.outs.concat([s.out]), ins: prev.ins.concat([s.in]), pairs: prev.pairs.concat([{ out: s.out, in: s.in, shift: s.shift || null }]), shift: prev.shift || s.shift, slots, pos, bench, pinned: prev.pinned || !!s.pinned };
        } else cards.push({ kind: 'swap', t: s.t, out: s.out, in: s.in, outs: [s.out], ins: [s.in], pairs: [{ out: s.out, in: s.in, shift: s.shift || null }], shift: s.shift, slots, pos, bench, keeper, lines, past: false, pinned: !!s.pinned });
      }
    }
  }
  return { cards, nowIndex };
}
