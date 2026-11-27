      const authSection = document.getElementById('authSection');
      const dashboardSection = document.getElementById('dashboardSection');
      const membershipHero = document.getElementById('membershipHero');
      const membershipPageContent = document.getElementById('membershipPageContent');
      const memberAlert = document.getElementById('memberAlert');
      const memberMeta = document.getElementById('memberMeta');
      const membershipLevel = document.getElementById('membershipLevel');
      const membershipPlanMeta = document.getElementById('membershipPlanMeta');
      const paymentButton = document.getElementById('paymentButton');
      const registerButton = document.querySelector('#registerForm button[type="submit"]');
      const registerPasswordInput = document.getElementById('registerPassword');
      const profileSaveButton = document.getElementById('profileSaveButton');
      const FREE_MEMBERSHIP_SAVE_LIMIT = 7;
      const HISTORY_PAGE_SIZE = 25;
      const FOLLOW_IT_SUBSCRIPTION_URL = 'https://api.follow.it/subscription-form/UGRiajBXSUFKaWpwZ1h3Q0xaQzdXdTV5UUdaamJxaFcvTXpQbWR5RjFpTExacnNMZE9MdkdkelY0ZGdza1R2M1ZkYnR6RDdvak5vYno4YzNEaEQwZC9ORkhma1RMdloyekNPTFphV1BrWVJzbHYvbTR5RzdiM0tBTGlzcXZPUHZ8NXlRaUNjSHhLN05ISUJ1RnhsWXJRakZqQkt4K1pwc1NxVlIyaGVybTdxND0=/8';
      const FOLLOW_IT_PENDING_SUBSCRIBE_KEY = 'memberFollowItPendingSubscribeEmail';
      const messageInboxCard = document.getElementById('messageInboxCard');
      const messageInboxOpenButton = document.getElementById('messageInboxOpenButton');
      const messageInboxCount = document.getElementById('messageInboxCount');
      const messageInboxMeta = document.getElementById('messageInboxMeta');
      const historyList = document.getElementById('historyList');
      const historyListToggleWrap = document.getElementById('historyListToggleWrap');
      const historyListToggleButton = document.getElementById('historyListToggleButton');
      const historyLoadMoreWrap = document.getElementById('historyLoadMoreWrap');
      const historyLoadMoreButton = document.getElementById('historyLoadMoreButton');
      const historySectionContent = document.getElementById('historySectionContent');
      const historySectionToggleButton = document.getElementById('historySectionToggleButton');
      const historySectionToggleLabel = document.getElementById('historySectionToggleLabel');
      const historySectionToggleArrow = document.getElementById('historySectionToggleArrow');
      const historySectionTitle = document.getElementById('historySectionTitle');
      const chatSessionList = document.getElementById('chatSessionList');
      const chatSessionSectionContent = document.getElementById('chatSessionSectionContent');
      const chatSessionSectionToggleButton = document.getElementById('chatSessionSectionToggleButton');
      const chatSessionSectionToggleLabel = document.getElementById('chatSessionSectionToggleLabel');
      const chatSessionSectionToggleArrow = document.getElementById('chatSessionSectionToggleArrow');
      const chatSessionSectionTitle = document.getElementById('chatSessionSectionTitle');
      const profileSectionContent = document.getElementById('profileSectionContent');
      const profileSectionToggleButton = document.getElementById('profileSectionToggleButton');
      const profileSectionToggleLabel = document.getElementById('profileSectionToggleLabel');
      const profileSectionToggleArrow = document.getElementById('profileSectionToggleArrow');
      const membershipUpgradeSection = document.getElementById('membershipUpgradeSection');
      const membershipUpgradeToggleButton = document.getElementById('membershipUpgradeToggleButton');
      const membershipUpgradeToggleLabel = document.getElementById('membershipUpgradeToggleLabel');
      const membershipUpgradeToggleArrow = document.getElementById('membershipUpgradeToggleArrow');
      const membershipUpgradeContent = document.getElementById('membershipUpgradeContent');
      const premiumResearchLink = document.getElementById('premiumResearchLink');
      const adminPageButton = document.getElementById('adminPageButton');
      const superAdminPageButton = document.getElementById('superAdminPageButton');
      const siteHubPageButton = document.getElementById('siteHubPageButton');
      const authTabRegister = document.getElementById('authTabRegister');
      const authTabLogin = document.getElementById('authTabLogin');
      const authPanelRegister = document.getElementById('authPanelRegister');
      const authPanelLogin = document.getElementById('authPanelLogin');
      const membershipHeroKicker = document.getElementById('membershipHeroKicker');
      const membershipHeroTitle = document.getElementById('membershipHeroTitle');
      const membershipHeroLead = document.getElementById('membershipHeroLead');
      const membershipHeroCta = document.getElementById('membershipHeroCta');
      const comparisonSection = document.getElementById('comparisonSection');
      const comparisonCurrentLevel = document.getElementById('comparisonCurrentLevel');
      const comparisonVisitorCurrent = document.getElementById('comparisonVisitorCurrent');
      const comparisonMemberCurrent = document.getElementById('comparisonMemberCurrent');
      const comparisonPremiumCurrent = document.getElementById('comparisonPremiumCurrent');
      const comparisonCreateAccountButton = document.getElementById('comparisonCreateAccountButton');
      const comparisonVisitorColumns = comparisonSection.querySelectorAll('.comparison-col--visitor');
      const comparisonMemberColumns = comparisonSection.querySelectorAll('.comparison-col--member');
      const comparisonPremiumColumns = comparisonSection.querySelectorAll('.comparison-col--premium');
      const learningPathStep1Section = document.getElementById('learningPathStep1Section');
      const goToLearningPathStep1Button = document.getElementById('goToLearningPathStep1Button');
      const learningPathCompletedSection = document.getElementById('learningPathCompletedSection');
      const learningPathCompletedAtText = document.getElementById('learningPathCompletedAtText');
      const learningPathCompletedDismiss = document.getElementById('learningPathCompletedDismiss');
      const learningPathShareLink = document.getElementById('learningPathShareLink');
      const learningPathShareTwitter = document.getElementById('learningPathShareTwitter');
      const learningPathShareFacebook = document.getElementById('learningPathShareFacebook');
      const learningPathShareLinkedIn = document.getElementById('learningPathShareLinkedIn');
      const learningPathShareCopy = document.getElementById('learningPathShareCopy');
      const learningPathShareCopied = document.getElementById('learningPathShareCopied');
      const learningPathShareNative = document.getElementById('learningPathShareNative');
      const learningPathAspireSection = document.getElementById('learningPathAspireSection');
      const learningPathAspireCta = document.getElementById('learningPathAspireCta');
      const learningPathAspireProgress = document.getElementById('learningPathAspireProgress');
      const LEARNING_PATH_COMPLETED_DISMISS_KEY = 'memberLearningPathCompletedDismissedAt';
      const messageCenterOpenButton = document.getElementById('messageCenterOpenButton');
      const manageSubscriptionButton = document.getElementById('manageSubscriptionButton');
      const messageCenterSection = document.getElementById('messageCenterSection');
      const messageCenterCloseButton = document.getElementById('messageCenterCloseButton');
      const messageCenterArchiveToggleButton = document.getElementById('messageCenterArchiveToggleButton');
      const messageCenterInboxHeading = document.getElementById('messageCenterInboxHeading');
      const messageCenterSentList = document.getElementById('messageCenterSentList');
      const messageCenterInboxList = document.getElementById('messageCenterInboxList');
      const dashboardMainContent = document.getElementById('dashboardMainContent');
      const premiumBlogProposalSection = document.getElementById('premiumBlogProposalSection');
      const premiumBlogProposalForm = document.getElementById('premiumBlogProposalForm');
      const premiumBlogProposalLockedMessage = document.getElementById('premiumBlogProposalLockedMessage');
      const premiumBlogProposalSuccessMessage = document.getElementById('premiumBlogProposalSuccessMessage');
      const premiumBlogProposalContent = document.getElementById('premiumBlogProposalContent');
      const premiumBlogProposalToggleButton = document.getElementById('premiumBlogProposalToggleButton');
      const premiumBlogProposalToggleLabel = document.getElementById('premiumBlogProposalToggleLabel');
      const premiumBlogProposalToggleArrow = document.getElementById('premiumBlogProposalToggleArrow');
      const memberProposalFeedbackList = document.getElementById('memberProposalFeedbackList');
      const memberChatbotFeedbackList = document.getElementById('memberChatbotFeedbackList');
      const blogProposalAttribution = document.getElementById('blogProposalAttribution');
      const blogSubscriptionSection = document.getElementById('blogSubscriptionSection');
      const blogSubscriptionForm = document.getElementById('blogSubscriptionForm');
      const blogSubscriptionEmail = document.getElementById('blogSubscriptionEmail');
      const blogSubscriptionButton = document.getElementById('blogSubscriptionButton');
      const blogSubscriptionPendingNotice = document.getElementById('blogSubscriptionPendingNotice');
      const forumNotificationSection = document.getElementById('forumNotificationSection');
      const forumNotificationSummary = document.getElementById('forumNotificationSummary');
      const forumNotificationList = document.getElementById('forumNotificationList');
      const forumNotificationLink = document.getElementById('forumNotificationLink');
      const forumNotificationCountTop = document.getElementById('forumNotificationCountTop');
      const forumNotificationCountMetaTop = document.getElementById('forumNotificationCountMetaTop');
      const forumNotificationTopLink = document.getElementById('forumNotificationTopLink');
      const forumNotificationQuickViewButton = document.getElementById('forumNotificationQuickViewButton');
      const forumNotificationContent = document.getElementById('forumNotificationContent');
      const forumNotificationToggleButton = document.getElementById('forumNotificationToggleButton');
      const forumNotificationToggleLabel = document.getElementById('forumNotificationToggleLabel');
      const forumNotificationToggleArrow = document.getElementById('forumNotificationToggleArrow');
      const MEMBER_DASHBOARD_SYNC_KEY = 'memberDashboardUpdate';
      const memberDashboardSyncChannel = typeof window.BroadcastChannel === 'function'
        ? new window.BroadcastChannel('member-dashboard-sync')
        : null;
      const siteModules = window.GematriaModules;
      const forumModuleEnabled = siteModules?.isEnabled('forum') !== false;
      const gemabotModuleEnabled = siteModules?.isEnabled('gemabot') !== false;

      const scheduleIdle = (cb) =>
        (typeof window.requestIdleCallback === 'function'
          ? window.requestIdleCallback(cb, { timeout: 1500 })
          : window.setTimeout(cb, 200));

      let session = null;
      let csrfToken = null;
      let historyItems = [];
      // member-history pages its results. historyTotal is every saved
      // calculation; historyHasMore says older ones are still on the server.
      let historyTotal = 0;
      let historyHasMore = false;
      let historyLoadMoreInFlight = false;
      let favoriteHistoryIds = new Set();
      const pendingHistoryNoteTimers = new Map();
      let showAllHistoryItems = false;
      let paymentConfirmationInFlight = false;
      let membershipHeroReady = false;
      let memberProposals = [];
      let memberChatbotFeedback = [];
      let archivedMemberProposals = [];
      let archivedMemberChatbotFeedback = [];
      let recentForumThreads = [];
      let chatSessions = [];
      let isMessageCenterOpen = false;
      let isArchiveViewOpen = false;
      let dashboardSyncRefreshInFlight = false;
      let lastDashboardSyncRefreshAt = 0;

      function ensureWorkingOverlay() {
        let overlay = document.getElementById('globalLoadingOverlay');
        if (overlay) {
          return overlay;
        }

        overlay = document.createElement('div');
        overlay.id = 'globalLoadingOverlay';
        overlay.className = 'global-loading-overlay';
        overlay.setAttribute('aria-live', 'polite');
        overlay.setAttribute('aria-busy', 'true');
        overlay.innerHTML = [
          '<div class="global-loading-overlay__card" role="status" aria-label="Loading">',
          '  <div class="global-loading-overlay__spinner" aria-hidden="true"></div>',
          '  <p class="global-loading-overlay__text">Working… Please wait.</p>',
          '</div>',
        ].join('');

        document.body.appendChild(overlay);
        return overlay;
      }

      function showWorkingOverlay() {
        const overlay = ensureWorkingOverlay();
        overlay.classList.add('global-loading-overlay--visible');
      }

      function hideWorkingOverlay() {
        const overlay = document.getElementById('globalLoadingOverlay');
        if (!overlay) {
          return;
        }
        overlay.classList.remove('global-loading-overlay--visible');
      }

      let memberAlertDismissTimer = null;

      function showAlert(message, tone = 'danger') {
        memberAlert.textContent = message;
        memberAlert.className = `alert alert-${tone}`;
        // The alert sits at the top of the page, so a member acting on a
        // control further down would never see the outcome scroll into view.
        if (!isElementInViewport(memberAlert)) {
          memberAlert.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'nearest',
          });
        }
        if (memberAlertDismissTimer) {
          window.clearTimeout(memberAlertDismissTimer);
          memberAlertDismissTimer = null;
        }
        if (tone === 'success' || tone === 'info') {
          memberAlertDismissTimer = window.setTimeout(() => {
            clearAlert();
          }, 6000);
        }
      }

      function isElementInViewport(element) {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);
      }

      function clearAlert() {
        memberAlert.textContent = '';
        memberAlert.className = 'alert d-none';
        if (memberAlertDismissTimer) {
          window.clearTimeout(memberAlertDismissTimer);
          memberAlertDismissTimer = null;
        }
      }

      function escapeHtml(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function formatTranscriptEntryHtml(text) {
        const normalizedText = String(text || '')
          .replace(/\r\n?/g, '\n')
          .replace(/\bDictionary lookup page for\s+"[^"\n]*"(?:\s+—\s+Preview:[^\n]*)?/gi, '')
          .replace(/\s*Actions ⋯\s*/g, ' ')
          .replace(/\s*Save to dashboard\s+Save image\s+Share\s*/gi, ' ')
          .replace(/\bSave to (?:my|membership)?\s*dashboard\b/gi, '')
          .replace(/\bSave image\b/gi, '')
          .replace(/\bCopy comparison\b/gi, '')
          .replace(/\bCopy lookup\b/gi, '')
          .replace(/\(\s*(singular|rare|uncommon|moderate|common|saturated)\s+—\s+[^)]+\)/gi, '($1)')
          .replace(/\s+(Comparison summary)\b/gi, '\n\n$1\n')
          .replace(/\s+(For\s+(?:"[^"\n]+"|[^,\n]+),\s+here\s+is\s+the\s+current\s+gematria\s+snapshot:)/gi, '\n\n$1')
          .replace(/\s+(Total:?\s*\d+)/gi, '\n$1')
          .replace(/\s+(Digital root:\s*\d+)/gi, '\n$1')
          .replace(/\s+(Base-root pattern:\s*(?:Yes|No))/gi, '\n$1')
          .replace(/\s+(Current archived matches:\s*[^\n]+)/gi, '\n$1')
          .replace(/\s+(Suggested next lookups)\b/gi, '\n$1')
          .replace(/\s+(Letter breakdown)\b/gi, '\n$1')
          .replace(/\s+(Related words lookup:)/gi, '\n$1')
          .replace(/[ \t]{2,}/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        if (!normalizedText) {
          return '<p class="mb-0 text-muted">No message text provided.</p>';
        }

        const blocks = normalizedText.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
        return blocks.map((block, index) => {
          const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
          const marginClass = index === blocks.length - 1 ? 'mb-0' : 'mb-2';

          const unorderedMatch = lines.every((line) => /^[*-]\s+/.test(line));
          if (unorderedMatch) {
            const items = lines.map((line) => `<li>${escapeHtml(line.replace(/^[*-]\s+/, ''))}</li>`).join('');
            return `<ul class="${marginClass} ps-4">${items}</ul>`;
          }

          const orderedMatch = lines.every((line) => /^\d+[.)]\s+/.test(line));
          if (orderedMatch) {
            const items = lines.map((line) => `<li>${escapeHtml(line.replace(/^\d+[.)]\s+/, ''))}</li>`).join('');
            return `<ol class="${marginClass} ps-4">${items}</ol>`;
          }

          if (lines.length === 1) {
            const headingMatch = lines[0].match(/^(#{1,3})\s+(.+)$/);
            if (headingMatch) {
              const level = Math.min(6, headingMatch[1].length + 2);
              return `<h${level} class="${marginClass}">${escapeHtml(headingMatch[2])}</h${level}>`;
            }
          }

          if (lines.length === 1 && !block.includes('\n')) {
            const sentenceChunks = block
              .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
              .map((line) => line.trim())
              .filter(Boolean);
            if (sentenceChunks.length >= 3 && block.length >= 180) {
              return `<p class="${marginClass}">${sentenceChunks.map((line) => escapeHtml(line)).join('<br>')}</p>`;
            }
          }

          return `<p class="${marginClass}">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`;
        }).join('');
      }

      function createChatSessionHtmlDocument(sessionItem = {}) {
        const transcriptEntries = Array.isArray(sessionItem.transcript) ? sessionItem.transcript : [];
        const createdAt = sessionItem.createdAt ? new Date(sessionItem.createdAt).toLocaleString() : 'Unknown save time';
        const messagesHtml = transcriptEntries.length
          ? transcriptEntries.map((entry) => `
              <article class="message ${entry.role === 'assistant' ? 'assistant' : 'user'}">
                <h3>${entry.role === 'assistant' ? 'GemaBot' : 'You'}</h3>
                <div>${formatTranscriptEntryHtml(entry.text || '')}</div>
              </article>
            `).join('')
          : '<p>No transcript messages were saved in this session.</p>';

        return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(sessionItem.title || 'GemaBot session')}</title>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.5; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1f2937; }
      h1 { margin-bottom: 0.25rem; }
      .meta { color: #6b7280; margin-bottom: 1.5rem; }
      .message { border: 1px solid #d1d5db; border-radius: 10px; padding: 1rem; margin-bottom: 1rem; background: #ffffff; }
      .message.assistant { background: #f8fafc; }
      .message h3 { margin-top: 0; margin-bottom: 0.5rem; font-size: 1rem; }
      p { margin-top: 0; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(sessionItem.title || 'GemaBot session')}</h1>
    <p class="meta">Topic: ${escapeHtml(sessionItem.topic || 'General chat')} · Saved ${escapeHtml(createdAt)}</p>
    ${messagesHtml}
  </body>
</html>`;
      }

      function createChatSessionMarkdownDocument(sessionItem = {}) {
        const transcriptEntries = Array.isArray(sessionItem.transcript) ? sessionItem.transcript : [];
        const createdAt = sessionItem.createdAt ? new Date(sessionItem.createdAt).toLocaleString() : 'Unknown save time';
        const heading = sessionItem.title || 'GemaBot session';
        const topic = sessionItem.topic || 'General chat';
        const messages = transcriptEntries.length
          ? transcriptEntries.map((entry) => `## ${entry.role === 'assistant' ? 'GemaBot' : 'You'}\n\n${entry.text || ''}`).join('\n\n')
          : 'No transcript messages were saved in this session.';

        return `# ${heading}\n\n- Topic: ${topic}\n- Saved: ${createdAt}\n\n${messages}\n`;
      }

      function createChatSessionPlainTextDocument(sessionItem = {}) {
        const transcriptEntries = Array.isArray(sessionItem.transcript) ? sessionItem.transcript : [];
        const createdAt = sessionItem.createdAt ? new Date(sessionItem.createdAt).toLocaleString() : 'Unknown save time';
        const heading = sessionItem.title || 'GemaBot session';
        const topic = sessionItem.topic || 'General chat';
        const messages = transcriptEntries.length
          ? transcriptEntries.map((entry, index) => `${index + 1}. ${entry.role === 'assistant' ? 'GemaBot' : 'You'}\n${entry.text || ''}`).join('\n\n')
          : 'No transcript messages were saved in this session.';

        return `${heading}\n\nTopic: ${topic}\nSaved: ${createdAt}\n\n${messages}\n`;
      }

      function createChatSessionJsonDocument(sessionItem = {}) {
        const transcriptEntries = Array.isArray(sessionItem.transcript) ? sessionItem.transcript : [];
        const payload = {
          title: sessionItem.title || 'GemaBot session',
          topic: sessionItem.topic || 'General chat',
          createdAt: sessionItem.createdAt || null,
          transcript: transcriptEntries.map((entry) => ({
            role: entry.role === 'assistant' ? 'assistant' : 'user',
            text: String(entry.text || ''),
          })),
        };

        return JSON.stringify(payload, null, 2);
      }

      function downloadChatSession(sessionItem = {}, format = 'html') {
        const exportConfig = {
          html: { content: createChatSessionHtmlDocument(sessionItem), mime: 'text/html;charset=utf-8', extension: 'html' },
          markdown: { content: createChatSessionMarkdownDocument(sessionItem), mime: 'text/markdown;charset=utf-8', extension: 'md' },
          text: { content: createChatSessionPlainTextDocument(sessionItem), mime: 'text/plain;charset=utf-8', extension: 'txt' },
          json: { content: createChatSessionJsonDocument(sessionItem), mime: 'application/json;charset=utf-8', extension: 'json' },
        };
        const selectedFormat = Object.prototype.hasOwnProperty.call(exportConfig, format) ? format : 'html';
        const { content, mime, extension } = exportConfig[selectedFormat];
        const blob = new Blob([content], { type: mime });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const fallbackName = `gematria-chat-session-${sessionItem.id || 'export'}`;
        const safeName = (sessionItem.title || fallbackName)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || fallbackName;

        link.href = objectUrl;
        link.download = `${safeName}.${extension}`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      }

      function scheduleFollowItTabAutoClose(followItWindow, minDelayMs = 15000, maxDelayMs = 300000) {
        if (!followItWindow || followItWindow.closed) {
          return;
        }

        const start = Date.now();
        const isFollowItConfirmationPage = () => {
          try {
            const locationHref = String(followItWindow.location?.href || '');
            if (!locationHref) {
              return false;
            }
            const followItUrl = new URL(locationHref);
            return /\/follow\.it-verification-code(?:\s*)\.html$/i.test(followItUrl.pathname);
          } catch (_) {
            return false;
          }
        };

        const returnFocusToDashboard = () => {
          try {
            window.focus();
          } catch (_) {
            // Ignore browser focus restrictions.
          }
        };

        const closeFollowItWindowAndRefocus = () => {
          followItWindow.close();
          window.setTimeout(returnFocusToDashboard, 0);
        };

        const closeIfReady = () => {
          if (!followItWindow || followItWindow.closed) {
            return true;
          }

          if (isFollowItConfirmationPage()) {
            closeFollowItWindowAndRefocus();
            return true;
          }

          const elapsed = Date.now() - start;
          if (elapsed >= maxDelayMs) {
            closeFollowItWindowAndRefocus();
            return true;
          }

          if (elapsed < minDelayMs) {
            return false;
          }

          if (document.visibilityState === 'visible' && document.hasFocus()) {
            closeFollowItWindowAndRefocus();
            return true;
          }

          return false;
        };

        const pollId = window.setInterval(() => {
          if (closeIfReady()) {
            window.clearInterval(pollId);
          }
        }, 1000);

        window.addEventListener('focus', () => {
          if (closeIfReady()) {
            window.clearInterval(pollId);
          }
        }, { once: true });
      }

      // Returns whether the follow.it form was sent. With allowBlankFallback
      // off, a blocked popup sends nothing, so the caller can keep the intent.
      function openFollowItSubscription(email = '', preopenedWindow = null, { allowBlankFallback = true } = {}) {
        const normalizedEmail = String(email || '').trim();
        if (!normalizedEmail) {
          return false;
        }

        const targetName = `followItSubscribe_${Date.now()}`;
        if (preopenedWindow && !preopenedWindow.closed) {
          try {
            preopenedWindow.name = targetName;
          } catch (_) {
            // Ignore cross-origin naming issues and fall back to opening a new tab.
          }
        }

        const form = document.createElement('form');
        form.method = 'post';
        form.action = FOLLOW_IT_SUBSCRIPTION_URL;
        form.target = targetName;
        form.style.display = 'none';

        const emailInput = document.createElement('input');
        emailInput.type = 'hidden';
        emailInput.name = 'email';
        emailInput.value = normalizedEmail;
        form.appendChild(emailInput);

        document.body.appendChild(form);

        const openedWindow = preopenedWindow && !preopenedWindow.closed
          ? preopenedWindow
          : window.open('', targetName);

        if (openedWindow) {
          try {
            openedWindow.opener = null;
          } catch (_) {
            // Ignore cross-origin opener protection errors.
          }
        } else if (!allowBlankFallback) {
          form.remove();
          return false;
        } else {
          form.target = '_blank';
        }

        form.submit();
        scheduleFollowItTabAutoClose(openedWindow);
        form.remove();
        return true;
      }

      function rememberFollowItSubscriptionIntent(email = '') {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!normalizedEmail) {
          return;
        }
        localStorage.setItem(FOLLOW_IT_PENDING_SUBSCRIBE_KEY, normalizedEmail);
      }

      function readRememberedFollowItSubscriptionIntent() {
        try {
          return String(localStorage.getItem(FOLLOW_IT_PENDING_SUBSCRIBE_KEY) || '').trim().toLowerCase();
        } catch (_) {
          return '';
        }
      }

      function clearRememberedFollowItSubscriptionIntent() {
        try {
          localStorage.removeItem(FOLLOW_IT_PENDING_SUBSCRIBE_KEY);
        } catch (_) {
          // Storage unavailable; the profile flag is cleared separately.
        }
      }

      // The signup opt-in, read from the profile (set by member-register, so
      // it follows the member to any device) or from this browser. It stays
      // pending until the member is actually subscribed.
      function getPendingBlogSubscriptionEmail(activeSession = session) {
        const member = activeSession?.member;
        const membershipEmail = String(member?.email || '').trim().toLowerCase();
        if (!member?.emailVerified || !membershipEmail) {
          return '';
        }
        if (getBlogSubscriptionEmailFromPreferences(activeSession?.profile, member)) {
          return '';
        }
        const pendingOnProfile = activeSession?.profile?.preferences?.blogSubscriptionPending === true;
        return pendingOnProfile || readRememberedFollowItSubscriptionIntent() === membershipEmail ? membershipEmail : '';
      }

      // The intent used to be removed before this ran, and the popup it opens
      // after the sign-in round trip is often blocked (always in Safari), so
      // the opt-in vanished with no message. It is now cleared only once the
      // follow.it tab really opened; otherwise the dashboard asks the member
      // to finish with the subscribe button, a click no blocker stops.
      function maybeOpenFollowItAfterVerifiedSignIn(activeSession = session) {
        const pendingEmail = getPendingBlogSubscriptionEmail(activeSession);
        if (!pendingEmail) {
          return;
        }
        if (!openFollowItSubscription(pendingEmail, null, { allowBlankFallback: false })) {
          showAlert('Your browser blocked the blog subscription tab you asked for at signup. Use "Subscribe to blog updates" on your dashboard to finish.', 'warning');
          return;
        }
        clearRememberedFollowItSubscriptionIntent();
        rememberBlogSubscriptionEmail(pendingEmail, activeSession);
      }

      async function rememberBlogSubscriptionEmail(email = '', activeSession = session) {
        const membershipEmail = String(activeSession?.member?.email || '').trim().toLowerCase();
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!membershipEmail || !normalizedEmail || membershipEmail !== normalizedEmail) {
          return;
        }

        const storedPreferences = activeSession?.profile?.preferences && typeof activeSession.profile.preferences === 'object'
          ? activeSession.profile.preferences
          : {};
        if (String(storedPreferences.blogSubscriptionEmail || '').trim().toLowerCase() === membershipEmail) {
          return;
        }
        // Subscribing settles the signup opt-in.
        const { blogSubscriptionPending: _settledOptIn, ...existingPreferences } = storedPreferences;

        try {
          const payload = await request('/api/member-profile', {
            method: 'PATCH',
            body: JSON.stringify({
              displayName: document.getElementById('profileDisplayName').value.trim() || activeSession.member.displayName || activeSession.member.username,
              preferences: {
                ...existingPreferences,
                blogSubscriptionEmail: membershipEmail,
              },
            }),
          });
          session = { ...activeSession, authenticated: true, member: payload.member, profile: payload.profile };
          populateProfile(payload.member, payload.profile, session?.user);
        } catch (error) {
          console.warn('Unable to persist blog subscription preference.', error);
        }
      }

      async function request(url, options = {}) {
        const method = String(options.method || 'GET').toUpperCase();
        const csrfHeaders = csrfToken && method !== 'GET' && method !== 'HEAD'
          ? { 'x-csrf-token': csrfToken }
          : {};
        const response = await fetch(url, {
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', ...csrfHeaders, ...(options.headers || {}) },
          ...options,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Request failed');
        }
        return payload;
      }

      function membershipUpgradeDismissedStorageKey(member) {
        const memberId = String(member?.id || member?.memberId || member?.email || '').trim().toLowerCase();
        return memberId
          ? `membershipUpgradeDismissed:${memberId}`
          : 'membershipUpgradeDismissed';
      }

      function isMembershipUpgradeDismissed(member) {
        try {
          const key = membershipUpgradeDismissedStorageKey(member);
          return window.localStorage?.getItem(key) === '1';
        } catch (error) {
          return false;
        }
      }

      function setMembershipUpgradeDismissed(member, dismissed) {
        try {
          const key = membershipUpgradeDismissedStorageKey(member);
          if (dismissed) {
            window.localStorage?.setItem(key, '1');
          } else {
            window.localStorage?.removeItem(key);
          }
        } catch (error) {
          /* storage unavailable */
        }
      }

      function syncMembershipUpgradePanel(member = session?.member) {
        const level = member?.membershipLevel;
        const isFree = level === 'free';
        membershipUpgradeSection.classList.toggle('d-none', !isFree);
        const expand = isFree && !isMembershipUpgradeDismissed(member);
        membershipUpgradeContent.classList.toggle('show', expand);
        membershipUpgradeToggleButton.setAttribute('aria-expanded', expand ? 'true' : 'false');
        membershipUpgradeToggleArrow.textContent = expand ? '▲' : '▼';
        membershipUpgradeToggleLabel.textContent = 'Become a supporter';
      }

      function syncComparisonCurrentLevel(member = session?.member) {
        const level = member?.membershipLevel || 'visitor';
        const showVisitor = true;
        const showMember = true;
        const showPremium = true;

        comparisonVisitorColumns.forEach((column) => {
          column.classList.toggle('d-none', !showVisitor);
        });
        comparisonMemberColumns.forEach((column) => {
          column.classList.toggle('d-none', !showMember);
        });
        comparisonPremiumColumns.forEach((column) => {
          column.classList.toggle('d-none', !showPremium);
        });

        comparisonVisitorCurrent.classList.toggle('d-none', level !== 'visitor');
        comparisonMemberCurrent.classList.toggle('d-none', level !== 'free');
        comparisonPremiumCurrent.classList.toggle('d-none', !(level === 'premium' || level === 'lifetime'));

        comparisonCreateAccountButton.classList.add('d-none');

        if (level === 'free') {
          comparisonCurrentLevel.textContent = 'Current level: Member (Free)';
        } else if (level === 'premium' || level === 'lifetime') {
          comparisonCurrentLevel.textContent = `Current level: ${level === 'lifetime' ? 'Lifetime Supporter' : 'Supporter'}`;
        } else {
          comparisonCurrentLevel.textContent = 'Current level: Visitor';
        }
      }

      function syncComparisonVisibility(member = session?.member) {
        const level = member?.membershipLevel || 'visitor';
        const loginOnlyMode = !member && normalizeAuthView(new URL(window.location.href).searchParams.get('auth')) === 'login';
        const hideComparison = level === 'free' || level === 'premium' || level === 'lifetime' || loginOnlyMode;
        comparisonSection.classList.toggle('d-none', hideComparison);
      }

      function syncMembershipHero(member = session?.member, isLoggedIn = Boolean(member)) {
        const justVerifiedEmail = window.sessionStorage.getItem('memberJustVerifiedEmail') === 'true';
        if (!membershipHeroReady) {
          membershipHero.classList.add('d-none');
          return;
        }

        const level = member?.membershipLevel || 'visitor';
        const isPremiumMember = level === 'premium' || level === 'lifetime';
        const isFreeMember = level === 'free';
        const loginOnlyMode = !isLoggedIn && normalizeAuthView(new URL(window.location.href).searchParams.get('auth')) === 'login';

        membershipHero.classList.toggle('d-none', (isLoggedIn && isPremiumMember) || isFreeMember);

        if (loginOnlyMode) {
          // Signup routes here with ?auth=login, but a user who just created an
          // account has never been here before and hasn't verified yet.
          if (justRegistered) {
            membershipHeroKicker.textContent = 'Member Access';
            membershipHeroTitle.textContent = 'Almost there — verify your email.';
            membershipHeroLead.textContent = registrationEmailDelivered
              ? 'We sent you a verification link. Open it, then sign in below to reach your dashboard.'
              : 'We could not send your verification email. Send a fresh link with the form below in a little while, or contact support.';
            membershipHeroCta.textContent = 'Sign in';
            membershipHeroCta.setAttribute('href', '#authSection');
            return;
          }
          membershipHeroKicker.textContent = 'Member Access';
          membershipHeroTitle.textContent = 'Welcome back! Sign in below.';
          membershipHeroLead.textContent = justVerifiedEmail
            ? 'Your email is verified. Sign in to access your tools and saved research.'
            : 'Sign in to access your tools and saved research.';
          membershipHeroCta.textContent = 'Sign in';
          membershipHeroCta.setAttribute('href', '#authSection');
          return;
        }

        membershipHeroKicker.textContent = 'Member Access';
        membershipHeroTitle.textContent = 'Start free. Save searches. Unlock related words.';
        membershipHeroLead.textContent = 'Create a free account to save searches and look up related words. Supporters get GemaBot, Premium Research, the supporter forum, and the message-center inbox for $19 a year, and help keep the site running.';
        membershipHeroCta.textContent = 'Create free account';
        membershipHeroCta.setAttribute('href', '#authSection');
      }

      function hasLocalLearningPathStep1Intent() {
        return window.localStorage.getItem('learningPathStep1Intent') === 'true';
      }

      function hasServerLearningPathStep1Intent(profile = session?.profile) {
        return profile?.preferences?.learningPathStep1Intent === true;
      }

      function hasLearningPathStep1Intent() {
        return hasLocalLearningPathStep1Intent() || hasServerLearningPathStep1Intent();
      }

      function syncLearningPathStep1Cta(member = session?.member) {
        const shouldShow = Boolean(member) && hasLearningPathStep1Intent();
        learningPathStep1Section.classList.toggle('d-none', !shouldShow);
      }

      function isLearningPathCompletedBannerDismissed(completedAt) {
        if (!completedAt) return false;
        try {
          return window.localStorage.getItem(LEARNING_PATH_COMPLETED_DISMISS_KEY) === String(completedAt);
        } catch {
          return false;
        }
      }

      function syncLearningPathCompletedBadge(member = session?.member, profile = session?.profile) {
        if (!learningPathCompletedSection) return;
        const completedAt = profile?.preferences?.learningPathCompletedAt;
        const shouldShow = Boolean(member) && Boolean(completedAt) && !isLearningPathCompletedBannerDismissed(completedAt);
        learningPathCompletedSection.classList.toggle('d-none', !shouldShow);
        if (shouldShow) configureLearningPathShareLinks(member);
        if (!shouldShow) {
          if (learningPathCompletedAtText) learningPathCompletedAtText.textContent = '';
          return;
        }
        if (!learningPathCompletedAtText) return;
        const parsed = new Date(completedAt);
        if (!Number.isFinite(parsed.getTime())) {
          learningPathCompletedAtText.textContent = '';
          return;
        }
        try {
          learningPathCompletedAtText.textContent = `Completed on ${parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.`;
        } catch {
          learningPathCompletedAtText.textContent = `Completed on ${parsed.toISOString().slice(0, 10)}.`;
        }
      }

      function configureLearningPathShareLinks(member) {
        const username = String(member?.username || '').trim();
        if (!username || !learningPathShareLink) return;
        const origin = window.location.origin;
        const shareUrl = `${origin}/b/${encodeURIComponent(username)}`;
        const text = `I just earned the Beginner Path Graduate badge on Gematria.Today.`;
        learningPathShareLink.href = shareUrl;
        if (learningPathShareTwitter) learningPathShareTwitter.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
        if (learningPathShareFacebook) learningPathShareFacebook.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        if (learningPathShareLinkedIn) learningPathShareLinkedIn.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        if (learningPathShareNative && typeof navigator.share === 'function' && !learningPathShareNative.dataset.bound) {
          learningPathShareNative.dataset.bound = '1';
          learningPathShareNative.classList.remove('d-none');
          learningPathShareNative.addEventListener('click', () => {
            navigator.share({ title: 'My Gematria.Today badge', text, url: shareUrl }).catch(() => {});
            window.gematriaTracking?.track?.('learning_path_badge_share', { channel: 'native', authenticated: true });
          });
        }
        if (learningPathShareCopy && !learningPathShareCopy.dataset.bound) {
          learningPathShareCopy.dataset.bound = '1';
          learningPathShareCopy.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(shareUrl);
              learningPathShareCopied?.classList.remove('d-none');
              window.setTimeout(() => learningPathShareCopied?.classList.add('d-none'), 2000);
              window.gematriaTracking?.track?.('learning_path_badge_share', { channel: 'copy', authenticated: true });
            } catch {
              window.prompt('Copy this link', shareUrl);
            }
          });
        }
        [
          [learningPathShareTwitter, 'twitter'],
          [learningPathShareFacebook, 'facebook'],
          [learningPathShareLinkedIn, 'linkedin'],
          [learningPathShareLink, 'public_page'],
        ].forEach(([node, channel]) => {
          if (!node || node.dataset.bound) return;
          node.dataset.bound = '1';
          node.addEventListener('click', () => {
            window.gematriaTracking?.track?.('learning_path_badge_share', { channel, authenticated: true });
          });
        });
      }

      function syncLearningPathAspireSection(member = session?.member, profile = session?.profile) {
        if (!learningPathAspireSection) return;
        if (!member) {
          learningPathAspireSection.classList.add('d-none');
          return;
        }
        const completedAt = profile?.preferences?.learningPathCompletedAt;
        if (completedAt) {
          learningPathAspireSection.classList.add('d-none');
          return;
        }
        // Don't double up with the Step 1 redirect card when it's already
        // showing (the user has an active step-1 intent from the homepage).
        if (learningPathStep1Section && !learningPathStep1Section.classList.contains('d-none')) {
          learningPathAspireSection.classList.add('d-none');
          return;
        }
        const progress = Number(profile?.preferences?.learningPathLevelReached || 0);
        if (learningPathAspireProgress) {
          learningPathAspireProgress.textContent = progress >= 1 && progress <= 4
            ? `You're on Level ${progress} of 4. Finish all four to unlock the badge on your dashboard and forum profile.`
            : 'Four short levels. Free for all members. The badge lands on your dashboard and forum profile when you finish.';
        }
        if (learningPathAspireCta) {
          const nextLevel = Math.min(Math.max(progress, 0) + 1, 4);
          const nextPath = nextLevel === 1
            ? '/gematria-basics.html'
            : nextLevel === 2
              ? '/gematria-pattern-grouping.html'
              : nextLevel === 3
                ? '/gematria-name-analysis.html'
                : '/blog/a-beginner-s-gematria-research-checklist-before-you-draw-conclusions?from=learning-path';
          learningPathAspireCta.href = nextPath;
          learningPathAspireCta.textContent = progress >= 1 ? `Continue Level ${nextLevel}` : 'This is the way →';
          if (progress >= 1) {
            learningPathAspireCta.removeAttribute('aria-label');
          } else {
            learningPathAspireCta.setAttribute('aria-label', 'This is the way: start the free beginner path');
          }
          if (!learningPathAspireCta.dataset.bound) {
            learningPathAspireCta.dataset.bound = '1';
            learningPathAspireCta.addEventListener('click', () => {
              window.gematriaTracking?.track?.('beginner_path_start_click', {
                source: 'member_dashboard_aspire',
                destination: learningPathAspireCta.href,
                authenticated: true,
              });
            });
          }
        }
        learningPathAspireSection.classList.remove('d-none');
      }

      function clearServerLearningPathStep1Intent() {
        if (session?.profile?.preferences) {
          delete session.profile.preferences.learningPathStep1Intent;
        }
        return request('/api/member-learning-path-consume', { method: 'POST', body: '{}' })
          .catch(() => {
            // Non-fatal: localStorage clear and client-side state still apply.
          });
      }

      function consumeLearningPathStep1Redirect() {
        if (!hasLearningPathStep1Intent()) return false;
        window.localStorage.removeItem('learningPathStep1Intent');
        window.gematriaTracking?.track?.('cta_ladder_click', {
          step: 'learning_path_step_1',
          location: 'member_dashboard_auto_redirect',
          destination: '/gematria-basics.html',
          authenticated: true,
        });
        showAlert('Signed in. Routing you to Level 1…', 'success');
        // Ensure the server-side intent is cleared before redirecting so the
        // dashboard doesn't re-trigger this auto-redirect on the next sign-in.
        // Cap the wait so a hung request can't strand the user here.
        const consume = clearServerLearningPathStep1Intent();
        const fallback = new Promise((resolve) => window.setTimeout(resolve, 1500));
        Promise.race([consume, fallback]).then(() => {
          window.location.assign('/gematria-basics.html');
        });
        return true;
      }

      function setLoggedIn(isLoggedIn) {
        if (isLoggedIn) {
          window.sessionStorage.removeItem('memberJustVerifiedEmail');
          if (consumeLearningPathStep1Redirect()) {
            return;
          }
        }
        if (typeof window.__gematriaSyncAuthState === 'function') {
          window.__gematriaSyncAuthState();
        }
        syncMembershipHero(isLoggedIn ? session?.member : null, isLoggedIn);
        syncComparisonCurrentLevel(isLoggedIn ? session?.member : null);
        syncComparisonVisibility(isLoggedIn ? session?.member : null);
        syncLearningPathStep1Cta(isLoggedIn ? session?.member : null);
        syncLearningPathCompletedBadge(
          isLoggedIn ? session?.member : null,
          isLoggedIn ? session?.profile : null,
        );
        syncLearningPathAspireSection(
          isLoggedIn ? session?.member : null,
          isLoggedIn ? session?.profile : null,
        );
        authSection.classList.toggle('d-none', isLoggedIn);
        dashboardSection.classList.toggle('d-none', !isLoggedIn);
        syncPaymentButton(isLoggedIn ? session?.member : null);
        syncMembershipUpgradePanel(isLoggedIn ? session?.member : null);
        syncPremiumResearchLink(isLoggedIn ? session?.member : null);
        syncAdminPageButton(isLoggedIn ? session?.member : null, isLoggedIn ? session?.user : null);
        syncBlogProposalForm(isLoggedIn ? session?.member : null);
        syncMessageCenterAccess(isLoggedIn ? session?.member : null);
        renderMessageCenter();
        renderForumNotifications();
        membershipPageContent.classList.remove('d-none');
        // Server-confirmed auth state is now in the DOM. Mark the page
        // hydrated so the first-paint CSS auth gating (theme.css) stops
        // applying and classList toggles above become authoritative.
        document.documentElement.classList.add('member-page-hydrated');
      }

      function formatMembershipWindow(member) {
        if (member.membershipLevel !== 'lifetime' && hasUnsettledSubscription(member)) {
          return 'Your renewal payment is overdue. Use Manage subscription to update your payment method.';
        }
        if (member.membershipLevel !== 'premium' || !member.membershipExpiresAt) {
          return 'Current membership tier.';
        }

        return `Supporter access active through ${new Date(member.membershipExpiresAt).toLocaleDateString()}.`;
      }

      function setPaymentButtonLabel(label) {
        const labelEl = paymentButton.querySelector('[data-payment-button-label]');
        if (labelEl) {
          labelEl.textContent = label;
        } else {
          paymentButton.textContent = label;
        }
      }

      function syncPaymentButton(member = session?.member) {
        const isPremium = member?.membershipLevel === 'premium';
        const isOverdue = !isPremium && hasUnsettledSubscription(member);
        paymentButton.disabled = !member || isPremium || isOverdue;
        if (isPremium) {
          setPaymentButtonLabel('You are a supporter');
        } else {
          setPaymentButtonLabel(isOverdue ? 'Renewal payment overdue' : 'Continue to secure Stripe checkout');
        }
      }

      function syncPremiumResearchLink(member = session?.member) {
        if (!premiumResearchLink) return;
        const isPremium = member?.membershipLevel === 'premium' || member?.membershipLevel === 'lifetime';
        premiumResearchLink.dataset.unlocked = isPremium ? 'true' : 'false';
        premiumResearchLink.textContent = isPremium ? 'Premium research' : 'Premium research 🔒';
        premiumResearchLink.setAttribute('aria-label', isPremium ? 'Open premium research' : 'Premium research (locked — for supporters)');
      }

      premiumResearchLink?.addEventListener('click', () => {
        const isUnlocked = premiumResearchLink.dataset.unlocked === 'true';
        const targetHref = premiumResearchLink.dataset.href || '/premium-research.html';
        if (isUnlocked) {
          window.location.assign(targetHref);
          return;
        }
        showAlert('Premium Research is a supporter feature. Open "Become a supporter" below to unlock it.', 'info');
        const upgradeSection = document.getElementById('membershipUpgradeSection');
        if (upgradeSection && !upgradeSection.classList.contains('d-none')) {
          if (!membershipUpgradeContent.classList.contains('show')) {
            membershipUpgradeToggleButton.click();
          }
          upgradeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          const authSection = document.getElementById('authSection');
          authSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      function syncAdminPageButton(member = session?.member, user = session?.user) {
        const isSuperAdmin = user?.role === 'super_admin' || member?.role === 'super_admin';
        const isAdminLevel = Boolean(user?.isAdmin) || user?.role === 'admin' || member?.role === 'admin' || Boolean(member?.isAdmin) || isSuperAdmin;
        adminPageButton.classList.toggle('d-none', !isAdminLevel);
        superAdminPageButton?.classList.toggle('d-none', !isSuperAdmin);
        siteHubPageButton?.classList.toggle('d-none', !isSuperAdmin);
        document.getElementById('adminMenuWrap')?.classList.toggle('d-none', !isAdminLevel);
      }

      function isPremiumMembershipLevel(level) {
        return level === 'premium' || level === 'lifetime';
      }

      // A renewal Stripe could not collect leaves the subscription open, still
      // billable, after premium ends (past_due while Stripe retries the card,
      // unpaid once it stops). The member fixes or cancels it in the billing
      // portal; the server refuses a second checkout until then.
      function hasUnsettledSubscription(member) {
        const status = String(member?.stripeSubscriptionStatus || '').trim();
        return Boolean(member?.stripeCustomerId) && (status === 'past_due' || status === 'unpaid');
      }

      function syncBlogProposalForm(member = session?.member) {
        const isPremium = isPremiumMembershipLevel(member?.membershipLevel);
        premiumBlogProposalForm.classList.toggle('d-none', !isPremium);
        premiumBlogProposalLockedMessage.classList.toggle('d-none', isPremium);
        premiumBlogProposalSuccessMessage.classList.add('d-none');
        blogProposalAttribution.value = member?.username || '';
      }

      function setMessageCenterOpen(isOpen) {
        isMessageCenterOpen = Boolean(isOpen);
        messageCenterSection.classList.toggle('d-none', !isMessageCenterOpen);
        dashboardMainContent.classList.toggle('d-none', isMessageCenterOpen);
      }

      function syncMessageCenterAccess(member = session?.member) {
        const isPremium = isPremiumMembershipLevel(member?.membershipLevel);
        messageCenterOpenButton.classList.toggle('d-none', !isPremium);
        messageInboxCard?.classList.toggle('is-locked', !isPremium);
        if (!isPremium) {
          setMessageCenterOpen(false);
        }
        manageSubscriptionButton?.classList.toggle('d-none', !((isPremium && member?.stripeCustomerId) || hasUnsettledSubscription(member)));
      }

      function getMessageCenterSentItems({ archived = false } = {}) {
        const proposals = archived ? archivedMemberProposals : memberProposals;
        const feedback = archived ? archivedMemberChatbotFeedback : memberChatbotFeedback;
        const proposalItems = proposals.map((proposal) => ({
          id: proposal.id,
          type: 'proposal',
          title: proposal.title || 'Untitled proposal',
          body: proposal.summary || proposal.body || 'No proposal content provided.',
          status: proposal.status || 'pending',
          createdAt: proposal.createdAt || proposal.updatedAt,
        }));
        const chatbotItems = feedback
          .filter((item) => item.wasExpected !== true)
          .map((item) => ({
            id: item.id,
            type: 'chatbot-feedback',
            title: item.query || 'Search feedback',
            body: item.feedbackText || 'No feedback text submitted.',
            status: (item.adminReply || item.adminNote) ? 'replied' : 'pending',
            createdAt: item.createdAt,
          }));
        return [...proposalItems, ...chatbotItems].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      }

      function getMessageCenterInboxItems({ archived = false } = {}) {
        const proposals = archived ? archivedMemberProposals : memberProposals;
        const feedback = archived ? archivedMemberChatbotFeedback : memberChatbotFeedback;
        const proposalReplies = proposals
          .filter((proposal) => proposal.rejectionExplanation || proposal.status === 'approved' || proposal.status === 'rejected')
          .map((proposal) => ({
            id: proposal.id,
            type: 'proposal',
            title: proposal.title || 'Untitled proposal',
            reply: proposal.rejectionExplanation || `Your proposal was marked as ${proposal.status || 'reviewed'}.`,
            repliedAt: proposal.reviewedAt || proposal.updatedAt || proposal.createdAt,
          }));
        const feedbackReplies = feedback
          .filter((item) => Boolean(item.adminReply || item.adminNote))
          .map((item) => ({
            id: item.id,
            type: 'chatbot-feedback',
            title: item.query || 'Search feedback',
            reply: item.adminReply || item.adminNote,
            repliedAt: item.repliedAt || item.updatedAt || item.createdAt,
          }));
        return [...proposalReplies, ...feedbackReplies].sort((a, b) => new Date(b.repliedAt || 0).getTime() - new Date(a.repliedAt || 0).getTime());
      }

      function updateMessageInboxSummary(inboxCount = 0) {
        const normalizedCount = Number.isFinite(inboxCount) ? Math.max(0, inboxCount) : 0;
        const isPremium = isPremiumMembershipLevel(session?.member?.membershipLevel);
        if (messageInboxCount) {
          messageInboxCount.textContent = String(normalizedCount);
        }
        if (!messageInboxMeta) {
          return;
        }

        if (!isPremium) {
          messageInboxMeta.textContent = 'Become a supporter to open your message center inbox.';
          return;
        }

        messageInboxMeta.textContent = normalizedCount
          ? `Admin replies waiting in your message center inbox (${normalizedCount}).`
          : 'No unread admin replies in your message center inbox.';
      }

      function renderMessageCenter({ renderLists = !isMessageCenterOpen } = {}) {
        if (!messageCenterSentList || !messageCenterInboxList) {
          return;
        }
        const sentItems = getMessageCenterSentItems({ archived: isArchiveViewOpen });
        const inboxItems = getMessageCenterInboxItems({ archived: isArchiveViewOpen });
        const inboxCount = inboxItems.length;
        if (!isArchiveViewOpen) {
          messageCenterOpenButton.textContent = inboxCount ? `Message Center (${inboxCount})` : 'Message Center';
          updateMessageInboxSummary(inboxCount);
        }
        if (!renderLists) return;
        if (messageCenterInboxHeading) {
          messageCenterInboxHeading.textContent = isArchiveViewOpen ? 'Archived inbox messages' : 'Inbox (until archived)';
        }
        if (messageCenterArchiveToggleButton) {
          messageCenterArchiveToggleButton.textContent = isArchiveViewOpen ? 'Back to Inbox' : 'Open Archive';
        }

        messageCenterSentList.innerHTML = sentItems.length ? sentItems.map((item) => `
          <article class="admin-item-card p-3 mb-2">
            <div class="d-flex justify-content-between align-items-center gap-2">
              <strong>${escapeHtml(item.title)}</strong>
              <span class="badge text-bg-secondary text-uppercase">${escapeHtml(item.status)}</span>
            </div>
            <p class="small mb-1 mt-2">${escapeHtml(item.body)}</p>
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <p class="small text-muted mb-0">Sent: ${escapeHtml(item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown date')}</p>
              ${isArchiveViewOpen ? '' : `<button class="btn btn-sm btn-outline-secondary" type="button" ${item.type === 'proposal' ? `data-archive-proposal="${escapeHtml(item.id)}"` : `data-archive-chatbot-feedback="${escapeHtml(item.id)}"`}>Archive</button>`}
            </div>
          </article>
        `).join('') : `<p class="text-muted mb-0">${isArchiveViewOpen ? 'No archived sent messages yet.' : 'No messages have been sent to admin yet.'}</p>`;

        messageCenterInboxList.innerHTML = inboxItems.length ? inboxItems.map((item) => `
          <article class="admin-item-card p-3 mb-2">
            <div class="d-flex justify-content-between align-items-center gap-2">
              <strong>${escapeHtml(item.title)}</strong>
              <span class="badge text-bg-success">reply</span>
            </div>
            <div class="alert alert-info small mb-2 mt-2"><strong>Admin message:</strong> ${escapeHtml(item.reply)}</div>
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span class="small text-muted">Received: ${escapeHtml(item.repliedAt ? new Date(item.repliedAt).toLocaleString() : 'Unknown date')}</span>
              ${isArchiveViewOpen ? '' : `<button class="btn btn-sm btn-outline-secondary" type="button" ${item.type === 'proposal' ? `data-archive-proposal="${escapeHtml(item.id)}"` : `data-archive-chatbot-feedback="${escapeHtml(item.id)}"`}>Archive</button>`}
            </div>
          </article>
        `).join('') : `<p class="text-muted mb-0">${isArchiveViewOpen ? 'Archive is empty.' : 'Inbox is empty. Admin replies will appear here until archived.'}</p>`;
      }

      function renderMemberProposalFeedback() {
        if (!memberProposalFeedbackList) {
          return;
        }

        if (!memberProposals.length) {
          memberProposalFeedbackList.classList.add('d-none');
          memberProposalFeedbackList.innerHTML = '';
          return;
        }

        memberProposalFeedbackList.classList.remove('d-none');
        memberProposalFeedbackList.innerHTML = memberProposals.map((proposal) => {
          const isRejected = proposal.status === 'rejected';
          const isApproved = proposal.status === 'approved';
          const statusTone = isRejected ? 'danger' : isApproved ? 'success' : 'secondary';
          const statusLabel = isApproved ? 'accepted' : (proposal.status || 'pending');
          const reviewedAt = proposal.reviewedAt ? new Date(proposal.reviewedAt).toLocaleString() : '';
          const explanationMarkup = proposal.rejectionExplanation
            ? `<div class="alert alert-warning small mb-0 mt-2 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2">
                <span><strong>Message from admin:</strong> ${escapeHtml(proposal.rejectionExplanation)}</span>
                <button class="btn btn-sm btn-outline-secondary align-self-start align-self-md-auto" type="button" data-archive-proposal="${escapeHtml(proposal.id)}">Archive</button>
              </div>`
            : '';
          const archiveButtonMarkup = !proposal.rejectionExplanation
            ? `<div class="mt-2">
                <button class="btn btn-sm btn-outline-secondary" type="button" data-archive-proposal="${escapeHtml(proposal.id)}">Archive</button>
              </div>`
            : '';

          return `
            <article class="admin-item-card p-3 mb-2">
              <div class="d-flex justify-content-between align-items-center gap-2">
                <strong>${escapeHtml(proposal.title || 'Untitled proposal')}</strong>
                <span class="badge text-bg-${statusTone} text-uppercase">${escapeHtml(statusLabel)}</span>
              </div>
              ${reviewedAt ? `<p class="small text-muted mb-0 mt-2">Last reviewed: ${reviewedAt}</p>` : ''}
              ${explanationMarkup}
              ${archiveButtonMarkup}
            </article>
          `;
        }).join('');
        renderMessageCenter();
      }

      function renderMemberChatbotFeedback() {
        if (!memberChatbotFeedbackList) {
          updateMessageInboxSummary(getMessageCenterInboxItems().length);
          return;
        }

        memberChatbotFeedbackList.innerHTML = memberChatbotFeedback.length ? memberChatbotFeedback.map((item) => {
          const adminReplyMessage = item.adminReply || item.adminNote || '';
          const hasReply = Boolean(adminReplyMessage);
          const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
          const repliedAt = item.repliedAt ? new Date(item.repliedAt).toLocaleString() : '';
          return `
            <article class="admin-item-card p-3 mb-2">
              <div class="d-flex justify-content-between align-items-center gap-2">
                <strong>${escapeHtml(item.query || 'Search feedback')}</strong>
                <span class="badge text-bg-${hasReply ? 'success' : 'secondary'}">${hasReply ? 'replied' : 'pending'}</span>
              </div>
              ${item.feedbackText ? `<p class="small mb-1 mt-2"><strong>Your feedback:</strong> ${escapeHtml(item.feedbackText)}</p>` : ''}
              ${hasReply
                ? `<div class="alert alert-info small mb-2 mt-2"><strong>Admin reply:</strong> ${escapeHtml(adminReplyMessage)}</div>`
                : '<p class="small text-muted mb-2 mt-2">Awaiting admin reply.</p>'}
              <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span class="small text-muted">${hasReply && repliedAt ? `Replied: ${escapeHtml(repliedAt)}` : `Submitted: ${escapeHtml(createdAt)}`}</span>
                <button class="btn btn-sm btn-outline-secondary" type="button" data-archive-chatbot-feedback="${escapeHtml(item.id)}">Archive</button>
              </div>
            </article>
          `;
        }).join('') : '<p class="text-muted mb-0">No chatbot feedback submitted yet.</p>';
        renderMessageCenter();
      }

      async function loadMemberChatbotFeedback() {
        if (!session?.member) {
          memberChatbotFeedback = [];
          archivedMemberChatbotFeedback = [];
          renderMemberChatbotFeedback();
          return;
        }
        const [activeResult, archivedResult] = await Promise.allSettled([
          request('/api/member-chatbot-feedback', { method: 'GET' }),
          request('/api/member-chatbot-feedback?view=archived', { method: 'GET' }),
        ]);

        if (activeResult.status === 'fulfilled') {
          memberChatbotFeedback = Array.isArray(activeResult.value.items) ? activeResult.value.items : [];
        }
        if (archivedResult.status === 'fulfilled') {
          archivedMemberChatbotFeedback = Array.isArray(archivedResult.value.items) ? archivedResult.value.items : [];
        }
        renderMemberChatbotFeedback();
      }

      async function loadMemberProposals() {
        if (!session?.member) {
          memberProposals = [];
          archivedMemberProposals = [];
          renderMemberProposalFeedback();
          renderForumNotifications();
          return;
        }

        const [activeResult, archivedResult] = await Promise.allSettled([
          request('/api/member-blog-proposals', { method: 'GET' }),
          request('/api/member-blog-proposals?view=archived', { method: 'GET' }),
        ]);

        if (activeResult.status === 'fulfilled') {
          memberProposals = Array.isArray(activeResult.value.items) ? activeResult.value.items : [];
        }
        if (archivedResult.status === 'fulfilled') {
          archivedMemberProposals = Array.isArray(archivedResult.value.items) ? archivedResult.value.items : [];
        }
        renderMemberProposalFeedback();
        renderForumNotifications();
      }

      function getForumNotificationEntries() {
        const entries = [];
        const reviewedProposals = memberProposals.filter((proposal) => {
          const status = String(proposal.status || '').toLowerCase();
          return status === 'approved' || status === 'rejected' || Boolean(proposal.rejectionExplanation);
        });
        if (reviewedProposals.length) {
          entries.push({
            tone: 'warning',
            title: `${reviewedProposals.length} proposal update${reviewedProposals.length === 1 ? '' : 's'} from admin`,
            body: 'You have response messages on your submitted blog proposals. Open your proposal panel to review and archive them.',
          });
        }

        const activeThreadCount = recentForumThreads.filter((thread) => {
          if (!thread?.lastActivityAt) {
            return false;
          }
          const ageMs = Date.now() - new Date(thread.lastActivityAt).getTime();
          return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= (72 * 60 * 60 * 1000);
        }).length;
        if (activeThreadCount) {
          entries.push({
            tone: 'info',
            title: `${activeThreadCount} active forum thread${activeThreadCount === 1 ? '' : 's'} in the last 72 hours`,
            body: 'Fresh replies and conversations are active now. Jump into the forum to read updates and respond.',
          });
        }

        entries.push({
          tone: 'primary',
          title: 'Check your forum mentions, replies, and member updates',
          body: 'Use the forum regularly to catch conversations, moderator updates, and new responses from the community.',
        });

        return entries;
      }

      function renderForumNotifications() {
        if (!forumNotificationSection || !forumNotificationSummary || !forumNotificationList) {
          return;
        }

        if (!session?.member) {
          forumNotificationSummary.textContent = 'Sign in to view your latest forum updates and responses.';
          forumNotificationLink.href = '/member.html#authSection';
          forumNotificationLink.textContent = 'Sign in to unlock forum alerts';
          forumNotificationCountTop.textContent = '0';
          forumNotificationCountMetaTop.textContent = 'Sign in to view your latest forum notification highlights.';
          forumNotificationTopLink.href = '/member.html#authSection';
          forumNotificationTopLink.textContent = 'Sign in';
          forumNotificationList.innerHTML = '<p class="text-muted mb-0">Forum alerts will appear here after you sign in.</p>';
          return;
        }

        const entries = getForumNotificationEntries();
        forumNotificationCountTop.textContent = String(entries.length);
        forumNotificationCountMetaTop.textContent = entries.length === 1
          ? 'You currently have 1 forum notification highlight.'
          : `You currently have ${entries.length} forum notification highlights.`;
        forumNotificationSummary.textContent = entries.length > 1
          ? `You currently have ${entries.length} forum notification highlights.`
          : 'You currently have 1 forum notification highlight.';
        forumNotificationTopLink.href = '/forum.html';
        forumNotificationTopLink.textContent = 'Open Forum';
        forumNotificationLink.href = '/forum.html';
        forumNotificationLink.textContent = 'Open Forum';
        forumNotificationList.innerHTML = entries.map((entry) => `
          <article class="alert alert-${escapeHtml(entry.tone)} mb-2">
            <strong>${escapeHtml(entry.title)}</strong>
            <p class="mb-0 mt-1">${escapeHtml(entry.body)}</p>
          </article>
        `).join('');
      }

      async function loadForumNotifications() {
        if (!forumModuleEnabled) {
          recentForumThreads = [];
          renderForumNotifications();
          return;
        }
        if (!session?.member) {
          recentForumThreads = [];
          renderForumNotifications();
          return;
        }

        try {
          const payload = await request('/api/member-forum?limit=12&sort=newest', { method: 'GET' });
          recentForumThreads = Array.isArray(payload.threads) ? payload.threads : [];
        } catch (_) {
          recentForumThreads = [];
        }
        renderForumNotifications();
      }

      function loadForumNotificationsInBackground() {
        loadForumNotifications().catch(() => {});
      }

      function expandForumNotificationSection() {
        if (!forumNotificationContent || forumNotificationContent.classList.contains('show')) {
          return;
        }

        if (typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
          const collapse = bootstrap.Collapse.getOrCreateInstance(forumNotificationContent, { toggle: false });
          collapse.show();
          return;
        }

        forumNotificationContent.classList.add('show');
        forumNotificationToggleLabel.textContent = 'Collapse';
        forumNotificationToggleArrow.textContent = '▲';
        forumNotificationToggleButton?.setAttribute('aria-expanded', 'true');
      }

      function openForumNotificationsFromTopCard() {
        expandForumNotificationSection();
        forumNotificationSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        forumNotificationToggleButton?.focus({ preventScroll: true });
      }

      async function archiveProposal(proposalId) {
        const id = String(proposalId || '').trim();
        if (!id) {
          return;
        }

        await request('/api/member-blog-proposals', {
          method: 'PATCH',
          body: JSON.stringify({ id, action: 'archive' }),
        });

        memberProposals = memberProposals.filter((proposal) => proposal.id !== id);
        renderMemberProposalFeedback();
      }

      function getBlogSubscriptionEmailFromPreferences(profile = session?.profile, member = session?.member) {
        const savedEmail = String(profile?.preferences?.blogSubscriptionEmail || '').trim().toLowerCase();
        const membershipEmail = String(member?.email || '').trim().toLowerCase();
        if (!savedEmail || !membershipEmail) {
          return '';
        }
        return savedEmail === membershipEmail ? savedEmail : '';
      }

      function syncBlogSubscriptionSection(member = session?.member, profile = session?.profile) {
        const membershipEmail = String(member?.email || '').trim();
        const subscribedEmail = getBlogSubscriptionEmailFromPreferences(profile, member);
        const shouldShowSubscriptionForm = Boolean(member) && Boolean(membershipEmail) && !subscribedEmail;

        blogSubscriptionSection.classList.toggle('d-none', !shouldShowSubscriptionForm);
        blogSubscriptionEmail.value = membershipEmail;
        blogSubscriptionPendingNotice?.classList.toggle('d-none', !getPendingBlogSubscriptionEmail({ member, profile }));
      }

      function scrollToLoginArea() {
        setAuthView('login', { updateUrl: true });
        const loginForm = document.getElementById('loginForm');
        const loginIdentifier = document.getElementById('loginIdentifier');
        if (!loginForm || !loginIdentifier) {
          return;
        }

        loginForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => {
          loginIdentifier.focus({ preventScroll: true });
        }, 300);
      }

      // Set for the rest of the page's life after a successful signup, so the
      // hero doesn't greet a brand-new unverified user with "Welcome back!".
      let justRegistered = false;

      // member-register reports whether the verification email actually went
      // out. Telling someone to check an inbox nothing was sent to is how a
      // SendGrid outage turns into a signup that quietly never completes.
      let registrationEmailDelivered = true;

      function showRegisterSuccessPanel(email, registration = {}) {
        const panel = document.getElementById('registerSuccessPanel');
        if (!panel) return;
        const delivered = registration?.emailDelivered !== false;
        registrationEmailDelivered = delivered;
        const emailNode = document.getElementById('registerSuccessEmail');
        if (emailNode) {
          emailNode.textContent = maskEmailForResendNotice(email) || 'your inbox';
        }

        // No verification link comes back from member-register: it only ever
        // travels by email, so an undelivered signup is finished by a resend.
        const deliveredBlock = document.getElementById('registerSuccessDelivered');
        const undeliveredBlock = document.getElementById('registerSuccessUndelivered');
        deliveredBlock?.classList.toggle('d-none', !delivered);
        undeliveredBlock?.classList.toggle('d-none', delivered);
        // The spam-folder hint only makes sense for mail that was actually sent.
        document.getElementById('registerSuccessSpamHint')?.classList.toggle('d-none', !delivered);

        panel.classList.remove('d-none');
        // The resend form is the recovery path when the mail never lands, so
        // surface it now rather than waiting for a failed sign-in attempt.
        revealResendVerificationPanel({ focus: false });
        // setAuthView syncs the hero before it rewrites the URL, so the
        // just-registered copy needs a second pass once ?auth=login is set.
        syncMembershipHero();
        panel.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        });
      }

      function hideRegisterSuccessPanel() {
        document.getElementById('registerSuccessPanel')?.classList.add('d-none');
      }

      function revealResendVerificationPanel({ focus = true } = {}) {
        const panel = document.getElementById('resendVerificationPanel');
        if (!panel) return;
        panel.classList.remove('d-none');
        if (!focus) return;
        window.setTimeout(() => {
          document.getElementById('resendVerificationIdentifier')?.focus({ preventScroll: true });
        }, 50);
      }

      function normalizeAuthView(value) {
        return value === 'login' ? 'login' : 'register';
      }

      function setAuthView(view, options = {}) {
        const { updateUrl = true } = options;
        const normalizedView = normalizeAuthView(view);
        const registerSelected = normalizedView === 'register';

        authTabRegister.classList.toggle('active', registerSelected);
        authTabRegister.setAttribute('aria-selected', registerSelected ? 'true' : 'false');

        authTabLogin.classList.toggle('active', !registerSelected);
        authTabLogin.setAttribute('aria-selected', registerSelected ? 'false' : 'true');

        authPanelRegister.classList.toggle('d-none', !registerSelected);
        authPanelLogin.classList.toggle('d-none', registerSelected);
        syncMembershipHero(session?.member, Boolean(session?.member));

        if (!updateUrl) {
          return;
        }

        const url = new URL(window.location.href);
        if (registerSelected) {
          url.searchParams.delete('auth');
        } else {
          url.searchParams.set('auth', 'login');
        }
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + (url.hash || ''));
      }

      async function confirmStripePayment(sessionId) {
        if (!sessionId || paymentConfirmationInFlight) {
          return;
        }

        paymentConfirmationInFlight = true;
        try {
          const payload = await request('/api/member-payment-confirm', {
            method: 'POST',
            body: JSON.stringify({ sessionId }),
          });
          session = { ...session, member: payload.member, authenticated: true };
          populateProfile(session.member, session.profile, session.user);
          syncPaymentButton(session.member);
          syncMembershipUpgradePanel(session.member);
          showAlert(`Payment received. Your ${payload.membership.label.toLowerCase()} is active.`, 'success');
          window.gematriaTracking?.track('checkout_complete', {
            source: 'member_payment_confirm',
            membershipLevel: payload?.member?.membershipLevel || 'premium',
          });
          const url = new URL(window.location.href);
          url.searchParams.delete('session_id');
          window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + (url.hash || ''));
        } catch (error) {
          window.gematriaTracking?.track('checkout_error', {
            source: 'member_payment_confirm',
            errorMessage: error?.message || 'unknown_error',
          });
          showAlert(error.message || 'Payment was received, but the membership status could not be refreshed yet.');
        } finally {
          paymentConfirmationInFlight = false;
        }
      }


      function getCanonicalShareOrigin() {
        const host = window.location.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') {
          return window.location.origin;
        }

        return window.location.protocol === 'https:'
          ? window.location.origin
          : `https://${window.location.host}`;
      }

      function toCanonicalShareUrl(pathOrUrl) {
        const source = String(pathOrUrl || '').trim() || window.location.href;
        const parsed = new URL(source, window.location.origin);
        return `${getCanonicalShareOrigin()}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }

      function getHistoryReopenUrl(item) {
        if (item.calculatorSource === 'name-calculator') {
          const names = Array.isArray(item.resultPayload?.names) ? item.resultPayload.names.filter(Boolean) : [];
          const url = new URL('/name-calculator.html', getCanonicalShareOrigin());
          names.slice(0, 3).forEach((name, index) => {
            url.searchParams.set(`name${index + 1}`, name);
          });
          return `${url.pathname}${url.search}`;
        }

        const queryText = String(item.queryText || '').trim();
        return `/calculator.html?query=${encodeURIComponent(queryText)}`;
      }

      function getPerLetterValuesLabel(input) {
        const letters = Array.from(String(input || '').normalize('NFKC').replace(/[^A-Za-z]/g, '').toUpperCase())
          .map((char) => `${char}=${(char.charCodeAt(0) - 64) * 6}`);
        return letters.length ? letters.join(', ') : 'n/a';
      }

      function stripHtmlTags(value) {
        return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      async function fetchDefinitionPreview(word) {
        const normalizedWord = String(word || '').trim();
        if (!normalizedWord) {
          return '';
        }
        const extractText = (definition) => String(
          definition?.text || definition?.definition || definition?.display || definition?.gloss || ''
        ).trim();
        const getDefinitionList = (payload) => {
          if (Array.isArray(payload)) return payload;
          if (Array.isArray(payload?.definitions)) return payload.definitions;
          if (Array.isArray(payload?.data?.definitions)) return payload.data.definitions;
          return [];
        };
        const endpoints = [
          `/api/wordnikDefinition?word=${encodeURIComponent(normalizedWord)}`,
          `/.netlify/functions/wordnikDefinition?word=${encodeURIComponent(normalizedWord)}`,
        ];
        try {
          for (const endpoint of endpoints) {
            const response = await fetch(endpoint, { headers: { accept: 'application/json' } });
            if (!response.ok) continue;
            const payload = await response.json();
            const definitions = getDefinitionList(payload);
            const firstDefinition = definitions.find((definition) => extractText(definition));
            const preview = stripHtmlTags(extractText(firstDefinition));
            if (preview) return preview;
          }
        } catch {
          return '';
        }
        return '';
      }

      async function buildHistoryShareUrl(item) {
        if (item.calculatorSource === 'name-calculator') {
          const names = Array.isArray(item.resultPayload?.names) ? item.resultPayload.names.filter(Boolean) : [];
          const url = new URL('/name-calculator.html', getCanonicalShareOrigin());
          names.slice(0, 3).forEach((name, index) => {
            url.searchParams.set(`name${index + 1}`, name);
          });
          // One slot per name, in name order: the share card pairs the Nth
          // total with nameN. Dropping a failed lookup shifted every later
          // total onto the wrong name, so it keeps its slot as '?'.
          const results = Array.isArray(item.resultPayload?.results) ? item.resultPayload.results : [];
          const totals = names.slice(0, 3).map((_, index) => {
            const result = results[index];
            return !result?.error && result?.gematria?.gematria?.total != null
              ? String(result.gematria.gematria.total)
              : '?';
          });
          if (totals.some((total) => total !== '?')) {
            url.searchParams.set('totals', totals.join(','));
          }
          url.hash = 'name-form';
          return url.toString();
        }

        const queryText = String(item.queryText || '').trim();
        const url = new URL('/calculator.html', getCanonicalShareOrigin());
        url.searchParams.set('query', queryText);
        if (item.gematriaTotal != null) {
          url.searchParams.set('total', String(item.gematriaTotal));
        }
        if (item.digitalRoot != null) {
          url.searchParams.set('digitalRoot', String(item.digitalRoot));
        }
        if (typeof item.isBaseRoot === 'boolean') {
          url.searchParams.set('isBaseRoot', String(item.isBaseRoot));
        }
        const perLetterValues = getPerLetterValuesLabel(queryText);
        if (perLetterValues && perLetterValues !== 'n/a') {
          url.searchParams.set('perLetterValues', perLetterValues);
        }
        const definitionPreview = await fetchDefinitionPreview(queryText);
        url.searchParams.set('definitionPreview', definitionPreview || 'Definition preview unavailable.');
        url.hash = 'gematria-result';
        return url.toString();
      }

      async function shareHistoryItem(item) {
        const shareUrl = toCanonicalShareUrl(await buildHistoryShareUrl(item));
        const sharePayload = {
          title: 'Gematria.Today saved search',
          text: `Saved search: ${item.queryText || 'Gematria lookup'}\nView results: ${shareUrl}`,
          url: shareUrl,
        };

        if (navigator.share) {
          try {
            await navigator.share(sharePayload);
            showAlert('Share opened.', 'success');
            return;
          } catch (error) {
            if (error?.name === 'AbortError') {
              return;
            }
          }
        }

        try {
          await navigator.clipboard.writeText(shareUrl);
          showAlert('Share link copied to clipboard.', 'success');
          return;
        } catch {}

        window.prompt('Copy this link to share:', shareUrl);
      }

      function formatHistorySummary(item) {
        if (item.calculatorSource === 'name-calculator') {
          const names = Array.isArray(item.resultPayload?.names) ? item.resultPayload.names.filter(Boolean) : [];
          const successfulCount = Array.isArray(item.resultPayload?.results)
            ? item.resultPayload.results.filter((result) => !result?.error && result?.gematria).length
            : 0;
          return `Names: ${escapeHtml(names.join(', ')) || '—'} · Successful results: ${successfulCount}`;
        }

        const digitalRootValue = item.digitalRoot ?? '—';
        const digitalRootSummary = Number(item.digitalRoot) === 6
          ? `<span class="meta-highlight">Digital Root: ${digitalRootValue}</span>`
          : `Digital Root: ${digitalRootValue}`;
        return `Gematria: ${item.gematriaTotal ?? '—'} · ${digitalRootSummary} · Base Root: ${item.isBaseRoot === null ? '—' : (item.isBaseRoot ? 'Yes' : 'No')}`;
      }

      function getFavoriteStorageKey() {
        const memberId = session?.member?.id ?? 'guest';
        return `member-history-favorites:${memberId}`;
      }

      function loadFavoriteHistoryIds() {
        try {
          const saved = window.localStorage.getItem(getFavoriteStorageKey());
          const parsed = JSON.parse(saved || '[]');
          favoriteHistoryIds = new Set(Array.isArray(parsed) ? parsed.map((value) => String(value)) : []);
        } catch {
          favoriteHistoryIds = new Set();
        }
      }

      function persistFavoriteHistoryIds() {
        window.localStorage.setItem(getFavoriteStorageKey(), JSON.stringify(Array.from(favoriteHistoryIds)));
      }

      function isFavorited(item) {
        return favoriteHistoryIds.has(String(item.id));
      }

      const HISTORY_NOTE_SAVE_DELAY_MS = 600;

      function getHistoryNote(item) {
        return typeof item?.note === 'string' ? item.note : '';
      }

      // Reports the failure as well as alerting, so a caller that must not
      // lose the note (the legacy localStorage migration) can keep its copy.
      async function saveHistoryNoteToServer(id, noteText) {
        try {
          const payload = await request('/api/member-history', {
            method: 'PATCH',
            body: JSON.stringify({ id, note: noteText }),
          });
          const updated = payload?.item;
          if (updated) {
            const index = historyItems.findIndex((existing) => String(existing.id) === String(updated.id));
            if (index !== -1) {
              historyItems[index] = { ...historyItems[index], ...updated };
            }
          }
          return true;
        } catch (error) {
          showAlert(error.message || 'Unable to save note.');
          return false;
        }
      }

      function scheduleHistoryNoteSave(id, noteText) {
        const key = String(id);
        const existing = pendingHistoryNoteTimers.get(key);
        if (existing) {
          window.clearTimeout(existing.timer);
        }
        const timer = window.setTimeout(() => {
          pendingHistoryNoteTimers.delete(key);
          saveHistoryNoteToServer(key, noteText);
        }, HISTORY_NOTE_SAVE_DELAY_MS);
        pendingHistoryNoteTimers.set(key, { timer, noteText });
      }

      function flushPendingHistoryNoteSaves() {
        pendingHistoryNoteTimers.forEach((entry) => window.clearTimeout(entry.timer));
        pendingHistoryNoteTimers.clear();
      }

      function flushAbandonedHistoryNoteTimers() {
        if (!pendingHistoryNoteTimers.size) {
          return;
        }
        const entries = Array.from(pendingHistoryNoteTimers.entries());
        pendingHistoryNoteTimers.clear();
        entries.forEach(([key, { timer, noteText }]) => {
          window.clearTimeout(timer);
          const textarea = historyList?.querySelector(`[data-note-id="${CSS.escape(key)}"]`);
          const value = textarea ? textarea.value : noteText;
          const index = historyItems.findIndex((item) => String(item.id) === key);
          if (index !== -1) {
            historyItems[index] = { ...historyItems[index], note: value };
          }
          saveHistoryNoteToServer(key, value);
        });
      }

      async function migrateLegacyHistoryNotesToServer() {
        const memberId = session?.member?.id;
        if (!memberId) {
          return;
        }
        const key = `member-history-notes:${memberId}`;
        let parsed;
        try {
          parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
        } catch {
          parsed = null;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return;
        }
        const entries = Object.entries(parsed);
        if (!entries.length) {
          window.localStorage.removeItem(key);
          return;
        }
        // saveHistoryNoteToServer catches its own errors, so the old
        // try/catch here never fired and the notes were deleted whether or not
        // they reached the server. Keep them until every one is accounted for.
        let keepLegacyNotes = false;
        for (const [id, noteText] of entries) {
          const text = String(noteText ?? '').trim();
          if (!text) {
            continue;
          }
          const existing = historyItems.find((item) => String(item.id) === String(id));
          if (!existing) {
            // Possibly on a page of saved calculations not loaded yet.
            keepLegacyNotes = keepLegacyNotes || historyHasMore;
            continue;
          }
          if (!getHistoryNote(existing) && !(await saveHistoryNoteToServer(String(id), text))) {
            return;
          }
        }
        if (!keepLegacyNotes) {
          window.localStorage.removeItem(key);
        }
      }

      function sortHistoryItems(items) {
        return [...items].sort((left, right) => {
          const favoriteDelta = Number(isFavorited(right)) - Number(isFavorited(left));
          if (favoriteDelta !== 0) {
            return favoriteDelta;
          }

          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        });
      }

      function toggleFavoriteHistory(id) {
        const key = String(id);
        if (favoriteHistoryIds.has(key)) {
          favoriteHistoryIds.delete(key);
        } else {
          favoriteHistoryIds.add(key);
        }
        persistFavoriteHistoryIds();
        renderHistory();
      }

      function updateDashboardSavedTitles() {
        const historyCount = Math.max(historyTotal, Array.isArray(historyItems) ? historyItems.length : 0);
        const chatSessionCount = Array.isArray(chatSessions) ? chatSessions.length : 0;

        if (historySectionTitle) {
          historySectionTitle.textContent = `Saved calculations (${historyCount})`;
        }

        if (chatSessionSectionTitle) {
          chatSessionSectionTitle.textContent = `Saved chat sessions (${chatSessionCount})`;
        }
      }

      function renderHistory() {
        flushAbandonedHistoryNoteTimers();
        updateDashboardSavedTitles();
        const isPremiumMember = session?.member?.membershipLevel !== 'free';
        const sortedHistoryItems = sortHistoryItems(historyItems);
        const canExpandHistoryList = isPremiumMember && sortedHistoryItems.length > FREE_MEMBERSHIP_SAVE_LIMIT;
        const visibleHistoryItems = showAllHistoryItems || !canExpandHistoryList
          ? sortedHistoryItems
          : sortedHistoryItems.slice(0, FREE_MEMBERSHIP_SAVE_LIMIT);

        historyList.innerHTML = visibleHistoryItems.length ? visibleHistoryItems.map((item) => {
          const favorited = isFavorited(item);
          const noteId = `member-history-note-${item.id}`;
          const noteValue = getHistoryNote(item);
          return `
          <article class="admin-item-card member-history-card mb-3 p-3${favorited ? ' is-favorited' : ''}">
            <div class="d-flex justify-content-between flex-wrap gap-3">
              <div class="d-flex align-items-start gap-3 flex-grow-1">
                <button
                  class="history-favorite-button${favorited ? ' is-favorited' : ''}"
                  type="button"
                  data-favorite-id="${item.id}"
                  aria-label="${favorited ? 'Remove from favorites' : 'Add to favorites'}"
                  aria-pressed="${favorited ? 'true' : 'false'}"
                  title="${favorited ? 'Favorited search' : 'Favorite this search'}"
                >★</button>
                <div>
                  <h4 class="h6 mb-1">${escapeHtml(item.queryText)}</h4>
                  <p class="small text-muted mb-1">${escapeHtml(item.calculatorSource)} · ${escapeHtml(item.queryType)} · Saved ${new Date(item.createdAt).toLocaleString()}</p>
                  <p class="small mb-0">${formatHistorySummary(item)}</p>
                </div>
              </div>
              <div class="d-flex align-items-center gap-2">
                <a class="btn btn-outline-primary btn-sm" href="${getHistoryReopenUrl(item)}">Reopen</a>
                <button class="btn btn-warning btn-sm fw-semibold share-action-button" type="button" data-share-id="${item.id}">Share</button>
                <button class="btn btn-outline-danger btn-sm" type="button" data-delete-id="${item.id}">Delete</button>
              </div>
            </div>
            <div class="mt-3">
              <label class="form-label small text-muted mb-1" for="${noteId}">Notes</label>
              <textarea
                id="${noteId}"
                class="form-control form-control-sm"
                rows="4"
                maxlength="10000"
                placeholder="Add private notes about this saved search..."
                data-note-id="${item.id}"
              >${escapeHtml(noteValue)}</textarea>
            </div>
          </article>
        `;
        }).join('') : '<p class="text-muted mb-0">No saved calculations yet. Run a lookup on the <a href="/calculator.html">calculator</a> or <a href="/name-calculator.html">name calculator</a> page and click <strong>Save result</strong>.</p>';

        if (canExpandHistoryList) {
          historyListToggleWrap.classList.remove('d-none');
          historyListToggleButton.textContent = showAllHistoryItems
            ? 'Show only first 7 calculations'
            : 'View all saved calculations';
        } else {
          historyListToggleWrap.classList.add('d-none');
          showAllHistoryItems = false;
        }

        // Older saves stay on the server until asked for. Offered once the
        // whole loaded list is on screen, so it never skips past hidden rows.
        const canLoadMoreHistory = historyHasMore && (showAllHistoryItems || !canExpandHistoryList);
        historyLoadMoreWrap?.classList.toggle('d-none', !canLoadMoreHistory);

        historyList.querySelectorAll('[data-favorite-id]').forEach((button) => {
          button.addEventListener('click', () => {
            toggleFavoriteHistory(button.dataset.favoriteId);
          });
        });

        historyList.querySelectorAll('[data-delete-id]').forEach((button) => {
          button.addEventListener('click', async () => {
            if (!window.confirm('Delete this saved search? This cannot be undone.')) {
              return;
            }
            try {
              await request('/api/member-history', {
                method: 'DELETE',
                body: JSON.stringify({ id: button.dataset.deleteId }),
              });
              favoriteHistoryIds.delete(String(button.dataset.deleteId));
              persistFavoriteHistoryIds();
              const pendingEntry = pendingHistoryNoteTimers.get(String(button.dataset.deleteId));
              if (pendingEntry) {
                window.clearTimeout(pendingEntry.timer);
                pendingHistoryNoteTimers.delete(String(button.dataset.deleteId));
              }
              showAlert('History entry deleted.', 'success');
              // Dropped in place rather than reloaded: a reload starts again
              // from the first page and loses every page the member opened.
              historyItems = historyItems.filter((item) => String(item.id) !== String(button.dataset.deleteId));
              historyTotal = Math.max(0, historyTotal - 1);
              renderHistory();
            } catch (error) {
              showAlert(error.message || 'Unable to delete history item.');
            }
          });
        });

        historyList.querySelectorAll('[data-share-id]').forEach((button) => {
          button.addEventListener('click', async () => {
            const selected = historyItems.find((item) => String(item.id) === String(button.dataset.shareId));
            if (!selected) {
              showAlert('Saved search could not be found.');
              return;
            }

            await shareHistoryItem(selected);
          });
        });

        historyList.querySelectorAll('[data-note-id]').forEach((textarea) => {
          textarea.addEventListener('input', () => {
            scheduleHistoryNoteSave(textarea.dataset.noteId, textarea.value);
          });
          textarea.addEventListener('blur', () => {
            const key = String(textarea.dataset.noteId);
            const entry = pendingHistoryNoteTimers.get(key);
            if (entry) {
              window.clearTimeout(entry.timer);
              pendingHistoryNoteTimers.delete(key);
              saveHistoryNoteToServer(key, textarea.value);
            }
          });
        });
      }

      function renderChatSessions() {
        updateDashboardSavedTitles();
        if (!gemabotModuleEnabled) {
          chatSessionList.innerHTML = '<p class="text-muted mb-0">GemaBot module is disabled for this site build.</p>';
          return;
        }
        chatSessionList.innerHTML = chatSessions.length ? chatSessions.map((sessionItem) => {
          const transcriptEntries = Array.isArray(sessionItem.transcript) ? sessionItem.transcript : [];
          const transcriptSummary = transcriptEntries.map((entry) => `
            <li><strong>${entry.role === 'assistant' ? 'Agent' : 'You'}:</strong><div class="mt-1">${formatTranscriptEntryHtml(entry.text || '')}</div></li>
          `).join('');

          return `
            <article class="admin-item-card member-history-card mb-3 p-3">
              <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
                <div class="flex-grow-1">
                  <h4 class="h6 mb-1">${escapeHtml(sessionItem.title || 'GemaBot session')}</h4>
                  <p class="small text-muted mb-2">${escapeHtml(sessionItem.topic || 'General chat')} · Saved ${new Date(sessionItem.createdAt).toLocaleString()}</p>
                  <details>
                    <summary>View transcript (${transcriptEntries.length} message${transcriptEntries.length === 1 ? '' : 's'})</summary>
                    <ol class="small mt-2 mb-0">
                      ${transcriptSummary || '<li>No transcript preview available.</li>'}
                    </ol>
                  </details>
                </div>
                <div class="d-flex flex-wrap gap-2">
                  <div class="btn-group">
                    <button class="btn btn-outline-secondary btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Download</button>
                    <ul class="dropdown-menu dropdown-menu-end">
                      <li><button class="dropdown-item" type="button" data-export-chat-session-id="${sessionItem.id}" data-export-chat-format="html">HTML (.html)</button></li>
                      <li><button class="dropdown-item" type="button" data-export-chat-session-id="${sessionItem.id}" data-export-chat-format="markdown">Markdown (.md)</button></li>
                      <li><button class="dropdown-item" type="button" data-export-chat-session-id="${sessionItem.id}" data-export-chat-format="text">Plain text (.txt)</button></li>
                      <li><button class="dropdown-item" type="button" data-export-chat-session-id="${sessionItem.id}" data-export-chat-format="json">JSON (.json)</button></li>
                    </ul>
                  </div>
                  <button class="btn btn-outline-danger btn-sm" type="button" data-delete-chat-session-id="${sessionItem.id}">Delete</button>
                </div>
              </div>
            </article>
          `;
        }).join('') : '<p class="text-muted mb-0">No saved AI GemaBot chat sessions yet. Open the <a href="/ai-agent.html">GemaBot</a> and click <strong>Save chat to dashboard</strong>.</p>';

        chatSessionList.querySelectorAll('[data-export-chat-session-id]').forEach((button) => {
          button.addEventListener('click', () => {
            const selected = chatSessions.find((item) => String(item.id) === String(button.dataset.exportChatSessionId));
            if (!selected) {
              showAlert('Chat session could not be found.');
              return;
            }

            downloadChatSession(selected, button.dataset.exportChatFormat || 'html');
          });
        });

        chatSessionList.querySelectorAll('[data-delete-chat-session-id]').forEach((button) => {
          button.addEventListener('click', async () => {
            if (!window.confirm('Delete this chat session? This cannot be undone.')) {
              return;
            }
            try {
              await request('/api/member-chat-sessions', {
                method: 'DELETE',
                body: JSON.stringify({ id: button.dataset.deleteChatSessionId }),
              });
              showAlert('Chat session deleted.', 'success');
              await loadChatSessions();
            } catch (error) {
              showAlert(error.message || 'Unable to delete chat session.');
            }
          });
        });
      }

      function populateProfile(member, profile, user = null) {
        memberMeta.textContent = `Signed in as ${member.displayName || member.username} (${member.email})`;
        membershipLevel.textContent = member.membershipLevel;
        membershipPlanMeta.textContent = formatMembershipWindow(member);
        updateMessageInboxSummary(getMessageCenterInboxItems().length);
        document.getElementById('profileDisplayName').value = member.displayName || '';
        document.getElementById('profileNotes').value = profile?.preferences?.notes || '';
        syncPaymentButton(member);
        syncMembershipUpgradePanel(member);
        syncPremiumResearchLink(member);
        syncAdminPageButton(member, user);
        syncBlogProposalForm(member);
        syncMessageCenterAccess(member);
        syncBlogSubscriptionSection(member, profile);
      }

      const METRIC_LABELS = {
        searches_total: 'Word lookups',
        words_contributed: 'New words added to database',
        base_root_finds: 'Base-root discoveries',
        gematria_searches_total: 'Gematria-value searches',
      };

      function renderAchievementsEmpty() {
        const stats = document.getElementById('achievementsStatsRow');
        const earned = document.getElementById('achievementsEarnedList');
        const progress = document.getElementById('achievementsProgressList');
        if (stats) stats.innerHTML = '';
        if (earned) earned.innerHTML = '<span class="text-muted small">Sign in to view your badges.</span>';
        if (progress) progress.innerHTML = '';
      }

      function renderAchievements(data) {
        const statsContainer = document.getElementById('achievementsStatsRow');
        const earnedContainer = document.getElementById('achievementsEarnedList');
        const progressContainer = document.getElementById('achievementsProgressList');
        const summary = document.getElementById('achievementsSummary');
        if (!statsContainer || !earnedContainer || !progressContainer) return;

        const stats = data?.stats || {};
        const earned = Array.isArray(data?.earnedBadges) ? data.earnedBadges : [];
        const progress = Array.isArray(data?.progress) ? data.progress : [];

        const statTiles = [
          { label: 'Searches', value: stats.searchesTotal || 0 },
          { label: 'Words contributed', value: stats.wordsContributed || 0 },
          { label: 'Base roots found', value: stats.baseRootFinds || 0 },
          { label: 'Gematria searches', value: stats.gematriaSearchesTotal || 0 },
        ];
        statsContainer.innerHTML = statTiles.map((tile) => `
          <div class="col-6 col-md-3">
            <div class="stat-card p-3 h-100">
              <div class="section-kicker mb-1">${escapeHtml(tile.label)}</div>
              <div class="metric-value text-primary">${escapeHtml(String(tile.value))}</div>
            </div>
          </div>
        `).join('');

        if (summary) {
          summary.textContent = earned.length
            ? `You have earned ${earned.length} badge${earned.length === 1 ? '' : 's'}.`
            : 'Search words and explore gematria values to earn badges.';
        }

        earnedContainer.innerHTML = earned.length
          ? earned.map((badge) => `
              <span class="badge rounded-pill text-bg-primary p-2" title="${escapeHtml(badge.description || '')}">
                ${escapeHtml(badge.name)}
              </span>
            `).join('')
          : '<span class="text-muted small">No badges earned yet.</span>';

        const upcoming = progress.filter((item) => item.nextThreshold);
        progressContainer.innerHTML = upcoming.length
          ? upcoming.map((item) => {
              const label = METRIC_LABELS[item.metric] || item.metric;
              const pct = Math.min(100, Math.round((item.current / item.nextThreshold) * 100));
              return `
                <div>
                  <div class="d-flex justify-content-between small mb-1">
                    <span>${escapeHtml(item.nextBadgeName || 'Next badge')} <span class="text-muted">— ${escapeHtml(label)}</span></span>
                    <span class="text-muted">${item.current} / ${item.nextThreshold}</span>
                  </div>
                  <div class="progress" role="progressbar" aria-label="${escapeHtml(item.nextBadgeName || 'Progress')}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" style="height: 0.5rem;">
                    <div class="progress-bar" style="width: ${pct}%;"></div>
                  </div>
                </div>
              `;
            }).join('')
          : '<span class="text-muted small">You have reached every badge tier. New tiers may appear over time.</span>';
      }

      async function loadAchievements() {
        try {
          const payload = await request('/api/member-badges');
          renderAchievements(payload);
        } catch (error) {
          renderAchievementsEmpty();
        }
      }

      function applyHistoryPage(payload, { append = false } = {}) {
        const pageItems = Array.isArray(payload?.history) ? payload.history : [];
        if (append) {
          // Offsets shift when a save lands between pages, so the next page
          // can repeat a row already on screen.
          const knownIds = new Set(historyItems.map((item) => String(item.id)));
          historyItems = [...historyItems, ...pageItems.filter((item) => !knownIds.has(String(item.id)))];
        } else {
          historyItems = pageItems;
        }
        historyHasMore = payload?.hasMore === true;
        historyTotal = Number.isFinite(Number(payload?.total)) ? Number(payload.total) : historyItems.length;
        // A favorite can only be called stale once every saved calculation is
        // loaded; before that it may belong to a page not fetched yet.
        if (!historyHasMore) {
          favoriteHistoryIds.forEach((id) => {
            if (!historyItems.some((item) => String(item.id) === id)) {
              favoriteHistoryIds.delete(id);
            }
          });
          persistFavoriteHistoryIds();
        }
        renderHistory();
        migrateLegacyHistoryNotesToServer().catch(() => {});
      }

      async function loadHistory() {
        const payload = await request(`/api/member-history?limit=${HISTORY_PAGE_SIZE}`);
        applyHistoryPage(payload);
      }

      async function loadMoreHistory() {
        if (historyLoadMoreInFlight || !historyHasMore) {
          return;
        }
        historyLoadMoreInFlight = true;
        if (historyLoadMoreButton) {
          historyLoadMoreButton.disabled = true;
        }
        try {
          const payload = await request(`/api/member-history?limit=${HISTORY_PAGE_SIZE}&offset=${historyItems.length}`);
          applyHistoryPage(payload, { append: true });
        } catch (error) {
          showAlert(error.message || 'Unable to load more saved calculations.');
        } finally {
          historyLoadMoreInFlight = false;
          if (historyLoadMoreButton) {
            historyLoadMoreButton.disabled = false;
          }
        }
      }

      async function loadChatSessions() {
        if (!gemabotModuleEnabled) {
          chatSessions = [];
          renderChatSessions();
          return;
        }
        const payload = await request('/api/member-chat-sessions');
        chatSessions = Array.isArray(payload.sessions) ? payload.sessions : [];
        renderChatSessions();
      }

      async function refreshDashboardFromSync(update = {}) {
        if (!session?.authenticated || dashboardSyncRefreshInFlight) {
          return;
        }

        const now = Date.now();
        if (now - lastDashboardSyncRefreshAt < 400) {
          return;
        }
        lastDashboardSyncRefreshAt = now;
        dashboardSyncRefreshInFlight = true;

        const kind = String(update?.kind || '').trim();
        try {
          if (kind === 'history') {
            await loadHistory();
          } else if (kind === 'chat' && gemabotModuleEnabled) {
            await loadChatSessions();
          } else {
            const loaders = [loadHistory()];
            if (gemabotModuleEnabled) {
              loaders.push(loadChatSessions());
            }
            await Promise.all(loaders);
          }
        } catch (error) {
          showAlert(error.message || 'Unable to refresh dashboard updates in real time.');
        } finally {
          dashboardSyncRefreshInFlight = false;
        }
      }

      function parseDashboardSyncPayload(rawPayload) {
        if (!rawPayload) return null;
        if (typeof rawPayload === 'object') return rawPayload;
        try {
          return JSON.parse(String(rawPayload));
        } catch {
          return null;
        }
      }

      historyListToggleButton.addEventListener('click', () => {
        showAllHistoryItems = !showAllHistoryItems;
        renderHistory();
      });

      historyLoadMoreButton?.addEventListener('click', () => {
        loadMoreHistory();
      });

      memberDashboardSyncChannel?.addEventListener('message', (event) => {
        refreshDashboardFromSync(parseDashboardSyncPayload(event.data));
      });

      window.addEventListener('storage', (event) => {
        if (event.key !== MEMBER_DASHBOARD_SYNC_KEY || !event.newValue) {
          return;
        }
        refreshDashboardFromSync(parseDashboardSyncPayload(event.newValue));
      });

      async function bootstrapSession() {
        const url = new URL(window.location.href);
        const paymentState = url.searchParams.get('payment');
        const stripeSessionId = url.searchParams.get('session_id');
        const verifyEmailToken = url.searchParams.get('verify_email_token');
        const explicitAuthParam = url.searchParams.get('auth');
        let initialAuthView;
        if (explicitAuthParam) {
          initialAuthView = normalizeAuthView(explicitAuthParam);
        } else {
          let hasLoggedInBefore = false;
          try {
            hasLoggedInBefore = window.localStorage.getItem('memberHasLoggedInBefore') === 'true';
          } catch (_error) { /* storage unavailable */ }
          initialAuthView = hasLoggedInBefore ? 'login' : 'register';
        }

        setAuthView(initialAuthView, { updateUrl: false });

        if (verifyEmailToken) {
          try {
            await request(`/api/member-verify-email?token=${encodeURIComponent(verifyEmailToken)}`, { method: 'GET' });
            window.sessionStorage.setItem('memberJustVerifiedEmail', 'true');
            showAlert('Email verified. Your account is now active and you can sign in.', 'success');
            scrollToLoginArea();
          } catch (error) {
            showAlert(error.message || 'Email verification link is invalid or expired.', 'warning');
            revealResendVerificationPanel();
          } finally {
            url.searchParams.delete('verify_email_token');
            window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + (url.hash || ''));
          }
        }

        const csrfReady = request('/api/member-csrf', { method: 'GET' })
          .then(({ csrfToken: preAuthCsrfToken }) => {
            if (preAuthCsrfToken && !csrfToken) {
              csrfToken = preAuthCsrfToken;
            }
          })
          .catch(() => {
            // Non-fatal: proceed without pre-auth CSRF token
          });

        try {
          session = await request('/api/member-session', { method: 'GET' });
          // member-session answers a signed-out visitor with 200
          // { authenticated: false }, which request() does not treat as a
          // failure. That used to fall through to setLoggedIn(true): visitors
          // got the dashboard, and anyone holding the signup's Level 1 intent
          // was told "Signed in" and sent to /gematria-basics.html instead of
          // the sign-in form their verification link pointed at.
          if (!session?.authenticated || !session.member) {
            throw new Error('Not signed in');
          }
          if (session?.csrfToken) {
            csrfToken = session.csrfToken;
          }
          membershipHeroReady = true;
          loadFavoriteHistoryIds();
          setLoggedIn(true);
          populateProfile(session.member, session.profile, session.user);
          loadHistory().catch((error) => {
            showAlert(error.message || 'Unable to load saved calculations.');
          });
          if (!gemabotModuleEnabled) {
            chatSessions = [];
            renderChatSessions();
          }
          scheduleIdle(() => {
            if (forumModuleEnabled) {
              loadForumNotificationsInBackground();
            }
            loadAchievements().catch(() => {});
            if (gemabotModuleEnabled) {
              loadChatSessions().catch((error) => {
                showAlert(error.message || 'Unable to load chat sessions.');
              });
            }
            loadMemberProposals().catch(() => {});
            loadMemberChatbotFeedback().catch(() => {});
          });

          if (paymentState === 'success' && stripeSessionId) {
            await csrfReady;
            await confirmStripePayment(stripeSessionId);
          } else if (paymentState === 'cancelled') {
            showAlert('Stripe checkout was cancelled. Your membership remains unchanged.', 'warning');
          }
        } catch {
          session = null;
          favoriteHistoryIds = new Set();
          flushPendingHistoryNoteSaves();
          membershipHeroReady = true;
          setLoggedIn(false);
          renderAchievementsEmpty();
          historyItems = [];
          historyTotal = 0;
          historyHasMore = false;
          renderHistory();
          chatSessions = [];
          renderChatSessions();
          loadMemberProposals().catch(() => {});
          loadMemberChatbotFeedback().catch(() => {});
          if (paymentState === 'success') {
            showAlert('Sign in to finish activating your Stripe payment.', 'warning');
          }
        } finally {
          hideWorkingOverlay();
          scrollToInitialHashTarget();
        }
      }

      function scrollToInitialHashTarget() {
        const rawHash = window.location.hash;
        if (!rawHash || rawHash === '#') {
          return;
        }
        let target = null;
        try {
          target = document.querySelector(rawHash);
        } catch {
          return;
        }
        if (!target || target.offsetParent === null) {
          return;
        }
        window.requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: 'auto', block: 'start' });
        });
      }

      window.addEventListener('DOMContentLoaded', () => {
        const registerStrengthBar = document.getElementById('registerPasswordStrengthBar');
        const registerStrengthLabel = document.getElementById('registerPasswordStrengthLabel');
        const passwordStrength = window.GematriaPasswordStrength;
        function updateRegisterStrength() {
          if (!registerPasswordInput || !registerStrengthBar || !registerStrengthLabel || !passwordStrength) return;
          const value = registerPasswordInput.value;
          if (!value) {
            registerStrengthBar.className = 'progress-bar bg-secondary';
            registerStrengthBar.style.width = '0%';
            registerStrengthLabel.textContent = passwordStrength.HINT;
            return;
          }
          const style = passwordStrength.styleFor(value);
          registerStrengthBar.className = 'progress-bar ' + style.cls;
          registerStrengthBar.style.width = style.width;
          registerStrengthLabel.textContent = style.label;
        }
        registerPasswordInput?.addEventListener('input', updateRegisterStrength);

        window.GematriaRegisterForm.initRegisterForm({
          form: document.getElementById('registerForm'),
          fields: {
            username: document.getElementById('registerUsername'),
            displayName: document.getElementById('registerDisplayName'),
            email: document.getElementById('registerEmail'),
            password: registerPasswordInput,
          },
          submitButton: registerButton,
          alert: { show: showAlert, clear: clearAlert },
          source: 'member_register_form',
          request,
          // Kept on the new profile, so the opt-in survives verifying and
          // signing in on another device.
          extraFields: () => ({ blogSubscribe: document.getElementById('registerBlogSubscribe').checked }),
          onSuccess: (response, ctx) => {
            const shouldSubscribeToBlog = document.getElementById('registerBlogSubscribe').checked;
            const registerEmail = document.getElementById('registerEmail').value.trim();
            session = null;
            favoriteHistoryIds = new Set();
            flushPendingHistoryNoteSaves();
            setLoggedIn(false);
            historyItems = [];
            historyTotal = 0;
            historyHasMore = false;
            renderHistory();
            ctx.form.reset();
            if (shouldSubscribeToBlog) {
              rememberFollowItSubscriptionIntent(registerEmail);
            }
            justRegistered = true;
            setAuthView('login', { updateUrl: true });
            // Persistent panel instead of a 6s alert: this is the only place
            // that tells the user their signup isn't finished yet.
            showRegisterSuccessPanel(registerEmail, response);
          },
          onError: (error) => {
            showAlert(error.message || 'Unable to create membership account.');
          },
        });
      });

      authTabRegister.addEventListener('click', () => {
        window.gematriaTracking?.track('sign_up_start', { source: 'member_auth_tab' });
        // Starting a new signup makes the previous one's confirmation stale.
        justRegistered = false;
        registrationEmailDelivered = true;
        hideRegisterSuccessPanel();
        setAuthView('register', { updateUrl: true });
      });

      authTabLogin.addEventListener('click', () => {
        setAuthView('login', { updateUrl: true });
      });

      const resendVerificationForm = document.getElementById('resendVerificationForm');
      const resendVerificationSubmit = document.getElementById('resendVerificationSubmit');
      const resendVerificationAlert = document.getElementById('resendVerificationAlert');
      const resendVerificationIdentifier = document.getElementById('resendVerificationIdentifier');

      function setResendVerificationAlert(message, tone) {
        if (!resendVerificationAlert) return;
        resendVerificationAlert.textContent = message;
        resendVerificationAlert.classList.remove('d-none', 'alert-success', 'alert-warning', 'alert-danger', 'alert-info');
        resendVerificationAlert.classList.add('alert-' + (tone || 'info'));
      }

      function maskEmailForResendNotice(value) {
        const trimmed = String(value || '').trim();
        const atIndex = trimmed.lastIndexOf('@');
        if (atIndex < 1) {
          return '';
        }
        const local = trimmed.slice(0, atIndex);
        const domain = trimmed.slice(atIndex + 1);
        if (!local || !domain) {
          return '';
        }
        const visible = local.slice(0, 1);
        return `${visible}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
      }

      function startResendCooldown(seconds) {
        if (!resendVerificationSubmit) return;
        const defaultLabel = resendVerificationSubmit.dataset.defaultLabel
          || resendVerificationSubmit.textContent
          || 'Send a fresh link';
        resendVerificationSubmit.dataset.defaultLabel = defaultLabel;
        let remaining = seconds;
        resendVerificationSubmit.disabled = true;
        resendVerificationSubmit.textContent = `Wait ${remaining}s before resending`;
        const interval = window.setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            window.clearInterval(interval);
            resendVerificationSubmit.disabled = false;
            resendVerificationSubmit.textContent = defaultLabel;
            return;
          }
          resendVerificationSubmit.textContent = `Wait ${remaining}s before resending`;
        }, 1000);
      }

      resendVerificationForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const identifier = (resendVerificationIdentifier?.value || '').trim();
        if (!identifier) {
          setResendVerificationAlert('Enter the username or email you registered with.', 'warning');
          return;
        }
        const defaultLabel = resendVerificationSubmit?.dataset.defaultLabel
          || resendVerificationSubmit?.textContent
          || 'Send a fresh link';
        if (resendVerificationSubmit) {
          resendVerificationSubmit.dataset.defaultLabel = defaultLabel;
          resendVerificationSubmit.disabled = true;
          resendVerificationSubmit.setAttribute('aria-busy', 'true');
          resendVerificationSubmit.textContent = 'Sending…';
        }
        try {
          const response = await request('/api/member-resend-verification', {
            method: 'POST',
            body: JSON.stringify({
              identifier,
              ...(window.GematriaAntiBot?.honeypotPayload?.(resendVerificationForm) || {}),
            }),
          });
          const maskedEmail = maskEmailForResendNotice(identifier);
          const successMessage = maskedEmail
            ? `Verification email sent to ${maskedEmail}. Check spam if you don't see it within 5 minutes.`
            : (response?.message || 'If a pending account matches that identifier, a fresh verification link has been sent by email. Check spam if you don\'t see it within 5 minutes.');
          setResendVerificationAlert(successMessage, 'success');
          if (resendVerificationSubmit) {
            resendVerificationSubmit.removeAttribute('aria-busy');
            startResendCooldown(30);
          }
        } catch (error) {
          setResendVerificationAlert(error.message || 'Unable to resend the verification email right now. Please try again in a few minutes.', 'danger');
          if (resendVerificationSubmit) {
            resendVerificationSubmit.disabled = false;
            resendVerificationSubmit.removeAttribute('aria-busy');
            resendVerificationSubmit.textContent = defaultLabel;
          }
        }
      });

      const loginForm = document.getElementById('loginForm');
      const loginSubmitButton = document.getElementById('loginSubmitButton');
      const loginSubmitButtonDefaultLabel = loginSubmitButton?.textContent || 'Sign in';
      const setLoginSubmittingState = (isSubmitting) => {
        if (!loginSubmitButton) {
          return;
        }
        loginSubmitButton.disabled = Boolean(isSubmitting);
        loginSubmitButton.textContent = isSubmitting ? 'Signing in… Please wait' : loginSubmitButtonDefaultLabel;
      };

      loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();
        setLoginSubmittingState(true);
        try {
          session = await request('/api/member-login', {
            method: 'POST',
            body: JSON.stringify({
              identifier: document.getElementById('loginIdentifier').value.trim(),
              password: document.getElementById('loginPassword').value,
              ...(window.GematriaAntiBot?.honeypotPayload?.(loginForm) || {}),
            }),
          });
          if (session?.csrfToken) {
            csrfToken = session.csrfToken;
          }
          try {
            window.localStorage.setItem('memberHasLoggedInBefore', 'true');
          } catch (_error) { /* storage unavailable */ }
          loadFavoriteHistoryIds();
          showAlert('Signed in successfully.', 'success');
          setLoggedIn(true);
          populateProfile(session.member, session.profile, session.user);
          if (forumModuleEnabled) {
            loadForumNotificationsInBackground();
          }
          maybeOpenFollowItAfterVerifiedSignIn(session);
          await loadHistory();
          if (gemabotModuleEnabled) {
            await loadChatSessions();
          } else {
            chatSessions = [];
            renderChatSessions();
          }
          await loadMemberProposals();
          await loadMemberChatbotFeedback();
        } catch (error) {
          showAlert(error.message || 'Unable to sign in.');
          if (/verify your email/i.test(error?.message || '')) {
            revealResendVerificationPanel();
            const submittedIdentifier = document.getElementById('loginIdentifier')?.value.trim();
            if (submittedIdentifier && resendVerificationIdentifier) {
              resendVerificationIdentifier.value = submittedIdentifier;
            }
          }
        } finally {
          setLoginSubmittingState(false);
        }
      });

      let isProfileSaving = false;

      function setProfileSaveButtonState(state) {
        if (!profileSaveButton) return;
        if (state === 'saving') {
          profileSaveButton.textContent = 'Saving...';
          profileSaveButton.disabled = true;
          profileSaveButton.classList.add('btn-primary');
          profileSaveButton.classList.remove('btn-secondary');
          return;
        }
        if (state === 'saved') {
          profileSaveButton.textContent = 'Saved';
          profileSaveButton.disabled = true;
          profileSaveButton.classList.remove('btn-primary');
          profileSaveButton.classList.add('btn-secondary');
          return;
        }
        profileSaveButton.textContent = 'Save profile';
        profileSaveButton.disabled = false;
        profileSaveButton.classList.add('btn-primary');
        profileSaveButton.classList.remove('btn-secondary');
      }

      document.getElementById('profileForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isProfileSaving) {
          return;
        }
        isProfileSaving = true;
        setProfileSaveButtonState('saving');
        clearAlert();
        try {
          const existingPreferences = session?.profile?.preferences && typeof session.profile.preferences === 'object'
            ? session.profile.preferences
            : {};
          const nextDisplayName = document.getElementById('profileDisplayName').value.trim();
          const nextNotes = document.getElementById('profileNotes').value.trim();
          const prevDisplayName = (session?.member?.displayName || '').trim();
          const prevNotes = (existingPreferences?.notes || '').trim();
          const changedFields = [];
          if (nextDisplayName !== prevDisplayName) changedFields.push('display name');
          if (nextNotes !== prevNotes) changedFields.push('notes');
          const payload = await request('/api/member-profile', {
            method: 'PATCH',
            body: JSON.stringify({
              displayName: nextDisplayName,
              preferences: {
                ...existingPreferences,
                notes: nextNotes,
              },
            }),
          });
          session = { ...session, authenticated: true, member: payload.member, profile: payload.profile };
          populateProfile(payload.member, payload.profile, session?.user);
          setProfileSaveButtonState('saved');
          const savedMessage = changedFields.length
            ? `Profile saved (${changedFields.join(' and ')} updated).`
            : 'Profile saved (no changes).';
          showAlert(savedMessage, 'success');
        } catch (error) {
          setProfileSaveButtonState('default');
          showAlert(error.message || 'Unable to save profile.');
        } finally {
          isProfileSaving = false;
        }
      });

      ['profileDisplayName', 'profileNotes'].forEach((id) => {
        const field = document.getElementById(id);
        if (!field) return;
        field.addEventListener('input', () => {
          if (isProfileSaving) return;
          setProfileSaveButtonState('default');
        });
      });

      blogSubscriptionForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();
        if (!session?.member?.email) {
          showAlert('Sign in before subscribing to blog updates.', 'warning');
          return;
        }

        blogSubscriptionButton.disabled = true;
        try {
          const membershipEmail = String(session.member.email).trim().toLowerCase();
          openFollowItSubscription(membershipEmail);
          clearRememberedFollowItSubscriptionIntent();
          await rememberBlogSubscriptionEmail(membershipEmail);
          showAlert('Blog subscription started. Please finish confirmation in the opened tab.', 'success');
        } catch (error) {
          showAlert(error.message || 'Unable to start blog subscription right now.');
        } finally {
          blogSubscriptionButton.disabled = false;
        }
      });

      premiumBlogProposalForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();
        if (!session?.member || !isPremiumMembershipLevel(session.member.membershipLevel)) {
          showAlert('Blog proposals are open to supporters only.', 'warning');
          return;
        }

        const rawTags = document.getElementById('blogProposalTags').value;
        const tags = rawTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);

        if (tags.length === 0) {
          showAlert('Please include at least one suggested tag separated by commas.', 'warning');
          return;
        }

        const payload = {
          title: document.getElementById('blogProposalTitle').value.trim(),
          summary: document.getElementById('blogProposalSummary').value.trim(),
          body: document.getElementById('blogProposalBody').value.trim(),
          suggestedTags: tags.join(', '),
          proposedImageUrl: document.getElementById('blogProposalImageUrl').value.trim() || null,
        };

        // A rejected POST (validation, a lapsed tier, a server error) used to
        // escape this listener as an unhandled rejection: no message, and the
        // form left as if the proposal might have gone through.
        const proposalSubmitButton = premiumBlogProposalForm.querySelector('button[type="submit"]');
        if (proposalSubmitButton) {
          proposalSubmitButton.disabled = true;
        }
        try {
          await request('/api/member-blog-proposals', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        } catch (error) {
          showAlert(error.message || 'Unable to send your proposal right now. Please try again.');
          return;
        } finally {
          if (proposalSubmitButton) {
            proposalSubmitButton.disabled = false;
          }
        }

        showAlert('Your proposal was sent to the admin review queue.', 'success');
        event.target.reset();
        premiumBlogProposalForm.classList.add('d-none');
        premiumBlogProposalSuccessMessage.classList.remove('d-none');
        blogProposalAttribution.value = session.member.username || '';
        await loadMemberProposals().catch(() => {});
      });

      memberProposalFeedbackList?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-archive-proposal]');
        if (!button) {
          return;
        }

        clearAlert();
        button.disabled = true;
        try {
          await archiveProposal(button.dataset.archiveProposal);
          showAlert('Proposal archived.', 'success');
        } catch (error) {
          showAlert(error.message || 'Unable to archive proposal.');
          button.disabled = false;
        }
      });

      async function archiveMessageCenterItem({ proposalId = null, feedbackId = null }) {
        if (proposalId) {
          await archiveProposal(proposalId);
          return;
        }

        await request('/api/member-chatbot-feedback', {
          method: 'PATCH',
          body: JSON.stringify({ id: feedbackId, action: 'archive' }),
        });
        memberChatbotFeedback = memberChatbotFeedback.filter((item) => item.id !== feedbackId);
        renderForumNotifications();
      }

      messageCenterSentList?.addEventListener('click', async (event) => {
        const proposalButton = event.target.closest('[data-archive-proposal]');
        const feedbackButton = event.target.closest('[data-archive-chatbot-feedback]');
        if (!proposalButton && !feedbackButton) {
          return;
        }
        clearAlert();
        const button = proposalButton || feedbackButton;
        button.disabled = true;
        try {
          await archiveMessageCenterItem({
            proposalId: proposalButton?.dataset.archiveProposal || null,
            feedbackId: feedbackButton?.dataset.archiveChatbotFeedback || null,
          });
          await Promise.allSettled([loadMemberChatbotFeedback(), loadMemberProposals()]);
          renderMessageCenter({ renderLists: true });
          showAlert('Message archived.', 'success');
        } catch (error) {
          showAlert(error.message || 'Unable to archive message.');
          button.disabled = false;
        }
      });

      messageCenterInboxList?.addEventListener('click', async (event) => {
        const proposalButton = event.target.closest('[data-archive-proposal]');
        const feedbackButton = event.target.closest('[data-archive-chatbot-feedback]');
        if (!proposalButton && !feedbackButton) {
          return;
        }
        clearAlert();
        const button = proposalButton || feedbackButton;
        button.disabled = true;
        try {
          await archiveMessageCenterItem({
            proposalId: proposalButton?.dataset.archiveProposal || null,
            feedbackId: feedbackButton?.dataset.archiveChatbotFeedback || null,
          });
          await Promise.allSettled([loadMemberChatbotFeedback(), loadMemberProposals()]);
          renderMessageCenter({ renderLists: true });
          showAlert('Message archived.', 'success');
        } catch (error) {
          showAlert(error.message || 'Unable to archive message.');
          button.disabled = false;
        }
      });

      memberChatbotFeedbackList?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-archive-chatbot-feedback]');
        if (!button) {
          return;
        }
        clearAlert();
        button.disabled = true;
        try {
          await request('/api/member-chatbot-feedback', {
            method: 'PATCH',
            body: JSON.stringify({ id: button.dataset.archiveChatbotFeedback, action: 'archive' }),
          });
          memberChatbotFeedback = memberChatbotFeedback.filter((item) => item.id !== button.dataset.archiveChatbotFeedback);
          renderMemberChatbotFeedback();
          renderForumNotifications();
          showAlert('Chatbot feedback archived.', 'success');
        } catch (error) {
          showAlert(error.message || 'Unable to archive chatbot feedback.');
          button.disabled = false;
        }
      });


      document.getElementById('logoutButton').addEventListener('click', async () => {
        if (!window.confirm('Sign out of Gematria.Today on this device?')) {
          return;
        }
        clearAlert();
        try {
          await request('/api/member-logout', { method: 'POST', body: '{}' });
          showAlert('Signed out.', 'success');
        } catch (error) {
          showAlert(error.message || 'Unable to sign out.');
        } finally {
          session = null;
          favoriteHistoryIds = new Set();
          flushPendingHistoryNoteSaves();
          setLoggedIn(false);
          chatSessions = [];
          renderChatSessions();
          await loadMemberProposals();
          await loadMemberChatbotFeedback();
        }
      });

      document.getElementById('paymentForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();

        if (!session?.member) {
          showAlert('Create your account or sign in before starting checkout.', 'warning');
          return;
        }

        if (session.member.membershipLevel === 'premium') {
          showAlert('You are already a supporter.', 'info');
          return;
        }

        if (hasUnsettledSubscription(session.member)) {
          showAlert('The renewal payment for your membership is overdue. Use Manage subscription to update your payment method, or to cancel that subscription before starting a new one.', 'warning');
          return;
        }

        try {
          window.gematriaTracking?.track('checkout_start', {
            source: 'member_upgrade_form',
            currentMembershipLevel: session?.member?.membershipLevel || 'free',
          });
          paymentButton.disabled = true;
          setPaymentButtonLabel('Opening Stripe…');
          const payload = await request('/api/member-payment-checkout', { method: 'POST', body: '{}' });
          window.location.assign(payload.checkoutUrl);
        } catch (error) {
          window.gematriaTracking?.track('checkout_error', {
            source: 'member_upgrade_form',
            errorMessage: error?.message || 'unknown_error',
          });
          syncPaymentButton(session.member);
          showAlert(error.message || 'Unable to start Stripe checkout.');
        }
      });

      manageSubscriptionButton?.addEventListener('click', async () => {
        clearAlert();
        if (!isPremiumMembershipLevel(session?.member?.membershipLevel) && !hasUnsettledSubscription(session?.member)) {
          showAlert('Subscription management is available to supporters only.', 'warning');
          return;
        }
        if (!session?.member?.stripeCustomerId) {
          showAlert('No Stripe customer is linked to this account yet. Contact support@lunarwebstudio.com for help.', 'warning');
          return;
        }
        const originalLabel = manageSubscriptionButton.textContent;
        try {
          manageSubscriptionButton.disabled = true;
          manageSubscriptionButton.textContent = 'Opening Stripe…';
          const payload = await request('/api/member-billing-portal', { method: 'POST', body: '{}' });
          window.location.assign(payload.portalUrl);
        } catch (error) {
          manageSubscriptionButton.disabled = false;
          manageSubscriptionButton.textContent = originalLabel;
          showAlert(error.message || 'Unable to open the Stripe billing portal.');
        }
      });

      messageCenterOpenButton?.addEventListener('click', async () => {
        if (!isPremiumMembershipLevel(session?.member?.membershipLevel)) {
          showAlert('Message Center is available to supporters only.', 'warning');
          return;
        }
        isArchiveViewOpen = false;
        await Promise.allSettled([loadMemberChatbotFeedback(), loadMemberProposals()]);
        renderMessageCenter();
        setMessageCenterOpen(true);
      });

      messageCenterArchiveToggleButton?.addEventListener('click', () => {
        isArchiveViewOpen = !isArchiveViewOpen;
        renderMessageCenter({ renderLists: true });
      });

      messageCenterCloseButton?.addEventListener('click', () => {
        setMessageCenterOpen(false);
      });

      messageInboxOpenButton?.addEventListener('click', async () => {
        if (!isPremiumMembershipLevel(session?.member?.membershipLevel)) {
          showAlert('Message Center is available to supporters only.', 'warning');
          return;
        }
        isArchiveViewOpen = false;
        await Promise.allSettled([loadMemberChatbotFeedback(), loadMemberProposals()]);
        renderMessageCenter();
        setMessageCenterOpen(true);
        messageCenterSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      membershipUpgradeContent.addEventListener('show.bs.collapse', () => {
        membershipUpgradeToggleArrow.textContent = '▲';
        membershipUpgradeToggleButton.setAttribute('aria-expanded', 'true');
        setMembershipUpgradeDismissed(session?.member, false);
      });

      membershipUpgradeContent.addEventListener('hide.bs.collapse', () => {
        membershipUpgradeToggleArrow.textContent = '▼';
        membershipUpgradeToggleButton.setAttribute('aria-expanded', 'false');
        setMembershipUpgradeDismissed(session?.member, true);
      });

      premiumBlogProposalContent?.addEventListener('show.bs.collapse', () => {
        premiumBlogProposalToggleLabel.textContent = 'Collapse';
        premiumBlogProposalToggleArrow.textContent = '▲';
        premiumBlogProposalToggleButton?.setAttribute('aria-expanded', 'true');
      });

      premiumBlogProposalContent?.addEventListener('hide.bs.collapse', () => {
        premiumBlogProposalToggleLabel.textContent = 'Expand';
        premiumBlogProposalToggleArrow.textContent = '▼';
        premiumBlogProposalToggleButton?.setAttribute('aria-expanded', 'false');
      });

      forumNotificationContent?.addEventListener('show.bs.collapse', () => {
        forumNotificationToggleLabel.textContent = 'Collapse';
        forumNotificationToggleArrow.textContent = '▲';
        forumNotificationToggleButton?.setAttribute('aria-expanded', 'true');
      });

      forumNotificationContent?.addEventListener('hide.bs.collapse', () => {
        forumNotificationToggleLabel.textContent = 'Expand';
        forumNotificationToggleArrow.textContent = '▼';
        forumNotificationToggleButton?.setAttribute('aria-expanded', 'false');
      });

      forumNotificationQuickViewButton?.addEventListener('click', () => {
        openForumNotificationsFromTopCard();
      });

      historySectionContent?.addEventListener('show.bs.collapse', () => {
        historySectionToggleLabel.textContent = 'Collapse';
        historySectionToggleArrow.textContent = '▲';
        historySectionToggleButton?.setAttribute('aria-expanded', 'true');
      });

      historySectionContent?.addEventListener('hide.bs.collapse', () => {
        historySectionToggleLabel.textContent = 'Expand';
        historySectionToggleArrow.textContent = '▼';
        historySectionToggleButton?.setAttribute('aria-expanded', 'false');
      });

      chatSessionSectionContent?.addEventListener('show.bs.collapse', () => {
        chatSessionSectionToggleLabel.textContent = 'Collapse';
        chatSessionSectionToggleArrow.textContent = '▲';
        chatSessionSectionToggleButton?.setAttribute('aria-expanded', 'true');
      });

      chatSessionSectionContent?.addEventListener('hide.bs.collapse', () => {
        chatSessionSectionToggleLabel.textContent = 'Expand';
        chatSessionSectionToggleArrow.textContent = '▼';
        chatSessionSectionToggleButton?.setAttribute('aria-expanded', 'false');
      });

      profileSectionContent?.addEventListener('show.bs.collapse', () => {
        profileSectionToggleLabel.textContent = 'Collapse';
        profileSectionToggleArrow.textContent = '▲';
        profileSectionToggleButton?.setAttribute('aria-expanded', 'true');
      });

      profileSectionContent?.addEventListener('hide.bs.collapse', () => {
        profileSectionToggleLabel.textContent = 'Expand';
        profileSectionToggleArrow.textContent = '▼';
        profileSectionToggleButton?.setAttribute('aria-expanded', 'false');
      });

      goToLearningPathStep1Button?.addEventListener('click', () => {
        window.gematriaTracking?.track('cta_ladder_click', {
          step: 'learning_path_step_1',
          location: 'member_dashboard',
          destination: '/gematria-basics.html',
          authenticated: Boolean(session?.member),
        });
        window.localStorage.removeItem('learningPathStep1Intent');
        clearServerLearningPathStep1Intent();
      });

      learningPathCompletedDismiss?.addEventListener('click', () => {
        const completedAt = session?.profile?.preferences?.learningPathCompletedAt;
        if (completedAt) {
          try { window.localStorage.setItem(LEARNING_PATH_COMPLETED_DISMISS_KEY, String(completedAt)); } catch {}
        }
        learningPathCompletedSection?.classList.add('d-none');
        window.gematriaTracking?.track?.('learning_path_completion_dismiss', {
          location: 'member_dashboard',
        });
      });

      window.addEventListener('DOMContentLoaded', bootstrapSession);

      setInterval(() => {
        if (!session?.member || document.visibilityState === 'hidden') return;
        loadMemberChatbotFeedback();
        loadMemberProposals();
      }, 60000);
