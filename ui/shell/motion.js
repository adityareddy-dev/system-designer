// Short screen transitions keep shared navigation in place and never capture input.
let active = null;
export function transitionScreen(update, { direction = 'forward', reduced = false, kind = 'navigation' } = {}) {
  active?.skipTransition();
  document.documentElement.dataset.navigation = direction;
  document.documentElement.dataset.transitionKind = kind;
  if (reduced || !document.startViewTransition) return Promise.resolve(update());
  document.documentElement.dataset.transitioning = 'true';
  const transition = document.startViewTransition(update);
  transition.ready.catch(() => {});
  active = transition;
  transition.finished.catch(() => {}).finally(() => {
    if (active === transition) { active = null; delete document.documentElement.dataset.transitioning; }
  });
  return transition.updateCallbackDone.then(() => transition.ready.catch(() => {}));
}
