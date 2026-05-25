(function () {
  'use strict';

  const REGISTER_ENDPOINT = '/api/member-register';
  const CSRF_ENDPOINT = '/api/member-csrf';

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

    function clearMismatchAlert() {
      passwordMismatchAlert?.classList.add('d-none');
    }
    function showMismatchAlert() {
      passwordMismatchAlert?.classList.remove('d-none');
    }
    function syncConfirmHint() {
      if (!confirmMismatchHint || !fields.confirmPassword) return;
      const confirm = fields.confirmPassword.value;
      const password = fields.password.value;
      const mismatch = confirm.length > 0 && confirm !== password;
      if (confirmMismatchHint.dataset.alwaysOn === 'true') {
        confirmMismatchHint.textContent = mismatch ? "Passwords don't match yet." : '';
      } else {
        confirmMismatchHint.classList.toggle('d-none', !mismatch);
      }
      fields.confirmPassword.setAttribute('aria-invalid', mismatch ? 'true' : 'false');
    }

    const onPasswordInput = () => {
      clearMismatchAlert();
      syncConfirmHint();
    };
    fields.password.addEventListener('input', onPasswordInput);
    if (fields.confirmPassword) {
      fields.confirmPassword.addEventListener('input', onPasswordInput);
      fields.confirmPassword.addEventListener('blur', syncConfirmHint);
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      pageAlert.clear?.();
      clearMismatchAlert();

      if (fields.confirmPassword && fields.password.value !== fields.confirmPassword.value) {
        showMismatchAlert();
        return;
      }

      const extras = typeof config.extraFields === 'function'
        ? (config.extraFields() || {})
        : (config.extraFields || {});
      const honeypot = window.GematriaAntiBot?.honeypotPayload?.(form) || {};
      const payload = {
        username: fields.username.value.trim(),
        displayName: fields.displayName ? fields.displayName.value.trim() : '',
        email: fields.email.value.trim(),
        password: fields.password.value,
        ...extras,
        ...honeypot,
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
      }
    });

    return { request };
  }

  window.GematriaRegisterForm = {
    initRegisterForm,
    createCsrfRequestHelper,
  };
})();
