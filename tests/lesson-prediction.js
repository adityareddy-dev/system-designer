// Canvas checks enter through the same first-prediction gate as a player.
export async function commitLessonPrediction(page) {
  await page.waitForSelector('.sh-estimate-form');
  await page.$eval('.sh-estimate-form', form => {
    if (form.hidden) return;
    const input = form.querySelector('input,textarea');
    input.value = input.type === 'number' ? '9' : 'I expect the downstream capacity to set the limit. I will measure completed requests.';
    form.requestSubmit();
  });
  await page.waitForSelector('.sh-demo-stage', { visible: true });
  await page.waitForFunction(() => window.__game.getState().mode === 'lesson' && window.__game.getState().view?.zoom > 0);
  await new Promise(resolve => setTimeout(resolve, 700));
}

export async function commitChoicePrediction(page) {
  await page.waitForSelector('.sh-prediction-form');
  await page.$eval('.sh-prediction-form', form => {
    const input = form.querySelector('textarea');
    input.value = 'I expect useful completion capacity to set the limit.';
    input.dispatchEvent(new Event('input'));
    form.requestSubmit();
  });
}
