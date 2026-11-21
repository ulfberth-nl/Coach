import { html, render, useEffect, useState } from '../vendor/preact-htm.js';
import { useStore } from './store.js';
import { installPress } from './motion.js';
import { ToastHost, FlashHost, Icon, toast } from './ui.js';
import { Wedstrijd } from './screens/wedstrijd.js';
import { Plan } from './screens/plan.js';
import { Afloop } from './screens/afloop.js';
import { Seizoen } from './screens/seizoen.js';
import { Team } from './screens/team.js';
import { Spelers } from './screens/spelers.js';

function useRoute() {
  const read = () => (location.hash.replace(/^#/, '') || '/').split('/').filter(Boolean);
  const [route, setRoute] = useState(read());
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
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
  const [r0, r1] = useRoute();
  const cur = state.matches.find((x) => x.id === state.currentMatchId);
  const liveNow = !!(cur && cur.started && !cur.finished);
  let screen, tab = null;
  switch (r0) {
    case 'plan': screen = html`<${Plan} state=${state} />`; break;
    case 'afloop': screen = html`<${Afloop} state=${state} matchId=${r1} />`; break;
    case 'seizoen': screen = html`<${Seizoen} state=${state} />`; tab = 'seizoen'; break;
    case 'team': screen = html`<${Team} state=${state} />`; tab = 'team'; break;
    case 'spelers': screen = html`<${Spelers} state=${state} />`; break;
    default: screen = html`<${Wedstrijd} state=${state} />`; tab = liveNow ? null : 'wedstrijd';
  }
  return html`
    ${screen}
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
