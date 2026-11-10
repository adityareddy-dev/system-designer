// Applies the saved theme before styles and page content can paint.
(function () {
  function apply() {
    var theme = 'dark';
    try {
      var saved = JSON.parse(localStorage.getItem('hotpath.v1.settings') || '{}') || {};
      if (saved.theme === 'light' || saved.theme === 'dark') theme = saved.theme;
      else if (saved.theme === 'system') {
        theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } catch (e) { /* Storage can be unavailable. */ }
    document.documentElement.dataset.theme = theme;
    var bar = document.querySelector('meta[name="theme-color"]');
    if (bar) bar.content = theme === 'dark' ? '#0A0E18' : '#EDF2F9';
  }
  apply();
  if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', apply);
})();
