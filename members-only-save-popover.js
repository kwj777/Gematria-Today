(function installMembersOnlySavePopover() {
  if (typeof window === 'undefined' || window.createMembersOnlySavePopover) {
    return;
  }

  const HIDE_DELAY_MS = 200;
  const POPOVER_CONTENT = 'Only registered members can save searches. <a href="/member.html#registerForm">Join</a>.';
  const ARIA_LABEL = 'Only registered members can save searches. Join to unlock this feature.';
  // iOS treats the first tap on a hoverable element as a hover preview and
  // delays the click event until the second tap. Only attach hover triggers
  // on devices that actually have a hover-capable pointer.
  const HAS_HOVER = !!(window.matchMedia && window.matchMedia('(hover: hover)').matches);

  function createMembersOnlySavePopover(button) {
    if (!button || !window.bootstrap?.Popover) {
      return null;
    }
    if (button.__membersOnlySavePopover) {
      return button.__membersOnlySavePopover;
    }

    // Bootstrap reads the `title` attribute as the popover header, which
    // duplicates the body text. Strip it and expose the same copy via aria-label.
    button.removeAttribute('title');
    button.setAttribute('aria-label', ARIA_LABEL);

    const popover = new window.bootstrap.Popover(button, {
      container: 'body',
      html: true,
      trigger: 'manual',
      placement: 'top',
      content: POPOVER_CONTENT,
    });

    let hideTimeout = null;
    let tipListenersAttached = false;

    function cancelHide() {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    }

    function scheduleHide() {
      cancelHide();
      hideTimeout = window.setTimeout(() => popover.hide(), HIDE_DELAY_MS);
    }

    function showNow() {
      cancelHide();
      popover.show();
    }

    function attachTipListeners() {
      if (tipListenersAttached) {
        return;
      }
      const tipId = button.getAttribute('aria-describedby');
      const tip = tipId ? document.getElementById(tipId) : null;
      if (!tip) {
        return;
      }
      tipListenersAttached = true;
      if (HAS_HOVER) {
        tip.addEventListener('mouseenter', cancelHide);
        tip.addEventListener('mouseleave', scheduleHide);
      }
    }

    function resetTipListenersFlag() {
      tipListenersAttached = false;
    }

    if (HAS_HOVER) {
      button.addEventListener('mouseenter', showNow);
      button.addEventListener('mouseleave', scheduleHide);
    }
    button.addEventListener('focus', showNow);
    button.addEventListener('blur', scheduleHide);
    button.addEventListener('shown.bs.popover', attachTipListeners);
    button.addEventListener('hidden.bs.popover', resetTipListenersFlag);

    const handle = {
      dispose() {
        cancelHide();
        if (HAS_HOVER) {
          button.removeEventListener('mouseenter', showNow);
          button.removeEventListener('mouseleave', scheduleHide);
        }
        button.removeEventListener('focus', showNow);
        button.removeEventListener('blur', scheduleHide);
        button.removeEventListener('shown.bs.popover', attachTipListeners);
        button.removeEventListener('hidden.bs.popover', resetTipListenersFlag);
        popover.dispose();
        button.removeAttribute('aria-label');
        button.__membersOnlySavePopover = null;
      },
    };
    button.__membersOnlySavePopover = handle;
    return handle;
  }

  window.createMembersOnlySavePopover = createMembersOnlySavePopover;
})();
