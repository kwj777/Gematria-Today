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

        window.GematriaRegisterForm.initRegisterForm({
          form,
          fields: {
            username: document.getElementById('lzRegUsername'),
            displayName: document.getElementById('lzRegDisplayName'),
            email: document.getElementById('lzRegEmail'),
            password: document.getElementById('lzRegPassword'),
            confirmPassword: document.getElementById('lzRegConfirmPassword'),
          },
          submitButton: document.getElementById('lzRegSubmit'),
          passwordMismatchAlert: document.getElementById('lzRegPasswordMismatchAlert'),
          confirmMismatchHint: document.getElementById('lzRegConfirmPasswordMismatch'),
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
