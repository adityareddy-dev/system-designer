// Delayed scorer startup isolates boot time from a job's execution limit.
await new Promise(resolve => setTimeout(resolve, 600));
await import('./slow-worker.js');
