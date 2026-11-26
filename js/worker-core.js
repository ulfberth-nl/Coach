// Het zware rekenwerk (wedstrijdplannen, wisselprofielen). Draait in een Web Worker (js/worker.js),
// of als dat niet kan gewoon op de hoofdthread.
import { tune, statsOf, enough } from './profiles.js';
import { createMatch, applyBase, isOwn } from './match.js';

export function run(type, a) {
  if (type === 'tune') return tune(a.team, a.key, a.present, a.keeperId);
  if (type === 'preview') {
    if (!enough(a.team, a.present, a.keeperId)) return null;
    return statsOf(createMatch(a.team, { present: a.present, keeperId: a.keeperId, priority: a.team.rules.priority }), a.team);
  }
  if (type === 'concept') {
    const t = a.tuneKey ? tune(a.team, a.tuneKey, a.opts.present, a.opts.keeperId) : null;
    const rules = t ? t.rules : null;
    const match = createMatch(a.team, { ...a.opts, rules });
    // gekozen basisopstelling opnieuw toepassen (bij zelf plannen is het bord de baas)
    const b = a.opts.baseId && (a.team.bases || []).find((x) => x.id === a.opts.baseId);
    if (b && !isOwn(match, a.team)) applyBase(match, a.team, b);
    return { rules, tuned: t, match };
  }
  throw new Error('Onbekende opdracht: ' + type);
}
