import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { placeRequest } from '../src/lib/placeRequest.js';

afterEach(() => mock.restoreAll());

test('structured errors show the message, stable code, HTTP status, and reference', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({
    error: 'Check the Sheet before retrying.', code: 'SAVE_UNCONFIRMED', requestId: 'test-reference',
  }, { status: 502 }));
  await assert.rejects(placeRequest('/api/add-place', {}, 'save'), error => {
    assert.match(String(error), /Check the Sheet before retrying/);
    assert.match(String(error), /SAVE_UNCONFIRMED; HTTP 502; ref test-reference/);
    return true;
  });
});

test('plain-text function crashes still show an HTTP code and cautious retry advice', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('FUNCTION_INVOCATION_FAILED', { status: 500 }));
  await assert.rejects(placeRequest('/api/add-place', {}, 'save'), /Check the Google Sheet before retrying.*HTTP_500; HTTP 500/);
});

test('unauthenticated HTML responses prompt sign-in', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('<html>Unauthorized</html>', { status: 401 }));
  await assert.rejects(placeRequest('/api/add-place', {}, 'save'), /Please sign in again.*HTTP_401/);
});

test('network failures do not retry an operation that may already have succeeded', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(placeRequest('/api/add-place', {}, 'save'), /Check the Google Sheet before retrying.*NETWORK_ERROR/);
  assert.equal(fetch.mock.callCount(), 1);
});

test('invalid successful responses do not pretend a save succeeded', async () => {
  for (const response of [new Response('<html>SPA fallback</html>'), Response.json({ ok: true })]) {
    const fetch = mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(placeRequest('/api/add-place', {}, 'save'), /INVALID_SERVER_RESPONSE; HTTP 200/);
    fetch.mock.restore();
  }
});

test('valid save and delete results are returned to the form', async () => {
  const place = { id: 'synthetic-place', name: 'Synthetic Place' };
  const fetch = mock.method(globalThis, 'fetch', async () => Response.json(place));
  assert.deepEqual(await placeRequest('/api/add-place', {}, 'save'), place);
  fetch.mock.mockImplementation(async () => Response.json({ ok: true }));
  assert.deepEqual(await placeRequest('/api/delete-place', {}, 'delete'), { ok: true });
});

test('legacy delete errors retain their message and gain an HTTP code', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Could not find the row to delete' }, { status: 404 }));
  await assert.rejects(placeRequest('/api/delete-place', {}, 'delete'), /Could not find the row to delete.*HTTP_404; HTTP 404/);
});
