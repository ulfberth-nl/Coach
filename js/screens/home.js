import { html, useMemo, useState } from '../../vendor/preact-htm.js';
import { update, activeTeam, currentMatch } from '../store.js';
import { createMatch, previewPlan, periodLabel, elapsedInPeriod, fmt, summary, matchEnd } from '../match.js';
import { Seg, go, Icon, Neon, useNow } from '../ui.js';

export function keeperCounts(state, team) {
  const counts = {};
  for (const m of state.matches) if (m.teamId === team.id && m.keeperId && m.started) counts[m.keeperId] = (counts[m.keeperId] || 0) + 1;
  return counts;
}

function suggestKeeper(team, present, counts) {
  const pool = team.players.filter((p) => present.indexOf(p.id) !== -1);
  if (!pool.length) return null;
  const dominant = pool.filter((p) => p.main === 'K');
  if (dominant.length) return dominant.slice().sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0))[0].id;
  const wants = pool.filter((p) => (p.prefs || []).indexOf('K') !== -1);
  const list = (wants.length ? wants : pool).slice().sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0) || a.kracht - b.kracht);
  return list[0].id;
}

function LiveCard({ match, team }) {
  const now = useNow(1000);
  const s = summary(match, team).score;
  const el = elapsedInPeriod(match, now);
  return html`<a class="livecard" href="#/live" aria-label="Naar de wedstrijd die bezig is">
    <${Neon} box><span class="lc">
      <span class="between">
        <span class="row" style="gap:8px;font-weight:900;font-size:13px;letter-spacing:.08em">${match.started ? html`<span class="livedot"></span>LIVE` : 'KLAAR VOOR DE AFTRAP'}</span>
        <span class="row" style="gap:4px;font-weight:800;font-size:14px">Naar wedstrijd <${Icon} name="chev" size=${18} /></span>
      </span>
      <span class="between" style="align-items:flex-end">
        <span class="col" style="gap:0">
          <span class="big" style="font-size:40px;line-height:1">${fmt(el)}</span>
          <span style="font-weight:800">${match.started ? periodLabel(team, match.clock.period) + (match.clock.running ? '' : ' · klok stil') : 'Nog niet begonnen'}</span>
        </span>
        <span class="col" style="gap:0;align-items:flex-end">
          <span class="big bump" key=${s.us + '-' + s.them} style="font-size:40px;line-height:1">${s.us}–${s.them}</span>
          <span style="font-weight:800;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${match.opponent ? 'tegen ' + match.opponent : team.name}</span>
        </span>
      </span>
    </span></${Neon}>
  </a>`;
}

export function Home({ state }) {
  const team = activeTeam(state);
  const running = currentMatch(state);
  const active = team.players.filter((p) => p.active !== false);
  const counts = useMemo(() => keeperCounts(state, team), [state.matches, team.id]);

  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [present, setPresent] = useState(active.map((p) => p.id));
  const [keeperId, setKeeperId] = useState(() => (team.keeper ? suggestKeeper(team, active.map((p) => p.id), counts) : null));
  const [priority, setPriority] = useState(team.rules.priority);
  const [keeperOpen, setKeeperOpen] = useState(false);

  const F = Object.values(team.lines).reduce((a, b) => a + b, 0);
  const presentIds = present.filter((id) => team.players.some((p) => p.id === id));
  const keeper = team.keeper && presentIds.indexOf(keeperId) !== -1 ? keeperId : null;
  const field = presentIds.filter((id) => id !== keeper);
  const tooFew = field.length < F || (team.keeper && !keeper);
  const plan = useMemo(() => (tooFew ? null : previewPlan(team, presentIds, keeper, priority)),
    [team, presentIds.join(','), keeper, priority, tooFew]);
  const swaps = plan ? plan.steps.filter((s) => s.type === 'swap').length : 0;
  const every = swaps ? Math.round((matchEnd(team) / (swaps + team.periods)) / 30) / 2 : 0;

  const toggle = (id) => {
    const next = present.indexOf(id) !== -1 ? present.filter((x) => x !== id) : present.concat([id]);
    setPresent(next);
    if (team.keeper && (id === keeperId || !keeperId) && next.indexOf(keeperId) === -1) setKeeperId(suggestKeeper(team, next, counts));
  };

  const start = () => {
    update((draft) => {
      const t = activeTeam(draft);
      const m = createMatch(t, { opponent: opponent.trim(), date, present: presentIds, keeperId: keeper, priority });
      // een klaargezette maar nooit gestarte wedstrijd vervalt
      draft.matches = draft.matches.filter((x) => x.started || x.id !== draft.currentMatchId);
      draft.matches.push(m);
      draft.currentMatchId = m.id;
    });
    go('/live');
  };

  const lastDone = state.matches.filter((m) => m.teamId === team.id && m.finished).slice(-1)[0];

  return html`<main class="screen with-tabs">
    <div class="topbar">
      <span class="badge">${team.name}</span>
      <span class="small">${new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
    </div>
    <h1 class="h1">Wedstrijd</h1>

    ${running && !running.finished && html`<${LiveCard} match=${running} team=${state.teams.find((t) => t.id === running.teamId) || team} />`}

    <section class="card">
      <span class="h2">Klaarzetten</span>
      <div class="col">
        <label class="label" for="opp">Tegenstander</label>
        <input id="opp" class="input" value=${opponent} placeholder="Bijv. Hurley JO9-3" onInput=${(e) => setOpponent(e.target.value)} />
      </div>
      <div class="col">
        <label class="label" for="date">Datum</label>
        <input id="date" type="date" class="input" value=${date} onInput=${(e) => setDate(e.target.value)} />
      </div>
    </section>

    <section class="card">
      <div class="between"><span class="h2">Wie is er?</span><span class="small">${presentIds.length} van ${active.length}</span></div>
      <div class="wrap">
        ${active.map((p) => html`<button type="button" class="chip" aria-pressed=${present.indexOf(p.id) !== -1 ? 'true' : 'false'} onClick=${() => toggle(p.id)}>${p.nick || p.name}</button>`)}
      </div>
      ${!active.length && html`<p class="small" style="margin:0">Nog geen spelers. Voeg ze toe bij Team → Spelers.</p>`}
    </section>

    ${team.keeper && html`<section class="card" style="gap:0">
      <button type="button" class="between" style="background:none;border:none;padding:0;min-height:44px;width:100%;text-align:left" aria-expanded=${keeperOpen ? 'true' : 'false'} onClick=${() => setKeeperOpen(!keeperOpen)}>
        <span class="col" style="gap:0"><span class="h2">Keeper</span>
          <span class="sub">${keeper ? (team.players.find((p) => p.id === keeper) || {}).nick + ' · ' + (counts[keeper] ? counts[keeper] + '× gekeept' : 'nog niet gekeept') : 'Kies een keeper'}</span></span>
        <span class=${'chev' + (keeperOpen ? ' open' : '')}><${Icon} name="chev" size=${20} /></span>
      </button>
      <div class=${'collapse' + (keeperOpen ? ' open' : '')}><div><div class="col" style="padding-top:10px">
      <div class="wrap">
        ${active.filter((p) => present.indexOf(p.id) !== -1).map((p) => html`<button type="button" class="chip warm" aria-pressed=${keeperId === p.id ? 'true' : 'false'} onClick=${() => setKeeperId(p.id)}>
          ${p.nick || p.name}<span class="small" style="margin-left:6px">${counts[p.id] ? counts[p.id] + '×' : 'nog niet'}</span>
        </button>`)}
      </div>
      <span class="small">Voorstel: wie het minst gekeept heeft${team.players.some((p) => p.main === 'K' || (p.prefs || []).indexOf('K') !== -1) ? ' en graag keept' : ''}.</span>
      </div></div></div>
    </section>`}

    <section class="card">
      <span class="h2">Voorrang deze wedstrijd</span>
      <${Seg} label="Voorrang" value=${priority} onChange=${setPriority} options=${[['eerlijk', 'Eerlijkheid'], ['bezetting', 'Beste bezetting']]} />
      <span class="small">${priority === 'eerlijk' ? 'Speeltijd en wisselbeurten gaan voor; daarbinnen de beste bezetting.' : 'De beste bezetting gaat voor; eerlijkheid zo goed als het kan.'}</span>
    </section>

    <section class="card" style="background:var(--blue-tint)">
      ${tooFew
        ? html`<span class="h2">Te weinig spelers</span><span class="sub">Je hebt ${F} veldspelers nodig${team.keeper ? ' plus een keeper' : ''}.</span>`
        : html`<div class="between"><span class="h2">Wisselschema</span><span class="badge">${field.length} veld · ${field.length - F} bank</span></div>
          <span class="sub">${swaps ? `${swaps} wissels, telkens 1 · ongeveer elke ${String(every).replace('.', ',')} min` : 'Geen wissels nodig'}${team.rules.newLineupAtBreak && team.periods > 1 && swaps ? ' · in de rust een nieuwe opstelling' : ''}</span>
          ${plan && swaps > 0 && html`<span class="sub">Speeltijd per kind ${Math.round(plan.fair.minPlayed / 60)}–${Math.round(plan.fair.maxPlayed / 60)} min · ${plan.fair.minTurns === plan.fair.maxTurns ? `iedereen ${plan.fair.minTurns}× gewisseld` : `${plan.fair.minTurns}–${plan.fair.maxTurns}× gewisseld`}</span>`}
          ${plan && !plan.ok && html`<span class="small" style="color:var(--ink)">Niet alle eerlijkheidsregels passen precies; dit is de eerlijkste verdeling.</span>`}`}
    </section>

    <button type="button" class="btn primary block" disabled=${tooFew} onClick=${start}>Opstelling bekijken</button>
    ${running && !running.finished && html`<span class="small" style="text-align:center">${running.started ? 'De wedstrijd die bezig is blijft bewaard, maar is dan niet meer de huidige.' : 'Dit vervangt de opstelling die klaarstaat.'}</span>`}

    ${lastDone && html`<a class="card" href=${'#/afloop/' + lastDone.id} style="text-decoration:none;color:inherit">
      <div class="between"><span class="sub">Laatste wedstrijd${lastDone.opponent ? ': ' + lastDone.opponent : ''}</span><span class="link">Bekijk <${Icon} name="chev" size=${16} /></span></div>
    </a>`}
  </main>`;
}
