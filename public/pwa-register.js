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


  function injectRefreshButtonStyles() {
    if (document.getElementById('pwa-refresh-cache-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'pwa-refresh-cache-styles';
    style.textContent = `
      .pwa-refresh-cache-wrap {
        position: fixed;
        left: 0;
        right: 0;
        bottom: max(12px, env(safe-area-inset-bottom));
        display: flex;
        justify-content: center;
        pointer-events: none;
        z-index: 1050;
      }

      .pwa-refresh-cache-button {
        pointer-events: auto;
        border: 0;
        border-radius: 9999px;
        padding: 0.6rem 1rem;
        font-size: 0.9rem;
        font-weight: 700;
        letter-spacing: 0.01em;
        background: #f59e0b;
        color: #111827;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      }

      .pwa-refresh-cache-button[disabled] {
        opacity: 0.75;
      }
    `;

    document.head.appendChild(style);
  }

  async function requestServiceWorkerCacheRefresh() {
    const registration = await navigator.serviceWorker.ready;

    if (!registration.active) {
      throw new Error('No active service worker to refresh cache.');
    }

    await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => {
        reject(new Error('Service worker cache refresh timed out.'));
      }, 10000);

      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        if (event.data && event.data.ok) {
          resolve();
          return;
        }
        reject(new Error((event.data && event.data.error) || 'Service worker cache refresh failed.'));
      };

      registration.active.postMessage({ type: 'REFRESH_CACHE' }, [channel.port2]);
    });
  }

  function showRefreshCacheButton() {
    if (document.querySelector('[data-pwa-refresh-cache]')) {
      return;
    }

    injectRefreshButtonStyles();

    const wrap = document.createElement('div');
    wrap.className = 'pwa-refresh-cache-wrap';
    wrap.setAttribute('data-pwa-refresh-cache', 'true');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pwa-refresh-cache-button';
    button.textContent = 'Refresh app cache';

    button.addEventListener('click', async () => {
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = 'Refreshing cache…';

      try {
        await requestServiceWorkerCacheRefresh();
      } catch {
        // Fall through to forced reload as a graceful fallback.
      }

      window.location.reload();

      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
      }, 1500);
    });

    wrap.appendChild(button);
    document.body.appendChild(wrap);
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
    showRefreshCacheButton();
  });
})();
