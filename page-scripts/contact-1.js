(function () {
  function init() {
    const form = document.getElementById('supportForm');
    const diagPre = document.getElementById('supportDiagnostics');
    if (!form || !diagPre) return;

    let currentVersion = null;

    function currentTier() {
      const t = window.__gematriaAuthTier;
      return (t === 'free' || t === 'premium' || t === 'lifetime') ? t : 'anon';
    }

    function isMember() {
      const t = currentTier();
      return t === 'premium' || t === 'lifetime';
    }

    function collectDiagnostics() {
      return {
        version: currentVersion || 'unknown',
        tier: currentTier(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        language: navigator.language,
        viewport: window.innerWidth + 'x' + window.innerHeight,
        standalone: (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) ? 'yes' : 'no',
        timestamp: new Date().toISOString()
      };
    }

    function formatDiagnostics(diag) {
      return [
        'App version: ' + diag.version,
        'Account tier: ' + diag.tier,
        'Page: ' + diag.url,
        'Browser: ' + diag.userAgent,
        'Language: ' + diag.language,
        'Viewport: ' + diag.viewport,
        'Installed app: ' + diag.standalone,
        'Reported at: ' + diag.timestamp
      ].join('\n');
    }

    const memberBadge = document.getElementById('supportMemberBadge');
    if (memberBadge && isMember()) {
      memberBadge.classList.remove('d-none');
    }

    function renderPreview() {
      diagPre.textContent = formatDiagnostics(collectDiagnostics());
    }

    renderPreview();

    function tryLoadVersion() {
      if (window.gematriaSupport && typeof window.gematriaSupport.getServiceWorkerVersion === 'function') {
        window.gematriaSupport.getServiceWorkerVersion().then(function (version) {
          currentVersion = version;
          renderPreview();
        });
        return true;
      }
      return false;
    }

    if (!tryLoadVersion()) {
      window.addEventListener('load', tryLoadVersion, { once: true });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const topic = document.getElementById('supportTopic').value || 'General question';
      const name = document.getElementById('supportName').value.trim();
      const messageEl = document.getElementById('supportMessage');
      const message = messageEl.value.trim();
      if (!message) {
        messageEl.focus();
        return;
      }

      const subject = (isMember() ? '[Member] ' : '') + topic;
      const body =
        (name ? 'From: ' + name + '\n\n' : '') +
        message +
        '\n\n---\nDiagnostics (auto-captured)\n' +
        formatDiagnostics(collectDiagnostics());

      const href = 'mailto:support@lunarwebstudio.com'
        + '?subject=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(body);

      window.location.href = href;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
