(function () {
  const loadingShell = document.getElementById('badgeLoadingShell');
  const errorShell = document.getElementById('badgeErrorShell');
  const errorMessage = document.getElementById('badgeErrorMessage');
  const card = document.getElementById('badgeCard');
  const holderName = document.getElementById('badgeHolderName');
  const earnedAtText = document.getElementById('badgeEarnedAt');
  const shareTwitter = document.getElementById('badgeShareTwitter');
  const shareFacebook = document.getElementById('badgeShareFacebook');
  const shareLinkedIn = document.getElementById('badgeShareLinkedIn');
  const shareNative = document.getElementById('badgeShareNative');
  const shareCopy = document.getElementById('badgeShareCopy');
  const shareCopied = document.getElementById('badgeShareCopied');
  const pageTitle = document.getElementById('badgePageTitle');
  const pageDescription = document.getElementById('badgePageDescription');

  function showError(message) {
    if (loadingShell) loadingShell.classList.add('d-none');
    if (card) card.classList.add('d-none');
    if (errorShell) {
      errorShell.classList.remove('d-none');
      if (message && errorMessage) errorMessage.textContent = message;
    }
  }

  function formatDate(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return '';
    try {
      return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return parsed.toISOString().slice(0, 10);
    }
  }

  function buildShareLinks(displayName, shareUrl) {
    const text = `${displayName} earned the Beginner Path Graduate badge on Gematria.Today.`;
    if (shareTwitter) {
      shareTwitter.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    }
    if (shareFacebook) {
      shareFacebook.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    }
    if (shareLinkedIn) {
      shareLinkedIn.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    }
    if (shareCopy) {
      shareCopy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(shareUrl);
          if (shareCopied) {
            shareCopied.classList.remove('d-none');
            window.setTimeout(() => shareCopied.classList.add('d-none'), 2000);
          }
        } catch {
          window.prompt('Copy this link', shareUrl);
        }
      });
    }
    if (shareNative && typeof navigator.share === 'function') {
      shareNative.classList.remove('d-none');
      shareNative.addEventListener('click', () => {
        navigator.share({ title: 'Gematria.Today badge', text, url: shareUrl }).catch(() => {});
      });
    }
  }

  async function load() {
    const params = new URLSearchParams(window.location.search);
    const username = (params.get('u') || params.get('user') || '').trim();
    if (!username) {
      showError('No user specified. Add ?u=username to the URL to view a member\'s badge.');
      return;
    }

    try {
      // Without a timeout a hung request left the loading shell spinning
      // forever, with no error path ever reached.
      const response = await fetch(`/api/public-badge?user=${encodeURIComponent(username)}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 404) {
        showError(`We couldn't find a Beginner Path Graduate badge for "${username}".`);
        return;
      }
      if (!response.ok) {
        showError('Something went wrong loading this badge. Please try again later.');
        return;
      }
      const data = await response.json();
      const displayName = String(data.displayName || data.username || username);
      const earnedAt = formatDate(data.badge?.earnedAt);
      if (holderName) holderName.textContent = displayName;
      if (earnedAtText) earnedAtText.textContent = earnedAt ? `Earned on ${earnedAt}` : '';
      const headline = `${displayName} earned the Beginner Path Graduate badge | Gematria.Today`;
      if (pageTitle) pageTitle.textContent = headline;
      if (pageDescription) pageDescription.setAttribute('content', `${displayName} completed the four-level beginner learning path on Gematria.Today.`);
      try { document.title = headline; } catch {}
      const shareUrl = `${window.location.origin}/b/${encodeURIComponent(data.username || username)}`;
      buildShareLinks(displayName, shareUrl);
      if (loadingShell) loadingShell.classList.add('d-none');
      if (card) card.classList.remove('d-none');
      window.gematriaTracking?.track?.('badge_share_page_view', { slug: data.badge?.slug, hasUser: true });
    } catch (error) {
      showError('Network error loading this badge.');
    }
  }

  window.addEventListener('DOMContentLoaded', load);
})();
