(function () {
  // Single source of truth for register-form password strength UI.
  // Two register flows (member.html and gematria-account-setup.html) share the
  // same scoring + label/track styling; deviating between the two would let
  // copy or scoring drift.
  const STRENGTH_STYLES = Object.freeze([
    Object.freeze({ width: '0%', cls: 'bg-secondary', label: '' }),
    Object.freeze({ width: '25%', cls: 'bg-danger', label: 'Weak password' }),
    Object.freeze({ width: '50%', cls: 'bg-warning', label: 'Fair password' }),
    Object.freeze({ width: '75%', cls: 'bg-info', label: 'Good password' }),
    Object.freeze({ width: '100%', cls: 'bg-success', label: 'Strong password' }),
  ]);

  const HINT = 'Must be at least 8 characters.';

  function score(value) {
    if (!value) return 0;
    let s = 0;
    if (value.length >= 8) s += 1;
    if (value.length >= 12) s += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) s += 1;
    if (/\d/.test(value)) s += 1;
    if (/[^A-Za-z0-9]/.test(value)) s += 1;
    return Math.min(s, 4);
  }

  function styleFor(value) {
    return STRENGTH_STYLES[score(value)];
  }

  window.GematriaPasswordStrength = Object.freeze({
    STRENGTH_STYLES,
    HINT,
    score,
    styleFor,
  });
})();
