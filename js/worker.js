// Rekendraad: houdt de bediening soepel terwijl de app plannen en profielen doorrekent.
import { run } from './worker-core.js';

self.onmessage = (e) => {
  const { id, type, args } = e.data;
  try {
    self.postMessage({ id, result: run(type, args) });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
