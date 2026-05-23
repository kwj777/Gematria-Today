(function () {
  // Records the learning-path level the current page corresponds to so the
  // member dashboard's aspirational card can show "Continue Level N". Runs
  // once per page-load and silently no-ops for anonymous visitors (the
  // member-csrf endpoint will return 401, which we swallow). Levels are
  // resolved via the shared gematriaLearningPath helper, so updating the
  // lesson map there propagates here automatically.
  function getLevel() {
    try {
      return window.gematriaLearningPath?.getLevel?.(window.location.pathname) ?? null;
    } catch {
      return null;
    }
  }

  async function record(level) {
    try {
      const csrfRes = await fetch('/api/member-csrf', {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (!csrfRes.ok) return;
      const csrfPayload = await csrfRes.json().catch(() => ({}));
      const token = csrfPayload && csrfPayload.csrfToken;
      if (!token) return;
      await fetch('/api/member-learning-path-progress', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': token,
        },
        body: JSON.stringify({ level }),
      });
    } catch {
      // Non-fatal; the badge eventually unlocks at the completion checklist.
    }
  }

  function init() {
    const level = getLevel();
    if (!level) return;
    record(level);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
