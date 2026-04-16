import test from 'node:test';
import assert from 'node:assert/strict';
import { handler as siteAdaptationGuideHandler } from '../netlify/functions/site-adaptation-guide.mjs';

test('site-adaptation-guide rejects non-GET methods', async () => {
  const response = await siteAdaptationGuideHandler({ httpMethod: 'POST', headers: {} });
  assert.equal(response.statusCode, 405);
  assert.equal(response.body, JSON.stringify({ error: 'Method not allowed' }));
});

test('site-adaptation-guide redirects unauthenticated users to admin login with noindex directives', async () => {
  const response = await siteAdaptationGuideHandler({
    httpMethod: 'GET',
    path: '/architect-site-adaptation-guide.html',
    headers: {},
  });
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, '/admin.html?auth=required');
  assert.match(String(response.headers['x-robots-tag'] || ''), /noindex/i);
});
