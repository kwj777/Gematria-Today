      (function () {
        const CHECKLIST_SLUG = 'a-beginner-s-gematria-research-checklist-before-you-draw-conclusions';
        const DISMISS_KEY = 'learningPathCompletionBannerDismissed';
        const LEARNING_PATH_REFERRERS = ['/gematria-name-analysis'];

        function getParams() {
          try { return new URLSearchParams(window.location.search); }
          catch { return new URLSearchParams(''); }
        }

        function getRequestedSlug() {
          const params = getParams();
          const fromQuery = params.get('post') || window.location.hash.slice(1);
          if (fromQuery) {
            try { return decodeURIComponent(fromQuery); } catch { return fromQuery; }
          }
          const match = window.location.pathname.match(/^\/blog\/([^/?#]+)/i);
          if (!match) return '';
          try { return decodeURIComponent(match[1]); } catch { return match[1]; }
        }

        function detectSource() {
          if (getParams().get('from') === 'learning-path') return 'param';
          const ref = String(document.referrer || '').toLowerCase();
          if (LEARNING_PATH_REFERRERS.some((token) => ref.includes(token))) return 'referrer';
          return null;
        }

        async function recordCompletionForSignedInMember() {
          try {
            const csrfResponse = await fetch('/api/member-csrf', {
              credentials: 'same-origin',
              headers: { accept: 'application/json' },
            });
            if (!csrfResponse.ok) return;
            const csrfPayload = await csrfResponse.json().catch(() => ({}));
            const token = csrfPayload && csrfPayload.csrfToken;
            if (!token) return; // Anonymous visitor; nothing to persist.
            await fetch('/api/member-learning-path-complete', {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'content-type': 'application/json',
                'x-csrf-token': token,
              },
              body: '{}',
            });
          } catch {
            // Non-fatal: banner is shown regardless of server-side persistence.
          }
        }

        function maybeShow() {
          const banner = document.getElementById('learningPathCompletionBanner');
          if (!banner) return;
          try {
            if (window.sessionStorage.getItem(DISMISS_KEY) === 'true') return;
          } catch {
            // sessionStorage may be blocked; proceed without dismissal memory.
          }
          if (getRequestedSlug().toLowerCase() !== CHECKLIST_SLUG) return;
          const source = detectSource();
          if (!source) return;

          banner.classList.remove('d-none');
          window.gematriaTracking?.track?.('learning_path_completion_view', { source });
          recordCompletionForSignedInMember();

          const dismiss = document.getElementById('learningPathCompletionBannerDismiss');
          dismiss?.addEventListener('click', () => {
            try { window.sessionStorage.setItem(DISMISS_KEY, 'true'); } catch {}
            banner.classList.add('d-none');
            window.gematriaTracking?.track?.('learning_path_completion_dismiss', { source });
          });
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', maybeShow);
        } else {
          maybeShow();
        }
      })();
