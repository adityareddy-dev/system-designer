// The readable pages share the game's top bar. This file makes it behave like the game's bar: the sound switch, and the
// same account menu for a signed-in player (it loads the game's own account code, so there is one copy). Without an account service
// (forks, local copies) the plain Sign in link stays and nothing is loaded.
(function () {
  // The game mounts its own header and account client.
  if (document.getElementById('app')) return;
  var SITE = 'https://systemdesigner.io', API = 'https://api.systemdesigner.io';
  var script = document.currentScript;
  var ROOT = script && script.src ? new URL('../', script.src).href : null;
  var link = document.querySelector('.sd-signin');
  if (!link) return;
  var app = link.getAttribute('data-app') || './';
  var tab = document.querySelector('.sh-tab[data-tab="challenge"]');

  // ---- sound: the same setting the game uses (soundMuted in its saved settings)
  var SETTINGS = 'hotpath.v1.settings';
  function readSettings() { try { var s = JSON.parse(localStorage.getItem(SETTINGS) || '{}'); return s && typeof s === 'object' ? s : {}; } catch (e) { return {}; } }
  var snd = document.getElementById('sh-sound-btn');
  function paintSound() {
    if (!snd) return;
    var muted = readSettings().soundMuted === true;
    var on = snd.querySelector('[data-snd="on"]'), off = snd.querySelector('[data-snd="off"]');
    if (on) on.hidden = muted;
    if (off) off.hidden = !muted;
    snd.setAttribute('aria-label', muted ? 'Sound is off. Turn on.' : 'Sound is on. Turn off.');
    snd.setAttribute('aria-pressed', String(!muted));
    snd.title = muted ? 'Sound off' : 'Sound on';
  }
  if (snd) {
    paintSound();
    snd.addEventListener('click', function () {
      var s = readSettings();
      s.soundMuted = !(s.soundMuted === true);
      try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch (e) { /* storage can be blocked */ }
      paintSound();
    });
  }

  // ---- fallback: a plain initial for a signed-in player (used only if the account code cannot load)
  function plainInitial(user) {
    var me = document.createElement('a');
    me.className = 'sd-me';
    me.href = app + '#/settings';
    me.setAttribute('aria-label', 'Your account: ' + user.name);
    me.title = user.name;
    me.textContent = String(user.name || '?').trim().charAt(0).toUpperCase() || '?';
    link.parentNode.replaceChild(me, link);
    if (tab) tab.hidden = false;
  }
  function plain() {
    try {
      if (location.origin === SITE) {
        fetch(API + '/me', { credentials: 'include', headers: { Accept: 'application/json' } })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d && d.user && d.user.name) plainInitial(d.user); })
          .catch(function () { /* the service is not reachable: stay as is */ });
      } else if (sessionStorage.getItem('sd.preview') === 'hosted') {
        var u = JSON.parse(sessionStorage.getItem('sd.preview.user') || 'null');
        if (u && u.name) plainInitial(u);
      }
    } catch (e) { /* storage can be blocked */ }
  }

  // ---- the game's account button and menu
  function css(href) {
    return new Promise(function (resolve) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      l.onload = l.onerror = function () { resolve(); };
      document.head.appendChild(l);
      setTimeout(resolve, 3000);
    });
  }
  function load() {
    if (!ROOT) return plain();
    var u = function (p) { return ROOT + p; };
    import(u('account/config.js')).then(function (cfg) {
      if (!cfg.apiBase() && !cfg.previewHosted()) return;
      return Promise.all([import(u('core/bus.js')), import(u('core/store.js')), import(u('ui/shell/progress.js')), import(u('ui/shell/overlay.js')), import(u('account/index.js'))])
        .then(function (m) {
          var bus = m[0].createBus(), store = m[1].createStore();
          var host = document.createElement('div');
          host.id = 'overlay';
          document.documentElement.appendChild(host);   // outside the page body, so the page's link styles do not reach the menu
          m[3].setOverlayHost(host);
          // the menu's own links are written for the game's address: point them at the game from any page
          var fix = function () {
            host.querySelectorAll('a[href]').forEach(function (a) {
              var h = a.getAttribute('href');
              if (h === 'privacy.html' || h.indexOf('#/') === 0) a.setAttribute('href', app + h);
            });
          };
          new MutationObserver(fix).observe(host, { childList: true, subtree: true });
          var account = m[4].createAccount({ bus: bus, store: store, progress: m[2].createProgress(store, bus) });
          return account.ready.then(function () {
            // a signed-out visitor keeps the Sign in link exactly as it is (it opens the sign-in panel on the front page);
            // only a signed-in player gets the avatar and the account menu
            if (!account.state().available || !account.state().user) return;
            return Promise.all([css(u('ui/shell/shell.css')), css(u('account/account.css')), css(u('assets/neo.css')), css(u('assets/header.css'))]).then(function () {
              var slot = document.createElement('div');
              slot.className = 'sh-account';
              link.parentNode.replaceChild(slot, link);
              bus.on('account', function (st) { if (tab) tab.hidden = !st.user; });
              // the account button keeps the class the plain avatar had
              var tag = function () { var b = slot.querySelector('.ac-me-btn'); if (b) b.classList.add('sd-me'); };
              new MutationObserver(tag).observe(slot, { childList: true });
              account.mountHeader(slot);
              tag();
              if (tab) tab.hidden = !account.state().user;
            });
          });
        });
    }).catch(plain);
  }
  load();
})();
