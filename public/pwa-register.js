(function registerPwaServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  let deferredInstallPrompt = null;
  const REFRESH_MESSAGE_TYPE = 'PWA_REFRESH_CACHE';

  function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function removeInstallCta() {
    const existing = document.querySelector('[data-pwa-install-cta]');
    if (existing) {
      existing.remove();
    }
  }

  function requestServiceWorkerCacheRefresh() {
    return new Promise((resolve, reject) => {
      if (!navigator.serviceWorker?.controller) {
        reject(new Error('No active service worker controller.'));
        return;
      }

      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => {
        reject(new Error('Timed out while refreshing cache.'));
      }, 12000);

      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        if (event.data?.ok) {
          resolve();
          return;
        }
        reject(new Error(event.data?.error || 'Cache refresh failed.'));
      };

      navigator.serviceWorker.controller.postMessage({ type: REFRESH_MESSAGE_TYPE }, [channel.port2]);
    });
  }

  function showRefreshButton() {
    if (document.querySelector('[data-pwa-refresh-cache]')) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline-warning btn-sm fw-semibold pwa-refresh-cache-button';
    button.setAttribute('data-pwa-refresh-cache', 'true');
    button.textContent = 'Refresh cached data';

    button.addEventListener('click', async () => {
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = 'Refreshing...';

      try {
        await requestServiceWorkerCacheRefresh();
      } catch {
        // Continue and force a regular reload if refresh messaging fails.
      } finally {
        button.textContent = originalText;
        window.location.reload();
      }
    });

    document.body.appendChild(button);
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

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ignore registration failures in unsupported/private browsing scenarios.
    });

    showRefreshButton();

    if (isStandaloneMode()) {
      removeInstallCta();
    }
  });
})();
