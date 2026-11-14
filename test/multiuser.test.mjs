import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadConfig, validateRemote } from '../src/config.mjs';
import { createHttpApp } from '../src/http.mjs';
import { OAuthStateStore, isDisallowedIp } from '../src/oauth-store.mjs';
import { MultiUserGoogleProvider } from '../src/multiuser-auth.mjs';
import { ID } from './helpers.mjs';

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function multiuserConfig(dir, port, overrides = {}) {
  return loadConfig({
    MCP_ENV_FILE: join(dir, 'nonexistent.env'),
    MCP_AUTH_MODE: 'multiuser',
    MCP_PUBLIC_URL: 'https://sheets.example.com/mcp',
    HTTP_PORT: String(port),
    GOOGLE_WEB_CLIENT_ID: 'test-web-client-id.apps.googleusercontent.com',
    GOOGLE_WEB_CLIENT_SECRET: 'test-web-client-secret',
    GOOGLE_SCOPE_MODE: 'readwrite',
    ENABLE_WRITES: 'true',
    GOOGLE_DRIVE_LIST: 'true',
    MCP_OAUTH_STORE_FILE: join(dir, 'oauth-store.json'),
    MCP_MASTER_KEY_FILE: join(dir, 'master.key'),
    ...overrides
  });
}

async function completeOAuthFlow(base, { clientName, redirectUri, googleCode, scope = 'sheets:mcp' }) {
  const regRes = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.10' },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    })
  });
  assert.equal(regRes.status, 201);
  const client = await regRes.json();

  const { verifier, challenge } = pkcePair();
  const authUrl = new URL(`${base}/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', client.client_id);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', 'client-state-xyz');
  authUrl.searchParams.set('resource', 'https://sheets.example.com/mcp');

  const authRes = await fetch(authUrl, {
    redirect: 'manual',
    headers: { 'X-Forwarded-For': '203.0.113.10' }
  });
  assert.equal(authRes.status, 302);
  const googleRedirect = new URL(authRes.headers.get('location'));
  assert.equal(googleRedirect.hostname, 'accounts.google.com');
  const googleState = googleRedirect.searchParams.get('state');
  assert.ok(googleState);

  const cbUrl = new URL(`${base}/oauth/google/callback`);
  cbUrl.searchParams.set('state', googleState);
  cbUrl.searchParams.set('code', googleCode);
  const cbRes = await fetch(cbUrl, {
    redirect: 'manual',
    headers: { 'X-Forwarded-For': '203.0.113.10' }
  });
  assert.equal(cbRes.status, 302);
  const backUrl = new URL(cbRes.headers.get('location'));
  assert.equal(backUrl.origin + backUrl.pathname, redirectUri);
  assert.equal(backUrl.searchParams.get('state'), 'client-state-xyz');
  const mcpCode = backUrl.searchParams.get('code');
  assert.ok(mcpCode);

  const tokenRes = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': '203.0.113.10' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      code: mcpCode,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource: 'https://sheets.example.com/mcp'
    })
  });
  assert.equal(tokenRes.status, 200);
  const tokens = await tokenRes.json();
  assert.ok(tokens.access_token);
  assert.ok(tokens.refresh_token);
  return { client, verifier, tokens };
}

test('multi-user OAuth flow, per-user isolation, proxy headers, refresh, revoke, and encrypted persistence', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sheets-mcp-multi-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const listener = await new Promise(resolve => {
    const server = createServer().listen(0, '127.0.0.1', () => resolve(server));
  });
  t.after(() => new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); }));
  const port = listener.address().port;
  const base = `http://127.0.0.1:${port}`;
  const cfg = multiuserConfig(dir, port);
  validateRemote(cfg);

  const userTokensByCode = {
    'google-code-alice': {
      googleSub: 'google-sub-alice',
      email: 'alice@example.com',
      name: 'Alice',
      driveGranted: true,
      tokens: {
        refresh_token: 'SECRET_ALICE_REFRESH_TOKEN',
        access_token: 'alice-access-token',
        expiry_date: Date.now() + 3600_000
      }
    },
    'google-code-bob': {
      googleSub: 'google-sub-bob',
      email: 'bob@example.com',
      name: 'Bob',
      driveGranted: true,
      tokens: {
        refresh_token: 'SECRET_BOB_REFRESH_TOKEN',
        access_token: 'bob-access-token',
        expiry_date: Date.now() + 3600_000
      }
    }
  };

  const store = await OAuthStateStore.open(cfg);
  const provider = new MultiUserGoogleProvider(cfg, store, {
    exchangeGoogleCode: async ({ code }) => {
      const entry = userTokensByCode[code];
      if (!entry) throw new Error('Unknown simulated code');
      return entry;
    },
    sheetsApiFactory: auth => {
      const ownerLabel = auth.credentials.refresh_token.includes('ALICE') ? 'alice-cell' : 'bob-cell';
      return {
        spreadsheets: {
          get: async ({ spreadsheetId }) => ({
            data: { spreadsheetId, properties: { title: `Sheet for ${ownerLabel}`, locale: 'en_US' }, sheets: [] }
          }),
          batchUpdate: async () => ({ data: { replies: [{ addSheet: { properties: { sheetId: 1, title: 'New' } } }] } }),
          values: {
            get: async () => ({ data: { range: "'Data'!A1", values: [[ownerLabel]] } }),
            update: async () => ({ data: { updatedCells: 1 } }),
            append: async () => ({ data: { updates: { updatedRows: 1 } } })
          }
        }
      };
    }
  });

  listener.on('request', createHttpApp(cfg, provider));

  // Discovery checks
  const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
  assert.equal(prm.resource, 'https://sheets.example.com/mcp');
  const asMeta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
  assert.equal(asMeta.client_id_metadata_document_supported, true);
  assert.ok(asMeta.registration_endpoint.endsWith('/register'));

  // Landing page, policy pages & healthz
  const rootRes = await fetch(`${base}/`, { headers: { Accept: 'text/html' } });
  assert.equal(rootRes.status, 200);
  const rootHtml = await rootRes.text();
  assert.match(rootHtml, /Multi-User OAuth 2\.1/);
  assert.match(rootHtml, /href="\/privacy"/);
  assert.match(rootHtml, /href="\/terms"/);

  for (const [path, heading] of [['/privacy', /Privacy Policy/], ['/terms', /Terms of Service/]]) {
    const policyRes = await fetch(`${base}${path}`);
    assert.equal(policyRes.status, 200);
    assert.match(policyRes.headers.get('content-type'), /text\/html/);
    assert.match(await policyRes.text(), heading);
  }

  // Unauthenticated /mcp and malformed Bearer token both return 401 with WWW-Authenticate
  const unauthRes = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.10' },
    body: '{}'
  });
  assert.equal(unauthRes.status, 401);
  assert.match(unauthRes.headers.get('www-authenticate'), /resource_metadata=/);

  const garbageTokenRes = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-a-jwt' },
    body: '{}'
  });
  assert.equal(garbageTokenRes.status, 401);
  assert.match(garbageTokenRes.headers.get('www-authenticate'), /invalid_token/);

  // Origin checks in multiuser mode: https origin allowed, plain http evil origin denied
  const okOrigin = await fetch(`${base}/mcp`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://inspector.modelcontextprotocol.io' }
  });
  assert.equal(okOrigin.status, 204);
  const badOrigin = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { Origin: 'http://evil.example' }
  });
  assert.equal(badOrigin.status, 403);

  // Authenticate Alice and Bob
  const aliceAuth = await completeOAuthFlow(base, {
    clientName: 'Alice Client',
    redirectUri: 'http://127.0.0.1:4100/cb',
    googleCode: 'google-code-alice'
  });
  const bobAuth = await completeOAuthFlow(base, {
    clientName: 'Bob Client',
    redirectUri: 'http://127.0.0.1:4200/cb',
    googleCode: 'google-code-bob'
  });

  // Verify encrypted persistence on disk hides raw Google refresh tokens
  const storedRaw = await readFile(cfg.storeFile, 'utf8');
  assert.doesNotMatch(storedRaw, /SECRET_ALICE_REFRESH_TOKEN/);
  assert.doesNotMatch(storedRaw, /SECRET_BOB_REFRESH_TOKEN/);

  // Connect real MCP clients for Alice & Bob and verify complete user isolation
  const aliceClient = new Client({ name: 'alice-mcp', version: '1.0.0' });
  const bobClient = new Client({ name: 'bob-mcp', version: '1.0.0' });
  t.after(async () => { await aliceClient.close(); await bobClient.close(); });

  await aliceClient.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${aliceAuth.tokens.access_token}` } }
  }));
  await bobClient.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${bobAuth.tokens.access_token}` } }
  }));

  const aliceTools = await aliceClient.listTools();
  assert.equal(aliceTools.tools.length, 7);

  // Read via raw ID for Alice and via full Sheets URL for Bob
  const aliceRead = await aliceClient.callTool({
    name: 'read_sheet',
    arguments: { spreadsheetId: ID, sheet: 'Data', range: 'A1' }
  });
  assert.equal(JSON.parse(aliceRead.content[0].text).values[0][0], 'alice-cell');

  const bobRead = await bobClient.callTool({
    name: 'read_sheet',
    arguments: { spreadsheetId: `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`, sheet: 'Data', range: 'A1' }
  });
  assert.equal(JSON.parse(bobRead.content[0].text).values[0][0], 'bob-cell');

  const aliceWrite = await aliceClient.callTool({
    name: 'write_cells',
    arguments: { spreadsheetId: ID, sheet: 'Data', range: 'A1', values: [['hello']], confirm: true }
  });
  assert.ok(!aliceWrite.isError);

  // Refresh token flow
  const refreshRes = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: aliceAuth.client.client_id,
      refresh_token: aliceAuth.tokens.refresh_token
    })
  });
  assert.equal(refreshRes.status, 200);
  const refreshed = await refreshRes.json();
  assert.ok(refreshed.access_token);

  // Revoke access token & confirm 401
  const revokeAtRes = await fetch(`${base}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: aliceAuth.client.client_id,
      token: refreshed.access_token
    })
  });
  assert.equal(revokeAtRes.status, 200);
  const afterRevokeRes = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${refreshed.access_token}` },
    body: '{}'
  });
  assert.equal(afterRevokeRes.status, 401);

  // Revoke refresh token & confirm subsequent refresh fails
  const revokeRtRes = await fetch(`${base}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: aliceAuth.client.client_id,
      token: refreshed.refresh_token
    })
  });
  assert.equal(revokeRtRes.status, 200);
  const refreshDenied = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: aliceAuth.client.client_id,
      refresh_token: refreshed.refresh_token
    })
  });
  assert.equal(refreshDenied.status, 400);

  // Reload persisted store from disk and verify Bob's user grant + clients survive restart
  const reloadedStore = await OAuthStateStore.open(cfg);
  const bobUserId = reloadedStore.userIdForGoogleSub('google-sub-bob');
  const bobGrant = reloadedStore.getUserGrant(bobUserId);
  assert.equal(bobGrant.tokens.refresh_token, 'SECRET_BOB_REFRESH_TOKEN');
  assert.ok(await reloadedStore.getClient(bobAuth.client.client_id));
});

test('CIMD SSRF protection blocks private/loopback IPs and allows valid public HTTPS metadata', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sheets-mcp-cimd-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cfg = multiuserConfig(dir, 3000);

  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '::1', '::ffff:127.0.0.1', 'fe80::1']) {
    assert.equal(isDisallowedIp(ip), true, `Expected ${ip} to be disallowed`);
  }
  assert.equal(isDisallowedIp('93.184.216.34'), false);

  let fetchedPrivate = false;
  const ssrfStore = await OAuthStateStore.open(cfg, {
    lookupImpl: async () => [{ address: '169.254.169.254', family: 4 }],
    fetchImpl: async () => { fetchedPrivate = true; throw new Error('Should not fetch'); }
  });
  assert.equal(await ssrfStore.getClient('https://metadata.internal/oauth/client.json'), undefined);
  assert.equal(fetchedPrivate, false);

  const validUrl = 'https://client.example.com/oauth/client.json';
  const cimdStore = await OAuthStateStore.open(cfg, {
    lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => new Response(JSON.stringify({
      client_id: validUrl,
      client_name: 'External CIMD Client',
      redirect_uris: ['https://client.example.com/callback'],
      token_endpoint_auth_method: 'client_secret_post',
      client_secret: 'should-be-stripped'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  });
  const cimdClient = await cimdStore.getClient(validUrl);
  assert.equal(cimdClient.client_id, validUrl);
  assert.equal(cimdClient.token_endpoint_auth_method, 'none');
  assert.equal(cimdClient.client_secret, undefined);
});

test('multiuser list_spreadsheets uses Drive v3 query escaping and OAuth rejects mismatched PKCE/client/redirect', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sheets-mcp-multi-sec-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { SheetsService } = await import('../src/sheets.mjs');
  const { fakeApi } = await import('./helpers.mjs');
  const cfg = multiuserConfig(dir, 3000, { ALLOWED_SPREADSHEET_IDS: '' });

  let requestedUrl = '';
  const fakeAuth = { getAccessToken: async () => ({ token: 'user-google-token' }) };
  const svc = new SheetsService(cfg, fakeApi(), {
    auth: fakeAuth,
    driveEnabled: true,
    fetchImpl: async url => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({
        files: [{ id: ID, name: "Q4 'Sales'", modifiedTime: '2026-11-14T00:00:00Z', webViewLink: `https://docs.google.com/spreadsheets/d/${ID}/edit` }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  const listRes = await svc.listSpreadsheets({ query: "O'Brien\\2026", maxResults: 10 });
  assert.equal(listRes.spreadsheets.length, 1);
  assert.equal(listRes.spreadsheets[0].title, "Q4 'Sales'");
  assert.match(decodeURIComponent(requestedUrl), /O\\'Brien\\\\2026/);

  const noDriveSvc = new SheetsService(cfg, fakeApi(), { auth: fakeAuth, driveEnabled: false });
  const fallback = await noDriveSvc.listSpreadsheets({});
  assert.equal(fallback.spreadsheets.length, 0);
  assert.match(fallback.note, /Drive listing permission/);

  const listener = await new Promise(resolve => {
    const server = createServer().listen(0, '127.0.0.1', () => resolve(server));
  });
  t.after(() => new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); }));
  const port = listener.address().port;
  const base = `http://127.0.0.1:${port}`;
  const runCfg = multiuserConfig(dir, port);
  const store = await OAuthStateStore.open(runCfg);
  const provider = new MultiUserGoogleProvider(runCfg, store, {
    exchangeGoogleCode: async () => ({
      googleSub: 'sub-x',
      email: 'x@example.com',
      name: 'X',
      driveGranted: false,
      tokens: { refresh_token: 'RT', access_token: 'AT', expiry_date: Date.now() + 3600_000 }
    })
  });
  listener.on('request', createHttpApp(runCfg, provider));

  const reg = await (await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: ['http://127.0.0.1:4300/cb'], token_endpoint_auth_method: 'none' })
  })).json();
  const { challenge } = pkcePair();
  const authUrl = new URL(`${base}/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', reg.client_id);
  authUrl.searchParams.set('redirect_uri', 'http://127.0.0.1:4300/cb');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('scope', 'sheets:mcp');
  const googleLoc = new URL((await fetch(authUrl, { redirect: 'manual' })).headers.get('location'));
  const cbUrl = new URL(`${base}/oauth/google/callback`);
  cbUrl.searchParams.set('state', googleLoc.searchParams.get('state'));
  cbUrl.searchParams.set('code', 'ok');
  const backLoc = new URL((await fetch(cbUrl, { redirect: 'manual' })).headers.get('location'));
  const mcpCode = backLoc.searchParams.get('code');

  // Wrong PKCE code_verifier is rejected and keeps code unused or fails grant
  const badPkce = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: reg.client_id,
      code: mcpCode,
      code_verifier: 'wrong-verifier-0000000000000000000000000000000000000000',
      redirect_uri: 'http://127.0.0.1:4300/cb'
    })
  });
  assert.equal(badPkce.status, 400);

  // Onboarding portal HTML, CSP script nonce, client tabs, Cursor deeplink & JSON mode
  const portalRes = await fetch(`${base}/`, { headers: { Accept: 'text/html' } });
  assert.equal(portalRes.status, 200);
  const csp = portalRes.headers.get('content-security-policy') ?? '';
  const nonceMatch = csp.match(/script-src 'nonce-([^']+)'/);
  assert.ok(nonceMatch, `expected CSP script-src nonce in: ${csp}`);
  assert.match(csp, /connect-src 'self'/);

  const portalHtml = await portalRes.text();
  const scriptRegex = new RegExp(`<script nonce="${nonceMatch[1]}">([\\s\\S]*?)</script>`);
  const scriptMatch = portalHtml.match(scriptRegex);
  assert.ok(scriptMatch, 'expected inline script matching CSP nonce');
  assert.doesNotThrow(() => new Function(scriptMatch[1]));

  assert.match(portalHtml, /<html lang="id">/);
  assert.match(portalHtml, /role="tablist"/);
  assert.match(portalHtml, /id="tab-chatgpt"/);
  assert.match(portalHtml, /id="tab-claude"/);
  assert.match(portalHtml, /id="tab-cursor"/);
  assert.match(portalHtml, /id="tab-antigravity"/);
  assert.match(portalHtml, /id="tab-claudecode"/);
  assert.match(portalHtml, /agy mcp add --type stdio google-sheets/);
  assert.match(portalHtml, /claude mcp add --scope user --transport http google-sheets/);
  assert.match(portalHtml, /Google hasn&#39;t verified this app|Google hasn't verified this app/);
  assert.doesNotMatch(portalHtml, /\u2014|&mdash;/i);

  const deeplinkMatch = portalHtml.match(/href="(cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?[^"]+)"/);
  assert.ok(deeplinkMatch, 'expected Cursor 1-click install deeplink');
  const dlUrl = new URL(deeplinkMatch[1].replaceAll('&amp;', '&'));
  assert.equal(dlUrl.searchParams.get('name'), 'google-sheets');
  const decodedCursorCfg = JSON.parse(Buffer.from(dlUrl.searchParams.get('config'), 'base64').toString('utf8'));
  assert.equal(decodedCursorCfg.url, runCfg.publicUrl);

  const portalJsonRes = await fetch(`${base}/`, { headers: { Accept: 'application/json' } });
  assert.equal(portalJsonRes.status, 200);
  const portalJson = await portalJsonRes.json();
  assert.equal(portalJson.mcpEndpoint, runCfg.publicUrl);

  const privRes = await fetch(`${base}/privacy`);
  assert.equal(privRes.status, 200);
  assert.doesNotMatch(privRes.headers.get('content-security-policy') ?? '', /script-src/);
});
