// App-relative URLs resolve from core/ in source and js/ in the release.
const APP_BASE = new URL('../', import.meta.url);

export function appUrl(path) {
  return new URL(path, APP_BASE).href;
}
