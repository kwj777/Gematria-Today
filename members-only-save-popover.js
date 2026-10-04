(function installMembersOnlySavePopover() {
  if (typeof window === 'undefined' || window.createMembersOnlySavePopover) {
    return;
  }

  const HIDE_DELAY_MS = 200;
  const POPOVER_CONTENT = 'Only registered members can save searches. <a href="/member.html#registerForm">Join</a>.';
  // Appended to the button's visible text, never in place of it: speech-input
  // users say what they see ("click Save result"), and a name that dropped
  // those words matched nothing (WCAG 2.5.3). The popover, which Bootstrap
  // links through aria-describedby while it is open, carries the rest.
  const ARIA_LABEL_SUFFIX = ' (members only)';
  const FALLBACK_ARIA_LABEL = 'Save (members only)';
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
    // duplicates the body text. Strip it, and say in the name that saving is
    // for members.
    button.removeAttribute('title');
    const visibleLabel = String(button.textContent || '').replace(/\s+/g, ' ').trim();
    button.setAttribute('aria-label', visibleLabel ? `${visibleLabel}${ARIA_LABEL_SUFFIX}` : FALLBACK_ARIA_LABEL);

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
      // The tip contains a "Join free" link. Blur on the button scheduled the
      // hide, so a keyboard user tabbing toward that link dismissed the
      // popover before they could ever reach it (WCAG 1.4.13).
      tip.addEventListener('focusin', cancelHide);
      tip.addEventListener('focusout', scheduleHide);
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
      // Both calculators call handle.show() from their guest save handlers.
      // The handle only ever exposed dispose(), so those calls either threw a
      // TypeError or silently did nothing depending on whether Bootstrap's
      // Popover had loaded -- either way the guest never saw the tip.
      show: showNow,
      hide() {
        cancelHide();
        popover.hide();
      },
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
