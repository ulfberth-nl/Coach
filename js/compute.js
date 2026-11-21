// Zwaar rekenwerk in een aparte rekendraad (Web Worker), zodat tikken, schuiven en slepen altijd soepel blijven.
// Kan het toestel geen module-worker starten, dan rekent de app gewoon zelf (iets later, in een los moment).
let w; // undefined = nog niet geprobeerd, null = niet beschikbaar
let seq = 0;
const waiting = new Map();

function local(type, args) {
  return new Promise((resolve, reject) => {
    setTimeout(() => import('./worker-core.js').then((c) => resolve(c.run(type, args))).catch(reject), 0);
  });
}
function giveUp() {
  w = null;
  const list = [...waiting.values()];
  waiting.clear();
  for (const p of list) local(p.type, p.args).then(p.resolve, p.reject);
}
function worker() {
  if (w !== undefined) return w;
  try {
    w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const p = waiting.get(e.data.id);
      if (!p) return;
      waiting.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.result);
    };
    w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); giveUp(); };
  } catch (e) {
    w = null;
  }
  return w;
}

export function compute(type, args) {
  const wk = worker();
  if (!wk) return local(type, args);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject, type, args });
    try { wk.postMessage({ id, type, args }); } catch (e) { waiting.delete(id); local(type, args).then(resolve, reject); }
  });
}
