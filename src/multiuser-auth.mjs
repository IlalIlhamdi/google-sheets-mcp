import { createHash, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { InvalidGrantError, InvalidRequestError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { resolveGoogleWebClient } from './config.mjs';
import { scopeFor } from './google-auth.mjs';
import { googleApi, SheetsService } from './sheets.mjs';
import { isValidRedirectUri } from './oauth-store.mjs';
import { UserError } from './errors.mjs';

export const DRIVE_METADATA_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';

export function comparableResource(value) {
  const text = String(value);
  const hash = text.indexOf('#');
  return (hash === -1 ? text : text.slice(0, hash)).replace(/\/$/, '');
}

export function sameResource(reported, expected) {
  if (!reported || !expected) return false;
  return comparableResource(reported) === comparableResource(expected);
}

function redirectWithParams(baseUri, params) {
  const url = new URL(baseUri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.href;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/**
 * MCP OAuth 2.1 Authorization Server provider backed by per-user Google Web OAuth 2.0.
 */
export class MultiUserGoogleProvider {
  constructor(config, store, opts = {}) {
    this.config = config;
    this.store = store;
    this.googleCreds = opts.googleCreds ?? resolveGoogleWebClient(config);
    this.publicUrl = new URL(config.publicUrl);
    this.issuerUrl = new URL(this.publicUrl.origin).href;
    this.googleCallbackUri = new URL('/oauth/google/callback', this.publicUrl.origin).href;
    this.requiredGoogleScope = scopeFor(config.scopeMode);
    this.googleScopes = [
      'openid',
      'email',
      'profile',
      this.requiredGoogleScope,
      ...(config.driveListEnabled ? [DRIVE_METADATA_SCOPE] : [])
    ];
    this.sheetsApiFactory = opts.sheetsApiFactory ?? googleApi;
    this.exchangeGoogleCodeImpl = opts.exchangeGoogleCode ?? (args => this._exchangeGoogleCode(args));
    this.serviceCache = new Map();
    this.clientsStore = {
      getClient: id => this.store.getClient(id),
      registerClient: metadata => this.store.registerClient(metadata)
    };
  }

  async _exchangeGoogleCode({ code, codeVerifier }) {
    const oauth = new OAuth2Client({
      clientId: this.googleCreds.clientId,
      clientSecret: this.googleCreds.clientSecret,
      redirectUri: this.googleCallbackUri
    });
    const { tokens } = await oauth.getToken({ code, codeVerifier, redirect_uri: this.googleCallbackUri });
    if (!tokens.access_token || !tokens.id_token) {
      throw new UserError('Google did not return required OAuth tokens.');
    }
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: this.googleCreds.clientId });
    const idPayload = ticket.getPayload();
    if (!idPayload?.sub) throw new UserError('Google identity token is missing subject.');
    const info = await oauth.getTokenInfo(tokens.access_token);
    const grantedScopes = info.scopes ?? [];
    if (!grantedScopes.includes(this.requiredGoogleScope)) {
      throw new UserError('Required Google Sheets permission was not granted.');
    }
    return {
      googleSub: idPayload.sub,
      email: idPayload.email ?? '',
      name: idPayload.name ?? '',
      tokens,
      driveGranted: grantedScopes.includes(DRIVE_METADATA_SCOPE)
    };
  }

  async authorize(client, params, res) {
    if (!isValidRedirectUri(params.redirectUri)) {
      throw new InvalidRequestError('Unsupported redirect_uri.');
    }
    if (params.resource && !sameResource(params.resource, this.config.publicUrl)) {
      throw new InvalidRequestError('Invalid resource target.');
    }
    const requested = (params.scopes ?? []).filter(Boolean);
    if (requested.length > 0 && !requested.includes(this.config.scope)) {
      throw new InvalidRequestError(`Requested scope must include ${this.config.scope}.`);
    }
    const grantedScopes = [this.config.scope];
    const googleVerifier = randomBytes(48).toString('base64url');
    const googleChallenge = createHash('sha256').update(googleVerifier).digest('base64url');
    const googleState = this.store.createPendingAuth({
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      clientState: params.state,
      scopes: grantedScopes,
      resource: params.resource ? params.resource.href : this.config.publicUrl,
      googleVerifier
    });
    const oauth = new OAuth2Client({
      clientId: this.googleCreds.clientId,
      clientSecret: this.googleCreds.clientSecret,
      redirectUri: this.googleCallbackUri
    });
    const authUrl = oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account consent',
      include_granted_scopes: false,
      scope: this.googleScopes,
      state: googleState,
      code_challenge: googleChallenge,
      code_challenge_method: 'S256'
    });
    res.redirect(302, authUrl);
  }

  async handleGoogleCallback(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const pending = this.store.consumePendingAuth(state);
    if (!pending) {
      res.status(400).type('html').send(
        '<!doctype html><meta charset="utf-8"><title>Login Kadaluarsa</title>' +
        '<h2>Sesi login tidak valid atau kadaluarsa</h2><p>Silakan tutup tab ini dan ulangi koneksi dari aplikasi MCP Anda.</p>'
      );
      return;
    }
    const clientRedirect = extra => redirectWithParams(pending.redirectUri, { ...extra, state: pending.clientState });
    if (typeof req.query.error === 'string') {
      res.redirect(302, clientRedirect({ error: 'access_denied', error_description: 'Google authorization was cancelled or denied.' }));
      return;
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) {
      res.redirect(302, clientRedirect({ error: 'invalid_request', error_description: 'Missing authorization code from Google.' }));
      return;
    }
    try {
      const result = await this.exchangeGoogleCodeImpl({ code, codeVerifier: pending.googleVerifier });
      const userId = await this.store.upsertUserGrant(result);
      this.serviceCache.delete(userId);
      const mcpCode = this.store.createAuthCode({
        clientId: pending.clientId,
        redirectUri: pending.redirectUri,
        codeChallenge: pending.codeChallenge,
        scopes: pending.scopes,
        resource: pending.resource,
        userId
      });
      res.redirect(302, clientRedirect({ code: mcpCode }));
    } catch (err) {
      const desc = err instanceof UserError ? err.message : 'Google authentication failed.';
      res.redirect(302, clientRedirect({ error: 'access_denied', error_description: desc }));
    }
  }

  async challengeForAuthorizationCode(client, authorizationCode) {
    const codeData = this.store.peekAuthCode(authorizationCode);
    if (!codeData || codeData.clientId !== client.client_id) {
      throw new InvalidGrantError('Invalid or expired authorization code.');
    }
    return codeData.codeChallenge;
  }

  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri, resource) {
    const codeData = this.store.consumeAuthCode(authorizationCode);
    if (!codeData || codeData.clientId !== client.client_id) {
      throw new InvalidGrantError('Invalid or expired authorization code.');
    }
    if (redirectUri !== undefined && redirectUri !== codeData.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match authorization request.');
    }
    if (resource && !sameResource(resource, this.config.publicUrl)) {
      throw new InvalidRequestError('Invalid resource target.');
    }
    const audience = resource ? comparableResource(resource) : comparableResource(codeData.resource || this.config.publicUrl);
    return this.store.signTokenPair({
      issuer: this.issuerUrl,
      audience,
      userId: codeData.userId,
      clientId: client.client_id,
      scopes: codeData.scopes
    });
  }

  async exchangeRefreshToken(client, refreshToken, scopes, resource) {
    let verified;
    try {
      verified = await this.store.verifyJwt(refreshToken, { issuer: this.issuerUrl, expectedTyp: 'rt' });
    } catch {
      throw new InvalidGrantError('Invalid or revoked refresh token.');
    }
    const { payload } = verified;
    if (payload.cid !== client.client_id) {
      throw new InvalidGrantError('Refresh token was not issued to this client.');
    }
    if (resource && !sameResource(resource, this.config.publicUrl)) {
      throw new InvalidRequestError('Invalid resource target.');
    }
    const grantedScopes = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [this.config.scope];
    let finalScopes = grantedScopes;
    if (scopes && scopes.length > 0) {
      if (!scopes.every(s => grantedScopes.includes(s))) {
        throw new InvalidRequestError('Requested scope exceeds granted scope.');
      }
      finalScopes = scopes;
    }
    const audience = resource ? comparableResource(resource) : comparableResource(this.config.publicUrl);
    return this.store.signTokenPair({
      issuer: this.issuerUrl,
      audience,
      userId: payload.sub,
      clientId: client.client_id,
      scopes: finalScopes
    });
  }

  async verifyAccessToken(token) {
    let verified;
    try {
      verified = await this.store.verifyJwt(token, { issuer: this.issuerUrl, expectedTyp: 'at' });
    } catch {
      throw new InvalidTokenError('Invalid or expired access token.');
    }
    const { payload, user } = verified;
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [];
    return {
      token,
      clientId: String(payload.cid ?? ''),
      scopes,
      expiresAt: payload.exp,
      resource: new URL(String(payload.aud)),
      extra: { userId: payload.sub, email: user.email }
    };
  }

  async revokeToken(client, request) {
    await this.store.revokeToken({
      token: request.token,
      issuer: this.issuerUrl,
      clientId: client.client_id
    });
  }

  serviceForUser(userId) {
    if (!userId) throw new UserError('Missing authenticated user.');
    const grant = this.store.getUserGrant(userId);
    if (!grant) throw new UserError('Google authorization missing or revoked. Reconnect this MCP server.');
    const cached = this.serviceCache.get(userId);
    if (cached && cached.updatedAt === grant.updatedAt && cached.tokenVersion === grant.tokenVersion) {
      return cached.service;
    }
    const auth = new OAuth2Client({
      clientId: this.googleCreds.clientId,
      clientSecret: this.googleCreds.clientSecret
    });
    auth.setCredentials(grant.tokens);
    auth.on('tokens', newTokens => {
      void this.store.updateUserTokens(userId, newTokens).catch(() => {});
    });
    const service = new SheetsService(this.config, this.sheetsApiFactory(auth), {
      auth,
      driveEnabled: Boolean(grant.driveGranted && this.config.driveListEnabled)
    });
    if (this.serviceCache.size >= 500) {
      const oldest = this.serviceCache.keys().next().value;
      if (oldest) this.serviceCache.delete(oldest);
    }
    this.serviceCache.set(userId, { updatedAt: grant.updatedAt, tokenVersion: grant.tokenVersion, service });
    return service;
  }

  renderHtmlPage(title, bodyHtml) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 740px; margin: 48px auto; padding: 0 20px; line-height: 1.6; color: #111827; background: #f9fafb; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; font-size: 0.9em; word-break: break-all; }
  .badge { display: inline-block; background: #dcfce7; color: #166534; padding: 2px 10px; border-radius: 999px; font-size: 0.85em; font-weight: 600; }
  .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 0.9em; color: #4b5563; display: flex; gap: 16px; flex-wrap: wrap; }
  a { color: #1d4ed8; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="card">
  ${bodyHtml}
  <div class="footer">
    <a href="/">Home</a>
    <a href="/privacy">Privacy Policy</a>
    <a href="/terms">Terms of Service</a>
  </div>
</div>
</body>
</html>`;
  }

  landingPageHtml() {
    const mcpEndpoint = escapeHtml(this.config.publicUrl);
    const writes = this.config.writes ? 'Baca & Tulis (Read & Write)' : 'Baca saja (Read-only)';
    return this.renderHtmlPage('Google Sheets MCP Server', `
  <span class="badge">Online &bull; Multi-User OAuth 2.1</span>
  <h1>Google Sheets MCP Server</h1>
  <p>Server MCP publik untuk mengakses Google Sheets menggunakan akun Google masing-masing pengguna (OAuth 2.1 + PKCE).</p>
  <p><strong>MCP Endpoint:</strong> <code>${mcpEndpoint}</code></p>
  <p><strong>Mode Akses:</strong> ${escapeHtml(writes)}</p>
  <h3>Cara Menghubungkan</h3>
  <ol>
    <li>Tambahkan URL endpoint <code>${mcpEndpoint}</code> sebagai Custom MCP Server / Connector di ChatGPT, Claude, Cursor, Antigravity, atau MCP Inspector.</li>
    <li>Pilih autentikasi <strong>OAuth</strong> (Dynamic Client Registration &amp; CIMD didukung).</li>
    <li>Login dengan akun Google Anda masing-masing pada halaman izin Google.</li>
  </ol>`);
  }

  privacyPageHtml() {
    const origin = escapeHtml(this.publicUrl.origin);
    const scopes = this.config.driveListEnabled
      ? '<code>openid</code>, <code>email</code>, Google Sheets (<code>spreadsheets</code>), and Google Drive metadata (<code>drive.metadata.readonly</code>)'
      : '<code>openid</code>, <code>email</code>, and Google Sheets (<code>spreadsheets</code>)';
    return this.renderHtmlPage('Privacy Policy - Google Sheets MCP', `
  <h1>Privacy Policy</h1>
  <p><strong>Service:</strong> Google Sheets MCP Server (<code>${origin}</code>)</p>
  <h3>1. Information Accessed</h3>
  <p>When you sign in with Google OAuth 2.0, this server receives your Google account identifier, email address, and OAuth tokens for ${scopes} solely to execute MCP tool requests you initiate from your connected AI client.</p>
  <h3>2. Data Usage and Storage</h3>
  <ul>
    <li>Spreadsheet contents read or written through MCP tools are processed in memory per request and are not permanently stored in a server database.</li>
    <li>Your Google OAuth tokens are stored on this server encrypted at rest (AES-256-GCM) so your authorized MCP client sessions can access your Google Sheets on your behalf.</li>
    <li>We do not sell, rent, or transfer your Google user data to third parties or use it for advertising.</li>
  </ul>
  <h3>3. Revocation and Deletion</h3>
  <p>You may disconnect this service at any time by revoking access in your <a href="https://myaccount.google.com/permissions" rel="noreferrer">Google Account Permissions</a> or through your MCP client token revocation flow (<code>/revoke</code>).</p>
  <h3>4. Contact</h3>
  <p>For questions about this deployment, contact the operator listed on the Google OAuth consent screen for <code>${escapeHtml(this.publicUrl.hostname)}</code>.</p>`);
  }

  termsPageHtml() {
    const origin = escapeHtml(this.publicUrl.origin);
    return this.renderHtmlPage('Terms of Service - Google Sheets MCP', `
  <h1>Terms of Service</h1>
  <p><strong>Service:</strong> Google Sheets MCP Server (<code>${origin}</code>)</p>
  <h3>1. Acceptable Use</h3>
  <p>This service acts as an OAuth 2.1 Model Context Protocol (MCP) bridge between your chosen AI client and your own Google account. You are solely responsible for all read and write operations executed through your authorized sessions.</p>
  <h3>2. Authorization and Security</h3>
  <p>Each user authenticates directly with Google and can only access spreadsheets permitted by their own Google account. Do not share issued MCP tokens with untrusted parties.</p>
  <h3>3. Availability and Warranty</h3>
  <p>This service is provided &ldquo;as is&rdquo; without warranty of uninterrupted availability. The operator may suspend, rate-limit, or terminate access to protect service stability and security.</p>`);
  }
}
