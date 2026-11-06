// Short screen transitions keep shared navigation in place and never capture input.
let active = null;
export function transitionScreen(update, { direction = 'forward', reduced = false } = {}) {
  active?.skipTransition();
  document.documentElement.dataset.navigation = direction;
  if (reduced || !document.startViewTransition) return Promise.resolve(update());
  document.documentElement.dataset.transitioning = 'true';
  const transition = document.startViewTransition(update);
  active = transition;
  transition.finished.catch(() => {}).finally(() => {
    if (active === transition) { active = null; delete document.documentElement.dataset.transitioning; }
  });
  return transition.updateCallbackDone;
}
