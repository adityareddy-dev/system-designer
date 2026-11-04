// Compete module entry: daily challenge, share links, result card, personal bests, and the small UI pieces around them.
import { createDaily } from './daily.js';
import { createShare } from './share.js';
import { renderCard, shareCard, downloadCard } from './card.js';
import { createBests } from './bests.js';
import { createCompeteUi } from './ui.js';

export function createCompete(ctx) {
  const problems = () => ctx.content?.problems || [];
  const daily = createDaily(problems, ctx.catalog);
  const share = createShare(ctx.catalog, problems);
  const card = { renderCard, shareCard, downloadCard };
  const bests = createBests(ctx.store);
  const api = { daily, share, card, bests };
  api.ui = createCompeteUi(ctx, api);
  return api;
}
