// Every problem exposes matched wording and preserves explicit self-assignment of unmatched questions.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(); await page.goto(process.argv[2] || 'http://localhost:8765/');
  const results = await page.evaluate(async () => {
    const { problems } = await import('./content/problems/index.js');
    const { questionAnalysis } = await import('./ui/play/question-topics.js');
    const { renderInterviewPrep } = await import('./ui/play/interview.js');
    return problems.map(problem => {
      const questions = problem.clarify[0].q + '\nWhat about glitter?';
      const analysis = questionAnalysis(questions, problem.clarify);
      const state = { stage: 'answers', questions, ...analysis };
      const host = document.createElement('div'); renderInterviewPrep(host, problem, state, () => {});
      const before = host.textContent;
      const select = host.querySelector('[aria-label="Assign your question to a topic"]');
      select.value = String(problem.clarify.length - 1); select.dispatchEvent(new Event('change'));
      return { id: problem.id, phrase: analysis.closest[0].phrase, before, after: host.textContent, assigned: state.closest[1].selfAssigned, expected: problem.clarify.length - 1, covered: state.coverage.at(-1) };
    });
  });
  for (const result of results) {
    assert(result.phrase.length > 0, result.id); assert(result.before.includes('Matched phrase:'));
    assert.equal(result.assigned, result.expected); assert(result.covered);
    assert(result.after.includes('topics recorded.'), 'the combined count never presents self-assignment as an automatic match');
    assert(result.after.includes('Self-assigned by you. This is a wording check.'));
  }
  console.log(`${results.length} problems: matched phrases, self-assigned topics and wording warning verified in the browser.`);
} finally { await browser.close(); }
