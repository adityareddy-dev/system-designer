// The site has one theme, the cream workbench. Set before styles and page content can paint.
(function () {
  document.documentElement.dataset.theme = 'light';
  var bar = document.querySelector('meta[name="theme-color"]');
  if (bar) bar.content = '#FFF4E0';
})();
