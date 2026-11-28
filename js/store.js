// Opslag op de telefoon zelf (localStorage). Stap 2 vervangt dit door Firebase met offline-sync.
import { useEffect, useState } from '../vendor/preact-htm.js';

const KEY = 'spabo-coach-v1';
const listeners = new Set();

export const uid = () => Math.random().toString(36).slice(2, 10);

export function defaultRules() {
  return {
    evenOften: true,
    equalTime: true,
    marge: 5,
    keeperCounts: false,
    priority: 'eerlijk',
    autoStand: true,
    standAchter: 'verdedigen',
    standGelijk: 'balans',
    standVoor: 'balans',
    newLineupAtBreak: true,
    maxBenchOn: true,
    maxBench: 10,
    turnsPerPeriod: 0,
    perMoment: 1,
    minInterval: 2,
    profile: 'balans'
  };
}

function samplePlayers() {
  const base = [
    [70, ['A', 'M']], [90, ['M', 'V']], [70, ['V', 'M']], [75, ['M', 'A']], [30, ['A']],
    [50, ['A', 'V']], [35, ['A', 'V']], [50, ['V']], [30, ['V', 'A']]
  ];
  return base.map(([kracht, prefs], i) => ({
    id: uid(),
    name: 'Speler ' + (i + 1),
    nick: 'Speler ' + (i + 1),
    kracht,
    prefs,
    strengths: [],
    active: true
  }));
}

export function newTeam(name = 'Mijn team', withSamples = true) {
  return {
    id: uid(),
    name,
    short: withSamples ? 'SB' : '',
    type: 'veld',
    keeper: true,
    formation: '2-1-2',
    lines: { A: 2, M: 1, V: 2 },
    periods: 2,
    periodMin: 25,
    rules: defaultRules(),
    schedule: [],
    players: withSamples ? samplePlayers() : []
  };
}

// Demoteam om de app mee uit te proberen: voornamen uit de Oranje-selecties, met hun plek op het veld.
// De kracht verschilt alleen zodat Autopilot iets te verdelen heeft; het zegt niets over de echte spelers.
// Altijd een van de 9 niveaus (stappen van 12,5), net als met de schuif: 62,5 Vaste Waarde, 75 Bepalende Speler,
// 87,5 Motor van het Team, 100 Draagt Het Hele Team.
const DEMO_PLAYERS = [
  ['pirmin', 'Pirmin', 75, 'K', ['K', 'A']],
  ['lisa', 'Lisa', 75, 'A', ['A', 'M']],
  ['jip', 'Jip', 87.5, 'A', ['A', 'M']],
  ['pien', 'Pien', 62.5, 'M', ['M', 'A']],
  ['yibbi', 'Yibbi', 87.5, 'M', ['M', 'A']],
  ['jorrit', 'Jorrit', 100, 'M', ['M', 'V']],
  ['guusje', 'Guusje', 62.5, 'V', ['V', 'M']],
  ['duco', 'Duco', 87.5, 'V', ['V']],
  ['thierry', 'Thierry', 75, 'V', ['V', 'M']]
];
// demoteams uit v0.33.0 hadden krachtwaarden tussen de niveaus in: rechtzetten
function fixDemo(s) {
  for (const t of s.teams) {
    if (!t.demo) continue;
    for (const p of t.players) {
      const d = DEMO_PLAYERS.find((x) => 'nl-' + x[0] === p.id);
      if (d && p.kracht % 12.5 !== 0) p.kracht = d[2];
    }
  }
  return s;
}
export const DEMO_NAME = 'Demoteam Oranje';

export function demoTeam(id) {
  const t = newTeam(DEMO_NAME, false);
  if (id) t.id = id;
  t.demo = true;
  t.short = 'NL';
  t.players = DEMO_PLAYERS.map(([k, name, kracht, main, prefs]) => ({ id: 'nl-' + k, name, nick: name, kracht, main, flex: true, prefs, strengths: [], active: true }));
  return t;
}

// team weghalen met zijn wedstrijden (in een update-draft)
export function dropTeam(d, id) {
  d.matches = d.matches.filter((m) => m.teamId !== id);
  d.teams = d.teams.filter((t) => t.id !== id);
  if (!d.teams.some((t) => t.id === d.activeTeamId)) d.activeTeamId = (d.teams.find((t) => !t.demo) || d.teams[0]).id;
  if (d.currentMatchId && !d.matches.some((m) => m.id === d.currentMatchId)) d.currentMatchId = null;
}

// demoteam terug naar het begin: zelfde team, verse spelers en instellingen, oefenwedstrijden weg
export function resetDemo(d, id) {
  const i = d.teams.findIndex((t) => t.id === id);
  if (i === -1) return;
  d.matches = d.matches.filter((m) => m.teamId !== id);
  if (d.currentMatchId && !d.matches.some((m) => m.id === d.currentMatchId)) d.currentMatchId = null;
  d.teams[i] = demoTeam(id);
}

export function addDemo(d) {
  const have = d.teams.find((t) => t.demo);
  if (have) { d.activeTeamId = have.id; return; }
  const t = demoTeam();
  d.teams.push(t);
  d.activeTeamId = t.id;
}

function freshState() {
  const team = demoTeam();
  return { version: 1, teams: [team], activeTeamId: team.id, matches: [], currentMatchId: null, pinHash: null, unlockedUntil: 0 };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 1 && Array.isArray(s.teams) && s.teams.length) return fixDemo(s);
    }
  } catch (e) { /* lege of kapotte opslag: begin opnieuw */ }
  return freshState();
}

let state = load();

// Opslaan gebeurt net na de tik (samengevoegd), zodat tikken niet hoeft te wachten op de opslag.
// Bij wegklikken of vergrendelen wordt er meteen opgeslagen.
let saveTimer = 0;
function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* opslag vol of geblokkeerd */ }
}
function persist() {
  if (typeof window === 'undefined') return;
  if (!saveTimer) saveTimer = setTimeout(writeNow, 120);
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', writeNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') writeNow(); });
}

export function getState() { return state; }

export function update(fn) {
  const draft = JSON.parse(JSON.stringify(state));
  const res = fn(draft);
  state = res || draft;
  persist();
  listeners.forEach((l) => l(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useStore() {
  const [s, set] = useState(state);
  // na het aanmelden de laatste stand overnemen: een kind kan in zijn effect al iets hebben aangepast
  useEffect(() => { const off = subscribe(set); set(state); return off; }, []);
  return s;
}

export function activeTeam(s = state) {
  return s.teams.find((t) => t.id === s.activeTeamId) || s.teams[0];
}

export function currentMatch(s = state) {
  return s.matches.find((m) => m.id === s.currentMatchId) || null;
}

export function exportData() {
  return JSON.stringify(state, null, 2);
}

export function importData(json) {
  const s = JSON.parse(json);
  if (!s || s.version !== 1 || !Array.isArray(s.teams)) throw new Error('Dit bestand herken ik niet.');
  state = s;
  writeNow();
  listeners.forEach((l) => l(state));
}

export async function hashPin(pin) {
  const data = new TextEncoder().encode('spabo:' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
