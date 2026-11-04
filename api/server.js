// Entry point of the System Designer sign-in service (https://api.systemdesigner.io). Settings come from the environment; see API.md.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { createGoogleVerifier } from './google.js';
import { createGithub } from './github.js';
import { createLimiter } from './ratelimit.js';
import { createReplayer } from './replay.js';
import { loadGame } from './replay-core.js';

const log = (msg) => process.stdout.write(`${new Date().toISOString()} ${msg}\n`);

export async function start(env = process.env) {
  const { config, errors, warnings } = loadConfig(env);
  if (errors.length) {
    for (const e of errors) process.stderr.write(`config: ${e}\n`);
    process.exitCode = 1;
    return null;
  }
  for (const w of warnings) log(`note: ${w}`);

  const db = openDb(config.dbPath);
  const game = await loadGame();
  const limiter = createLimiter();
  const replayer = createReplayer({ workers: config.replayWorkers });
  const app = createApp({
    config, db, game, limiter, replayer, log,
    google: createGoogleVerifier({ clientId: config.google.clientId }),
    github: createGithub(config.github),
  });

  const server = http.createServer({ requestTimeout: 30_000, headersTimeout: 15_000, maxHeaderSize: 16 * 1024 }, app);
  server.keepAliveTimeout = 30_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolve); });

  // The test-only provider never runs on a public address, whatever the settings said.
  const bound = server.address();
  if (config.fake && bound.address !== '127.0.0.1') {
    process.stderr.write('config: AUTH_FAKE=1 is refused: the service is not listening on 127.0.0.1.\n');
    server.close();
    process.exitCode = 1;
    return null;
  }

  const sweep = setInterval(() => { try { db.expireSessions(Date.now()); limiter.sweep(); } catch { /* next round */ } }, 3600_000);
  sweep.unref();
  db.expireSessions(Date.now());

  const on = (x) => (x ? 'on' : 'off');
  log(`listening on ${bound.address}:${bound.port}; google ${on(config.google.clientId)}, github ${on(config.github.enabled)}, fake ${on(config.fake)}, dev ${on(config.dev)}`);

  let closing = false;
  async function stop() {
    if (closing) return;
    closing = true;
    clearInterval(sweep);
    await new Promise((r) => server.close(r));
    await replayer.close();
    db.close();
  }
  return { server, config, stop };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const s = await start();
  if (s) {
    const bye = () => { s.stop().then(() => process.exit(0), () => process.exit(1)); };
    process.on('SIGTERM', bye);
    process.on('SIGINT', bye);
  }
}
