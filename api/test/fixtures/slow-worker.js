// Stand-in scorer for the replayer tests: "work:<ms>" keeps the thread busy that long, "hang" never answers.
import { parentPort } from 'node:worker_threads';

parentPort.postMessage({ ready: true });

parentPort.on('message', ({ id, payload }) => {
  if (payload === 'hang') { for (;;) { /* stuck, like a runaway replay */ } }
  const ms = Number(String(payload).split(':')[1]) || 0;
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy, like a real replay */ }
  parentPort.postMessage({ id, ok: true, result: { payload, at: Date.now() } });
});
