import { html } from '../../vendor/preact-htm.js';
import { matchEnd, mins } from '../match.js';

export function keeperCounts(state, team) {
  const counts = {};
  for (const m of state.matches) if (m.teamId === team.id && m.keeperId && m.started) counts[m.keeperId] = (counts[m.keeperId] || 0) + 1;
  return counts;
}

export function suggestKeeper(team, present, counts) {
  const pool = team.players.filter((p) => present.indexOf(p.id) !== -1);
  if (!pool.length) return null;
  const byCount = (a, b) => (counts[a.id] || 0) - (counts[b.id] || 0) || a.kracht - b.kracht;
  const dominant = pool.filter((p) => p.main === 'K');
  if (dominant.length) return dominant.slice().sort(byCount)[0].id;
  const wants = pool.filter((p) => (p.prefs || []).indexOf('K') !== -1);
  return (wants.length ? wants : pool).slice().sort(byCount)[0].id;
}

export const WHY_TEXT = { turns: 'het aantal wissels per kind', even: 'even vaak wisselen', time: 'de marge in speeltijd', bench: 'maximaal op de bank' };

export function PlanSummary({ plan, team }) {
  const groups = {};
  for (const s of plan.steps) if (s.type === 'swap') groups[s.t] = (groups[s.t] || 0) + 1;
  const swaps = Object.keys(groups).length;
  const per = Math.max(1, ...Object.values(groups));
  const every = swaps ? Math.round((matchEnd(team) / (swaps + team.periods)) / 30) / 2 : 0;
  const f = plan.fair;
  return html`<div class="col" style="gap:4px">
    <span class="sub" style="color:var(--ink);font-weight:800">${swaps ? `${swaps} ${per > 1 ? 'wisselmomenten' : 'wissels'}, telkens ${per > 1 ? 'tot ' + per : 1} · ongeveer elke ${String(every).replace('.', ',')} min` : 'Geen wissels nodig'}</span>
    ${swaps > 0 && html`<span class="sub">Speeltijd ${mins(f.minPlayed)}–${mins(f.maxPlayed)} min per kind · ${f.minTurns === f.maxTurns ? `iedereen ${f.minTurns}× gewisseld` : `${f.minTurns}–${f.maxTurns}× gewisseld`}</span>`}
    ${!plan.ok && html`<span class="small" style="color:var(--ink);background:var(--orange-tint);padding:6px 10px;border-radius:10px">Niet alles past tegelijk (${(plan.why || []).map((w) => WHY_TEXT[w]).join(', ')}). Dit is de eerlijkste verdeling; aanpassen kan bij Team → Wisselen.</span>`}
  </div>`;
}

