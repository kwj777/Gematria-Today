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

        function revealAnonNotice() {
          const notice = document.getElementById('learningPathCompletionBannerAnonNotice');
          if (notice) notice.classList.remove('d-none');
        }

        async function recordCompletionForSignedInMember() {
          try {
            const csrfResponse = await fetch('/api/member-csrf', {
              credentials: 'same-origin',
              headers: { accept: 'application/json' },
            });
            if (!csrfResponse.ok) {
              revealAnonNotice();
              return;
            }
            const csrfPayload = await csrfResponse.json().catch(() => ({}));
            const token = csrfPayload && csrfPayload.csrfToken;
            if (!token) {
              revealAnonNotice();
              return;
            }
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

        function isStillOnChecklistPost() {
          return getRequestedSlug().toLowerCase() === CHECKLIST_SLUG && detectSource() !== null;
        }

        function removeLearningPathBreadcrumb() {
          const stale = document.querySelector('[data-learning-path-crumb]');
          if (stale) stale.remove();
        }

        function insertLearningPathBreadcrumb() {
          const breadcrumb = document.getElementById('blogBreadcrumb');
          if (!breadcrumb) return;
          const list = breadcrumb.querySelector('.breadcrumb');
          if (!list || list.querySelector('[data-learning-path-crumb]')) return;
          const crumb = document.createElement('li');
          crumb.className = 'breadcrumb-item';
          crumb.dataset.learningPathCrumb = 'true';
          const link = document.createElement('a');
          link.href = '/gematria-guide.html#learning-path';
          link.textContent = 'Learning Path';
          crumb.appendChild(link);
          const blogCrumb = list.firstElementChild;
          if (blogCrumb && blogCrumb.nextSibling) {
            list.insertBefore(crumb, blogCrumb.nextSibling);
          } else {
            list.appendChild(crumb);
          }

          // The blog uses replaceState to navigate between posts without a
          // full reload. Watch the breadcrumb's current item text for
          // changes so we can drop the Learning Path crumb if the user
          // navigates away from the checklist post.
          const current = document.getElementById('blogBreadcrumbCurrent');
          if (current && !current.dataset.learningPathObserverAttached) {
            current.dataset.learningPathObserverAttached = 'true';
            const observer = new MutationObserver(() => {
              if (!isStillOnChecklistPost()) removeLearningPathBreadcrumb();
            });
            observer.observe(current, { childList: true, characterData: true, subtree: true });
          }
        }

        function maybeShow() {
          const banner = document.getElementById('learningPathCompletionBanner');
          if (!banner) return;
          if (getRequestedSlug().toLowerCase() !== CHECKLIST_SLUG) return;
          const source = detectSource();
          if (!source) return;

          insertLearningPathBreadcrumb();

          try {
            if (window.sessionStorage.getItem(DISMISS_KEY) === 'true') return;
          } catch {
            // sessionStorage may be blocked; proceed without dismissal memory.
          }

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
