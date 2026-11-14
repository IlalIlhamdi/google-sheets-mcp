import { readFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { readToken, saveToken } from './vault.mjs';
import { UserError } from './errors.mjs';

export const scopeFor = mode => `https://www.googleapis.com/auth/spreadsheets${mode === 'readonly' ? '.readonly' : ''}`;
async function clientDetails(config) {
  let data;
  try { data = JSON.parse(await readFile(config.clientFile, 'utf8')).installed; }
  catch { throw new UserError('Cannot read Google Desktop OAuth JSON at GOOGLE_CLIENT_FILE.'); }
  if (!data?.client_id || !data?.client_secret) throw new UserError('Use OAuth client type Desktop app (not service account or Web application).');
  return data;
}
export function stateMatches(actual, expected) {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function authorize(config) {
  const details = await clientDetails(config);
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let complete, fail;
  const codePromise = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
  const listener = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    if (req.method !== 'GET' || url.pathname !== '/oauth/callback') { res.writeHead(404).end(); return; }
    if (!stateMatches(url.searchParams.get('state'), state)) { res.writeHead(400).end('Invalid OAuth state.'); return; }
    if (url.searchParams.has('error')) { res.writeHead(400).end('Authorization declined.'); fail(new UserError('Google consent was declined.')); return; }
    const code = url.searchParams.get('code');
    if (!code) { res.writeHead(400).end('Missing code.'); return; }
    res.end('Kode diterima. Kembali ke terminal untuk melihat hasil penyimpanan token.');
    complete(code);
  });
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const redirectUri = `http://127.0.0.1:${listener.address().port}/oauth/callback`;
  const auth = new OAuth2Client({ clientId:details.client_id, clientSecret:details.client_secret, redirectUri });
  const url = auth.generateAuthUrl({ access_type:'offline', prompt:'consent', scope:[scopeFor(config.scopeMode)],
    state, code_challenge:challenge, code_challenge_method:'S256' });
  // CLI only, never MCP stdout. Open manually to keep browser/user selection explicit.
  console.error(`Buka URL ini di browser Windows pada komputer yang sama (berlaku 5 menit):\n${url}`);
  const timer = setTimeout(() => fail(new UserError('OAuth timed out. Run npm run auth again.')), 300000);
  try {
    const code = await codePromise;
    const { tokens } = await auth.getToken({ code, codeVerifier:verifier, redirect_uri:redirectUri });
    if (!tokens.refresh_token || !tokens.access_token) throw new UserError('No offline token returned. Revoke the old grant and authorize again.');
    const info = await auth.getTokenInfo(tokens.access_token);
    if (!info.scopes.includes(scopeFor(config.scopeMode))) throw new UserError('Required Google scope was not granted.');
    await saveToken(config.tokenFile, { clientId:details.client_id, scopeMode:config.scopeMode, refresh_token:tokens.refresh_token });
    console.error('OAuth Google berhasil. Refresh token disimpan; token tidak ditampilkan.');
  } finally { clearTimeout(timer); listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)); }
}
export async function googleAuth(config) {
  const details = await clientDetails(config), token = await readToken(config.tokenFile);
  if (token.clientId !== details.client_id || token.scopeMode !== config.scopeMode)
    throw new UserError('OAuth client/scope changed. Run npm run auth again.');
  if (!token.refresh_token) throw new UserError('Refresh token missing. Run npm run auth.');
  const auth = new OAuth2Client({ clientId:details.client_id, clientSecret:details.client_secret });
  auth.setCredentials({ refresh_token:token.refresh_token });
  return auth;
}
export async function revoke(config) {
  const auth = await googleAuth(config);
  // Delete only after Google confirms revocation; errors remain visible to the operator.
  await auth.revokeToken(auth.credentials.refresh_token);
  await unlink(config.tokenFile);
  console.error('Akses Google dicabut dan token lokal dihapus.');
}
