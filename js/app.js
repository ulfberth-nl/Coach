import { html, render, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import { useStore } from './store.js';
import { installPress, viewTransition, canTransition } from './motion.js';
import { ToastHost, FlashHost, Icon, toast } from './ui.js';
import { Wedstrijd } from './screens/wedstrijd.js';
import { Plan } from './screens/plan.js';
import { Afloop } from './screens/afloop.js';
import { Seizoen } from './screens/seizoen.js';
import { Team } from './screens/team.js';
import { Spelers } from './screens/spelers.js';

// Soort overgang: tussen tabbladen schuift het scherm in de richting van het tabblad;
// dieper gaan (Plan, Afloop, Spelers) schuift erin als een iOS-push, terug schuift het weer weg.
const TABS = { '': 0, seizoen: 1, team: 2 };
function kindOf(a, b) {
  const x = a[0] || '', y = b[0] || '';
  if (a.join('/') === b.join('/')) return null;
  if (x === y) return 'fade';
  const xt = x in TABS, yt = y in TABS;
  if (xt && yt) return TABS[y] > TABS[x] ? 'tab-r' : 'tab-l';
  if (xt && !yt) return 'push';
  if (!xt && yt) return 'pop';
  return 'push';
}
// gedeeld element: de uitslag groeit uit tot het overzicht van de wedstrijd (en krimpt weer terug)
const hero = (id) => (id ? document.querySelector('[data-hero="m-' + id + '"]') : null);

function useRoute() {
  const read = () => (location.hash.replace(/^#/, '') || '/').split('/').filter(Boolean);
  const [route, setRoute] = useState(read());
  const [viaVT, setViaVT] = useState(false);
  const cur = useRef(route);
  useEffect(() => {
    const on = () => {
      const next = read();
      const prev = cur.current;
      cur.current = next;
      const kind = kindOf(prev, next);
      const vt = !!kind && canTransition();
      const apply = () => { setRoute(next); setViaVT(vt); window.scrollTo(0, 0); };
      if (!vt) { apply(); return; }
      const from = prev[0] === 'afloop' ? prev[1] : null;
      const to = next[0] === 'afloop' ? next[1] : null;
      const src = hero(to);
      if (src) src.style.viewTransitionName = 'hero';
      viewTransition(kind, apply, () => { const back = hero(from); if (back) back.style.viewTransitionName = 'hero'; });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, viaVT];
}

function TabBar({ current, live }) {
  const tab = (href, key, label, icon, isLive) => html`<a href=${href} class=${isLive ? 'live' : ''} aria-current=${current === key ? 'page' : undefined}><${Icon} name=${icon} /><span>${label}</span></a>`;
  const i = ['wedstrijd', 'seizoen', 'team'].indexOf(current);
  return html`<nav class="tabbar" aria-label="Menu" style=${'--i:' + i}>
    <span class="tab-ind" aria-hidden="true"></span>
    ${tab('#/', 'wedstrijd', live && current !== 'wedstrijd' ? 'Live' : 'Wedstrijd', 'field', live && current !== 'wedstrijd')}
    ${tab('#/seizoen', 'seizoen', 'Seizoen', 'chart')}
    ${tab('#/team', 'team', 'Team', 'team')}
  </nav>`;
}

function App() {
  const state = useStore();
  const [[r0, r1], viaVT] = useRoute();
  const cur = state.matches.find((x) => x.id === state.currentMatchId);
  const liveNow = !!(cur && cur.started && !cur.finished);
  let screen, tab = null;
  switch (r0) {
    case 'plan': screen = html`<${Plan} state=${state} />`; break;
    case 'afloop': screen = html`<${Afloop} state=${state} matchId=${r1} />`; break;
    case 'seizoen': screen = html`<${Seizoen} state=${state} />`; tab = 'seizoen'; break;
    case 'team': screen = html`<${Team} state=${state} />`; tab = 'team'; break;
    case 'spelers': screen = html`<${Spelers} state=${state} />`; break;
    // voorbereiden: geen menubalk maar een dock naast de startknop, zodat het veld groter kan
    default: screen = html`<${Wedstrijd} state=${state} />`; tab = liveNow || (cur && !cur.started && !cur.finished) ? null : 'wedstrijd';
  }
  // na een schermovergang geen extra binnenkom-animatie per blok (die zat al in de overgang)
  return html`
    <div class=${'route' + (viaVT ? ' novt' : '')}>${screen}</div>
    ${tab && html`<${TabBar} current=${tab} live=${liveNow} />`}
    <${ToastHost} />
    <${FlashHost} />
  `;
}

installPress();
render(html`<${App} />`, document.getElementById('app'));

// offline werken + nieuwe versie melden
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('Nieuwe versie klaar', { label: 'Vernieuwen', run: () => location.reload() });
  });
}
