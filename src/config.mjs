import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { UserError } from './errors.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const csv = value => (value ?? '').split(',').map(x => x.trim()).filter(Boolean);
const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  if (!['true', 'false'].includes(value)) throw new UserError('Boolean configuration must be true or false.');
  return value === 'true';
};
const integer = (value, fallback, min, max) => {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new UserError('Invalid numeric configuration.');
  return n;
};
const parseTrustProxy = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  if (value === 'false' || value === '0') return false;
  if (value === 'loopback') return 'loopback';
  const hops = Number(value);
  if (Number.isSafeInteger(hops) && hops >= 1 && hops <= 5) return hops;
  throw new UserError('MCP_TRUST_PROXY must be false, 0, loopback, or 1..5.');
};
export function validId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{20,200}$/.test(id) && !/REPLACE|YOUR_|GANTI/.test(id);
}
export function loadConfig(env = process.env) {
  let file = {};
  try { file = parse(readFileSync(env.MCP_ENV_FILE ? resolve(env.MCP_ENV_FILE) : resolve(ROOT, '.env'))); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const v = { ...file, ...env };
  const ids = csv(v.ALLOWED_SPREADSHEET_IDS);
  if (ids.some(id => !validId(id))) throw new UserError('ALLOWED_SPREADSHEET_IDS must contain valid IDs, not URLs/placeholders.');
  const authMode = v.MCP_AUTH_MODE || (v.GOOGLE_WEB_CLIENT_ID || v.GOOGLE_WEB_CLIENT_FILE ? 'multiuser' : 'external-oidc');
  if (!['external-oidc', 'multiuser'].includes(authMode)) throw new UserError('MCP_AUTH_MODE must be external-oidc or multiuser.');
  const scopeMode = v.GOOGLE_SCOPE_MODE ?? (authMode === 'multiuser' ? 'readwrite' : 'readonly');
  if (!['readonly', 'readwrite'].includes(scopeMode)) throw new UserError('GOOGLE_SCOPE_MODE must be readonly or readwrite.');
  const writes = bool(v.ENABLE_WRITES, false);
  if (writes && scopeMode !== 'readwrite') throw new UserError('Writes require GOOGLE_SCOPE_MODE=readwrite and new Google consent.');
  return {
    authMode,
    ids: new Set(ids), scopeMode, writes,
    driveListEnabled: bool(v.GOOGLE_DRIVE_LIST, authMode === 'multiuser'),
    clientFile: resolve(ROOT, v.GOOGLE_CLIENT_FILE || '.secrets/google-client.json'),
    tokenFile: resolve(ROOT, v.GOOGLE_TOKEN_FILE || '.secrets/google-token.json'),
    googleWebClientFile: v.GOOGLE_WEB_CLIENT_FILE ? resolve(ROOT, v.GOOGLE_WEB_CLIENT_FILE) : '',
    googleWebClientId: v.GOOGLE_WEB_CLIENT_ID ?? '',
    googleWebClientSecret: v.GOOGLE_WEB_CLIENT_SECRET ?? '',
    storeFile: resolve(ROOT, v.MCP_OAUTH_STORE_FILE || '.data/oauth-store.json'),
    masterKeyFile: resolve(ROOT, v.MCP_MASTER_KEY_FILE || '.secrets/master.key'),
    tokenSecret: v.MCP_TOKEN_SECRET ?? '',
    maxCells: integer(v.MAX_CELLS, 5000, 1, 10000),
    maxResponseBytes: integer(v.MAX_RESPONSE_BYTES, 200000, 1000, 1000000),
    port: integer(v.HTTP_PORT, 3000, 1024, 65535),
    host: v.HTTP_HOST || '127.0.0.1',
    publicUrl: v.MCP_PUBLIC_URL ?? '', issuer: v.MCP_OAUTH_ISSUER ?? '',
    jwksUri: v.MCP_JWKS_URI ?? '', scope: v.MCP_REQUIRED_SCOPE || 'sheets:mcp',
    subjects: new Set(csv(v.MCP_ALLOWED_SUBJECTS)), origins: new Set(csv(v.MCP_ALLOWED_ORIGINS)),
    allowAnyHttpsOrigin: bool(v.MCP_ALLOW_ANY_HTTPS_ORIGIN, authMode === 'multiuser'),
    trustProxy: parseTrustProxy(v.MCP_TRUST_PROXY, authMode === 'multiuser' ? 'loopback' : false)
  };
}
export function requireIds(config) {
  if (config.authMode === 'multiuser') return;
  if (!config.ids.size) throw new UserError('No spreadsheet configured. Run npm run verify -- <ID-or-Sheets-URL>, then set ALLOWED_SPREADSHEET_IDS.');
}
export function assertAllowed(config, id) {
  if (config.authMode === 'multiuser' && config.ids.size === 0) {
    if (!validId(id)) throw new UserError('Invalid spreadsheet ID.');
    return;
  }
  if (!config.ids.has(id)) throw new UserError('Spreadsheet is not in ALLOWED_SPREADSHEET_IDS.');
}
export function resolveGoogleWebClient(config) {
  if (config.googleWebClientId && config.googleWebClientSecret) {
    return { clientId: config.googleWebClientId, clientSecret: config.googleWebClientSecret };
  }
  if (config.googleWebClientFile) {
    let raw;
    try { raw = JSON.parse(readFileSync(config.googleWebClientFile, 'utf8')); }
    catch { throw new UserError('Cannot read GOOGLE_WEB_CLIENT_FILE.'); }
    const data = raw.web ?? raw.installed;
    if (!data?.client_id || !data?.client_secret) {
      throw new UserError('GOOGLE_WEB_CLIENT_FILE must contain client_id and client_secret.');
    }
    return { clientId: data.client_id, clientSecret: data.client_secret };
  }
  throw new UserError('Multi-user HTTP mode requires GOOGLE_WEB_CLIENT_ID and GOOGLE_WEB_CLIENT_SECRET (or GOOGLE_WEB_CLIENT_FILE).');
}
export function validateRemote(config) {
  let publicUrl;
  try { publicUrl = new URL(config.publicUrl); }
  catch { throw new UserError('HTTP mode requires valid HTTPS MCP_PUBLIC_URL ending with /mcp.'); }
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash)
    throw new UserError('Remote URLs must be HTTPS without credentials, query, or fragment.');
  if (publicUrl.pathname !== '/mcp') throw new UserError('MCP_PUBLIC_URL must end exactly with /mcp.');
  if (!/^[a-zA-Z0-9:_-]+$/.test(config.scope)) throw new UserError('Invalid MCP_REQUIRED_SCOPE.');
  for (const origin of config.origins) {
    if (new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new UserError('Origins must be exact HTTPS origins.');
  }
  if (config.authMode === 'multiuser') {
    resolveGoogleWebClient(config);
    return;
  }
  for (const value of [config.issuer, config.jwksUri]) {
    let url;
    try { url = new URL(value); } catch { throw new UserError('HTTP mode requires MCP_PUBLIC_URL, MCP_OAUTH_ISSUER and MCP_JWKS_URI.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new UserError('Remote URLs must be HTTPS without credentials, query, or fragment.');
  }
  if (!config.subjects.size || config.subjects.has('*')) throw new UserError('HTTP mode requires exact MCP_ALLOWED_SUBJECTS.');
}
