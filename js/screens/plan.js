import { html, useMemo, useState } from '../../vendor/preact-htm.js';
import { currentMatch } from '../store.js';
import * as M from '../match.js';
import { PlanView } from '../planview.js';
import { PlanSummary } from './home.js';
import { mutate, SwapSheet } from './live.js';
import { Icon, toast, useNow } from '../ui.js';

export function Plan({ state }) {
  const match = currentMatch(state);
  if (!match) return html`<main class="screen"><div class="empty"><p>Er is geen wedstrijd klaargezet.</p><a class="btn primary" href="#/">Wedstrijd klaarzetten</a></div></main>`;
  const team = state.teams.find((t) => t.id === match.teamId);
  return html`<${PlanInner} match=${match} team=${team} />`;
}

function PlanInner({ match, team }) {
  const nowIndex = useMemo(() => M.timeline(match, team).nowIndex, [match, team]);
  const editable = !match.started;
  const live = match.started && !match.finished;
  const now = useNow(live ? 1000 : 60000);
  const T = live ? M.gameTime(match, team, now) : null;
  const [swap, setSwap] = useState(null);
  const next = live ? M.nextSwap(match, team) : null;
  const openSwap = next && !M.lineupPending(match, team) ? () => setSwap({ out: next.out, in: next.in, planned: true }) : null;
  return html`<main class="screen">
    <div class="topbar">
      <a class="iconbtn" href="#/" aria-label="Terug"><${Icon} name="back" /></a>
      <span class="h2 grow" style="text-align:center">Wedstrijdplan</span>
      <span style="width:44px"></span>
    </div>
    <section class="card">
      ${match.plan && html`<${PlanSummary} plan=${match.plan} team=${team} />`}
      <${PlanView} match=${match} team=${team} initialIndex=${Math.max(0, nowIndex)} nowIndex=${match.started ? nowIndex : -1}
        liveT=${T} onSwapNow=${openSwap}
        editable=${editable} onSwap=${(a, b) => { mutate((m, t) => M.swapInStartLineup(m, t, a, b)); toast(`${M.nickOf(team, a)} ↔ ${M.nickOf(team, b)} · plan opnieuw berekend`); }} />
    </section>
    ${swap && html`<${SwapSheet} match=${match} team=${team} d=${M.derive(match, team, T)} init=${swap} counts=${M.swapCounts(match)} onClose=${() => setSwap(null)} />`}
  </main>`;
}
