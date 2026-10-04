import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// The signup page scripts are classic browser scripts, so they run here in a
// bare context with just the globals they touch.
async function runScript(file, context) {
  const source = await fs.readFile(new URL(file, import.meta.url), 'utf8');
  vm.createContext(context);
  vm.runInContext(source, context, { filename: file });
  return context;
}

function createElement(id = '') {
  const classes = new Set();
  const listeners = {};
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    style: {},
    dataset: {},
    attributes: {},
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      contains: (name) => classes.has(name),
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, listener) { listeners[type] = listener; },
    dispatch(type, event) { return listeners[type]?.(event); },
    focus() {},
    scrollIntoView() {},
  };
}

// ---------- password strength meter ----------

async function loadPasswordStrength() {
  const context = await runScript('../page-scripts/password-strength-helpers.js', { window: {} });
  return context.window.GematriaPasswordStrength;
}

test('the strength meter never praises a password the form will refuse', async () => {
  const strength = await loadPasswordStrength();

  // "Ab1!" used to read "Good password" with a 75% bar, and "Abc12!x" too,
  // while minlength=8 and the server both refused them.
  for (const tooShort of ['a', 'Ab1!', 'Abc12!x']) {
    assert.equal(strength.score(tooShort), 0, `${tooShort} scores as if it were acceptable`);
    const style = strength.styleFor(tooShort);
    assert.match(style.label, /Too short/, `${tooShort} is labelled "${style.label}"`);
    assert.match(style.label, /at least 8 characters/);
    assert.equal(style.cls, 'bg-danger');
  }
});

test('the strength meter grades passwords of an acceptable length as before', async () => {
  const strength = await loadPasswordStrength();

  assert.equal(strength.styleFor('password').label, 'Weak password');
  assert.equal(strength.styleFor('password1').label, 'Fair password');
  assert.equal(strength.styleFor('Password1').label, 'Good password');
  assert.equal(strength.styleFor('Password1!').label, 'Strong password');
  assert.equal(strength.styleFor('').label, '');
});

// ---------- signup success is not reported as a failure ----------

function createRegisterFormHarness({ onSuccess }) {
  const tracked = [];
  const alerts = [];
  const form = createElement('form');
  const fields = {
    username: Object.assign(createElement('username'), { value: 'kev' }),
    email: Object.assign(createElement('email'), { value: 'kev@example.com' }),
    password: Object.assign(createElement('password'), { value: 'a-long-password' }),
  };
  const context = {
    window: {
      gematriaTracking: { track: (name, data) => tracked.push({ name, data }) },
    },
  };
  return {
    context,
    tracked,
    alerts,
    async submit() {
      const { GematriaRegisterForm } = context.window;
      GematriaRegisterForm.initRegisterForm({
        form,
        fields,
        submitButton: createElement('submit'),
        alert: { show: (message, tone) => alerts.push({ message, tone }), clear: () => {} },
        request: async () => ({ member: { email: 'kev@example.com' }, emailDelivered: true }),
        onSuccess,
      });
      await form.dispatch('submit', { preventDefault() {} }).catch(() => {});
    },
  };
}

test('a page error after the account is created is not reported as a failed signup', async () => {
  const harness = createRegisterFormHarness({
    onSuccess() {
      throw new Error('The operation is insecure.');
    },
  });
  await runScript('../register-form.js', harness.context);

  await harness.submit();

  // The account exists. Showing the error and tracking sign_up_error left the
  // visitor resubmitting into "already exists".
  assert.deepEqual(harness.tracked.map(({ name }) => name), ['sign_up_start', 'sign_up_complete']);
  assert.deepEqual(harness.alerts.filter(({ tone }) => tone === 'danger'), []);
});

test('the Level 0 signup shows its check-your-email panel when site storage is blocked', async () => {
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  };
  let registerConfig = null;
  let onReady = null;
  const context = {
    document: { getElementById: getElement },
    window: {
      addEventListener(type, listener) {
        if (type === 'DOMContentLoaded') onReady = listener;
      },
      // Safari with "Block All Cookies" throws on any storage access.
      localStorage: {
        setItem() {
          throw new Error('The operation is insecure.');
        },
      },
      GematriaRegisterForm: {
        initRegisterForm(config) {
          registerConfig = config;
          return { request: async () => ({}) };
        },
      },
    },
  };
  getElement('levelZeroRegisterForm');
  getElement('signUpSuccessPanel').classList.add('d-none');

  await runScript('../page-scripts/gematria-account-setup-1.js', context);
  onReady();

  assert.doesNotThrow(() => registerConfig.onSuccess(
    { member: { email: 'kev@example.com' }, emailDelivered: true },
    { payload: { email: 'kev@example.com', username: 'kev' } },
  ));
  assert.equal(getElement('signUpSuccessPanel').classList.contains('d-none'), false);
  assert.equal(getElement('levelZeroRegisterForm').classList.contains('d-none'), true);
  assert.equal(getElement('signUpSuccessEmail').textContent, 'kev@example.com');
});
