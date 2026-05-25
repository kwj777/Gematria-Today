(function registerPwaServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  let deferredInstallPrompt = null;
  let launchOverlayTimer = null;
  const IOS_INSTALL_DISMISSED_KEY = 'pwa-ios-install-dismissed';
  const INSTALL_CTA_DISMISS_COUNT_KEY = 'pwa-install-cta-dismiss-count';
  const INSTALL_CTA_MAX_DISMISSALS = 2;

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

    const content = document.createElement('div');
    content.className = 'pwa-launch-overlay__content';

    const logo = document.createElement('img');
    logo.className = 'pwa-launch-overlay__logo';
    logo.src = '/assets/gematria-logo-navbar.svg';
    logo.alt = 'Gematria.Today';
    logo.width = 220;
    logo.height = 52;
    logo.decoding = 'async';

    const spinner = document.createElement('span');
    spinner.className = 'pwa-launch-overlay__spinner';
    spinner.setAttribute('aria-hidden', 'true');

    const message = document.createElement('p');
    message.className = 'pwa-launch-overlay__message';
    message.textContent = 'Opening app…';

    content.append(logo, spinner, message);
    overlay.appendChild(content);
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


  function isIosSafari() {
    const ua = window.navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return isIos && isSafari;
  }

  function removeIosInstallPopup() {
    const existing = document.querySelector('[data-pwa-ios-popup]');
    if (existing) {
      existing.remove();
    }
  }

  function shouldShowIosInstallPopup() {
    if (!isIosSafari() || isStandaloneMode()) {
      return false;
    }

    return window.localStorage.getItem(IOS_INSTALL_DISMISSED_KEY) !== 'true';
  }

  function showIosInstallPopup() {
    if (!shouldShowIosInstallPopup() || document.querySelector('[data-pwa-ios-popup]')) {
      return;
    }

    const popup = document.createElement('div');
    popup.className = 'pwa-ios-popup';
    popup.setAttribute('data-pwa-ios-popup', 'true');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-live', 'polite');
    popup.setAttribute('aria-label', 'Install app on iPhone');

    const title = document.createElement('p');
    title.className = 'pwa-ios-popup__title';
    title.textContent = 'Add Gematria.Today to your Home Screen';

    const instructions = document.createElement('p');
    instructions.className = 'pwa-ios-popup__instructions';
    instructions.innerHTML = 'Tap <strong>Share</strong> (<span aria-hidden="true" style="font-family:-apple-system,BlinkMacSystemFont,sans-serif">􀈂</span>), then choose <strong>Add to Home Screen</strong>.';

    const actions = document.createElement('div');
    actions.className = 'pwa-ios-popup__actions';

    const gotItButton = document.createElement('button');
    gotItButton.type = 'button';
    gotItButton.className = 'btn btn-warning btn-sm fw-semibold';
    gotItButton.textContent = 'Got it';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'pwa-ios-popup__close';
    closeButton.setAttribute('aria-label', 'Dismiss iPhone install popup');
    closeButton.textContent = '×';

    function dismissPopup() {
      window.localStorage.setItem(IOS_INSTALL_DISMISSED_KEY, 'true');
      document.removeEventListener('keydown', handleKeydown);
      removeIosInstallPopup();
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismissPopup();
      }
    }

    gotItButton.addEventListener('click', dismissPopup);
    closeButton.addEventListener('click', dismissPopup);
    document.addEventListener('keydown', handleKeydown);

    actions.append(gotItButton);
    popup.append(closeButton, title, instructions, actions);
    document.body.appendChild(popup);
  }

  function removeInstallCta() {
    const existing = document.querySelector('[data-pwa-install-cta]');
    if (existing) {
      existing.remove();
    }
  }

  function getInstallCtaDismissCount() {
    const stored = window.localStorage.getItem(INSTALL_CTA_DISMISS_COUNT_KEY);
    const parsed = Number.parseInt(stored || '0', 10);
    return Number.isNaN(parsed) ? 0 : Math.max(parsed, 0);
  }

  function incrementInstallCtaDismissCount() {
    const nextCount = getInstallCtaDismissCount() + 1;
    window.localStorage.setItem(INSTALL_CTA_DISMISS_COUNT_KEY, String(nextCount));
  }

  function resetInstallCtaDismissCount() {
    window.localStorage.removeItem(INSTALL_CTA_DISMISS_COUNT_KEY);
  }

  function showInstallCta() {
    if (deferredInstallPrompt === null || isStandaloneMode() || document.querySelector('[data-pwa-install-cta]')) {
      return;
    }

    if (getInstallCtaDismissCount() >= INSTALL_CTA_MAX_DISMISSALS) {
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

    function dismissCta() {
      incrementInstallCtaDismissCount();
      document.removeEventListener('keydown', handleKeydown);
      removeInstallCta();
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismissCta();
      }
    }

    dismiss.addEventListener('click', dismissCta);

    button.addEventListener('click', async () => {
      if (!deferredInstallPrompt) {
        return;
      }

      const promptEvent = deferredInstallPrompt;
      promptEvent.prompt();

      try {
        const choiceResult = await promptEvent.userChoice;
        if (choiceResult && choiceResult.outcome !== 'accepted') {
          incrementInstallCtaDismissCount();
        } else {
          resetInstallCtaDismissCount();
        }
      } finally {
        deferredInstallPrompt = null;
        document.removeEventListener('keydown', handleKeydown);
        removeInstallCta();
      }
    });

    document.addEventListener('keydown', handleKeydown);

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
    resetInstallCtaDismissCount();
    removeInstallCta();
    removeIosInstallPopup();
  });

  startLaunchOverlayTimer();

  function removeUpdateToast() {
    const existing = document.querySelector('[data-pwa-update-toast]');
    if (existing) {
      existing.remove();
    }
  }

  function showUpdateToast(waitingWorker) {
    if (!waitingWorker || document.querySelector('[data-pwa-update-toast]')) {
      return;
    }

    const toast = document.createElement('div');
    toast.className = 'pwa-update-toast';
    toast.setAttribute('data-pwa-update-toast', 'true');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const text = document.createElement('p');
    text.className = 'pwa-update-toast__text';
    text.textContent = 'A new version of Gematria.Today is available.';

    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className = 'btn btn-warning btn-sm fw-semibold pwa-update-toast__button';
    refreshButton.textContent = 'Refresh to update';

    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'pwa-update-toast__dismiss';
    dismissButton.setAttribute('aria-label', 'Dismiss update notice');
    dismissButton.textContent = '×';

    function dismissToast() {
      document.removeEventListener('keydown', handleKeydown);
      removeUpdateToast();
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismissToast();
      }
    }

    refreshButton.addEventListener('click', () => {
      refreshButton.disabled = true;
      refreshButton.textContent = 'Refreshing…';
      document.removeEventListener('keydown', handleKeydown);
      userTriggeredUpdate = true;
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    });

    dismissButton.addEventListener('click', dismissToast);
    document.addEventListener('keydown', handleKeydown);

    toast.append(text, refreshButton, dismissButton);
    document.body.appendChild(toast);
  }

  function watchForUpdates(registration) {
    if (!registration) return;

    // If a worker is already waiting from a prior visit, prompt immediately.
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdateToast(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateToast(newWorker);
        }
      });
    });

    const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
    let lastUpdateCheck = Date.now();

    function checkForUpdates() {
      lastUpdateCheck = Date.now();
      registration.update().catch(() => {});
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    });

    window.setInterval(() => {
      if (Date.now() - lastUpdateCheck >= EIGHT_HOURS_MS) {
        checkForUpdates();
      }
    }, EIGHT_HOURS_MS);
  }

  // Only reload when the user opted in via the "Refresh to update" toast.
  // The first SW install on a clean profile also fires controllerchange
  // (the new worker claims the page via clients.claim()), and reloading
  // there caused an unintended re-navigation every Lighthouse run, which
  // tanked both the Performance and Best Practices scores.
  let userTriggeredUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!userTriggeredUpdate) return;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(watchForUpdates)
      .catch(() => {
        // Ignore registration failures in unsupported/private browsing scenarios.
      });

    if (isStandaloneMode()) {
      removeInstallCta();
      removeIosInstallPopup();
    } else {
      showIosInstallPopup();
    }

    clearLaunchOverlayTimer();
  });
})();
