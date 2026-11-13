// SEO tags shared by generated pages and the home page.
import { SITE, clean, esc, json } from './site-text.mjs';

export function concise(value, limit) {
  const text = clean(value).replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const end = text.slice(0, limit - 1).replace(/\s+\S*$/, '').replace(/[,:.\s]+$/, '');
  return end + '…';
}
export function seoTitle(value) {
  const title = clean(value);
  const branded = title + ' | System Designer';
  return branded.length < 60 ? branded : concise(title, 59);
}
export const canonical = file => new URL(file.replace(/index\.html$/, ''), SITE).href;
export function seoTags(file, opts) {
  const url = canonical(file);
  const title = seoTitle(opts.metaTitle || opts.title);
  const description = concise(opts.metaDescription || opts.description, 154);
  const image = new URL(opts.preview || 'assets/social-preview.png', SITE).href;
  const alt = `System Designer: ${opts.title}`;
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
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
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="${esc(alt)}">`;
}
export function replaceSeoTags(html, file, opts, data) {
  return html.replace(/<head>([\s\S]*?)<\/head>/, (_, head) => {
    const kept = head
      .replace(/\s*<title>[^<]*<\/title>/g, '')
      .replace(/\s*<meta\s+(?:name|property)="(?:description|og:[^"]+|twitter:[^"]+)"[^>]*>/g, '')
      .replace(/\s*<link rel="canonical"[^>]*>/g, '')
      .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
    return `<head>${kept.trimEnd()}\n${seoTags(file, opts)}\n<script type="application/ld+json">${json(data)}</script>\n</head>`;
  });
}
export function faqData(rows) {
  return { '@type': 'FAQPage', mainEntity: rows.map(([name, text]) => ({ '@type': 'Question', name: clean(name), acceptedAnswer: { '@type': 'Answer', text: clean(text) } })) };
}
export function articleData(guide) {
  return {
    '@type': 'Article', headline: guide.title, description: guide.description,
    author: { '@type': 'Organization', name: 'System Designer', url: SITE },
    publisher: { '@type': 'Organization', name: 'System Designer', url: SITE },
    image: SITE + 'assets/share/guides.png', datePublished: '2026-11-07',
    dateModified: '__SITE_LASTMOD__', mainEntityOfPage: canonical(guide.file),
    isAccessibleForFree: !guide.gatedSelector,
    ...(guide.gatedSelector ? { hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: guide.gatedSelector } } : {})
  };
}
