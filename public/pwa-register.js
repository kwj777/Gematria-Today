(function registerPwaServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  let deferredInstallPrompt = null;
  let launchOverlayTimer = null;

  function removeLaunchOverlay() {
    const existing = document.querySelector('[data-pwa-launch-overlay]');
    if (existing) {
      existing.remove();
    }
  }

  function showLaunchOverlay() {
    if (!isStandaloneMode() || document.querySelector('[data-pwa-launch-overlay]')) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'pwa-launch-overlay';
    overlay.setAttribute('data-pwa-launch-overlay', 'true');

    const message = document.createElement('p');
    message.className = 'pwa-launch-overlay__message';
    message.textContent = 'getting latest updates...';

    overlay.appendChild(message);
    document.body.appendChild(overlay);
  }

  function startLaunchOverlayTimer() {
    if (!isStandaloneMode()) {
      return;
    }

    launchOverlayTimer = window.setTimeout(() => {
      showLaunchOverlay();
    }, 500);
  }

  function clearLaunchOverlayTimer() {
    if (launchOverlayTimer !== null) {
      window.clearTimeout(launchOverlayTimer);
      launchOverlayTimer = null;
    }

    removeLaunchOverlay();
  }

  function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function removeInstallCta() {
    const existing = document.querySelector('[data-pwa-install-cta]');
    if (existing) {
      existing.remove();
    }
  }

  function showInstallCta() {
    if (deferredInstallPrompt === null || isStandaloneMode() || document.querySelector('[data-pwa-install-cta]')) {
      return;
    }

    const cta = document.createElement('div');
    cta.className = 'pwa-install-cta';
    cta.setAttribute('data-pwa-install-cta', 'true');

    const text = document.createElement('p');
    text.className = 'pwa-install-cta__text';
    text.textContent = 'Install this app for faster access and offline support.';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-warning btn-sm fw-semibold pwa-install-cta__button';
    button.textContent = 'Install app';

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'pwa-install-cta__dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss install prompt');
    dismiss.textContent = '×';

    dismiss.addEventListener('click', () => {
      removeInstallCta();
    });

    button.addEventListener('click', async () => {
      if (!deferredInstallPrompt) {
        return;
      }

      const promptEvent = deferredInstallPrompt;
      promptEvent.prompt();

      try {
        await promptEvent.userChoice;
      } finally {
        deferredInstallPrompt = null;
        removeInstallCta();
      }
    });

    cta.append(text, button, dismiss);
    document.body.appendChild(cta);
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallCta();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    removeInstallCta();
  });

  startLaunchOverlayTimer();

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ignore registration failures in unsupported/private browsing scenarios.
    });

    if (isStandaloneMode()) {
      removeInstallCta();
    }

    clearLaunchOverlayTimer();
  });
})();
