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

        function scorePassword(value) {
          if (!value) return 0;
          let score = 0;
          if (value.length >= 8) score += 1;
          if (value.length >= 12) score += 1;
          if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
          if (/\d/.test(value)) score += 1;
          if (/[^A-Za-z0-9]/.test(value)) score += 1;
          return Math.min(score, 4);
        }

        const STRENGTH_STYLES = [
          { width: '0%', cls: 'bg-secondary', label: '' },
          { width: '25%', cls: 'bg-danger', label: 'Weak password' },
          { width: '50%', cls: 'bg-warning', label: 'Fair password' },
          { width: '75%', cls: 'bg-info', label: 'Good password' },
          { width: '100%', cls: 'bg-success', label: 'Strong password' },
        ];

        function updateStrength() {
          if (!passwordInput || !strengthBar || !strengthLabel || !strengthWrap) return;
          const value = passwordInput.value;
          if (!value) {
            strengthWrap.classList.add('d-none');
            strengthLabel.textContent = '';
            return;
          }
          strengthWrap.classList.remove('d-none');
          const idx = scorePassword(value);
          const style = STRENGTH_STYLES[idx];
          strengthBar.className = 'progress-bar ' + style.cls;
          strengthBar.style.width = style.width;
          strengthLabel.textContent = style.label;
        }

        passwordInput?.addEventListener('input', updateStrength);

        window.GematriaRegisterForm.initRegisterForm({
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
          onSuccess() {
            window.localStorage.setItem('learningPathStep1Intent', 'true');
            form.classList.add('d-none');
            successPanel?.classList.remove('d-none');
            successPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        });
      });
