      const alertEl = document.getElementById('forumAlert');
      const forumAppEl = document.getElementById('forumApp');
      const threadListEl = document.getElementById('threadList');
      const threadDetailEl = document.getElementById('threadDetail');
      const replyListEl = document.getElementById('replyList');
      const trendingThreadListEl = document.getElementById('trendingThreadList');
      const categoryFilterEl = document.getElementById('forumCategoryFilter');
      const categoryCreateEl = document.getElementById('newThreadCategory');
      const sortEl = document.getElementById('forumSort');
      const moderationSectionEl = document.getElementById('moderationSection');
      const moderationListEl = document.getElementById('moderationList');
      const areaEl = document.getElementById('forumArea');
      const searchEl = document.getElementById('forumSearch');
      const toggleForumRulesButtonEl = document.getElementById('toggleForumRulesButton');
      const forumRulesContentEl = document.getElementById('forumRulesContent');
      const forumFilterControlsEl = document.getElementById('forumFilterControls');
      const forumFilterToggleButtonEl = document.getElementById('forumFilterToggleButton');

      function wireCharCount(inputId, counterId) {
        const input = document.getElementById(inputId);
        const counter = document.getElementById(counterId);
        if (!input || !counter) return;
        const max = Number(input.getAttribute('maxlength')) || 0;
        const update = () => {
          const len = input.value.length;
          counter.textContent = `${len} / ${max}`;
          counter.classList.toggle('forum-char-count--near', max > 0 && len >= max * 0.9);
          counter.classList.toggle('forum-char-count--at', max > 0 && len >= max);
        };
        input.addEventListener('input', update);
        update();
      }
      wireCharCount('newThreadTitle', 'newThreadTitleCount');
      wireCharCount('newThreadBody', 'newThreadBodyCount');
      wireCharCount('newReplyBody', 'newReplyBodyCount');

      let isAdmin = false;
      let isPremium = false;
      let currentThread = null;
      const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      const iconByName = {
        megaphone: '📢',
        chat: '💬',
        'book-open': '📖',
        'heart-handshake': '🤝',
        'shield-check': '🛡️',
        lightbulb: '💡',
        sparkles: '✨',
        'praying-hands': '🙏',
      };

      function showAlert(message, type = 'danger') {
        alertEl.className = `alert alert-${type}`;
        alertEl.textContent = message;
        alertEl.classList.remove('d-none');
      }

      // Failures used to leave the page with a bare message and no way
      // forward: #forumApp stays hidden, so the alert was the whole page.
      function showRetryableAlert(message, retry) {
        alertEl.className = 'alert alert-danger';
        alertEl.textContent = '';
        const heading = document.createElement('p');
        heading.className = 'fw-semibold mb-1';
        heading.textContent = 'Something went wrong';
        const detail = document.createElement('p');
        detail.className = 'mb-3';
        detail.textContent = message;
        const retryButton = document.createElement('button');
        retryButton.className = 'btn btn-outline-danger';
        retryButton.type = 'button';
        retryButton.textContent = 'Try again';
        retryButton.addEventListener('click', () => {
          retryButton.disabled = true;
          retryButton.textContent = 'Retrying…';
          Promise.resolve()
            .then(retry)
            .catch((error) => showRetryableAlert(error.message, retry));
        });
        alertEl.append(heading, detail, retryButton);
        alertEl.classList.remove('d-none');
      }

      function showAuthRequiredAlert() {
        alertEl.className = 'alert alert-warning';
        alertEl.textContent = '';
        const message = document.createElement('p');
        message.className = 'mb-3';
        message.textContent = 'Please sign in with your member account to access the forum. New here? Create a free account in seconds.';
        const actions = document.createElement('div');
        actions.className = 'd-flex flex-wrap gap-2';
        const signInLink = document.createElement('a');
        signInLink.className = 'btn btn-outline-warning fw-semibold';
        signInLink.href = '/member.html?auth=login#authSection';
        signInLink.textContent = 'Sign in';
        const signUpLink = document.createElement('a');
        signUpLink.className = 'btn btn-warning fw-semibold';
        signUpLink.href = '/member.html?auth=register#authSection';
        signUpLink.textContent = 'Create free account';
        actions.append(signInLink, signUpLink);
        alertEl.append(message, actions);
        alertEl.classList.remove('d-none');
      }

      function clearAlert() {
        alertEl.classList.add('d-none');
      }

      // A maintenance page, proxy error or 502 comes back as HTML, so
      // response.json() throws a SyntaxError whose message ("Unexpected token
      // '<'...") used to be printed straight into the page. Anything that
      // isn't a real server-authored message becomes friendly copy here.
      const UNREACHABLE_MESSAGE = 'We couldn’t reach the forum. Check your connection and try again.';
      const UNAVAILABLE_MESSAGE = 'The forum is temporarily unavailable. Please try again in a moment.';

      async function readJsonResponse(response) {
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new Error(UNAVAILABLE_MESSAGE);
        }
        if (!response.ok) throw new Error(payload.error || UNAVAILABLE_MESSAGE);
        return payload;
      }

      async function apiGet(url) {
        let response;
        try {
          response = await fetch(url, { credentials: 'include' });
        } catch {
          throw new Error(UNREACHABLE_MESSAGE);
        }
        return readJsonResponse(response);
      }

      async function apiPost(body) {
        let response;
        try {
          response = await fetch('/api/member-forum', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
        } catch {
          throw new Error(UNREACHABLE_MESSAGE);
        }
        return readJsonResponse(response);
      }

      function formatDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
      }

      function setForumRulesExpanded(expanded) {
        toggleForumRulesButtonEl.setAttribute('aria-expanded', String(expanded));
        toggleForumRulesButtonEl.textContent = expanded ? 'Hide rules' : 'Read rules';
        forumRulesContentEl.hidden = !expanded;
        forumRulesContentEl.classList.toggle('d-none', !expanded);
      }

      toggleForumRulesButtonEl?.addEventListener('click', () => {
        const isExpanded = toggleForumRulesButtonEl.getAttribute('aria-expanded') === 'true';
        setForumRulesExpanded(!isExpanded);
      });

      function esc(value) {
        return String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
      }

      // WCAG 2 relative luminance of a #rrggbb color, or null if it isn't one.
      function relativeLuminance(hexColor) {
        const match = /^#?([0-9a-f]{6})$/i.exec(String(hexColor || ''));
        if (!match) return null;
        const int = Number.parseInt(match[1], 16);
        const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((channel) => {
          const value = channel / 255;
          return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }

      function contrastRatio(luminanceA, luminanceB) {
        const [lighter, darker] = luminanceA > luminanceB ? [luminanceA, luminanceB] : [luminanceB, luminanceA];
        return (lighter + 0.05) / (darker + 0.05);
      }

      // Category colors are free admin input, so pick the chip text by WCAG
      // contrast, not a brightness threshold: that put white on cyan, teal and
      // orange at about 2:1. On mid-tones where neither white nor the body ink
      // reaches 4.5:1, black always does (white failing implies black passes).
      function textColorForBackground(hexColor = '#6c757d') {
        const background = relativeLuminance(hexColor);
        if (background === null) return '#ffffff';
        const [best] = ['#ffffff', '#212529']
          .map((color) => ({ color, ratio: contrastRatio(background, relativeLuminance(color)) }))
          .sort((a, b) => b.ratio - a.ratio);
        return best.ratio >= 4.5 ? best.color : '#000000';
      }

      function renderCategoryChip(thread) {
        const color = /^#[0-9a-f]{6}$/i.test(String(thread.categoryColorBadge || '').trim()) ? thread.categoryColorBadge : '#6c757d';
        const icon = iconByName[String(thread.categoryIconName || '').trim()] || '';
        const colorText = textColorForBackground(color);
        const categoryName = esc(thread.categoryName || 'Category');
        const iconMarkup = icon ? `<span class="forum-category-icon" aria-hidden="true">${icon}</span>` : '';
        return `<span class="forum-category-chip" style="background:${color};color:${colorText};">${iconMarkup}<span>${categoryName}</span></span>`;
      }

      // Archived and locked categories take no new threads, and moderators-only
      // ones take them from staff alone, so the composer does not offer them.
      function acceptsNewThreads(category) {
        if (category.isArchived || category.isLocked) return false;
        return category.postMode !== 'moderators' || isAdmin;
      }

      function renderCategories(categories) {
        for (const select of [categoryFilterEl, categoryCreateEl]) {
          const keepAll = select === categoryFilterEl ? '<option value="">All categories</option>' : '';
          const options = select === categoryCreateEl ? categories.filter(acceptsNewThreads) : categories;
          select.innerHTML = keepAll + options.map((category) => {
            const icon = iconByName[String(category.iconName || '').trim()] || '';
            return `<option value="${esc(category.slug)}">${icon ? `${icon} ` : ''}${esc(category.name)}</option>`;
          }).join('');
        }
      }

      function renderThreads(threads) {
        if (!threads.length) {
          const searchActive = Boolean(searchEl.value.trim());
          threadListEl.innerHTML = `
            <article class="forum-empty-state" role="status" aria-live="polite">
              <p class="forum-empty-title mb-1">${searchActive ? 'No search results' : 'No threads yet'}</p>
              <p class="forum-empty-copy mb-0">${searchActive ? 'Try a different keyword, category, or area filter.' : 'Be the first member to start a discussion in this area.'}</p>
            </article>
          `;
          return;
        }

        // The card used to be role="button" itself, which hid everything in it
        // (excerpt, author, counts, Locked) behind its label and nested the
        // author and badge controls inside a button. The title is now the
        // real control; the card keeps a mouse-only click as a convenience.
        // no-glossary: the glossary skipped the card while it was role="button".
        // Its term buttons would add tab stops to every card in the list, and a
        // tap on one (the only way to open a definition on touch) opened the thread.
        threadListEl.innerHTML = threads.map((thread) => `
          <article class="forum-thread-card" data-thread-id="${thread.id}">
            <div class="d-flex justify-content-between align-items-start gap-3 no-glossary">
              <div class="forum-thread-card-main">
                <h3 class="h6 mb-1 forum-subtitle"><button type="button" class="forum-thread-open">${esc(thread.title)}</button> ${thread.isLocked ? '<span class="badge text-bg-warning ms-1">Locked</span>' : ''}</h3>
                <p class="small text-muted mb-1 forum-meta">
                  <span class="forum-meta-item">${renderCategoryChip(thread)}</span>
                  <span class="forum-meta-item">By ${renderAuthorInline(thread)}</span>
                  <span class="forum-meta-item">${thread.replyCount} replies</span>
                  <span class="forum-meta-item">${thread.viewCount} views</span>
                </p>
                <p class="small mb-0 forum-body">${esc(thread.body.slice(0, 180))}</p>
              </div>
              <span class="badge text-bg-secondary forum-thread-score">${thread.popularityScore}</span>
            </div>
          </article>
        `).join('');

        threadListEl.querySelectorAll('[data-thread-id]').forEach((card) => {
          // The title button's own click (mouse, Enter or Space) bubbles here.
          // Every other control in the card (author profile, badge link, a
          // glossary term) and the popups they open do their own thing.
          card.addEventListener('click', (event) => {
            if (event.target.closest('a, button:not(.forum-thread-open), .forum-profile-popover, .defn-popup')) return;
            loadThread(card.dataset.threadId).catch((error) => showAlert(error.message));
          });
        });
        bindAuthorPopovers(threadListEl);
      }

      function renderReplies(replies) {
        if (!replies.length) {
          replyListEl.innerHTML = `
            <article class="forum-empty-state" role="status" aria-live="polite">
              <p class="forum-empty-title mb-1">No replies yet</p>
              <p class="forum-empty-copy mb-0">Share your perspective and post the first reply.</p>
            </article>
          `;
          return;
        }

        replyListEl.innerHTML = replies.map((reply) => `
          <article class="forum-reply-card p-3 mb-3" data-reply-id="${reply.id}">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
              <p class="small text-muted mb-0 forum-meta">${renderAuthorInline(reply)} · ${formatDate(reply.createdAt)}</p>
              <div class="d-flex gap-2 align-items-center">
                <button class="btn btn-outline-warning btn-sm" type="button" data-report-reply="${reply.id}" title="Report this reply to the moderation team" aria-label="Report this reply to the moderation team">Report</button>
                ${isAdmin ? `<span class="badge text-bg-secondary forum-mod-inline-label" aria-hidden="true">Mod</span><button class="btn btn-outline-danger btn-sm" type="button" data-delete-reply="${reply.id}" title="Delete this reply permanently (moderator only)" aria-label="Delete this reply permanently (moderator only)">Delete</button>` : ''}
              </div>
            </div>
            <p class="mb-0 forum-body">${esc(reply.body)}</p>
          </article>
        `).join('');

        replyListEl.querySelectorAll('[data-report-reply]').forEach((button) => {
          button.addEventListener('click', () => reportReply(button.dataset.reportReply).catch((error) => showAlert(error.message)));
        });

        replyListEl.querySelectorAll('[data-delete-reply]').forEach((button) => {
          button.addEventListener('click', () => deleteReply(button.dataset.deleteReply).catch((error) => showAlert(error.message)));
        });
        bindAuthorPopovers(replyListEl);
      }

      function renderTrendingThreads(threads) {
        const trending = [...threads]
          .sort((a, b) => Number(b.popularityScore || 0) - Number(a.popularityScore || 0) || new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0))
          .slice(0, 5);

        if (!trending.length) {
          trendingThreadListEl.innerHTML = '<p class="text-muted mb-0">Trending threads will appear as discussions grow.</p>';
          return;
        }

        trendingThreadListEl.innerHTML = trending.map((thread, index) => `
          <button type="button" class="forum-trending-card" data-trending-thread-id="${thread.id}">
            <p class="small text-muted mb-1">#${index + 1} · Score ${Number(thread.popularityScore || 0)}</p>
            <h3 class="h6 mb-2 forum-subtitle">${esc(thread.title)}</h3>
            <p class="small text-muted mb-0">${thread.replyCount} replies · ${thread.viewCount} views</p>
          </button>
        `).join('');

        trendingThreadListEl.querySelectorAll('[data-trending-thread-id]').forEach((button) => {
          button.addEventListener('click', () => loadThread(button.dataset.trendingThreadId).catch((error) => showAlert(error.message)));
        });
      }

      function renderThreadLoadingState() {
        threadListEl.innerHTML = Array.from({ length: 3 }, (_, index) => `
          <article class="forum-thread-card forum-skeleton-card" aria-hidden="true" data-skeleton-id="${index}">
            <div class="forum-skeleton forum-skeleton-line forum-skeleton-line--title"></div>
            <div class="forum-skeleton forum-skeleton-line forum-skeleton-line--meta"></div>
            <div class="forum-skeleton forum-skeleton-line forum-skeleton-line--body"></div>
          </article>
        `).join('');
      }

      function renderReplyLoadingState() {
        replyListEl.innerHTML = Array.from({ length: 2 }, (_, index) => `
          <article class="forum-reply-card p-3 forum-skeleton-card" aria-hidden="true" data-reply-skeleton-id="${index}">
            <div class="forum-skeleton forum-skeleton-line forum-skeleton-line--meta mb-2"></div>
            <div class="forum-skeleton forum-skeleton-line forum-skeleton-line--body"></div>
          </article>
        `).join('');
      }

      function updateModeratorButtons(thread) {
        const modToolbar = document.getElementById('threadModToolbar');
        const lockButton = document.getElementById('lockThreadButton');
        const replySubmitButton = document.getElementById('replySubmitButton');
        const replyBox = document.getElementById('newReplyBody');

        if (isAdmin) {
          modToolbar.classList.remove('d-none');
          modToolbar.hidden = false;
          const locking = thread.isLocked;
          lockButton.textContent = locking ? 'Unlock' : 'Lock';
          lockButton.dataset.mode = locking ? 'unlock_thread' : 'lock_thread';
          lockButton.setAttribute('aria-label', locking ? 'Unlock this thread (moderator only)' : 'Lock this thread (moderator only)');
          lockButton.setAttribute('title', locking ? 'Unlock this thread (moderator only)' : 'Lock or unlock this thread (moderator only)');
        } else {
          modToolbar.classList.add('d-none');
          modToolbar.hidden = true;
        }

        // Only moderators can reply to a thread that is still awaiting approval.
        const awaitingApproval = Boolean(thread.pendingApproval) && !isAdmin;
        const locked = Boolean(thread.isLocked) || awaitingApproval;
        replySubmitButton.disabled = locked;
        replyBox.disabled = locked;
        if (locked) {
          replyBox.placeholder = awaitingApproval ? 'Replies open once a moderator approves this thread.' : 'Thread is locked by moderators.';
        } else {
          replyBox.placeholder = '';
        }
      }

      // Visual theme metadata for the forum's earned badges. Each entry maps a
      // badge name to an emoji glyph, a category-themed pill style, and (where
      // relevant) a tier so multi-tier badges (Pioneer, Seeker, etc.) can show
      // bronze/silver/gold/platinum accents.
      const BADGE_THEMES = {
        Moderator:                 { icon: '🛡️', theme: 'mod' },
        Supporter:                 { icon: '⭐',  theme: 'premium' },
        Contributor:               { icon: '✍️', theme: 'contributor' },
        Trusted:                   { icon: '✅', theme: 'reputation', tier: 1 },
        Sage:                      { icon: '📚', theme: 'reputation', tier: 2 },
        'Pioneer I':               { icon: '🧭', theme: 'pioneer', tier: 1 },
        'Pioneer II':              { icon: '🧭', theme: 'pioneer', tier: 2 },
        'Pioneer III':             { icon: '🧭', theme: 'pioneer', tier: 3 },
        'Seeker I':                { icon: '🔍', theme: 'seeker', tier: 1 },
        'Seeker II':               { icon: '🔍', theme: 'seeker', tier: 2 },
        'Seeker III':              { icon: '🔍', theme: 'seeker', tier: 3 },
        'Seeker IV':               { icon: '🔍', theme: 'seeker', tier: 4 },
        'Base Root Hunter I':      { icon: '🌳', theme: 'baseroot', tier: 1 },
        'Base Root Hunter II':     { icon: '🌳', theme: 'baseroot', tier: 2 },
        'Gematrist I':             { icon: '🔢', theme: 'gematrist', tier: 1 },
        'Gematrist II':            { icon: '🔢', theme: 'gematrist', tier: 2 },
        'Beginner Path Graduate':  { icon: '🎓', theme: 'learning' },
      };

      const LEARNING_PATH_BADGE_NAME = 'Beginner Path Graduate';

      function renderBadges(badges, options = {}) {
        if (!Array.isArray(badges) || !badges.length) return '';
        const username = options.username || '';
        // Hoist the learning-path graduate badge to the front so the
        // achievement reads first, and render it as an anchor pointing to
        // the holder's public /b/USERNAME page so others can verify it.
        const hasLearningPath = badges.includes(LEARNING_PATH_BADGE_NAME);
        const remaining = badges.filter((badge) => badge !== LEARNING_PATH_BADGE_NAME);
        const ordered = hasLearningPath ? [LEARNING_PATH_BADGE_NAME, ...remaining] : remaining;
        return ordered.map((badge) => {
          const theme = BADGE_THEMES[badge] || { icon: '🏅', theme: 'default' };
          const tierClass = theme.tier ? ` forum-badge--tier-${theme.tier}` : '';
          if (badge === LEARNING_PATH_BADGE_NAME) {
            const href = username ? `/b/${encodeURIComponent(username)}` : '/gematria-basics.html';
            const title = username ? `View ${username}'s Beginner Path Graduate badge` : 'Earn the Beginner Path Graduate badge';
            return `<a class="forum-badge forum-badge--${theme.theme} forum-badge--primary${tierClass}" href="${href}" target="_blank" rel="noopener" title="${esc(title)}"><span class="forum-badge-icon" aria-hidden="true">${theme.icon}</span><span class="forum-badge-label">${esc(badge)}</span></a>`;
          }
          return `<span class="forum-badge forum-badge--${theme.theme}${tierClass}" title="${esc(badge)}"><span class="forum-badge-icon" aria-hidden="true">${theme.icon}</span><span class="forum-badge-label">${esc(badge)}</span></span>`;
        }).join('');
      }

      function membershipLabel(level) {
        const normalized = String(level || 'free').toLowerCase();
        if (normalized === 'lifetime') return 'Lifetime supporter';
        if (normalized === 'premium') return 'Supporter';
        return 'Free member';
      }

      function renderAuthorInline(item) {
        const profile = {
          username: item.authorUsername || 'member',
          displayName: item.authorDisplayName || '',
          reputation: Number(item.authorReputation || 0),
          badges: item.authorBadges || [],
          threadCount: Number(item.authorThreadCount || 0),
          replyCount: Number(item.authorReplyCount || 0),
          membershipLevel: item.authorMembershipLevel || 'free',
          joinedAt: item.authorJoinedAt || null,
        };
        const payload = esc(JSON.stringify(profile));
        return `
          <span class="forum-author">
            <button class="forum-author-trigger" type="button" aria-expanded="false" aria-haspopup="dialog" data-author-profile="${payload}">
              ${esc(profile.displayName || profile.username)}
            </button>
            <span class="small">(${profile.reputation} rep)</span> ${renderBadges(profile.badges, { username: profile.username })}
          </span>
        `;
      }

      function showAuthorPopover(trigger, profile) {
        closeAuthorPopovers();
        const popover = document.createElement('div');
        const popoverId = `authorProfilePopover-${profile.username || 'member'}-${Math.random().toString(36).slice(2, 8)}`;
        popover.className = 'forum-profile-popover';
        popover.id = popoverId;
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-modal', 'false');
        popover.setAttribute('aria-label', `${profile.displayName || profile.username} profile details`);
        popover.setAttribute('tabindex', '-1');
        popover.innerHTML = `
          <div class="d-flex align-items-start justify-content-between gap-2">
            <p class="fw-semibold mb-1">${esc(profile.displayName || profile.username)}</p>
            <button type="button" class="forum-profile-popover-close" aria-label="Close profile details">×</button>
          </div>
          <p class="small text-muted mb-1">@${esc(profile.username)} · ${profile.reputation} rep</p>
          <p class="small text-muted mb-2">${membershipLabel(profile.membershipLevel)}${profile.joinedAt ? ` · joined ${formatDate(profile.joinedAt)}` : ''}</p>
          <p class="small mb-2">${profile.threadCount} threads · ${profile.replyCount} replies</p>
          <div>${renderBadges(profile.badges, { username: profile.username })}</div>
        `;
        trigger.parentElement.appendChild(popover);
        trigger.setAttribute('aria-expanded', 'true');
        trigger.setAttribute('aria-controls', popoverId);
        popover.querySelector('.forum-profile-popover-close')?.addEventListener('click', () => {
          closeAuthorPopovers();
          trigger.focus();
        });
      }

      function closeAuthorPopovers() {
        document.querySelectorAll('.forum-profile-popover').forEach((popover) => popover.remove());
        document.querySelectorAll('.forum-author-trigger[aria-expanded="true"]').forEach((trigger) => {
          trigger.setAttribute('aria-expanded', 'false');
          trigger.removeAttribute('aria-controls');
        });
      }

      function bindAuthorPopovers(container) {
        // On touch-only devices, the synthetic mouseenter on first tap opens
        // the popover, then the click handler treats it as "already open" and
        // closes it. Only bind hover behavior when the device has hover.
        const hasHover = !!(window.matchMedia && window.matchMedia('(hover: hover)').matches);
        container.querySelectorAll('.forum-author-trigger').forEach((trigger) => {
          const raw = trigger.dataset.authorProfile;
          if (!raw) return;
          let profile;
          try {
            profile = JSON.parse(raw);
          } catch (error) {
            return;
          }

          if (hasHover) {
            trigger.addEventListener('mouseenter', () => showAuthorPopover(trigger, profile));
            trigger.parentElement?.addEventListener('mouseleave', () => closeAuthorPopovers());
          }
          trigger.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            showAuthorPopover(trigger, profile);
          });
          trigger.addEventListener('click', (event) => {
            event.stopPropagation();
            const hasOpen = trigger.parentElement.querySelector('.forum-profile-popover');
            if (hasOpen) {
              closeAuthorPopovers();
              return;
            }
            showAuthorPopover(trigger, profile);
          });
        });
      }

      async function loadThreads() {
        clearAlert();
        renderThreadLoadingState();
        const query = new URLSearchParams({ action: 'threads', sort: sortEl.value });
        query.set('area', areaEl.value);
        if (categoryFilterEl.value) query.set('category', categoryFilterEl.value);
        if (searchEl.value.trim()) query.set('q', searchEl.value.trim());
        const payload = await apiGet(`/api/member-forum?${query.toString()}`);
        renderCategories(payload.categories || []);
        categoryFilterEl.value = payload.category || '';
        sortEl.value = payload.sort || 'newest';
        areaEl.value = payload.area || 'free';
        searchEl.value = payload.searchQuery || '';
        const threads = payload.threads || [];
        renderThreads(threads);
        renderTrendingThreads(threads);
      }

      async function loadThread(threadId) {
        clearAlert();
        threadDetailEl.classList.remove('d-none');
        document.getElementById('threadDetailTitle').textContent = 'Loading thread…';
        document.getElementById('threadDetailMeta').textContent = 'Fetching thread details';
        document.getElementById('threadDetailBody').textContent = '';
        renderReplyLoadingState();
        const payload = await apiGet(`/api/member-forum?action=thread&threadId=${encodeURIComponent(threadId)}`);
        const thread = payload.thread;
        currentThread = thread;

        document.getElementById('threadDetailTitle').textContent = thread.title;
        document.getElementById('threadDetailMeta').innerHTML = `
          ${thread.pendingApproval ? '<span class="forum-meta-item"><span class="badge text-bg-warning">Awaiting approval</span></span>' : ''}
          <span class="forum-meta-item">${renderCategoryChip(thread)}</span>
          <span class="forum-meta-item">${renderAuthorInline(thread)}</span>
          <span class="forum-meta-item">${thread.replyCount} replies</span>
          <span class="forum-meta-item">${thread.viewCount} views</span>
        `;
        document.getElementById('threadDetailBody').textContent = thread.body;
        document.getElementById('replyThreadId').value = thread.id;
        renderReplies(payload.replies || []);
        updateModeratorButtons(thread);

        threadDetailEl.classList.remove('d-none');
        bindAuthorPopovers(threadDetailEl);
        threadDetailEl.scrollIntoView({
          behavior: reduceMotionQuery.matches ? 'auto' : 'smooth',
          block: 'start',
        });
      }

      async function reportThread() {
        if (!currentThread) return;
        const reason = prompt('Report reason (spam, harassment, off-topic, abuse, other):', 'spam');
        if (!reason) return;
        await apiPost({ action: 'report_thread', threadId: currentThread.id, reason });
        showAlert('Thread report submitted.', 'success');
      }

      async function reportReply(replyId) {
        const reason = prompt('Report reason (spam, harassment, off-topic, abuse, other):', 'spam');
        if (!reason) return;
        await apiPost({ action: 'report_reply', postId: replyId, reason });
        showAlert('Reply report submitted.', 'success');
      }

      async function deleteReply(replyId) {
        if (!confirm('Delete this reply?')) return;
        await apiPost({ action: 'delete_reply', replyId });
        await loadThread(currentThread.id);
        await loadThreads();
        showAlert('Reply deleted.', 'success');
      }

      async function moderateThread(mode) {
        if (!currentThread) return;
        if (!confirm(`Confirm ${mode === 'delete_thread' ? 'deleting' : mode === 'lock_thread' ? 'locking' : 'unlocking'} this thread?`)) return;
        await apiPost({ action: mode, threadId: currentThread.id });
        if (mode === 'delete_thread') {
          threadDetailEl.classList.add('d-none');
          currentThread = null;
        } else {
          await loadThread(currentThread.id);
        }
        await loadThreads();
        showAlert('Moderation action completed.', 'success');
      }

      async function approveThread(threadId) {
        await apiPost({ action: 'approve_thread', threadId });
        await loadModerationQueue();
        if (currentThread?.id === threadId) await loadThread(threadId);
        await loadThreads();
        showAlert('Thread approved and published.', 'success');
      }

      async function loadModerationQueue() {
        if (!isAdmin) return;
        moderationSectionEl.classList.remove('d-none');
        const payload = await apiGet('/api/member-forum?action=reports');
        const reports = payload.reports || [];
        const pendingThreads = payload.pendingThreads || [];
        if (!reports.length && !pendingThreads.length) {
          moderationListEl.innerHTML = '<p class="text-muted mb-0">No open reports or threads awaiting approval.</p>';
          return;
        }

        // Threads posted to a category that requires approval wait here, hidden
        // from other members until a moderator approves (or deletes) them.
        moderationListEl.innerHTML = pendingThreads.map((thread) => `
          <article class="border rounded p-3 mb-3">
            <p class="mb-1"><strong>Awaiting approval</strong> · ${esc(thread.categoryName)} · by ${esc(thread.authorUsername)} · ${formatDate(thread.createdAt)}</p>
            <p class="mb-2">${esc(thread.title)}</p>
            <div class="d-flex gap-2">
              <button class="btn btn-outline-secondary btn-sm" type="button" data-open-pending-thread="${esc(thread.id)}" aria-label="Open thread: ${esc(thread.title)}">Open</button>
              <button class="btn btn-outline-success btn-sm" type="button" data-approve-thread="${esc(thread.id)}" aria-label="Approve thread: ${esc(thread.title)}">Approve</button>
            </div>
          </article>
        `).join('') + reports.map((report) => `
          <article class="border rounded p-3 mb-3">
            <p class="mb-1"><strong>${esc(report.reason)}</strong> · by ${esc(report.reporterUsername)} · ${formatDate(report.createdAt)}</p>
            <p class="small text-muted mb-1">Thread: ${esc(report.threadId || 'n/a')} · Reply: ${esc(report.postId || 'n/a')}</p>
            <p class="mb-0">${esc(report.details || 'No additional details.')}</p>
          </article>
        `).join('');

        moderationListEl.querySelectorAll('[data-open-pending-thread]').forEach((button) => {
          button.addEventListener('click', () => loadThread(button.dataset.openPendingThread).catch((error) => showAlert(error.message)));
        });
        moderationListEl.querySelectorAll('[data-approve-thread]').forEach((button) => {
          button.addEventListener('click', () => approveThread(button.dataset.approveThread).catch((error) => showAlert(error.message)));
        });
      }

      document.getElementById('forumRefreshButton').addEventListener('click', () => loadThreads().catch((error) => showAlert(error.message)));
      sortEl.addEventListener('change', () => loadThreads().catch((error) => showAlert(error.message)));
      categoryFilterEl.addEventListener('change', () => loadThreads().catch((error) => showAlert(error.message)));
      searchEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        loadThreads().catch((error) => showAlert(error.message));
      });
      areaEl.addEventListener('change', () => {
        threadDetailEl.classList.add('d-none');
        currentThread = null;
        loadThreads().catch((error) => {
          if (error.message.includes('for supporters only')) {
            areaEl.value = 'free';
            showAlert('The supporter area is for supporters only. Switched back to free member area.', 'warning');
            loadThreads().catch((innerError) => showAlert(innerError.message));
            return;
          }
          showAlert(error.message);
        });
      });
      document.getElementById('reportThreadButton').addEventListener('click', () => reportThread().catch((error) => showAlert(error.message)));

      document.getElementById('lockThreadButton').addEventListener('click', (event) => {
        const mode = event.currentTarget.dataset.mode || 'lock_thread';
        moderateThread(mode).catch((error) => showAlert(error.message));
      });

      document.getElementById('deleteThreadButton').addEventListener('click', () => moderateThread('delete_thread').catch((error) => showAlert(error.message)));

      function refreshComposerCounts() {
        ['newThreadTitle', 'newThreadBody', 'newReplyBody'].forEach((id) => {
          document.getElementById(id)?.dispatchEvent(new Event('input'));
        });
      }

      const createThreadFormEl = document.getElementById('createThreadForm');
      const createReplyFormEl = document.getElementById('createReplyForm');

      createThreadFormEl.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          clearAlert();
          const payload = await apiPost({
            action: 'create_thread',
            categorySlug: categoryCreateEl.value,
            title: document.getElementById('newThreadTitle').value,
            body: document.getElementById('newThreadBody').value,
            ...(window.GematriaAntiBot?.honeypotPayload?.(createThreadFormEl) || {}),
          });
          createThreadFormEl.reset();
          refreshComposerCounts();
          await loadThreads();
          showAlert(payload?.thread?.pendingApproval
            ? 'Thread submitted. A moderator will review it before other members can see it.'
            : 'Thread posted.', 'success');
        } catch (error) {
          showAlert(error.message);
        }
      });

      createReplyFormEl.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          clearAlert();
          const threadId = document.getElementById('replyThreadId').value;
          await apiPost({
            action: 'create_reply',
            threadId,
            body: document.getElementById('newReplyBody').value,
            ...(window.GematriaAntiBot?.honeypotPayload?.(createReplyFormEl) || {}),
          });
          document.getElementById('newReplyBody').value = '';
          refreshComposerCounts();
          await loadThread(threadId);
          await loadThreads();
          showAlert('Reply posted.', 'success');
        } catch (error) {
          showAlert(error.message);
        }
      });

      if (forumFilterControlsEl && forumFilterToggleButtonEl) {
        const syncForumFilterVisibility = () => {
          if (window.innerWidth >= 768) {
            forumFilterControlsEl.hidden = false;
            forumFilterControlsEl.classList.remove('d-none');
            forumFilterToggleButtonEl.setAttribute('aria-expanded', 'true');
            forumFilterToggleButtonEl.textContent = 'Hide filters';
            return;
          }
          forumFilterControlsEl.hidden = true;
          forumFilterControlsEl.classList.add('d-none');
          forumFilterToggleButtonEl.setAttribute('aria-expanded', 'false');
          forumFilterToggleButtonEl.textContent = 'Show filters';
        };

        forumFilterToggleButtonEl.addEventListener('click', () => {
          const isHidden = forumFilterControlsEl.hidden;
          forumFilterControlsEl.hidden = !isHidden;
          forumFilterControlsEl.classList.toggle('d-none', !isHidden);
          forumFilterToggleButtonEl.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
          forumFilterToggleButtonEl.textContent = isHidden ? 'Hide filters' : 'Show filters';
        });

        window.addEventListener('resize', syncForumFilterVisibility);
        syncForumFilterVisibility();
      }

      document.addEventListener('click', (event) => {
        if (event.target.closest('.forum-author')) return;
        closeAuthorPopovers();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeAuthorPopovers();
      });

      async function init() {
        try {
          const session = await apiGet('/api/member-session');
          isAdmin = ['admin', 'super_admin'].includes(session?.user?.role) || Boolean(session?.user?.isAdmin);
          isPremium = ['premium', 'lifetime'].includes(session?.user?.membershipLevel);
          if (!isPremium && !isAdmin) {
            areaEl.value = 'free';
          }
          await loadThreads();
          await loadModerationQueue();
          forumAppEl.classList.remove('d-none');
        } catch (error) {
          if (error.message.toLowerCase().includes('unauthorized')) {
            showAuthRequiredAlert();
          } else {
            showRetryableAlert(error.message, init);
          }
        }
      }

      init();
