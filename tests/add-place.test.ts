import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { google } from 'googleapis';
import { SignJWT } from 'jose';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../api/add-place.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const envKeys = ['JWT_SECRET', 'GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_MAPS_API_KEY'] as const;
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const testSecret = 'test-only-signing-key-not-for-production';
const place = { name: 'Synthetic Place', neighborhood: 'Synthetic Area', isRestaurant: true };
let admin: string;
let viewer: string;

async function invoke(body: object = place, token: string | null = admin, method = 'POST') {
  const result = { status: 0, headers: {} as Record<string, unknown>, body: {} as Record<string, unknown> };
  const response = {
    setHeader(name: string, value: unknown) { result.headers[name] = value; return this; },
    status(value: number) { result.status = value; return this; },
    json(value: Record<string, unknown>) { result.body = value; return this; },
  } as unknown as VercelResponse;
  await handler({ method, body, cookies: token ? { auth: token } : {} } as VercelRequest, response);
  return result;
}

describe('add-place errors and save outcomes', { concurrency: false }, () => {
  let get: ReturnType<typeof mock.fn>;
  let append: ReturnType<typeof mock.fn>;
  let update: ReturnType<typeof mock.fn>;
  let logs: ReturnType<typeof mock.method>;

  before(async () => {
    const secret = new TextEncoder().encode(testSecret);
    admin = await new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(secret);
    viewer = await new SignJWT({ role: 'viewer' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(secret);
  });

  beforeEach(() => {
    process.env.JWT_SECRET = testSecret;
    process.env.GOOGLE_SHEET_ID = 'test-only-sheet';
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'test@example.invalid', private_key: 'test-only-placeholder' });
    process.env.GOOGLE_MAPS_API_KEY = 'test-only-placeholder';
    get = mock.fn(async () => ({ data: { values: [] } }));
    append = mock.fn(async () => ({}));
    update = mock.fn(async () => ({}));
    mock.method(google, 'sheets', () => ({ spreadsheets: { values: { get, append, update } } }));
    mock.method(globalThis, 'fetch', async () => { throw new Error('External network disabled in tests'); });
    logs = mock.method(console, 'error', () => {});
  });

  afterEach(() => mock.restoreAll());
  after(() => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  test('method, session, and admin failures have codes and a traceable reference', async () => {
    for (const [token, method, status, code] of [
      [null, 'GET', 405, 'METHOD_NOT_ALLOWED'],
      [null, 'POST', 401, 'AUTH_REQUIRED'],
      ['invalid', 'POST', 401, 'SESSION_INVALID'],
      [viewer, 'POST', 403, 'ADMIN_REQUIRED'],
    ] as const) {
      const result = await invoke(place, token, method);
      assert.equal(result.status, status);
      assert.equal(result.body.code, code);
      assert.equal(result.body.requestId, result.headers['X-Request-Id']);
      assert.match(String(result.body.requestId), /^[a-f0-9-]{36}$/);
    }
    assert.equal(append.mock.callCount(), 0);
  });

  test('invalid input is rejected before contacting Sheets', async () => {
    assert.equal((await invoke({})).body.code, 'PLACE_NAME_REQUIRED');
    assert.equal((await invoke({ name: '   ' })).body.code, 'PLACE_NAME_REQUIRED');
    assert.equal((await invoke({ name: place.name })).body.code, 'PLACE_TYPE_REQUIRED');
    assert.equal((await invoke({ ...place, neighborhood: {} })).body.code, 'PLACE_FIELDS_INVALID');
    assert.equal(get.mock.callCount() + append.mock.callCount(), 0);
  });

  test('missing or invalid server settings return safe configuration errors', async () => {
    delete process.env.JWT_SECRET;
    assert.equal((await invoke()).body.code, 'AUTH_NOT_CONFIGURED');
    process.env.JWT_SECRET = testSecret;
    delete process.env.GOOGLE_SHEET_ID;
    assert.equal((await invoke()).body.code, 'SHEETS_NOT_CONFIGURED');
    process.env.GOOGLE_SHEET_ID = 'test-only-sheet';
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = 'invalid-json';
    assert.equal((await invoke()).body.code, 'SHEETS_CREDENTIALS_INVALID');
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = '{}';
    assert.equal((await invoke()).body.code, 'SHEETS_CREDENTIALS_INVALID');
    assert.equal(append.mock.callCount(), 0);
  });

  for (const [upstreamStatus, status, code] of [
    [400, 502, 'SHEETS_REQUEST_REJECTED'],
    [401, 502, 'SHEETS_AUTH_FAILED'],
    [403, 502, 'SHEETS_PERMISSION_DENIED'],
    [404, 502, 'SHEET_NOT_FOUND'],
    [429, 503, 'SHEETS_RATE_LIMITED'],
  ] as const) {
    test(`Google ${upstreamStatus} becomes ${code} without exposing upstream details`, async () => {
      const marker = 'SENSITIVE_UPSTREAM_TEST_MARKER';
      append.mock.mockImplementation(async () => {
        throw { message: marker, response: { status: upstreamStatus, data: { privateDetails: marker } } };
      });
      const result = await invoke();
      assert.equal(result.status, status);
      assert.equal(result.body.code, code);
      assert.ok(!JSON.stringify(result.body).includes(marker));
      assert.ok(!JSON.stringify(logs.mock.calls).includes(marker));
      assert.equal(logs.mock.calls[0].arguments[1].requestId, result.body.requestId);
      assert.equal(append.mock.callCount(), 1);
    });
  }

  test('revoked Google credentials are distinguished from a rejected Sheet request', async () => {
    append.mock.mockImplementation(async () => { throw { response: { status: 400, data: { error: 'invalid_grant' } } }; });
    assert.equal((await invoke()).body.code, 'SHEETS_AUTH_FAILED');
  });

  test('an uncertain write warns against retrying and does not retry automatically', async () => {
    append.mock.mockImplementation(async () => { throw new Error('Connection lost after sending the write'); });
    const result = await invoke();
    assert.equal(result.status, 502);
    assert.equal(result.body.code, 'SAVE_UNCONFIRMED');
    assert.match(String(result.body.error), /Check the Google Sheet before retrying/);
    assert.equal(append.mock.callCount(), 1);
  });

  test('a failed read is distinguished from an uncertain write', async () => {
    get.mock.mockImplementation(async () => { throw null; });
    const result = await invoke({ ...place, originalName: place.name });
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'SHEETS_UNAVAILABLE');
    assert.equal(append.mock.callCount() + update.mock.callCount(), 0);
  });

  test('a missing edit target never appends a new row', async () => {
    const result = await invoke({ ...place, originalName: place.name });
    assert.equal(result.status, 404);
    assert.equal(result.body.code, 'PLACE_NOT_FOUND');
    assert.equal(append.mock.callCount() + update.mock.callCount(), 0);
  });

  test('a successful Sheet write stays successful when map enrichment fails', async () => {
    const result = await invoke();
    assert.equal(result.status, 200);
    assert.equal(result.body.name, place.name);
    assert.equal(result.body.code, undefined);
    assert.equal(append.mock.callCount(), 1);
  });

  test('edits use name and neighborhood to update the intended row', async () => {
    get.mock.mockImplementation(async () => ({ data: { values: [
      [place.name, '', 'y', '', '', '', 'Other Area'],
      [place.name, '', 'y', '', '', '', place.neighborhood],
    ] } }));
    const result = await invoke({ ...place, id: 'existing-id', originalName: place.name, originalNeighborhood: place.neighborhood });
    assert.equal(result.status, 200);
    assert.equal(result.body.id, 'existing-id');
    assert.equal(update.mock.calls[0].arguments[0].range, 'RestaurantList!A3:I3');
    assert.equal(append.mock.callCount(), 0);
  });
});

test('compiled production handler loads in plain Node without a TypeScript resolver', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'melissamap-esm-test-'));
  try {
    await mkdir(path.join(directory, 'api'));
    await mkdir(path.join(directory, 'src'));
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
    await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'));
    for (const file of ['api/add-place', 'src/placeSearchOverrides']) {
      const source = await readFile(path.join(root, `${file}.ts`), 'utf8');
      const emitted = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
      await writeFile(path.join(directory, `${file}.js`), emitted);
    }
    const url = pathToFileURL(path.join(directory, 'api/add-place.js')).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)})`], {
      encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' },
    });
    assert.equal(child.status, 0, child.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
