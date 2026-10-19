(function () {
  // Wires up the dismissable "earn a badge" learning-path nudge that's
  // embedded in the calculator and results pages. Looks for the element
  // with id="learningPathNudge"; quietly does nothing if absent so it's
  // safe to include unconditionally.
  //
  // Two-tier suppression so users don't see the nudge over and over:
  //   * dismiss → 30 days of localStorage suppression (cross-session)
  //   * first view → sessionStorage flag suppresses on later pages in
  //     the same visit, so the nudge only anchors once per session
  //     (audit's Pol2 -- avoids banner fatigue across home/calculator/
  //     results within a single browse).
  const DISMISS_KEY = 'learningPathNudgeDismissedAt';
  const SESSION_SHOWN_KEY = 'learningPathNudgeShownThisSession';
  const HIDE_FOR_MS = 30 * 24 * 60 * 60 * 1000;

  function init() {
    const nudge = document.getElementById('learningPathNudge');
    if (!nudge) return;
    let dismissedAt = 0;
    try { dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0); } catch {}
    if (dismissedAt && Date.now() - dismissedAt < HIDE_FOR_MS) return;
    let shownThisSession = false;
    try { shownThisSession = window.sessionStorage.getItem(SESSION_SHOWN_KEY) === '1'; } catch {}
    if (shownThisSession) return;
    const source = nudge.dataset.nudgeSource || 'unknown';
    nudge.classList.remove('d-none');
    // On the calculator the nudge sits under the results, often below the
    // fold. Count it as viewed, and use up the once-per-session slot, only
    // once at least half of it has stayed on screen for a second -- so a
    // layout shift just after load cannot count it unseen.
    const markShown = () => {
      try { window.sessionStorage.setItem(SESSION_SHOWN_KEY, '1'); } catch {}
      window.gematriaTracking?.track?.('beginner_path_nudge_view', { source });
    };
    if (typeof window.IntersectionObserver === 'function') {
      let dwellTimer = null;
      const observer = new window.IntersectionObserver((entries) => {
        const visible = entries[entries.length - 1].intersectionRatio >= 0.5;
        if (!visible) {
          window.clearTimeout(dwellTimer);
          dwellTimer = null;
          return;
        }
        if (dwellTimer) return;
        dwellTimer = window.setTimeout(() => {
          observer.disconnect();
          markShown();
        }, 1000);
      }, { threshold: [0, 0.5] });
      observer.observe(nudge);
    } else {
      markShown();
    }
    document.getElementById('learningPathNudgeCta')?.addEventListener('click', () => {
      window.gematriaTracking?.track?.('beginner_path_start_click', {
        source: `${source}_nudge`,
        destination: '/gematria-basics.html',
      });
    });
    document.getElementById('learningPathNudgeDismiss')?.addEventListener('click', () => {
      try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
      nudge.classList.add('d-none');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
