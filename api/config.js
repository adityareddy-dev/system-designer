// Service settings from the environment (API.md lists every variable). Refuses unsafe combinations instead of guessing.
import { randomBytes } from 'node:crypto';

export const SITE = 'https://systemdesigner.io';
export const DEV_SITES = ['http://localhost:8765', 'http://127.0.0.1:8765'];
export const GITHUB_CALLBACK = 'https://api.systemdesigner.io/auth/github/callback';

const flag = (v) => v === '1' || v === 'true';
const TEST_ENVS = new Set(['development', 'test']);

export function loadConfig(env = process.env) {
  const errors = [];
  const warnings = [];
  // The local origins and the test provider are opt-in for a machine that says exactly what it is. Any other NODE_ENV,
  // empty or misspelt ('prod', 'Production', 'production '), counts as production and refuses them.
  const testing = TEST_ENVS.has(env.NODE_ENV);
  const production = !testing;
  const dev = flag(env.DEV);
  const fake = flag(env.AUTH_FAKE);
  const host = (env.HOST || '127.0.0.1').trim();
  const port = Number(env.PORT || 8791);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('PORT must be a port number.');
  const replayWorkers = Number(env.REPLAY_WORKERS || 2);
  if (!Number.isInteger(replayWorkers) || replayWorkers < 1 || replayWorkers > 8) errors.push('REPLAY_WORKERS must be a whole number from 1 to 8.');
  if (dev && !testing) errors.push('DEV=1 is refused unless NODE_ENV is exactly development or test.');
  if (fake && (!testing || host !== '127.0.0.1')) errors.push('AUTH_FAKE=1 is refused unless NODE_ENV is exactly development or test and the service listens on 127.0.0.1.');

  let sessionSecret = env.SESSION_SECRET || '';
  if (sessionSecret.length < 32) {
    if (dev) {
      sessionSecret = randomBytes(32).toString('hex');
      warnings.push('SESSION_SECRET is not set: using a throwaway one, so sessions end when the process stops.');
    } else errors.push('SESSION_SECRET must be at least 32 characters.');
  }

  const googleClientId = (env.GOOGLE_CLIENT_ID || '').trim();
  if (googleClientId && !/^[0-9]{3,40}-[a-z0-9]{8,64}\.apps\.googleusercontent\.com$/.test(googleClientId)) errors.push('GOOGLE_CLIENT_ID does not look like a Google web client id.');
  const githubClientId = (env.GITHUB_CLIENT_ID || '').trim();
  const githubClientSecret = (env.GITHUB_CLIENT_SECRET || '').trim();
  if (githubClientId && !/^[A-Za-z0-9._-]{8,64}$/.test(githubClientId)) errors.push('GITHUB_CLIENT_ID does not look like a GitHub OAuth client id.');
  if (githubClientSecret && !/^[A-Za-z0-9._-]{20,128}$/.test(githubClientSecret)) errors.push('GITHUB_CLIENT_SECRET does not look like a GitHub OAuth client secret.');
  if (!!githubClientId !== !!githubClientSecret) warnings.push('GitHub sign-in is off until both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set.');

  return {
    errors,
    warnings,
    config: {
      production, dev, fake, host, port, replayWorkers,
      klaviyoKeyFile: env.KLAVIYO_KEY_FILE || '',
      dbPath: env.DB_PATH || new URL('./data/systemdesigner.db', import.meta.url).pathname,
      sessionSecret,
      sites: dev ? [SITE, ...DEV_SITES] : [SITE],
      google: { clientId: googleClientId },
      github: { clientId: githubClientId, clientSecret: githubClientSecret, enabled: !!(githubClientId && githubClientSecret), redirectUri: GITHUB_CALLBACK },
    },
  };
}
