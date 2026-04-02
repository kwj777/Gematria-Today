import { getAuthenticatedUser, jsonResponse, parseBody } from './_admin.mjs';

const STATIC_CONTENT_SETTINGS_KEY = 'static_content_workspace';
const MAX_REVISIONS = 3;

const PAGE_DEFINITIONS = [
  { id: 'home', label: 'Home Page', path: '/index.html' },
  { id: 'about', label: 'About/Why English Gematria', path: '/why-english-gematria.html' },
  { id: 'news', label: 'News Page', path: '/news.html' },
  { id: 'blog', label: 'Blog Page', path: '/blog.html' },
  { id: 'faq', label: 'FAQ Page', path: '/faq.html' },
  { id: 'contact', label: 'Contact Page', path: '/contact.html' },
  { id: 'privacy', label: 'Privacy Policy', path: '/privacy.html' },
  { id: 'terms', label: 'Terms of Use', path: '/terms.html' },
];

const ELEMENT_DEFINITIONS = [
  { id: 'site_announcement', label: 'Site Announcement Banner', description: 'Reusable top-of-page banner content.' },
  { id: 'homepage_hero_cta', label: 'Homepage Hero CTA', description: 'Primary call-to-action message and button text for home hero.' },
  { id: 'footer_note', label: 'Global Footer Note', description: 'Shared footer legal or campaign note.' },
  { id: 'support_cta', label: 'Support CTA', description: 'Reusable support/donation message.' },
];

function defaultWorkspace() {
  const pages = Object.fromEntries(PAGE_DEFINITIONS.map((item) => [item.id, {
    seoTitle: '',
    metaDescription: '',
    heroHeadline: '',
    heroBody: '',
    heroHeadlineSecondary: '',
    heroBodySecondary: '',
    ctaLabel: '',
    ctaUrl: '',
    allStaticContent: '',
  }]));
  const elements = Object.fromEntries(ELEMENT_DEFINITIONS.map((item) => [item.id, { heading: '', body: '', buttonLabel: '', buttonUrl: '' }]));
  return { pages, elements, updatedAt: null, updatedBy: null, revisions: [] };
}

function safeJsonParse(input, fallback) {
  if (!input || typeof input !== 'string') return fallback;
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

function normalizeText(value, maxLength = 5000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizePageInput(input = {}) {
  return {
    seoTitle: normalizeText(input.seoTitle, 160),
    metaDescription: normalizeText(input.metaDescription, 300),
    heroHeadline: normalizeText(input.heroHeadline, 180),
    heroBody: normalizeText(input.heroBody, 2000),
    heroHeadlineSecondary: normalizeText(input.heroHeadlineSecondary, 180),
    heroBodySecondary: normalizeText(input.heroBodySecondary, 2000),
    ctaLabel: normalizeText(input.ctaLabel, 80),
    ctaUrl: normalizeText(input.ctaUrl, 500),
    allStaticContent: normalizeText(input.allStaticContent, 20000),
  };
}

function normalizeElementInput(input = {}) {
  return {
    heading: normalizeText(input.heading, 180),
    body: normalizeText(input.body, 2000),
    buttonLabel: normalizeText(input.buttonLabel, 80),
    buttonUrl: normalizeText(input.buttonUrl, 500),
  };
}

function mergeWorkspace(saved = {}) {
  const workspace = defaultWorkspace();
  for (const page of PAGE_DEFINITIONS) {
    workspace.pages[page.id] = normalizePageInput(saved?.pages?.[page.id] || workspace.pages[page.id]);
  }
  for (const element of ELEMENT_DEFINITIONS) {
    workspace.elements[element.id] = normalizeElementInput(saved?.elements?.[element.id] || workspace.elements[element.id]);
  }
  workspace.updatedAt = saved?.updatedAt || null;
  workspace.updatedBy = saved?.updatedBy || null;
  workspace.revisions = Array.isArray(saved?.revisions)
    ? saved.revisions
      .filter((revision) => revision && revision.snapshot)
      .slice(0, MAX_REVISIONS)
      .map((revision) => ({
        id: String(revision.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
        createdAt: revision.createdAt || null,
        createdBy: revision.createdBy || null,
        targetType: revision.targetType || null,
        targetId: revision.targetId || null,
        snapshot: mergeWorkspace(revision.snapshot),
      }))
    : [];
  return workspace;
}

function cloneWorkspaceSnapshot(workspace = {}) {
  return {
    pages: workspace.pages || {},
    elements: workspace.elements || {},
    updatedAt: workspace.updatedAt || null,
    updatedBy: workspace.updatedBy || null,
  };
}

function createRevisionEntry(workspace, user, targetType, targetId) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    createdBy: user?.username || user?.id || 'unknown',
    targetType: targetType || null,
    targetId: targetId || null,
    snapshot: cloneWorkspaceSnapshot(workspace),
  };
}

async function readWorkspace(sql) {
  const rows = await sql`
    SELECT setting_value
    FROM admin_settings
    WHERE setting_key = ${STATIC_CONTENT_SETTINGS_KEY}
    LIMIT 1
  `;
  const saved = safeJsonParse(rows?.[0]?.setting_value, {});
  return mergeWorkspace(saved);
}

export async function handler(event) {
  try {
    const { sql, user } = await getAuthenticatedUser(event);

    if (event.httpMethod === 'GET') {
      const workspace = await readWorkspace(sql);
      return jsonResponse(200, {
        pageDefinitions: PAGE_DEFINITIONS,
        elementDefinitions: ELEMENT_DEFINITIONS,
        workspace,
      });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const workspace = await readWorkspace(sql);
      const action = String(body.action || '').trim().toLowerCase();
      if (action !== 'revert') {
        return jsonResponse(400, { error: 'Unsupported action' });
      }

      const selectedRevisionId = String(body.revisionId || '').trim();
      if (!selectedRevisionId) {
        return jsonResponse(400, { error: 'revisionId is required' });
      }

      const selectedRevision = (workspace.revisions || []).find((revision) => revision.id === selectedRevisionId);
      if (!selectedRevision?.snapshot) {
        return jsonResponse(404, { error: 'Saved revision not found' });
      }

      const currentSnapshotRevision = createRevisionEntry(workspace, user, 'revert', selectedRevisionId);
      const restoredWorkspace = mergeWorkspace(selectedRevision.snapshot);
      restoredWorkspace.updatedBy = user.username || user.id;
      restoredWorkspace.updatedAt = new Date().toISOString();
      restoredWorkspace.revisions = [currentSnapshotRevision, ...(workspace.revisions || []).filter((revision) => revision.id !== selectedRevisionId)]
        .slice(0, MAX_REVISIONS);

      await sql`
        INSERT INTO admin_settings (setting_key, setting_value, updated_by, updated_at)
        VALUES (${STATIC_CONTENT_SETTINGS_KEY}, ${JSON.stringify(restoredWorkspace)}, ${user.id}, NOW())
        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      `;

      return jsonResponse(200, { saved: true, workspace: restoredWorkspace });
    }

    if (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
      const body = parseBody(event);
      const workspace = await readWorkspace(sql);
      const targetType = String(body.targetType || '').trim().toLowerCase();
      const targetId = String(body.targetId || '').trim().toLowerCase();

      if (!targetType || !targetId) {
        return jsonResponse(400, { error: 'targetType and targetId are required' });
      }

      const revisionEntry = createRevisionEntry(workspace, user, targetType, targetId);
      if (targetType === 'page') {
        const exists = PAGE_DEFINITIONS.some((item) => item.id === targetId);
        if (!exists) return jsonResponse(404, { error: 'Unknown static page target' });
        workspace.pages[targetId] = normalizePageInput(body.content);
      } else if (targetType === 'element') {
        const exists = ELEMENT_DEFINITIONS.some((item) => item.id === targetId);
        if (!exists) return jsonResponse(404, { error: 'Unknown static element target' });
        workspace.elements[targetId] = normalizeElementInput(body.content);
      } else {
        return jsonResponse(400, { error: 'targetType must be page or element' });
      }

      workspace.updatedBy = user.username || user.id;
      workspace.updatedAt = new Date().toISOString();
      workspace.revisions = [revisionEntry, ...(workspace.revisions || [])].slice(0, MAX_REVISIONS);

      await sql`
        INSERT INTO admin_settings (setting_key, setting_value, updated_by, updated_at)
        VALUES (${STATIC_CONTENT_SETTINGS_KEY}, ${JSON.stringify(workspace)}, ${user.id}, NOW())
        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      `;

      return jsonResponse(200, { saved: true, workspace });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('admin-static-content error', error);
    return jsonResponse(500, { error: 'Unable to process static content workspace request' });
  }
}
