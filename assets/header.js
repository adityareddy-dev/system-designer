// The readable pages share the game's top bar. This tells the bar who is signed in: the same account check the game makes,
// nothing else. Without an account service (forks, local copies) the bar stays as it is.
(function () {
  var SITE = 'https://systemdesigner.io', API = 'https://api.systemdesigner.io';
  var link = document.querySelector('.sd-signin');
  if (!link) return;
  function signedIn(user) {
    var me = document.createElement('a');
    me.className = 'sd-me';
    me.href = (link.getAttribute('data-app') || './') + '#/settings';
    me.setAttribute('aria-label', 'Your account: ' + user.name);
    me.title = user.name;
    me.textContent = String(user.name || '?').trim().charAt(0).toUpperCase() || '?';
    link.parentNode.replaceChild(me, link);
    var tab = document.querySelector('.sh-tab[data-tab="challenge"]');
    if (tab) tab.hidden = false;
  }
  try {
    if (location.origin === SITE) {
      fetch(API + '/me', { credentials: 'include', headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d && d.user && d.user.name) signedIn(d.user); })
        .catch(function () { /* the service is not reachable: stay as is */ });
    } else if (sessionStorage.getItem('sd.preview') === 'hosted') {
      var u = JSON.parse(sessionStorage.getItem('sd.preview.user') || 'null');
      if (u && u.name) signedIn(u);
    }
  } catch (e) { /* storage can be blocked */ }
})();
