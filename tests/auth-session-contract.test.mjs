import test from 'node:test';
import assert from 'node:assert/strict';

import { handler as adminLogoutHandler } from '../netlify/functions/admin-logout.mjs';
import { handler as memberLogoutHandler } from '../netlify/functions/member-logout.mjs';
import { handler as adminSessionHandler } from '../netlify/functions/admin-session.mjs';
import { handler as memberSessionHandler } from '../netlify/functions/member-session.mjs';

function parseBody(response) {
  return JSON.parse(response.body || '{}');
}

test('member logout is idempotent and returns 200 with authenticated false', async () => {
  const response = await memberLogoutHandler({ httpMethod: 'POST', headers: {} });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parseBody(response), { authenticated: false });
  assert.match(String(response.headers?.['set-cookie'] || ''), /endtimes_member_session=/);
});

test('admin logout is idempotent and returns 200 with authenticated false', async () => {
  const response = await adminLogoutHandler({ httpMethod: 'POST', headers: {} });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parseBody(response), { authenticated: false });
  assert.match(String(response.headers?.['set-cookie'] || ''), /endtimes_admin_session=/);
});

test('logout endpoints reject non-POST methods with standard error payload', async () => {
  const [memberResponse, adminResponse] = await Promise.all([
    memberLogoutHandler({ httpMethod: 'GET', headers: {} }),
    adminLogoutHandler({ httpMethod: 'GET', headers: {} }),
  ]);
  assert.equal(memberResponse.statusCode, 405);
  assert.equal(adminResponse.statusCode, 405);
  assert.deepEqual(parseBody(memberResponse), { error: 'Method not allowed' });
  assert.deepEqual(parseBody(adminResponse), { error: 'Method not allowed' });
});

test('session endpoints return unauthenticated payload shape when unauthenticated', async () => {
  const [memberResponse, adminResponse] = await Promise.all([
    memberSessionHandler({ httpMethod: 'GET', headers: {} }),
    adminSessionHandler({ httpMethod: 'GET', headers: {} }),
  ]);

  assert.equal(memberResponse.statusCode, 200);
  assert.equal(adminResponse.statusCode, 200);
  assert.deepEqual(parseBody(memberResponse), { authenticated: false });
  assert.deepEqual(parseBody(adminResponse), { authenticated: false });
});

test('session endpoints reject non-GET methods with standard error payload', async () => {
  const [memberResponse, adminResponse] = await Promise.all([
    memberSessionHandler({ httpMethod: 'POST', headers: {} }),
    adminSessionHandler({ httpMethod: 'POST', headers: {} }),
  ]);

  assert.equal(memberResponse.statusCode, 405);
  assert.equal(adminResponse.statusCode, 405);
  assert.deepEqual(parseBody(memberResponse), { error: 'Method not allowed' });
  assert.deepEqual(parseBody(adminResponse), { error: 'Method not allowed' });
});
