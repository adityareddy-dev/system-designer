// Worker thread that replays submitted designs, so a long simulated day never blocks the service's requests.
import { parentPort } from 'node:worker_threads';
import { replayPayload, loadGame } from './replay-core.js';

parentPort.on('message', async ({ id, payload }) => {
  try {
    parentPort.postMessage({ id, ok: true, result: await replayPayload(payload) });
  } catch (e) {
    parentPort.postMessage({ id, ok: false, code: e?.code || 'replay-failed', message: String(e?.message || 'replay failed').slice(0, 200) });
  }
});

loadGame().then(() => parentPort.postMessage({ ready: true }), () => parentPort.postMessage({ ready: false }));
