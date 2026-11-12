// Shared HTML, structured data and text helpers for the readable site.
import path from 'node:path';
import fs from 'node:fs';
import { icon } from '../assets/icons/index.js';

export const themeHead = '<!-- theme:start --><script>\n' + fs.readFileSync(new URL('../assets/theme.js', import.meta.url), 'utf8') + '</script><!-- theme:end -->';

export const SITE = 'https://systemdesigner.io/';
export const clean = value => String(value ?? '').replace(/\u2014/g, ', ').replace(/\s+,/g, ',');
export const esc = value => clean(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const num = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 5 });
export const pct = value => num(value * 100) + '%';
export const para = text => `<p>${esc(text)}</p>`;
export const list = rows => `<ul>${rows.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`;
export const REPO = 'https://github.com/adityareddy-dev/system-designer';
export const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;
export const relative = (page, target) => {
  const [file, hash] = target.split('#');
  const base = (path.posix.relative(path.posix.dirname(page), file || 'index.html') || 'index.html').replace(/index\.html$/, '');
  // a fragment on the front page from a page in the root must still name the page, or it only changes this page's fragment
  return (hash == null ? base : (base || './') + '#' + hash) || './';
};
export const json = obj => JSON.stringify(obj).replace(/</g, '\\u003c');
export const breadcrumb = crumbs => ({ '@type':'BreadcrumbList', itemListElement: crumbs.map(([name, href], i)=>({ '@type':'ListItem', position:i+1, name:clean(name), item:new URL(href, SITE).href })) });
export const LOGO = '<svg viewBox="0 0 32 32" width="36" height="36" aria-hidden="true" focusable="false"><rect x="2" y="2" width="28" height="28" rx="6" fill="#141414"/><path d="M11 14 20 10M11 18l9 4" stroke="#FFF4E0" stroke-width="2"/><circle cx="8.5" cy="16" r="3.5" fill="#FFC93C"/><circle cx="23" cy="8.5" r="3.5" fill="#FF5B3A"/><circle cx="23" cy="23.5" r="3.5" fill="#2D5BFF"/></svg>';
// The same top bar as the game (assets/header.css): brand, the sections, Sign in.
export function navigation(file, { absolute = false } = {}) {
  // absolute: for a page served at any depth (404), links start at the site root
  const to = (target) => absolute ? '/' + target.replace(/index\.html$/, '').replace(/index\.html#/, '#') : relative(file, target);
  const section = file.startsWith('learn/') ? 'learn' : file.startsWith('problems/') || file.startsWith('p/') ? 'practice' : file.startsWith('guides/') ? 'guides' : '';
  const tab = (id, target, label, iconId, extra = '') => `<a class="sh-tab" data-tab="${id}" href="${esc(to(target))}"${section === id ? ' aria-current="page"' : ''}${extra}><span class="sh-ico" style="--ico:20px">${icon(iconId, { size: 20 })}</span><span class="sh-tab-label">${esc(label)}</span></a>`;
  const app = esc(to('index.html'));
  return `<a class="site-skip" href="#content">Skip to content</a><header class="sh-topbar"><a class="sh-brand" href="${to('index.html')}" aria-label="System Designer, home"><span class="sh-brand-mark">${LOGO}</span><span class="sh-brand-name">System Designer</span></a><nav class="sh-nav" aria-label="Sections">${tab('learn','learn/index.html','Learn','ui.learn')}${tab('practice','problems/index.html','Practice','ui.practice')}${tab('challenge','index.html#/challenge','Challenge','ui.challenge',' hidden')}${tab('sandbox','index.html#/sandbox','Sandbox','ui.sandbox')}${tab('guides','guides/index.html','Guides','ui.editorial')}</nav><div class="sh-actions"><a class="sd-signin" data-app="${app}" href="${esc(to('index.html#/signin'))}">Sign in</a><button type="button" class="sh-icon-btn" id="sh-sound-btn" aria-pressed="true" aria-label="Sound is on. Turn off." title="Sound on"><span class="sh-ico" style="--ico:20px" data-snd="on">${icon('ui.sound-on', { size: 20 })}</span><span class="sh-ico" style="--ico:20px" data-snd="off" hidden>${icon('ui.sound-off', { size: 20 })}</span></button><a class="sh-icon-btn" href="${esc(to('index.html#/settings'))}" aria-label="Settings" title="Settings"><span class="sh-ico" style="--ico:20px">${icon('ui.settings', { size: 20 })}</span></a></div></header><script src="${absolute ? '/assets/header.js' : relative(file, 'assets/header.js')}"></script>`;
}
export function bodyShell(file, {title, description, kicker = 'Build the system. Survive the day.', crumbs, body, action = '', image = ''}) {
  const trail = `<nav class="site-crumbs" aria-label="Breadcrumb">${crumbs.map(([name, target],i)=>i===crumbs.length-1 ? `<span aria-current="page">${esc(name)}</span>` : link(relative(file,target),name)).join('<span aria-hidden="true"> / </span>')}</nav>`;
  return `${navigation(file)}<main id="content" class="site-main" tabindex="-1">${trail}<div class="site-hero"><div><p class="site-kicker">${esc(kicker)}</p><h1>${esc(title)}</h1><p class="site-lead">${esc(description)}</p>${action}</div>${image}</div>${body}</main><footer class="site-footer"><p>System Designer · Free system design practice in your browser. Open source under the MIT License.</p><nav aria-label="Footer">${link(relative(file,'problems/index.html'),'All problems')} ${link(relative(file,'learn/index.html'),'All lessons')} ${link(relative(file,'guides/index.html'),'Guides')} ${link(relative(file,'privacy.html'),'Privacy')} ${link(REPO,'Source on GitHub')}</nav></footer>`;
}
export function page(file, opts) {
  const url = new URL(file.replace(/index\.html$/, ''), SITE).href;
  const title = opts.metaTitle || opts.title;
  const image = new URL(opts.preview || 'assets/social-preview.png', SITE).href;
  const alt = `System Designer: ${opts.title}`;
  const data = {'@context':'https://schema.org', '@graph':[breadcrumb(opts.crumbs), ...(opts.data || []).map(d=>({...d, name:d.name || clean(opts.title), url, inLanguage:'en', isAccessibleForFree:true}))]};
  const css = relative(file, 'assets/site.css');
  return `<!doctype html>
<!-- Readable content generated by tools/gen-site-pages.mjs. -->
<html lang="en" data-theme="light"><head>
<meta charset="utf-8">
${themeHead}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | System Designer</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="${relative(file,'assets/favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${relative(file,'assets/fonts.css')}">
<link rel="stylesheet" href="${css}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:type" content="${opts.article ? 'article' : 'website'}">
<meta property="og:site_name" content="System Designer">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:type" content="${image.endsWith('.jpg') ? 'image/jpeg' : 'image/png'}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(opts.description)}">
<meta name="twitter:image" content="${image}">
<script type="application/ld+json">${json(data)}</script>
</head><body class="site">${bodyShell(file,opts)}${opts.script ? `<script>${opts.script}</script>` : ''}</body></html>
`;
}
export function textOf(html) {
  return html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<\/dt>\s*<dd>/g,': ').replace(/<\/(?:p|li|h[1-6]|section|tr|div|dt|dd)>/g,'\n\n').replace(/<[^>]+>/g,'').replace(/&(amp|lt|gt|quot|#39);/g,(_,s)=>({'amp':'&','lt':'<','gt':'>','quot':'"','#39':"'"}[s])).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim();
}
