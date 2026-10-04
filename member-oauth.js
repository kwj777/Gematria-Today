(function () {
  'use strict';

  const PROVIDERS_ENDPOINT = '/api/member-oauth-providers';
  const START_ENDPOINT = '/api/member-oauth-start';

  // The callback can only hand the page a code, never a message: anything a
  // provider controls must not reach the DOM as text.
  const ERROR_MESSAGES = {
    access_denied: 'Sign-in was cancelled, so no account was created.',
    invalid_state: 'That sign-in attempt expired or was started in another browser. Please try again.',
    missing_code: 'The sign-in provider did not send us an authorization code. Please try again.',
    nonce_mismatch: 'That sign-in response did not match this browser session. Please try again.',
    link_requires_password:
      'An account already uses that email address. Sign in with your password first, then link the provider from your account.',
    staff_account_conflict:
      'That email belongs to a staff account. Please sign in with your username and password.',
    missing_email:
      'Your provider account did not share an email address, so we could not create a membership.',
    account_not_active: 'That membership account is not active. Please contact support.',
    provider_unavailable: 'Social sign-in is not available right now. Please use the form below.',
    unknown_provider: 'That sign-in provider is not supported.',
    rate_limited: 'Too many sign-in attempts. Please wait a few minutes and try again.',
    signup_closed: 'New membership sign-ups are closed right now, so no account was created.',
  };
  const GENERIC_ERROR = 'We could not complete that sign-in. Please try again, or use the form below.';

  function lookup(table, key, fallback) {
    // Object.hasOwn, not a bracket read: '?oauth_error=constructor' otherwise
    // resolves through Object.prototype and skips the fallback entirely.
    const name = String(key || '');
    return Object.hasOwn(table, name) ? table[name] : fallback;
  }

  function providerLabel(id) {
    const known = { google: 'Google' };
    return lookup(known, String(id || '').toLowerCase(), 'your provider');
  }

  function describeSuccess(params) {
    const label = providerLabel(params.get('oauth_provider'));
    if (params.get('oauth') === 'verify') {
      const sent = params.get('oauth_email_sent') !== '0';
      return {
        tone: sent ? 'info' : 'warning',
        message: sent
          ? `We created your account from ${label}, but that account's email is not confirmed. Check your inbox for a verification link, then sign in.`
          : `We created your account from ${label}, but we could not send the verification email. Please contact support.`,
      };
    }
    if (params.get('oauth_new') === '1') {
      return { tone: 'success', message: `Welcome aboard — your membership was created with ${label}.` };
    }
    if (params.get('oauth_linked') === '1') {
      if (params.get('oauth_password_retired') === '1') {
        const renamed = params.get('oauth_username_replaced') === '1'
          ? ` Its username and display name were chosen before the address was confirmed, so they have been replaced with new ones from ${label}.`
          : '';
        return {
          tone: 'warning',
          message: `Signed in with ${label} and linked it to the account already using that email. That account had a password that was never confirmed by email, so it has been removed — use ${label} to sign in, or set a new password from the account recovery page.${renamed}`,
        };
      }
      return { tone: 'success', message: `Signed in with ${label} and linked it to your existing membership.` };
    }
    return { tone: 'success', message: `Signed in with ${label}.` };
  }

  // Reads the outcome the callback encoded in the query string and strips those
  // parameters, so a reload (or a shared URL) does not replay a stale banner.
  function readOutcome() {
    let url;
    try {
      url = new URL(window.location.href);
    } catch {
      return null;
    }
    const params = url.searchParams;
    const status = params.get('oauth');
    const errorCode = params.get('oauth_error');
    if (!status && !errorCode) {
      return null;
    }

    const outcome = errorCode
      ? { ok: false, code: errorCode, tone: 'danger', message: lookup(ERROR_MESSAGES, errorCode, GENERIC_ERROR) }
      : { ok: status !== 'verify', code: status, ...describeSuccess(params) };
    outcome.provider = params.get('oauth_provider') || '';
    outcome.signedIn = Boolean(status === 'success');

    for (const key of ['oauth', 'oauth_error', 'oauth_provider', 'oauth_new', 'oauth_linked', 'oauth_email_sent', 'oauth_password_retired', 'oauth_username_replaced']) {
      params.delete(key);
    }
    const query = params.toString();
    window.history.replaceState({}, '', url.pathname + (query ? `?${query}` : '') + (url.hash || ''));
    return outcome;
  }

  function buildStartUrl(providerId, returnTo, signupSource) {
    const search = new URLSearchParams({ provider: providerId });
    if (returnTo) {
      search.set('return_to', returnTo);
    }
    // Seeds the new account the way the password form's signupSource does
    // (the server ignores anything it does not recognise).
    if (signupSource) {
      search.set('signup_source', signupSource);
    }
    return `${START_ENDPOINT}?${search.toString()}`;
  }

  function revealButtons(container, providers) {
    const available = new Set(providers.map((provider) => provider.id));
    let shown = 0;
    for (const button of container.querySelectorAll('[data-oauth-provider]')) {
      const providerId = button.getAttribute('data-oauth-provider');
      if (!available.has(providerId)) {
        button.classList.add('d-none');
        continue;
      }
      button.href = buildStartUrl(
        providerId,
        container.getAttribute('data-oauth-return-to') || '',
        container.getAttribute('data-oauth-signup-source') || '',
      );
      button.classList.remove('d-none');
      button.addEventListener('click', () => {
        window.gematriaTracking?.track?.('sign_up_start', {
          source: container.getAttribute('data-oauth-source') || 'oauth_button',
          method: providerId,
        });
      });
      shown += 1;
    }
    container.classList.toggle('d-none', shown === 0);
    return shown;
  }

  async function loadProviders() {
    const response = await fetch(PROVIDERS_ENDPOINT, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error('Unable to load sign-in providers');
    }
    const payload = await response.json();
    return Array.isArray(payload.providers) ? payload.providers : [];
  }

  async function initOAuthButtons() {
    const containers = Array.from(document.querySelectorAll('[data-oauth-buttons]'));
    if (!containers.length) {
      return [];
    }
    let providers = [];
    try {
      providers = await loadProviders();
    } catch {
      // Leave every container hidden: a button that cannot work is worse than
      // no button, and the password form below it still works.
      return [];
    }
    for (const container of containers) {
      revealButtons(container, providers);
    }
    return providers;
  }

  function renderOutcome(outcome) {
    if (!outcome) return;
    for (const target of document.querySelectorAll('[data-oauth-message]')) {
      target.textContent = outcome.message;
      target.className = `alert alert-${outcome.tone}`;
      target.classList.remove('d-none');
    }
  }

  const outcome = readOutcome();
  if (outcome?.signedIn) {
    try {
      window.localStorage.setItem('memberHasLoggedInBefore', 'true');
    } catch (_error) { /* storage unavailable */ }
  }

  window.GematriaOAuth = {
    outcome,
    initOAuthButtons,
    renderOutcome,
    buildStartUrl,
    providerLabel,
  };

  function start() {
    initOAuthButtons();
    // member-1.js renders the outcome through the page alert when it is
    // present; the inline target is the fallback for pages without one.
    if (document.querySelector('[data-oauth-message]')) {
      renderOutcome(outcome);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
