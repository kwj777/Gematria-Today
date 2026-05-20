      const ALERT_ICONS = {
        success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><path d="M8 12l3 3 5-6"></path></svg>',
        danger: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="13"></line><line x1="12" y1="16.5" x2="12" y2="16.5"></line></svg>',
        warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3l10 18H2L12 3z"></path><line x1="12" y1="10" x2="12" y2="14"></line><line x1="12" y1="17" x2="12" y2="17"></line></svg>',
        info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="11" x2="12" y2="16"></line><line x1="12" y1="8" x2="12" y2="8"></line></svg>',
      };

      function buildAlertController(rootId) {
        const root = document.getElementById(rootId);
        const icon = root.querySelector('.recovery-alert-icon');
        const text = root.querySelector('span.flex-grow-1');
        return {
          show(message, tone = 'danger') {
            text.textContent = message;
            icon.innerHTML = ALERT_ICONS[tone] || ALERT_ICONS.info;
            root.className = `alert alert-${tone} d-flex align-items-start gap-2`;
            root.setAttribute('aria-live', tone === 'danger' ? 'assertive' : 'polite');
          },
          clear() {
            text.textContent = '';
            icon.innerHTML = '';
            root.className = 'alert d-none d-flex align-items-start gap-2';
          },
        };
      }

      const requestAlert = buildAlertController('recoveryRequestAlert');
      const resetAlert = buildAlertController('recoveryResetAlert');

      const heroLead = document.getElementById('recoveryHeroLead');
      const resetSection = document.getElementById('recoveryResetSection');
      const sentPanel = document.getElementById('recoverySentPanel');
      const sentEmailDisplay = document.getElementById('sentEmailDisplay');
      const requestForm = document.getElementById('recoveryRequestForm');
      const resetForm = document.getElementById('recoveryResetForm');
      const step1 = document.getElementById('step1');
      const step2 = document.getElementById('step2');
      const step3 = document.getElementById('step3');

      const HERO_COPY = {
        'forgot-password': "We'll email a one-time code to the address on file. Use it below to set a new password.",
        'forgot-userid': "We'll email your username to the address on file — no code or password reset needed.",
        'forgot-both': "We'll email your username along with a one-time password reset code.",
      };

      function selectedRequestType() {
        const checked = requestForm.querySelector('input[name="recoveryRequestType"]:checked');
        return checked ? checked.value : 'forgot-password';
      }

      function updateHeroCopy() {
        heroLead.textContent = HERO_COPY[selectedRequestType()] || HERO_COPY['forgot-password'];
      }

      requestForm.querySelectorAll('input[name="recoveryRequestType"]').forEach((input) => {
        input.addEventListener('change', updateHeroCopy);
      });
      updateHeroCopy();

      function setStep(active) {
        [step1, step2, step3].forEach((el, idx) => {
          el.classList.remove('is-active', 'is-done');
          if (idx + 1 < active) el.classList.add('is-done');
          if (idx + 1 === active) el.classList.add('is-active');
        });
      }

      function maskEmail(email) {
        const at = email.indexOf('@');
        if (at < 1) return email;
        const name = email.slice(0, at);
        const domain = email.slice(at);
        const visible = name.slice(0, Math.min(2, name.length));
        return `${visible}${'*'.repeat(Math.max(1, name.length - visible.length))}${domain}`;
      }

      let resendTimer = null;
      const resendButton = document.getElementById('resendButton');
      const resendCountdown = document.getElementById('resendCountdown');
      const changeEmailButton = document.getElementById('changeEmailButton');

      function startResendCooldown(seconds = 30) {
        if (resendTimer) clearInterval(resendTimer);
        let remaining = seconds;
        resendButton.disabled = true;
        resendCountdown.classList.remove('d-none');
        resendCountdown.textContent = `You can resend in ${remaining}s`;
        resendTimer = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearInterval(resendTimer);
            resendTimer = null;
            resendButton.disabled = false;
            resendCountdown.classList.add('d-none');
            resendCountdown.textContent = '';
          } else {
            resendCountdown.textContent = `You can resend in ${remaining}s`;
          }
        }, 1000);
      }

      async function submitRecoveryRequest({ silent = false } = {}) {
        if (!silent) requestAlert.clear();
        const email = document.getElementById('recoveryEmail').value.trim();
        const action = selectedRequestType();

        const response = await fetch('/api/member-account-recovery', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, email }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to submit account recovery request.');
        }
        return { payload, email, action };
      }

      requestForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        requestAlert.clear();

        const submitButton = event.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        try {
          const { email, action } = await submitRecoveryRequest();
          sentEmailDisplay.textContent = maskEmail(email);
          sentPanel.classList.remove('d-none');
          requestForm.classList.add('d-none');
          startResendCooldown(30);

          if (action === 'forgot-userid') {
            setStep(2);
            resetSection.classList.add('d-none');
            requestAlert.show('Username sent. Check your inbox to sign in.', 'success');
          } else {
            setStep(2);
            resetSection.classList.remove('d-none');
            requestAlert.show('Recovery email sent. Enter the code below when it arrives.', 'success');
          }
        } catch (error) {
          requestAlert.show(error.message || 'Unable to submit account recovery request.');
        } finally {
          submitButton.disabled = false;
        }
      });

      resendButton.addEventListener('click', async () => {
        requestAlert.clear();
        resendButton.disabled = true;
        try {
          await submitRecoveryRequest({ silent: true });
          startResendCooldown(30);
          requestAlert.show('Recovery email re-sent.', 'success');
        } catch (error) {
          resendButton.disabled = false;
          requestAlert.show(error.message || 'Unable to resend recovery email.');
        }
      });

      changeEmailButton.addEventListener('click', () => {
        if (resendTimer) clearInterval(resendTimer);
        resendTimer = null;
        sentPanel.classList.add('d-none');
        requestForm.classList.remove('d-none');
        resetSection.classList.add('d-none');
        requestAlert.clear();
        setStep(1);
        document.getElementById('recoveryEmail').focus();
      });

      const newPasswordInput = document.getElementById('newPassword');
      const confirmPasswordInput = document.getElementById('confirmNewPassword');
      const pwdStrengthBar = document.getElementById('pwdStrengthBar');
      const pwdStrengthLabel = document.getElementById('pwdStrengthLabel');
      const pwdMatchMsg = document.getElementById('pwdMatchMsg');
      const STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

      function scorePassword(pw) {
        if (!pw || pw.length < 8) return 0;
        let score = 1;
        if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
        if (/\d/.test(pw)) score += 1;
        if (/[^A-Za-z0-9]/.test(pw)) score += 1;
        if (pw.length >= 14) score = Math.min(4, score + 1);
        return Math.min(4, score);
      }

      function updatePasswordStrength() {
        const score = scorePassword(newPasswordInput.value);
        pwdStrengthBar.className = `pwd-strength-bar${score > 0 ? ` s-${score}` : ''}`;
        pwdStrengthLabel.textContent = newPasswordInput.value
          ? `Password strength: ${STRENGTH_LABELS[score]}`
          : 'Use at least 8 characters with a mix of letters, numbers, and symbols.';
      }

      function updatePasswordMatch() {
        const a = newPasswordInput.value;
        const b = confirmPasswordInput.value;
        if (!b) {
          pwdMatchMsg.textContent = '';
          pwdMatchMsg.className = 'pwd-match-msg';
          return;
        }
        if (a === b) {
          pwdMatchMsg.textContent = 'Passwords match.';
          pwdMatchMsg.className = 'pwd-match-msg is-ok';
        } else {
          pwdMatchMsg.textContent = 'Passwords do not match yet.';
          pwdMatchMsg.className = 'pwd-match-msg is-bad';
        }
      }

      newPasswordInput.addEventListener('input', () => { updatePasswordStrength(); updatePasswordMatch(); });
      confirmPasswordInput.addEventListener('input', updatePasswordMatch);

      const pasteCodeButton = document.getElementById('pasteCodeButton');
      const recoveryCodeInput = document.getElementById('recoveryCode');
      pasteCodeButton.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            recoveryCodeInput.value = text.trim();
            recoveryCodeInput.focus();
          }
        } catch (_err) {
          resetAlert.show('Clipboard access blocked — paste with Ctrl/Cmd+V instead.', 'warning');
        }
      });

      const resetSubmitButton = document.getElementById('resetSubmitButton');
      const resetSuccessPanel = document.getElementById('resetSuccessPanel');
      const continueButton = document.getElementById('continueButton');

      resetForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        resetAlert.clear();

        const recoveryCode = recoveryCodeInput.value.trim();
        const newPassword = newPasswordInput.value;
        const confirmNewPassword = confirmPasswordInput.value;

        if (newPassword !== confirmNewPassword) {
          resetAlert.show('New password and confirmation do not match.');
          return;
        }

        resetSubmitButton.disabled = true;

        try {
          const response = await fetch('/api/member-account-recovery', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'reset-password', recoveryCode, newPassword }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.error || 'Unable to reset your password.');
          }
          const destination = payload.route === 'admin' ? '/admin.html' : '/member.html';
          continueButton.setAttribute('href', destination);
          resetAlert.show(payload.message || 'Password reset complete. You can continue to your dashboard.', 'success');
          resetForm.classList.add('d-none');
          resetSuccessPanel.classList.remove('d-none');
          setStep(4);
          step3.classList.add('is-done');
          continueButton.focus();
        } catch (error) {
          resetAlert.show(error.message || 'Unable to reset your password.');
          resetSubmitButton.disabled = false;
        }
      });

      const recoveryCodeFromUrl = new URL(window.location.href).searchParams.get('recovery_code');
      if (recoveryCodeFromUrl) {
        recoveryCodeInput.value = recoveryCodeFromUrl;
        resetSection.classList.remove('d-none');
        setStep(3);
        resetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => newPasswordInput.focus(), 400);
      }
