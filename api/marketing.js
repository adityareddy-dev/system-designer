import { readFile } from 'node:fs/promises';

// Jobs stay in SQLite until the email service accepts them. Never log a key, address or response body.
export function createMarketingSync({ db, keyFile, fetchImpl = fetch, now = Date.now, log = () => {} }) {
  let running = null;
  async function drain(force) {
    const jobs = db.marketingJobs(now(), force);
    for (const job of jobs) {
      try {
        const key = (await readFile(keyFile, 'utf8')).trim();
        if (!key || /\s/.test(key)) throw new Error('key unavailable');
        const action = job.subscribed ? 'create' : 'delete';
        const attributes = { email: job.email };
        if (job.subscribed) attributes.subscriptions = { email: { marketing: { consent: 'SUBSCRIBED' } } };
        const res = await fetchImpl(`https://a.klaviyo.com/api/profile-subscription-bulk-${action}-jobs/`, {
          method: 'POST', signal: AbortSignal.timeout(8000),
          headers: { Authorization: `Klaviyo-API-Key ${key}`, revision: '2026-10-15', 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ data: {
            type: `profile-subscription-bulk-${action}-job`,
            attributes: { profiles: { data: [{ type: 'profile', attributes }] } },
            relationships: { list: { data: { type: 'list', id: 'TBaBvT' } } },
          } }),
        });
        if (!res.ok) throw new Error('request failed');
        db.finishMarketingJob(job.email, job.version);
      } catch {
        db.failMarketingJob(job.email, job.version, now());
        log('Marketing email sync failed. It will retry.');
      }
    }
  }
  return {
    flush(force = false) {
      if (!keyFile) return Promise.resolve();
      if (running) return running;
      running = drain(force).catch(() => { log('Marketing email sync will retry.'); }).finally(() => { running = null; });
      return running;
    },
  };
}
