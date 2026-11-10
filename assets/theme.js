// Applies the saved theme before styles and page content can paint.
(function () {
  var theme = 'dark';
  try {
    var saved = JSON.parse(localStorage.getItem('hotpath.v1.settings') || '{}') || {};
    if (saved.theme === 'light' || saved.theme === 'dark') theme = saved.theme;
    else if (saved.theme === 'system' && saved.themeExplicit === true) {
      theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  } catch (e) { /* Storage can be unavailable. */ }
  document.documentElement.dataset.theme = theme;
})();
