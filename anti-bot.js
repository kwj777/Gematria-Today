(function () {
  'use strict';

  const HONEYPOT_FIELD_NAME = 'website_url';
  const HONEYPOT_LABEL_TEXT = 'Website URL — leave this field blank.';
  const APPLIED_FLAG = 'antiBotApplied';
  const FORM_SELECTOR = 'form[data-anti-bot="1"]';

  function ensureStyles() {
    if (document.getElementById('anti-bot-style')) return;
    const style = document.createElement('style');
    style.id = 'anti-bot-style';
    style.textContent =
      '.anti-bot-honeypot{position:absolute!important;left:-9999px!important;top:auto!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(1px,1px,1px,1px)!important;white-space:nowrap!important;}';
    document.head.appendChild(style);
  }

  let counter = 0;

  function injectHoneypot(form) {
    if (!form || form.dataset[APPLIED_FLAG] === '1') return;
    if (form.querySelector('input[name="' + HONEYPOT_FIELD_NAME + '"]')) {
      form.dataset[APPLIED_FLAG] = '1';
      return;
    }

    ensureStyles();
    counter += 1;
    const inputId = HONEYPOT_FIELD_NAME + '-' + counter;
    const wrapper = document.createElement('div');
    wrapper.className = 'anti-bot-honeypot';
    wrapper.setAttribute('aria-hidden', 'true');

    const label = document.createElement('label');
    label.setAttribute('for', inputId);
    label.textContent = HONEYPOT_LABEL_TEXT;

    const input = document.createElement('input');
    input.type = 'text';
    input.name = HONEYPOT_FIELD_NAME;
    input.id = inputId;
    input.tabIndex = -1;
    input.autocomplete = 'off';
    input.value = '';

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    form.appendChild(wrapper);
    form.dataset[APPLIED_FLAG] = '1';
  }

  function injectAll(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    scope.querySelectorAll(FORM_SELECTOR).forEach(injectHoneypot);
  }

  function readHoneypotValue(form) {
    if (!form) return '';
    const input = form.querySelector('input[name="' + HONEYPOT_FIELD_NAME + '"]');
    return input ? String(input.value || '') : '';
  }

  function honeypotPayload(form) {
    return { [HONEYPOT_FIELD_NAME]: readHoneypotValue(form) };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => injectAll(document));
  } else {
    injectAll(document);
  }

  window.GematriaAntiBot = {
    fieldName: HONEYPOT_FIELD_NAME,
    inject: injectHoneypot,
    injectAll,
    honeypotPayload,
    readHoneypotValue,
  };
})();
