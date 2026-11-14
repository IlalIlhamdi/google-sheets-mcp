import { createHash, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { InvalidGrantError, InvalidRequestError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { resolveGoogleWebClient } from './config.mjs';
import { scopeFor } from './google-auth.mjs';
import { googleApi, SheetsService } from './sheets.mjs';
import { isValidRedirectUri } from './oauth-store.mjs';
import { UserError } from './errors.mjs';
import { renderLandingPage, renderPrivacyPage, renderTermsPage } from './portal.mjs';

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

  landingPageHtml(nonce = '') {
    return renderLandingPage({ config: this.config, publicUrl: this.publicUrl, nonce });
  }

  privacyPageHtml() {
    return renderPrivacyPage({ config: this.config, publicUrl: this.publicUrl });
  }

  termsPageHtml() {
    return renderTermsPage({ publicUrl: this.publicUrl });
  }
}
