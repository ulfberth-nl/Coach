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
    minInterval: 2
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

export function newTeam(name = 'JO9-Wit', withSamples = true) {
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

function freshState() {
  const team = newTeam();
  return { version: 1, teams: [team], activeTeamId: team.id, matches: [], currentMatchId: null, pinHash: null, unlockedUntil: 0 };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 1 && Array.isArray(s.teams) && s.teams.length) return s;
    }
  } catch (e) { /* lege of kapotte opslag: begin opnieuw */ }
  return freshState();
}

let state = load();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* opslag vol of geblokkeerd */ }
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
  persist();
  listeners.forEach((l) => l(state));
}

export async function hashPin(pin) {
  const data = new TextEncoder().encode('spabo:' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
