      const recoveryAlert = document.getElementById('recoveryAlert');
      const recoveryAlertIcon = document.getElementById('recoveryAlertIcon');
      const recoveryAlertText = document.getElementById('recoveryAlertText');

      const ALERT_ICONS = {
        success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><path d="M8 12l3 3 5-6"></path></svg>',
        danger: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="13"></line><line x1="12" y1="16.5" x2="12" y2="16.5"></line></svg>',
        warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3l10 18H2L12 3z"></path><line x1="12" y1="10" x2="12" y2="14"></line><line x1="12" y1="17" x2="12" y2="17"></line></svg>',
        info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="11" x2="12" y2="16"></line><line x1="12" y1="8" x2="12" y2="8"></line></svg>',
      };

      function showAlert(message, tone = 'danger') {
        recoveryAlertText.textContent = message;
        recoveryAlertIcon.innerHTML = ALERT_ICONS[tone] || ALERT_ICONS.info;
        recoveryAlert.className = `alert alert-${tone} d-flex align-items-start gap-2`;
        recoveryAlert.setAttribute('aria-live', tone === 'danger' ? 'assertive' : 'polite');
      }

      function clearAlert() {
        recoveryAlertText.textContent = '';
        recoveryAlertIcon.innerHTML = '';
        recoveryAlert.className = 'alert d-none d-flex align-items-start gap-2';
      }

      document.getElementById('recoveryRequestForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();

        const submitButton = event.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        const recoveryRequestType = document.getElementById('recoveryRequestType').value;

        try {
          const response = await fetch('/api/member-account-recovery', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: recoveryRequestType,
              email: document.getElementById('recoveryEmail').value.trim(),
              identifier: document.getElementById('recoveryEmail').value.trim(),
            }),
          });

          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.error || 'Unable to submit account recovery request.');
          }

          showAlert(payload.message || 'If an account exists for that email, recovery instructions were sent.', 'success');
          event.target.reset();
        } catch (error) {
          showAlert(error.message || 'Unable to submit account recovery request.');
        } finally {
          submitButton.disabled = false;
        }
      });

      document.getElementById('recoveryResetForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();

        const recoveryCode = document.getElementById('recoveryCode').value.trim();
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        if (newPassword !== confirmNewPassword) {
          showAlert('New password and confirmation do not match.');
          return;
        }

        const submitButton = event.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        try {
          const response = await fetch('/api/member-account-recovery', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'reset-password',
              recoveryCode,
              newPassword,
            }),
          });

          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.error || 'Unable to reset your password.');
          }

          const destination = payload.route === 'admin' ? '/admin.html' : '/member.html';
          showAlert(payload.message || 'Password reset complete. Redirecting to your dashboard...', 'success');
          window.setTimeout(() => {
            window.location.assign(destination);
          }, 600);
        } catch (error) {
          showAlert(error.message || 'Unable to reset your password.');
        } finally {
          submitButton.disabled = false;
        }
      });

      const recoveryCodeFromUrl = new URL(window.location.href).searchParams.get('recovery_code');
      if (recoveryCodeFromUrl) {
        document.getElementById('recoveryCode').value = recoveryCodeFromUrl;
      }
