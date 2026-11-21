// Optimistisch bijwerken: een instelling verandert meteen op het scherm; het wedstrijdplan rekent de app
// daarna rustig uit in de rekendraad (js/compute.js) en zet het pas neer als je even stopt met tikken.
import { getState, update } from './store.js';
import { replan } from './match.js';
import { PROFILES, profileOf, rememberTune } from './profiles.js';
import { compute } from './compute.js';
import { keeperCounts, suggestKeeper } from './screens/home.js';

let timer = 0;
let gen = 0;
let force = false;

// Herbereken de huidige wedstrijd (klaargezet of lopend) op de achtergrond.
// force: altijd opnieuw neerzetten (de teaminstellingen zijn veranderd); anders alleen als de regels anders uitkomen.
export function scheduleRefresh(opts = {}) {
  if (opts.force) force = true;
  clearTimeout(timer);
  gen++;
  timer = setTimeout(run, opts.delay != null ? opts.delay : 380);
}

const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
// komen de regels die echt gelden (team + profiel) op hetzelfde uit?
const TUNED = ['marge', 'equalTime', 'evenOften', 'maxBenchOn', 'maxBench', 'minInterval', 'turnsPerPeriod', 'priority', 'strongBias'];
const sameEff = (team, a, b) => TUNED.every((k) => {
  const va = a && k in a ? a[k] : team.rules[k];
  const vb = b && k in b ? b[k] : team.rules[k];
  return va === vb;
});

async function run() {
  const my = ++gen;
  const hard = force;
  force = false;
  const s = getState();
  const m = s.matches.find((x) => x.id === s.currentMatchId);
  if (!m || m.finished) return;
  const t = s.teams.find((x) => x.id === m.teamId);
  if (!t) return;
  const key = profileOf(t.rules);
  const tuneKey = PROFILES[key] ? key : null;

  if (m.started) {
    // lopende wedstrijd: regels voor deze selectie, dan herplannen vanaf nu
    let rules = null;
    if (tuneKey) {
      try { rules = await compute('tune', { team: t, key: tuneKey, present: m.present, keeperId: m.keeperId }); } catch (e) { return; }
      if (my !== gen) return;
      rememberTune(t, tuneKey, m.present, m.keeperId, rules);
      rules = rules ? rules.rules : null;
    }
    if (!hard && sameEff(t, rules, m.rules)) return;
    update((d) => {
      const mm = d.matches.find((x) => x.id === m.id);
      const tt = mm && d.teams.find((x) => x.id === mm.teamId);
      if (!mm || mm.finished || !tt) return;
      mm.rules = rules;
      try { replan(mm, tt); } catch (e) { /* volgt bij de volgende actie */ }
    });
    return;
  }

  // klaargezette wedstrijd: helemaal in de rekendraad opnieuw opbouwen
  let keeperId = m.keeperId;
  if (!t.keeper) keeperId = null;
  else if (m.present.indexOf(keeperId) === -1) keeperId = suggestKeeper(t, m.present, keeperCounts(s, t));
  const opts = { present: m.present, keeperId, priority: m.priority, opponent: m.opponent, date: m.date, lines: m.lines || null, pins: m.pins, fairness: m.fairness, standMode: m.standMode, manualStand: m.manualStand, planMode: m.planMode, periodLineups: m.periodLineups, ownStash: m.ownStash, planStyle: m.planStyle, planRhythm: m.planRhythm, ownSteps: m.ownSteps };
  let res;
  try { res = await compute('concept', { team: t, tuneKey, opts }); } catch (e) { return; }
  if (my !== gen) return;
  if (tuneKey) rememberTune(t, tuneKey, m.present, keeperId, res.tuned);
  if (!hard && sameEff(t, res.rules, m.rules)) return;
  update((d) => {
    const i = d.matches.findIndex((x) => x.id === m.id);
    if (i === -1) return;
    const cur = d.matches[i];
    // intussen iets veranderd (bijv. startopstelling gesleept)? dan niet overschrijven
    if (cur.started || cur.present.join() !== m.present.join() || cur.priority !== m.priority || !same(cur.lines, m.lines) || !same(cur.events, m.events) ||
      !same(cur.pins, m.pins) || cur.fairness !== m.fairness || cur.standMode !== m.standMode || cur.manualStand !== m.manualStand ||
      cur.planMode !== m.planMode || !same(cur.periodLineups, m.periodLineups) || !same(cur.ownStash, m.ownStash) || cur.planStyle !== m.planStyle || cur.planRhythm !== m.planRhythm || !same(cur.ownSteps, m.ownSteps)) return;
    const n = res.match;
    n.id = cur.id;
    n.setup = cur.setup || { present: false, keeper: false, opponent: false };
    for (const k of ['scheduleId', 'time', 'meet', 'field', 'home', 'season', 'opponent', 'date']) if (cur[k] !== undefined) n[k] = cur[k];
    d.matches[i] = n;
  });
}
