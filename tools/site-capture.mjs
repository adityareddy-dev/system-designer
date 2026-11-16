import { relative } from './site-template.mjs';

export function captureBox(file, purpose = 'updates') {
  const guide = purpose === 'guide';
  return `<section class="site-panel sd-capture" data-email-capture data-purpose="${purpose}" hidden>
<h2>${guide ? 'Read the rest, free' : 'Get the problem of the week'}</h2>
<p>${guide ? 'Enter your email to open the rest of the guides and lessons on this browser. Weekly updates are optional.' : 'One system design problem each week, with tips and product news.'}</p>
<form><fieldset disabled><label for="sd-reading-email">Email address</label><input id="sd-reading-email" name="email" type="email" autocomplete="email" maxlength="254" required>
<label class="sd-capture-choice"><input type="checkbox" name="marketingOptIn"> <span>Email me new problems, tips and product news. Unsubscribe any time.</span></label>
<button class="site-button" type="submit">${guide ? 'Read the rest' : 'Save my email choice'}</button></fieldset></form>
<p class="site-note">See how your email is used in <a href="${relative(file, 'privacy.html')}">Privacy</a>.</p>
<p role="status" aria-live="polite" data-capture-status>Loading email choices…</p></section>`;
}

export function gateReading(file, intro, rest) {
  return `${intro}${captureBox(file, 'guide')}<noscript><p>Turn on JavaScript to enter your email and read the rest.</p></noscript><div class="sd-gated" hidden>${rest}</div>`;
}

export const gateData = { isAccessibleForFree: false, hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.sd-gated' } };
