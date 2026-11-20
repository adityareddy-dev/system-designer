// The About page: what the game is, who makes it and how the site changes.
import { SITE, REPO, esc, link, relative } from './site-template.mjs';
import { listLinks } from './site-content.mjs';
import { AUTHOR } from './site-seo.mjs';

export const ABOUT = 'about/index.html';
export function aboutPage({ problems, lessons, groups }) {
  const file = ABOUT;
  const to = (target, text) => link(relative(file, target), text);
  const person = { ...AUTHOR, jobTitle: 'Senior Software Engineer' };
  return {
    title: 'About System Designer', metaTitle: 'About',
    description: 'System Designer is a free browser game for learning system design. I\'m Aditya Reddy and I built it.',
    crumbs: [['Home', 'index.html'], ['About', file]],
    action: `<a class="site-button" href="${esc(relative(file, 'index.html#/intro'))}">Build your first system</a>`,
    body: `<div class="site-split"><aside class="site-aside site-panel" aria-label="Who makes it"><span class="site-tag">Who makes it</span><h2>Aditya Reddy</h2><p>Senior Software Engineer, working on web performance and observability. I build System Designer on my own time as a personal project, and the code is open source under the MIT license.</p>${listLinks([['https://adityareddy.dev', 'adityareddy.dev'], ['https://www.linkedin.com/in/adityareddy-dev', 'LinkedIn'], ['https://github.com/adityareddy-dev', 'GitHub']])}</aside><div class="site-prose site-cols">`
      + `<section id="the-game"><h2>What the game is</h2><p>Each problem is a kind of system people actually run (a URL shortener, a bank ledger, a concert ticket drop etc). Read the brief, tap its questions to get the facts that change the design, work out the numbers, then drag parts onto the canvas and connect them. Once you press Start the clock runs from 00:00 to 24:00 and the day's traffic goes through your design, viral spikes, outages and retry storms included. The debrief after that is in plain words. It shows reliability, speed, data safety and monthly cost, and which event hurt.</p>`
      + `<p>Right now there are ${to('problems/index.html', `${problems.length} problems`)} across ${groups.length} industries, and ${to('learn/index.html', `${lessons.length} lessons`)} that take one idea at a time. Challenge gives everyone the same seeded scenario each day. Sandbox has no score and no game over, so you can try any part with any traffic and events. Medium and Hard problems also have Interview mode, a timed discussion on a 45-minute clock where you defend what you picked with evidence.</p>`
      + `<p>Prices are rounded from the big cloud providers' public list prices, and capacities and latencies from commonly published figures. Treat them as a sense of scale.</p></section>`
      + `<section id="updates"><h2>How it gets updated</h2><p>Everything is in one ${link(REPO, 'public GitHub repository')}, the game, these pages and the sign-in service. When I merge a change into main, Cloudflare Pages deploys the site. The sign-in service runs on its own server and I update it there. The problem, lesson and guide pages get generated from the same content the game plays, so when a problem changes its page changes with it.</p>`
      + `<p>I measured each problem's budget and targets by playing its reference design through a full simulated day, and the checks in the repo replay all of them. Every change is in the ${link(REPO + '/commits/main', 'commit history')}.</p></section>`
      + `<section id="access"><h2>Accounts and email</h2><p>You don't need an account or email to play, that covers every lesson, problem, the daily challenge and the sandbox. Progress stays in your browser. Sign in with Google or GitHub only if you want progress synced across devices or a score on a Challenge leaderboard.</p>`
      + `<p>Problem pages are open to read. The reading pages for guides and lessons show the intro and then ask for an email to read the rest, though the lesson itself still opens in the game without one. Giving an email there doesn't sign you up for weekly emails unless you tick the box for them. What's stored and how to delete it is on the ${to('privacy.html', 'privacy page')}.</p></section>`
      + `<section id="feedback"><h2>Feedback and fixes</h2><p>If a number looks off or something breaks, ${link(REPO + '/issues', 'open an issue on GitHub')} with the page and the steps to get there. There's also a feedback form in ${to('index.html#/settings', 'Settings')}. Fixes to problem and lesson text are welcome, the ${link(REPO + '/blob/main/CONTRIBUTING.md', 'contributor guide')} has the checks to run.</p></section>`
      + `</div></div>`,
    data: [{ '@type': 'AboutPage', about: { '@type': 'WebApplication', name: 'System Designer', url: SITE, creator: person }, author: person }]
  };
}
