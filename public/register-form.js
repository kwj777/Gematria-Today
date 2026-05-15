(function () {
  'use strict';

  const REGISTER_ENDPOINT = '/api/member-register';
  const CSRF_ENDPOINT = '/api/member-csrf';
  const TURNSTILE_ACTION = 'member_register';

  function getTurnstileSiteKey() {
    return String(
      window.GEMATRIA_TURNSTILE_SITE_KEY
        || document.querySelector('meta[name="turnstile-site-key"]')?.content
        || '',
    ).trim();
  }

  function isTurnstileRequired() {
    return Boolean(getTurnstileSiteKey());
  }

  function createTurnstileWidget(opts) {
    const container = opts && opts.container;
    const action = (opts && opts.action) || TURNSTILE_ACTION;
    const state = { token: '', widgetId: null };
    let retry = 0;

    function tryRender() {
      const siteKey = getTurnstileSiteKey();
      if (!siteKey) {
        if (retry < 80) {
          retry += 1;
          window.setTimeout(tryRender, 250);
        }
        return;
      }
      if (typeof window.turnstile?.render !== 'function') {
        window.setTimeout(tryRender, 150);
        return;
      }
      if (!container || state.widgetId !== null) return;
      state.widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        action,
        callback: (token) => { state.token = String(token || '').trim(); },
        'expired-callback': () => { state.token = ''; },
        'error-callback': () => { state.token = ''; },
      });
    }

    tryRender();

    return {
      getToken: () => state.token,
      reset: () => {
        state.token = '';
        if (typeof window.turnstile?.reset === 'function' && state.widgetId !== null) {
          window.turnstile.reset(state.widgetId);
        }
      },
    };
  }

  function createCsrfRequestHelper() {
    let csrfToken = null;
    let csrfFetchPromise = null;

    async function fetchCsrfOnce() {
      if (!csrfFetchPromise) {
        csrfFetchPromise = (async () => {
          try {
            const response = await fetch(CSRF_ENDPOINT, {
              credentials: 'same-origin',
              headers: { accept: 'application/json' },
            });
            const payload = await response.json().catch(() => ({}));
            if (response.ok && payload && payload.csrfToken) {
              csrfToken = payload.csrfToken;
            }
          } catch {
            // Non-fatal: submit will surface a clearer error.
          }
        })();
      }
      return csrfFetchPromise;
    }

    return async function request(url, options) {
      const opts = options || {};
      const method = String(opts.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        await fetchCsrfOnce();
      }
      const csrfHeaders = csrfToken && method !== 'GET' && method !== 'HEAD'
        ? { 'x-csrf-token': csrfToken }
        : {};
      const response = await fetch(url, {
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...csrfHeaders, ...(opts.headers || {}) },
        ...opts,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Request failed');
      }
      return payload;
    };
  }

  function initRegisterForm(config) {
    const form = config.form;
    const fields = config.fields;
    const submitButton = config.submitButton;
    const passwordMismatchAlert = config.passwordMismatchAlert || null;
    const confirmMismatchHint = config.confirmMismatchHint || null;
    const pageAlert = config.alert || { show: () => {}, clear: () => {} };
    const source = config.source || 'register_form';
    const request = config.request || createCsrfRequestHelper();
    const challenge = config.challenge || (config.turnstileContainer
      ? createTurnstileWidget({ container: config.turnstileContainer, action: TURNSTILE_ACTION })
      : { getToken: () => '', reset: () => {} });

    function clearMismatchAlert() {
      passwordMismatchAlert?.classList.add('d-none');
    }
    function showMismatchAlert() {
      passwordMismatchAlert?.classList.remove('d-none');
    }
    function syncConfirmHint() {
      if (!confirmMismatchHint) return;
      const confirm = fields.confirmPassword.value;
      const password = fields.password.value;
      const mismatch = confirm.length > 0 && confirm !== password;
      confirmMismatchHint.classList.toggle('d-none', !mismatch);
      fields.confirmPassword.setAttribute('aria-invalid', mismatch ? 'true' : 'false');
    }

    const onPasswordInput = () => {
      clearMismatchAlert();
      syncConfirmHint();
    };
    fields.password.addEventListener('input', onPasswordInput);
    fields.confirmPassword.addEventListener('input', onPasswordInput);
    fields.confirmPassword.addEventListener('blur', syncConfirmHint);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      pageAlert.clear?.();
      clearMismatchAlert();

      if (fields.password.value !== fields.confirmPassword.value) {
        showMismatchAlert();
        return;
      }

      const challengeToken = String(challenge.getToken() || '').trim();
      if (isTurnstileRequired() && !challengeToken) {
        pageAlert.show?.('Please complete the anti-robot check before creating your account.', 'warning');
        return;
      }

      const extras = typeof config.extraFields === 'function'
        ? (config.extraFields() || {})
        : (config.extraFields || {});
      const payload = {
        username: fields.username.value.trim(),
        displayName: fields.displayName ? fields.displayName.value.trim() : '',
        email: fields.email.value.trim(),
        password: fields.password.value,
        challengeToken,
        ...extras,
      };

      const originalButtonHtml = submitButton.innerHTML;
      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
      submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Creating account…';
      pageAlert.show?.('Creating your account—thanks for your patience. This can take a few seconds.', 'info');
      window.gematriaTracking?.track?.('sign_up_start', { source });

      try {
        const response = await request(REGISTER_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        pageAlert.clear?.();
        window.gematriaTracking?.track?.('sign_up_complete', { source });
        config.onSuccess?.(response, { payload, form });
      } catch (error) {
        window.gematriaTracking?.track?.('sign_up_error', {
          source,
          errorMessage: (error && error.message) || 'unknown_error',
        });
        if (config.onError) {
          config.onError(error);
        } else {
          pageAlert.show?.(
            (error && error.message) || 'Unable to create membership account.',
            'danger',
          );
        }
      } finally {
        submitButton.disabled = false;
        submitButton.removeAttribute('aria-busy');
        submitButton.innerHTML = originalButtonHtml;
        challenge.reset();
      }
    });

    return { challenge, request };
  }

  window.GematriaRegisterForm = {
    initRegisterForm,
    createTurnstileWidget,
    createCsrfRequestHelper,
    getTurnstileSiteKey,
    isTurnstileRequired,
  };
})();
