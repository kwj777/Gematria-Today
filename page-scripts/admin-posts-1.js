      const postList = document.getElementById('postList');
      const postCount = document.getElementById('postCount');
      const sessionMeta = document.getElementById('sessionMeta');
      const saveMessage = document.getElementById('saveMessage');
      const errorMessage = document.getElementById('errorMessage');
      const createPostForm = document.getElementById('createPostForm');
      const importMdFileButton = document.getElementById('importMdFileButton');
      const importMdFileInput = document.getElementById('importMdFileInput');
      const generateHeroImageButton = document.getElementById('generateHeroImageButton');
      const removeHeroImageButton = document.getElementById('removeHeroImageButton');
      const previewCreatePostButton = document.getElementById('previewCreatePostButton');
      const createPostPreviewSection = document.getElementById('createPostPreviewSection');
      const filterStatus = document.getElementById('filterStatus');
      const filterTitle = document.getElementById('filterTitle');
      const filterDateField = document.getElementById('filterDateField');
      const filterDateFrom = document.getElementById('filterDateFrom');
      const filterDateTo = document.getElementById('filterDateTo');
      const clearPostFiltersButton = document.getElementById('clearPostFiltersButton');
      const state = {
        posts: [],
        editingPostId: null,
        filters: { status: 'all', dateField: 'publishedAt', dateFrom: '', dateTo: '', title: '' }
      };

      const escapeHtml = (value = '') => String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

      const escapeXml = (value = '') => String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');

      function applyInlineMarkdown(value = '') {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`(.+?)`/g, '<code>$1</code>');
      }

      function normalizeImportedMarkdown(markdown = '') {
        return String(markdown || '')
          .replaceAll('\r', '')
          .replace(/\uE200cite\uE202turn(\d+)(?:search|fetch)\d+\uE201/g, '[$1]')
          .replace(/citeturn(\d+)(?:search|fetch)\d+/g, '[$1]')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      function stripMarkdownDecorators(value = '') {
        const cleaned = String(value || '')
          .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/`(.+?)`/g, '$1')
          .trim();
        return cleaned.replace(/^["'](.+)["']$/, '$1').trim();
      }

      function markdownToHtml(markdown = '') {
        const lines = String(markdown || '').replaceAll('\r', '').split('\n');
        const htmlBlocks = [];
        let paragraphLines = [];
        let listItems = [];

        function flushParagraph() {
          if (!paragraphLines.length) return;
          const paragraphText = paragraphLines.join(' ').trim();
          if (paragraphText) {
            htmlBlocks.push(`<p>${applyInlineMarkdown(paragraphText)}</p>`);
          }
          paragraphLines = [];
        }

        function flushList() {
          if (!listItems.length) return;
          htmlBlocks.push(`<ul>${listItems.map((item) => `<li>${applyInlineMarkdown(item)}</li>`).join('')}</ul>`);
          listItems = [];
        }

        lines.forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed) {
            flushParagraph();
            flushList();
            return;
          }
          if (trimmed.startsWith('### ')) {
            flushParagraph();
            flushList();
            htmlBlocks.push(`<h3>${applyInlineMarkdown(trimmed.slice(4).trim())}</h3>`);
            return;
          }
          if (trimmed.startsWith('## ')) {
            flushParagraph();
            flushList();
            htmlBlocks.push(`<h2>${applyInlineMarkdown(trimmed.slice(3).trim())}</h2>`);
            return;
          }
          if (trimmed.startsWith('# ')) {
            flushParagraph();
            flushList();
            htmlBlocks.push(`<h1>${applyInlineMarkdown(trimmed.slice(2).trim())}</h1>`);
            return;
          }
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            flushParagraph();
            listItems.push(trimmed.slice(2).trim());
            return;
          }
          flushList();
          paragraphLines.push(trimmed);
        });

        flushParagraph();
        flushList();
        return htmlBlocks.join('\n');
      }

      function extractMarkdownDocument(markdown = '') {
        const normalized = normalizeImportedMarkdown(markdown);
        const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        const frontmatter = {};
        let bodyMarkdown = normalized;

        if (frontmatterMatch) {
          const frontmatterLines = frontmatterMatch[1].split('\n');
          bodyMarkdown = frontmatterMatch[2] || '';
          let activeListKey = '';
          frontmatterLines.forEach((line) => {
            const listItemMatch = line.match(/^\s*-\s+(.+)$/);
            if (listItemMatch && activeListKey) {
              const listValue = stripMarkdownDecorators(listItemMatch[1]);
              if (!listValue) return;
              if (!Array.isArray(frontmatter[activeListKey])) {
                frontmatter[activeListKey] = [];
              }
              frontmatter[activeListKey].push(listValue);
              return;
            }
            const separatorIndex = line.indexOf(':');
            if (separatorIndex === -1) return;
            const key = line.slice(0, separatorIndex).trim().toLowerCase();
            const value = line.slice(separatorIndex + 1).trim();
            if (!key) return;
            activeListKey = key;
            if (!value) {
              if (key === 'tags' || key === 'tag') {
                frontmatter[key] = [];
              }
              return;
            }
            frontmatter[key] = value;
          });
        }

        const titleFromHeading = bodyMarkdown.match(/^\s*#\s+(.+)$/m)?.[1]?.trim() || '';
        const title = stripMarkdownDecorators(frontmatter.title || titleFromHeading);
        const summaryLine = frontmatter.summary || bodyMarkdown.split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('#')) || '';
        const summary = stripMarkdownDecorators(summaryLine);
        const rawTagValue = Array.isArray(frontmatter.tags)
          ? frontmatter.tags.join(', ')
          : (frontmatter.tags || frontmatter.tag || '');
        const tag = stripMarkdownDecorators(rawTagValue);
        const readTime = frontmatter.readtime || frontmatter['read-time'] || '';

        return { title, summary, tag, readTime, bodyMarkdown };
      }

      function createHeroImageMarkup() {
        const rawTitle = document.getElementById('createPostTitle').value.trim() || 'Untitled Post';
        const rawSummary = document.getElementById('createPostSummary').value.trim() || 'Draft summary preview';
        const title = rawTitle.slice(0, 90);
        const summary = rawSummary.slice(0, 140);
        const titleLineOne = title.slice(0, 45);
        const titleLineTwo = title.slice(45);
        const summaryLineOne = summary.slice(0, 70);
        const summaryLineTwo = summary.slice(70);
        const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="Generated blog post hero image">
  <defs>
    <linearGradient id="heroBackground" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b1f3a" />
      <stop offset="100%" stop-color="#355f8c" />
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#heroBackground)" />
  <text x="120" y="300" fill="#ffffff" font-family="Arial, sans-serif" font-size="68" font-weight="700">${escapeXml(titleLineOne)}</text>
  <text x="120" y="390" fill="#ffffff" font-family="Arial, sans-serif" font-size="68" font-weight="700">${escapeXml(titleLineTwo)}</text>
  <text x="120" y="520" fill="#d6e7ff" font-family="Arial, sans-serif" font-size="38">${escapeXml(summaryLineOne)}</text>
  <text x="120" y="575" fill="#d6e7ff" font-family="Arial, sans-serif" font-size="38">${escapeXml(summaryLineTwo)}</text>
  <text x="120" y="790" fill="#ffffff" font-family="Arial, sans-serif" font-size="32" opacity="0.9">Gematria.Today • Blog</text>
</svg>`.trim();
        const encodedSvg = encodeURIComponent(svg);
        const dataUrl = `data:image/svg+xml;charset=UTF-8,${encodedSvg}`;
        return `<!-- auto-generated-hero -->\n<p><img src="${dataUrl}" alt="${escapeHtml(rawTitle)} hero image" style="width:100%;height:auto;border-radius:12px;" /></p>\n<!-- /auto-generated-hero -->`;
      }

      function injectGeneratedHeroImage() {
        const heroMarkup = createHeroImageMarkup();
        const existingBody = getEditorHtml('createPostBody').trim();
        const heroBlockPattern = /<!-- auto-generated-hero -->[\s\S]*?<!-- \/auto-generated-hero -->\s*/;
        const bodyWithoutOldHero = existingBody.replace(heroBlockPattern, '').trim();
        setEditorHtml('createPostBody', bodyWithoutOldHero ? `${heroMarkup}\n\n${bodyWithoutOldHero}` : heroMarkup);
      }

      function removeGeneratedHeroImage() {
        const existingBody = getEditorHtml('createPostBody');
        const heroBlockPattern = /<!-- auto-generated-hero -->[\s\S]*?<!-- \/auto-generated-hero -->\s*/;
        const bodyWithoutHero = existingBody.replace(heroBlockPattern, '').trim();
        if (bodyWithoutHero === existingBody.trim()) {
          return false;
        }
        setEditorHtml('createPostBody', bodyWithoutHero);
        return true;
      }

      function formatCreatedOnLabel(value) {
        if (!value) return 'Created on: —';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'Created on: —';
        return `Created on: ${parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`;
      }

      function formatPostStatusLabel(status) {
        const normalizedStatus = String(status || '').toLowerCase();
        if (normalizedStatus === 'scheduled') return 'Scheduled';
        if (normalizedStatus === 'draft') return 'Draft';
        if (normalizedStatus === 'archived') return 'Archived';
        return 'Published';
      }

      function formatScheduledLabel(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return '';
        return `Scheduled publish: ${parsed.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
      }

      function localDateTimeInputToIso(value) {
        const raw = String(value || '').trim();
        if (!raw) return null;
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toISOString();
      }

      function isoToLocalDateTimeInput(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return '';
        const offsetMs = parsed.getTimezoneOffset() * 60000;
        const localDate = new Date(parsed.getTime() - offsetMs);
        return localDate.toISOString().slice(0, 16);
      }

      function isFutureScheduledDate(value) {
        const isoValue = localDateTimeInputToIso(value);
        if (!isoValue) return false;
        return new Date(isoValue).getTime() > Date.now();
      }

      function getCreatePostRequestStatus() {
        const selectedStatus = document.getElementById('createPostStatus').value;
        return selectedStatus === 'scheduled' ? 'draft' : selectedStatus;
      }

      function syncCreatePostStatusToSchedule() {
        const scheduleInput = document.getElementById('createPostScheduledPublishAt');
        const statusSelect = document.getElementById('createPostStatus');
        if (!scheduleInput || !statusSelect) return;
        if (isFutureScheduledDate(scheduleInput.value)) {
          statusSelect.value = 'scheduled';
        }
      }

      function showMessage(target, message) {
        target.textContent = message;
        target.classList.remove('d-none');
      }

      function getEditorHtml(targetId) {
        const field = document.getElementById(targetId);
        if (!field) return '';
        return field.innerHTML || '';
      }

      function setEditorHtml(targetId, value) {
        const field = document.getElementById(targetId);
        if (!field) return;
        field.innerHTML = String(value || '');
      }

      function focusEditor(targetId) {
        const field = document.getElementById(targetId);
        if (!field) return null;
        field.focus();
        return field;
      }

      function insertEditorHtml(targetId, html) {
        const field = focusEditor(targetId);
        if (!field) return;
        document.execCommand('insertHTML', false, html);
      }

      function applyEditorAction(action, targetId) {
        const targetField = focusEditor(targetId);
        if (!targetField) return;
        switch (action) {
          case 'bold':
            document.execCommand('bold', false);
            return;
          case 'italic':
            document.execCommand('italic', false);
            return;
          case 'heading':
            document.execCommand('formatBlock', false, 'h2');
            return;
          case 'unordered-list':
            document.execCommand('insertUnorderedList', false);
            return;
          case 'ordered-list':
            document.execCommand('insertOrderedList', false);
            return;
          case 'quote':
            document.execCommand('formatBlock', false, 'blockquote');
            return;
          case 'code':
            insertEditorHtml(targetId, '<code>code</code>');
            return;
          case 'link': {
            const urlInput = window.prompt('Enter link URL (include https://):', 'https://');
            if (!urlInput) return;
            const safeUrl = urlInput.trim();
            if (!/^https?:\/\//i.test(safeUrl)) {
              showMessage(errorMessage, 'Please enter a valid link starting with http:// or https://');
              return;
            }
            clearMessage(errorMessage);
            const selectedText = window.getSelection?.()?.toString().trim() || 'Link text';
            document.execCommand('createLink', false, safeUrl);
            const selection = window.getSelection?.();
            const anchor = selection?.anchorNode?.parentElement?.closest?.('a');
            if (anchor) {
              anchor.textContent = anchor.textContent || selectedText;
              anchor.setAttribute('target', '_blank');
              anchor.setAttribute('rel', 'noopener noreferrer');
            }
            return;
          }
          default:
            return;
        }
      }


      function estimateReadTimeLabelFromContent(content) {
        const plainText = String(content || '')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&[a-z0-9#]+;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const wordCount = plainText ? plainText.split(' ').filter(Boolean).length : 0;
        const estimatedMinutes = Math.max(1, Math.ceil(wordCount / 200));
        return `${estimatedMinutes} minute read`;
      }

      function renderCreatePostPreview() {
        const title = document.getElementById('createPostTitle').value.trim() || 'Untitled draft';
        const tag = document.getElementById('createPostTag').value.trim();
        const readTime = document.getElementById('createPostReadTime').value.trim();
        const summary = document.getElementById('createPostSummary').value.trim() || 'No summary added yet.';
        const body = getEditorHtml('createPostBody').trim() || '<p>No body content added yet.</p>';
        const status = document.getElementById('createPostStatus').value;
        const scheduledPublishAt = document.getElementById('createPostScheduledPublishAt').value || null;
        const previewStatus = document.getElementById('previewCreatePostStatus');
        const previewCreatedOn = document.getElementById('previewCreatePostCreatedOn');
        const previewTitle = document.getElementById('previewCreatePostTitle');
        const previewMeta = document.getElementById('previewCreatePostMeta');
        const previewSummary = document.getElementById('previewCreatePostSummary');
        const previewBody = document.getElementById('previewCreatePostBody');
        const metadata = [tag ? `Tags: ${tag}` : '', readTime ? `Read time: ${readTime}` : ''].filter(Boolean).join(' • ');

        previewStatus.className = `badge ${status === 'archived' ? 'text-bg-warning' : status === 'draft' || status === 'scheduled' ? 'text-bg-secondary' : 'text-bg-success'}`;
        previewStatus.textContent = formatPostStatusLabel(status);
        previewCreatedOn.textContent = scheduledPublishAt ? formatScheduledLabel(scheduledPublishAt) : 'Created on: now';
        previewTitle.textContent = title;
        previewMeta.textContent = metadata || 'No tags or read time yet.';
        previewSummary.textContent = summary;
        previewBody.innerHTML = body;
        createPostPreviewSection.classList.remove('d-none');
      }

      function clearMessage(target) {
        target.textContent = '';
        target.classList.add('d-none');
      }

      async function request(url, options = {}) {
        const response = await fetch(url, {
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', ...(options.headers || {}) },
          ...options
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Request failed');
        }
        return payload;
      }


      function normalizePostBodyHtml(value = '') {
        const raw = String(value || '').trim();
        if (!raw) {
          return '<p></p>';
        }
        const containsHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
        if (containsHtml) {
          return raw;
        }
        return markdownToHtml(raw);
      }

      function getComputedPostStatus(post) {
        const normalized = String(post?.status || '').toLowerCase();
        if (normalized === 'scheduled') return 'scheduled';
        if (normalized === 'archived') return 'archived';
        if (normalized === 'draft' && String(post?.scheduledPublishAt || '').trim()) return 'scheduled';
        return normalized || 'published';
      }

      function slugifyForPreview(value = '') {
        return String(value || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }

      function getPostPreviewUrl(post) {
        const postId = String(post?.id || '').trim();
        const slug = String(post?.slug || '').trim() || slugifyForPreview(post?.title || '');
        if (!slug) {
          return postId
            ? `/blog.html?preview=true&postId=${encodeURIComponent(postId)}`
            : '/blog.html?preview=true';
        }
        const searchParams = new URLSearchParams({ preview: 'true', post: slug });
        if (postId) {
          searchParams.set('postId', postId);
        }
        return `/blog.html?${searchParams.toString()}#${encodeURIComponent(slug)}`;
      }

      function getPostHeroImageUrl(post) {
        return String(post?.imageUrl || post?.heroImageUrl || post?.backgroundImageUrl || post?.sliderImageUrl || '').trim();
      }

      function getDateFilterTimestamp(value, isEndOfDay = false) {
        if (!value) return null;
        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) return null;
        if (!isEndOfDay) return date.getTime();
        date.setHours(23, 59, 59, 999);
        return date.getTime();
      }

      function getPostDateValue(post, dateField) {
        const source = post?.[dateField];
        if (!source) return null;
        const parsed = new Date(source);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.getTime();
      }

      function getFilteredPosts() {
        const startTime = getDateFilterTimestamp(state.filters.dateFrom, false);
        const endTime = getDateFilterTimestamp(state.filters.dateTo, true);
        const titleTerm = String(state.filters.title || '').trim().toLowerCase();
        return state.posts.filter((post) => {
          const status = getComputedPostStatus(post);
          if (state.filters.status !== 'all' && status !== state.filters.status) {
            return false;
          }
          // With no title search the only way to find a post among hundreds was
          // to scroll the whole list.
          if (titleTerm && !String(post.title || '').toLowerCase().includes(titleTerm)) {
            return false;
          }
          if (!startTime && !endTime) {
            return true;
          }
          const postDate = getPostDateValue(post, state.filters.dateField);
          if (!postDate) return false;
          if (startTime && postDate < startTime) return false;
          if (endTime && postDate > endTime) return false;
          return true;
        });
      }

      // Every post rendered its full body HTML, an eight-button toolbar and a
      // complete edit form, unpaginated. At a few hundred posts that is an
      // enormous DOM and an endless scroll.
      const POSTS_PAGE_SIZE = 20;
      let postsShown = POSTS_PAGE_SIZE;

      function renderPosts() {
        const allFiltered = getFilteredPosts();
        postCount.textContent = `${allFiltered.length}/${state.posts.length}`;
        // Keep an open editor on screen even if it sits past the cut-off.
        const editingIndex = state.editingPostId
          ? allFiltered.findIndex((post) => post.id === state.editingPostId)
          : -1;
        const visibleCount = Math.max(postsShown, editingIndex + 1);
        const filteredPosts = allFiltered.slice(0, visibleCount);
        postList.innerHTML = filteredPosts.length ? filteredPosts.map((post) => {
          const isEditing = state.editingPostId === post.id;
          const computedStatus = getComputedPostStatus(post);
          const statusBadgeClass = computedStatus === 'published'
            ? 'text-bg-success'
            : computedStatus === 'archived'
              ? 'text-bg-warning'
              : 'text-bg-secondary';
          return `
            <details class="admin-post-details admin-item-card p-3" ${isEditing ? 'open' : ''}>
              <summary class="admin-post-summary">
                <span class="fw-semibold admin-post-summary-title">${escapeHtml(post.title)}</span>
                <span class="admin-post-summary-trailing">
                  <span class="badge ${statusBadgeClass} admin-post-summary-status">${escapeHtml(formatPostStatusLabel(computedStatus))}</span>
                  <span class="small text-muted admin-post-summary-meta">${escapeHtml(post.scheduledPublishAt ? formatScheduledLabel(post.scheduledPublishAt) : formatCreatedOnLabel(post.createdAt || post.publishedAt))}</span>
                </span>
              </summary>
              <div class="pt-3">
                <p class="mb-2"><span class="badge ${statusBadgeClass}">${escapeHtml(formatPostStatusLabel(computedStatus))}</span></p>
                ${post.scheduledPublishAt ? `<p class="small text-muted mb-2">${escapeHtml(formatScheduledLabel(post.scheduledPublishAt))}</p>` : ''}
                <p class="small text-muted mb-2">${escapeHtml(post.summary || '')}</p>
                <article class="small mb-3">${normalizePostBodyHtml(post.body || '')}</article>
                <div class="d-flex flex-wrap gap-3 mb-3">
                  <a class="btn btn-sm btn-outline-secondary" href="${getPostPreviewUrl(post)}" target="_blank" rel="noopener noreferrer">Preview on Blog</a>
                  <button class="btn btn-sm btn-outline-primary" type="button" data-edit-post="${post.id}">Edit</button>
                  <button class="btn btn-sm btn-danger text-white" type="button" data-delete-post="${post.id}">Delete</button>
                </div>
                <form class="row g-2 ${isEditing ? '' : 'd-none'}" data-edit-form="${post.id}">
                  <div class="col-12"><label class="form-label" for="editTitle-${post.id}">Title</label><input id="editTitle-${post.id}" class="form-control" value="${escapeHtml(post.title || '')}" required /></div>
                  <div class="col-12"><label class="form-label" for="editSlug-${post.id}">Slug</label><input id="editSlug-${post.id}" class="form-control" value="${escapeHtml(post.slug || '')}" placeholder="auto-generated from title if left blank" /></div>
                  <div class="col-12"><label class="form-label" for="editTag-${post.id}">Tags</label><input id="editTag-${post.id}" class="form-control" value="${escapeHtml(post.tag || '')}" /></div>
                  <div class="col-12"><label class="form-label" for="editReadTime-${post.id}">Read time</label><input id="editReadTime-${post.id}" class="form-control" value="${escapeHtml(post.readTime || '')}" /></div>
                  <div class="col-md-6"><label class="form-label" for="editStatus-${post.id}">Publish status</label><select id="editStatus-${post.id}" class="form-select"><option value="published" ${String(post.status || '').toLowerCase() === 'published' ? 'selected' : ''}>Publish now</option><option value="draft" ${String(post.status || '').toLowerCase() === 'draft' ? 'selected' : ''}>Save as draft</option><option value="archived" ${String(post.status || '').toLowerCase() === 'archived' ? 'selected' : ''}>Archive (hide from blog)</option></select></div>
                  <div class="col-md-6"><label class="form-label" for="editScheduledPublishAt-${post.id}">Schedule publish date/time (optional)</label><input id="editScheduledPublishAt-${post.id}" class="form-control" type="datetime-local" value="${escapeHtml(isoToLocalDateTimeInput(post.scheduledPublishAt || ''))}" /></div>
                  <div class="col-12"><label class="form-label" for="editSummary-${post.id}">Summary</label><textarea id="editSummary-${post.id}" class="form-control" rows="2" required>${escapeHtml(post.summary || '')}</textarea></div>
                  <div class="col-12">
                    <label class="form-label" id="editBodyLabel-${post.id}" for="editBody-${post.id}">Body</label>
                    <div class="d-flex flex-wrap gap-2 mb-2 admin-editor-toolbar" role="toolbar" aria-label="Edit post editor toolbar">
                      <button class="btn btn-sm btn-outline-secondary" type="button" data-editor-action="bold" data-editor-target="editBody-${post.id}"><strong>B</strong></button>
                      <button class="btn btn-sm btn-outline-secondary" type="button" data-editor-action="italic" data-editor-target="editBody-${post.id}"><em>I</em></button>
                      <button class="btn btn-sm btn-outline-secondary" type="button" data-editor-action="heading" data-editor-target="editBody-${post.id}">H2</button>
                      <button class="btn btn-sm btn-outline-secondary" type="button" data-editor-action="link" data-editor-target="editBody-${post.id}">Link</button>
                      <button class="btn btn-sm btn-outline-secondary" type="button" data-editor-action="unordered-list" data-editor-target="editBody-${post.id}">Bullets</button>
                      <button class="btn btn-sm btn-outline-secondary" type="button" data-editor-action="ordered-list" data-editor-target="editBody-${post.id}">Numbered</button>
                      <button class="btn btn-sm btn-outline-secondary" type="button" data-editor-action="quote" data-editor-target="editBody-${post.id}">Quote</button>
                      <button class="btn btn-sm btn-outline-secondary" type="button" data-editor-action="code" data-editor-target="editBody-${post.id}">Code</button>
                    </div>
                    <div id="editBody-${post.id}" class="form-control admin-wysiwyg-editor" role="textbox" aria-multiline="true" aria-labelledby="editBodyLabel-${post.id}" contenteditable="true">${normalizePostBodyHtml(post.body || '')}</div>
                  </div>
                  <div class="col-12"><label class="form-label" for="editImageUrl-${post.id}">Hero image URL</label><input id="editImageUrl-${post.id}" class="form-control" value="${escapeHtml(getPostHeroImageUrl(post))}" /></div>
                  <div class="col-12"><label class="form-label" for="editSliderImageUrl-${post.id}">Homepage slider image URL</label><input id="editSliderImageUrl-${post.id}" class="form-control" value="${escapeHtml(post.sliderImageUrl || '')}" /></div>
                  <div class="col-12"><label class="form-label" for="editBackgroundImageUrl-${post.id}">Background image URL</label><input id="editBackgroundImageUrl-${post.id}" class="form-control" value="${escapeHtml(post.backgroundImageUrl || '')}" /></div>
                  <div class="col-12">
                    <div class="form-check">
                      <input id="editHomepage-${post.id}" class="form-check-input" type="checkbox" ${post.showOnHomepage ? 'checked' : ''} />
                      <label class="form-check-label" for="editHomepage-${post.id}">Show this post in the home page slider</label>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="form-check">
                      <input id="editHideFromBlog-${post.id}" class="form-check-input" type="checkbox" ${post.hideFromBlog ? 'checked' : ''} />
                      <label class="form-check-label" for="editHideFromBlog-${post.id}">Hide this post from the main Blog page</label>
                    </div>
                  </div>
                  <div class="col-12 d-flex gap-2">
                    <button class="btn btn-sm btn-primary" type="submit">Save changes</button>
                    <button class="btn btn-sm btn-outline-secondary" type="button" data-cancel-edit="${post.id}">Cancel</button>
                  </div>
                </form>
              </div>
            </details>`;
        }).join('') : '<p class="text-muted small mb-0">No blog posts match the selected filters.</p>';

        if (allFiltered.length > filteredPosts.length) {
          const remaining = allFiltered.length - filteredPosts.length;
          const more = document.createElement('button');
          more.type = 'button';
          more.className = 'btn btn-outline-secondary w-100 mt-3';
          more.textContent = `Show ${Math.min(POSTS_PAGE_SIZE, remaining)} more (${remaining} remaining)`;
          more.addEventListener('click', () => {
            postsShown += POSTS_PAGE_SIZE;
            renderPosts();
          });
          postList.appendChild(more);
        }
      }

      async function loadSession() {
        try {
          const session = await request('/api/admin-session');
          sessionMeta.textContent = `Signed in as ${session.user?.username || 'admin'}.`;
        } catch (error) {
          // Preserves the page you were on so signing in returns you here.
          window.location.href = window.adminSession?.signInUrl?.() || '/admin.html';
        }
      }

      async function loadPosts() {
        const payload = await request('/api/admin-posts');
        state.posts = payload.items || payload.posts || [];
        renderPosts();
      }

      async function loadProposalFromQueryParam() {
        const proposalId = new URLSearchParams(window.location.search).get('loadProposal');
        if (!proposalId) {
          return;
        }
        const payload = await request('/api/admin-blog-proposals');
        const proposal = (payload.items || []).find((item) => String(item.id) === String(proposalId));
        if (!proposal) {
          showMessage(errorMessage, 'The selected proposal could not be found. It may have been removed.');
          return;
        }
        document.getElementById('createPostTitle').value = proposal.title || '';
        document.getElementById('createPostTag').value = proposal.suggestedTags || '';
        document.getElementById('createPostSummary').value = proposal.summary || '';
        setEditorHtml('createPostBody', proposal.body || '');
        const details = document.getElementById('createPostDetails');
        details?.setAttribute('open', 'open');
        renderCreatePostPreview();
        const proposalLoadMessage = document.getElementById('proposalLoadMessage');
        if (proposalLoadMessage) {
          showMessage(proposalLoadMessage, `Loaded proposal into the publishing workspace: ${proposal.title || 'Untitled proposal'}.`);
        }
      }

      function loadPostForEditingFromQueryParam() {
        const editPostQuery = new URLSearchParams(window.location.search).get('editPost');
        if (!editPostQuery) {
          return;
        }
        const normalizedQuery = String(editPostQuery).trim().toLowerCase();
        const matchedPost = state.posts.find((post) => String(post.id || '').toLowerCase() === normalizedQuery
          || String(post.slug || '').trim().toLowerCase() === normalizedQuery);
        if (!matchedPost) {
          showMessage(errorMessage, 'The selected blog post could not be found for editing.');
          return;
        }
        state.editingPostId = matchedPost.id;
        renderPosts();
        window.requestAnimationFrame(() => {
          document.getElementById(`editTitle-${matchedPost.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }


      document.addEventListener('click', async (event) => {
        const toolbarButton = event.target.closest('[data-editor-action][data-editor-target]');
        if (toolbarButton) {
          const { editorAction, editorTarget } = toolbarButton.dataset;
          applyEditorAction(editorAction, editorTarget);
          return;
        }
        const { editPost, deletePost, cancelEdit } = event.target.dataset;
        if (!editPost && !deletePost && !cancelEdit) {
          return;
        }
        clearMessage(errorMessage);
        try {
          if (editPost) {
            state.editingPostId = editPost;
            renderPosts();
            return;
          }
          if (cancelEdit) {
            state.editingPostId = null;
            renderPosts();
            return;
          }
          if (deletePost) {
            const postToDelete = state.posts.find((post) => String(post.id) === String(deletePost));
            const postTitle = postToDelete?.title ? ` "${postToDelete.title}"` : '';
            const confirmed = window.confirm(`Delete blog post${postTitle}? This action cannot be undone.`);
            if (!confirmed) {
              return;
            }
            await request(`/api/admin-posts?id=${encodeURIComponent(deletePost)}`, { method: 'DELETE' });
            showMessage(saveMessage, 'Blog post removed.');
            state.editingPostId = null;
            await loadPosts();
          }
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      function syncFiltersFromInputs() {
        // Any filter change starts the list over from the first page.
        postsShown = POSTS_PAGE_SIZE;
        state.filters.title = filterTitle ? filterTitle.value : '';
        state.filters.status = filterStatus.value;
        state.filters.dateField = filterDateField.value;
        state.filters.dateFrom = filterDateFrom.value;
        state.filters.dateTo = filterDateTo.value;
        renderPosts();
      }

      [filterStatus, filterDateField, filterDateFrom, filterDateTo].forEach((control) => {
        control.addEventListener('change', syncFiltersFromInputs);
      });

      let titleFilterDebounce = null;
      filterTitle?.addEventListener('input', () => {
        if (titleFilterDebounce) window.clearTimeout(titleFilterDebounce);
        titleFilterDebounce = window.setTimeout(syncFiltersFromInputs, 200);
      });

      clearPostFiltersButton.addEventListener('click', () => {
        if (filterTitle) filterTitle.value = '';
        filterStatus.value = 'all';
        filterDateField.value = 'publishedAt';
        filterDateFrom.value = '';
        filterDateTo.value = '';
        syncFiltersFromInputs();
      });

      previewCreatePostButton.addEventListener('click', () => {
        renderCreatePostPreview();
      });

      // A long draft could be destroyed by the un-confirmed Reset button, by
      // navigating away, or by the session-expiry redirect, with no warning.
      function createPostFormIsDirty() {
        const title = document.getElementById('createPostTitle')?.value.trim();
        const summary = document.getElementById('createPostSummary')?.value.trim();
        const body = document.getElementById('createPostBody')?.textContent.trim();
        return Boolean(title || summary || body);
      }

      createPostForm.addEventListener('reset', (event) => {
        if (!createPostFormIsDirty()) return;
        if (!window.confirm('Clear this draft?\n\nThe title, summary and body you have typed will be lost.')) {
          event.preventDefault();
        }
      });

      window.addEventListener('beforeunload', (event) => {
        if (!createPostFormIsDirty()) return;
        event.preventDefault();
        event.returnValue = '';
      });

      document.getElementById('createPostScheduledPublishAt').addEventListener('change', () => {
        syncCreatePostStatusToSchedule();
        renderCreatePostPreview();
      });

      importMdFileButton.addEventListener('click', () => {
        importMdFileInput.click();
      });

      importMdFileInput.addEventListener('change', async () => {
        const file = importMdFileInput.files?.[0];
        if (!file) return;
        clearMessage(errorMessage);
        clearMessage(saveMessage);
        try {
          const markdownContent = await file.text();
          const extracted = extractMarkdownDocument(markdownContent);
          document.getElementById('createPostTitle').value = extracted.title || file.name.replace(/\.md$/i, '');
          document.getElementById('createPostTag').value = extracted.tag || '';
          document.getElementById('createPostReadTime').value = extracted.readTime || '';
          document.getElementById('createPostSummary').value = extracted.summary || '';
          setEditorHtml('createPostBody', markdownToHtml(extracted.bodyMarkdown));
          renderCreatePostPreview();
          showMessage(saveMessage, `Imported ${file.name} into the post editor.`);
        } catch (error) {
          showMessage(errorMessage, error.message || 'Unable to import markdown file.');
        } finally {
          importMdFileInput.value = '';
        }
      });

      generateHeroImageButton.addEventListener('click', () => {
        injectGeneratedHeroImage();
        showMessage(saveMessage, 'Generated hero image inserted into the post body.');
        clearMessage(errorMessage);
        renderCreatePostPreview();
      });

      removeHeroImageButton.addEventListener('click', () => {
        const didRemove = removeGeneratedHeroImage();
        if (didRemove) {
          showMessage(saveMessage, 'Generated hero image removed from the post body.');
          clearMessage(errorMessage);
        } else {
          showMessage(errorMessage, 'No generated hero image was found in the post body.');
          clearMessage(saveMessage);
        }
        renderCreatePostPreview();
      });

      createPostForm.addEventListener('reset', () => {
        createPostPreviewSection.classList.add('d-none');
      });


      createPostForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage(errorMessage);
        clearMessage(saveMessage);
        try {
          const readTimeField = document.getElementById('createPostReadTime');
          const bodyValue = getEditorHtml('createPostBody');
          if (!bodyValue.replace(/<[^>]+>/g, '').trim()) {
            throw new Error('Add body content before saving the post.');
          }
          const isSaveDraftAction = event.submitter?.id === 'saveDraftButton';
          if (!String(readTimeField.value || '').trim()) {
            readTimeField.value = estimateReadTimeLabelFromContent(bodyValue);
          }
          if (isSaveDraftAction) {
            document.getElementById('createPostStatus').value = 'draft';
          }
          await request('/api/admin-posts', {
            method: 'POST',
            body: JSON.stringify({
              title: document.getElementById('createPostTitle').value,
              tag: document.getElementById('createPostTag').value,
              readTime: readTimeField.value,
              summary: document.getElementById('createPostSummary').value,
              body: bodyValue,
              imageUrl: document.getElementById('createPostImageUrl').value,
              sliderImageUrl: document.getElementById('createPostSliderImageUrl').value,
              backgroundImageUrl: document.getElementById('createPostBackgroundImageUrl').value,
              status: isSaveDraftAction ? 'draft' : getCreatePostRequestStatus(),
              scheduledPublishAt: localDateTimeInputToIso(document.getElementById('createPostScheduledPublishAt').value)
            })
          });
          createPostForm.reset();
          showMessage(saveMessage, isSaveDraftAction ? 'Draft post saved.' : 'Blog post created.');
          await loadPosts();
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      document.addEventListener('submit', async (event) => {
        const form = event.target.closest('[data-edit-form]');
        if (!form) {
          return;
        }
        event.preventDefault();
        clearMessage(errorMessage);
        const postId = form.dataset.editForm;
        const getField = (fieldName) => form.querySelector(`[id="${fieldName}-${postId}"]`);
        const getFieldValue = (fieldName) => getField(fieldName)?.value || '';
        try {
          const bodyValue = getEditorHtml(`editBody-${postId}`);
          if (!bodyValue.replace(/<[^>]+>/g, '').trim()) {
            throw new Error('Add body content before saving the post.');
          }
          const readTimeValue = String(getFieldValue('editReadTime') || '').trim() || estimateReadTimeLabelFromContent(bodyValue);
          await request('/api/admin-posts', {
            method: 'PUT',
            body: JSON.stringify({
              id: postId,
              title: getFieldValue('editTitle'),
              slug: getFieldValue('editSlug'),
              tag: getFieldValue('editTag'),
              readTime: readTimeValue,
              imageUrl: getFieldValue('editImageUrl'),
              sliderImageUrl: getFieldValue('editSliderImageUrl'),
              backgroundImageUrl: getFieldValue('editBackgroundImageUrl'),
              showOnHomepage: Boolean(getField('editHomepage')?.checked),
              hideFromBlog: Boolean(getField('editHideFromBlog')?.checked),
              summary: getFieldValue('editSummary'),
              body: bodyValue,
              status: String(getFieldValue('editStatus') || 'published').toLowerCase(),
              scheduledPublishAt: localDateTimeInputToIso(getFieldValue('editScheduledPublishAt'))
            })
          });
          form.closest('details')?.removeAttribute('open');
          state.editingPostId = null;
          renderPosts();
          showMessage(saveMessage, 'Blog post updated.');
          try {
            await loadPosts();
          } catch (refreshError) {
            console.warn('Saved post but failed to refresh list.', refreshError);
          }
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      loadSession()
        .then(loadPosts)
        .then(loadPostForEditingFromQueryParam)
        .then(loadProposalFromQueryParam)
        .catch((error) => showMessage(errorMessage, error.message));
