import { html, render, useEffect, useState } from '../vendor/preact-htm.js';
import { useStore } from './store.js';
import { ToastHost, FlashHost, Icon, toast } from './ui.js';
import { Home } from './screens/home.js';
import { Live } from './screens/live.js';
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

function TabBar({ current }) {
  const tab = (href, key, label, icon) => html`<a href=${href} aria-current=${current === key ? 'page' : undefined}><${Icon} name=${icon} /><span>${label}</span></a>`;
  return html`<nav class="tabbar" aria-label="Menu">
    ${tab('#/', 'wedstrijd', 'Wedstrijd', 'field')}
    ${tab('#/seizoen', 'seizoen', 'Seizoen', 'chart')}
    ${tab('#/team', 'team', 'Team', 'team')}
  </nav>`;
}

function App() {
  const state = useStore();
  const [r0, r1] = useRoute();
  let screen, tab = null;
  switch (r0) {
    case 'live': screen = html`<${Live} state=${state} />`; break;
    case 'plan': screen = html`<${Plan} state=${state} />`; break;
    case 'afloop': screen = html`<${Afloop} state=${state} matchId=${r1} />`; break;
    case 'seizoen': screen = html`<${Seizoen} state=${state} />`; tab = 'seizoen'; break;
    case 'team': screen = html`<${Team} state=${state} />`; tab = 'team'; break;
    case 'spelers': screen = html`<${Spelers} state=${state} />`; break;
    default: screen = html`<${Home} state=${state} key=${state.activeTeamId} />`; tab = 'wedstrijd';
  }
  return html`
    ${screen}
    ${tab && html`<${TabBar} current=${tab} />`}
    <${ToastHost} />
    <${FlashHost} />
  `;
}

render(html`<${App} />`, document.getElementById('app'));

// offline werken + nieuwe versie melden
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('Nieuwe versie klaar', { label: 'Vernieuwen', run: () => location.reload() });
  });
}
