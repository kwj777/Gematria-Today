      window.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('levelZeroRegisterForm');
        if (!form || !window.GematriaRegisterForm) return;

        const alertEl = document.getElementById('signUpAlert');
        const successPanel = document.getElementById('signUpSuccessPanel');

        const pageAlert = {
          show(message, level) {
            if (!alertEl) return;
            alertEl.textContent = message;
            alertEl.classList.remove('d-none', 'alert-success', 'alert-warning', 'alert-danger', 'alert-info');
            alertEl.classList.add('alert-' + (level || 'danger'));
          },
          clear() {
            alertEl?.classList.add('d-none');
            if (alertEl) alertEl.textContent = '';
          },
        };

        const passwordInput = document.getElementById('lzRegPassword');
        const strengthWrap = document.getElementById('lzRegPasswordStrength');
        const strengthBar = document.getElementById('lzRegPasswordStrengthBar');
        const strengthLabel = document.getElementById('lzRegPasswordStrengthLabel');

        const passwordStrength = window.GematriaPasswordStrength;

        function updateStrength() {
          if (!passwordInput || !strengthBar || !strengthLabel || !strengthWrap || !passwordStrength) return;
          const value = passwordInput.value;
          if (!value) {
            const empty = passwordStrength.STRENGTH_STYLES[0];
            strengthBar.className = 'progress-bar ' + empty.cls;
            strengthBar.style.width = empty.width;
            strengthLabel.textContent = passwordStrength.HINT;
            return;
          }
          const style = passwordStrength.styleFor(value);
          strengthBar.className = 'progress-bar ' + style.cls;
          strengthBar.style.width = style.width;
          strengthLabel.textContent = style.label;
        }

        passwordInput?.addEventListener('input', updateStrength);

        let lastSubmittedIdentifier = '';

        const registerHelpers = window.GematriaRegisterForm.initRegisterForm({
          form,
          fields: {
            username: document.getElementById('lzRegUsername'),
            displayName: document.getElementById('lzRegDisplayName'),
            email: document.getElementById('lzRegEmail'),
            password: passwordInput,
          },
          submitButton: document.getElementById('lzRegSubmit'),
          alert: pageAlert,
          source: 'level_zero_register_form',
          extraFields: { signupSource: 'learning_path_level_0' },
          onSuccess(response, context) {
            window.localStorage.setItem('learningPathStep1Intent', 'true');
            const emailEl = document.getElementById('signUpSuccessEmail');
            const submittedEmail = context?.payload?.email || response?.member?.email;
            if (emailEl && submittedEmail) {
              emailEl.textContent = submittedEmail;
            }
            lastSubmittedIdentifier = submittedEmail || context?.payload?.username || '';
            form.classList.add('d-none');
            successPanel?.classList.remove('d-none');
            successPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        });

        const resendButton = document.getElementById('signUpResendButton');
        const resendAlert = document.getElementById('signUpResendAlert');

        function setResendAlert(message, tone) {
          if (!resendAlert) return;
          resendAlert.textContent = message;
          resendAlert.classList.remove('d-none', 'alert-success', 'alert-warning', 'alert-danger', 'alert-info');
          resendAlert.classList.add('alert-' + (tone || 'info'));
        }

        resendButton?.addEventListener('click', async () => {
          if (!lastSubmittedIdentifier) {
            setResendAlert('Submit the form first to receive a verification email.', 'warning');
            return;
          }
          const originalLabel = resendButton.innerHTML;
          resendButton.disabled = true;
          resendButton.setAttribute('aria-busy', 'true');
          resendButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Sending…';
          try {
            const response = await registerHelpers.request('/api/member-resend-verification', {
              method: 'POST',
              body: JSON.stringify({ identifier: lastSubmittedIdentifier }),
            });
            setResendAlert(response?.message || 'If a pending account matches that identifier, a fresh verification link has been sent by email.', 'success');
          } catch (error) {
            setResendAlert((error && error.message) || 'Unable to resend the verification email right now. Please try again in a few minutes.', 'danger');
          } finally {
            resendButton.disabled = false;
            resendButton.removeAttribute('aria-busy');
            resendButton.innerHTML = originalLabel;
          }
        });
      });
