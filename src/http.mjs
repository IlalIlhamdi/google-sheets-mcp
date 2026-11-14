import { randomBytes } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createOAuthMetadata, mcpAuthMetadataRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { metadataHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/metadata.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { createMcpServer } from './mcp.mjs';
import { validateRemote } from './config.mjs';
import { UserError } from './errors.mjs';

export function tokenVerifier(config, key = createRemoteJWKSet(new URL(config.jwksUri))) {
  return async token => {
    const { payload } = await jwtVerify(token, key, { issuer:config.issuer, audience:config.publicUrl,
      algorithms:['RS256','ES256'], requiredClaims:['exp','sub','iat'], clockTolerance:5 });
    if (!config.subjects.has(payload.sub)) throw new UserError('Subject denied.');
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ') : [];
    if (!scopes.includes(config.scope)) throw new UserError('Scope denied.');
    return payload;
  };
}

export async function checkProvider(config) {
  const issuer = new URL(config.issuer);
  // OIDC discovery is required for external-oidc mode; URLs are operator configuration only.
  const discovery = new URL(`${issuer.pathname.replace(/\/$/, '')}/.well-known/openid-configuration`, issuer.origin);
  const response = await fetch(discovery, { signal:AbortSignal.timeout(15000), redirect:'error' });
  if (!response.ok) throw new UserError('Cannot fetch OAuth provider discovery.');
  const metadata = await response.json();
  if (metadata.issuer !== config.issuer || metadata.jwks_uri !== config.jwksUri || !metadata.code_challenge_methods_supported?.includes('S256'))
    throw new UserError('Provider issuer/JWKS mismatch or missing advertised S256 PKCE. Check provider discovery.');
  for (const field of ['authorization_endpoint','token_endpoint']) {
    if (!metadata[field]?.startsWith('https://')) throw new UserError('Provider requires HTTPS OAuth endpoints.');
  }
  return metadata;
}

function isAllowedMcpOrigin(origin, config, exactOrigins) {
  if (exactOrigins.has(origin)) return true;
  if (config.origins.size === 0 && config.allowAnyHttpsOrigin) {
    return origin.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
  }
  return false;
}

function createMcpRateLimiter(perKeyLimit, globalLimit) {
  const buckets = new Map();
  let globalWindow = Date.now(), globalCount = 0;
  return (req, res, next) => {
    const now = Date.now();
    if (now - globalWindow > 60000) {
      globalWindow = now;
      globalCount = 0;
      for (const [k, b] of buckets) if (now - b.start > 60000) buckets.delete(k);
    }
    if (++globalCount > globalLimit) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error:'Rate limit' });
    }
    const key = req.ip || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > 60000) {
      if (!bucket && buckets.size >= 10000) {
        const oldest = buckets.keys().next().value;
        if (oldest) buckets.delete(oldest);
      }
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    if (++bucket.count > perKeyLimit) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error:'Rate limit' });
    }
    next();
  };
}

function mountMcpEndpoint(app, config, { metadataUrl, publicUrl, authMiddleware, serviceResolver }) {
  const exactOrigins = new Set([publicUrl.origin, ...config.origins]);
  const limit = config.authMode === 'multiuser'
    ? createMcpRateLimiter(120, 2000)
    : createMcpRateLimiter(120, 120);

  app.use('/mcp', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !isAllowedMcpOrigin(origin, config, exactOrigins)) {
      return res.status(403).json({ error:'Origin denied' });
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id');
      res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Protocol-Version, MCP-Session-Id');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use('/mcp', limit);
  app.use('/mcp', authMiddleware);
  app.post('/mcp', express.json({ limit:'256kb', strict:true }), async (req, res) => {
    const server = createMcpServer(config, serviceResolver, { remote:true });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator:undefined, enableJsonResponse:true });
    res.on('close', () => { void server.close().catch(() => {}); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ jsonrpc:'2.0', id:null, error:{ code:-32603, message:'MCP request failed' } });
      await server.close().catch(() => {});
    }
  });
  app.all('/mcp', (_req, res) => { res.setHeader('Allow', 'POST'); res.sendStatus(405); });
}

export function createHttpApp(config, serviceOrProvider, verify = config.authMode === 'external-oidc' ? tokenVerifier(config) : null) {
  validateRemote(config);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  const publicUrl = new URL(config.publicUrl);
  const metadataUrl = `${publicUrl.origin}/.well-known/oauth-protected-resource/mcp`;
  const hosts = new Set([publicUrl.host, `127.0.0.1:${config.port}`, `localhost:${config.port}`]);

  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!hosts.has(req.headers.host)) return res.status(403).json({ error:'Host denied' });
    next();
  });

  app.get('/healthz', (_req, res) => res.json({
    status:'ok',
    authMode:config.authMode,
    writesEnabled:config.writes,
    googleConnection:config.authMode === 'multiuser' ? 'per-user-oauth' : 'not-checked'
  }));

  if (config.authMode === 'multiuser') {
    const provider = serviceOrProvider;
    const issuerUrl = new URL(publicUrl.origin);
    const oauthMetadata = {
      ...createOAuthMetadata({ provider, issuerUrl, scopesSupported:[config.scope] }),
      client_id_metadata_document_supported: true
    };
    const sendHtml = (res, html, nonce = '') => {
      const csp = nonce
        ? `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'self'; form-action 'none'`
        : "default-src 'none'; style-src 'unsafe-inline'; base-uri 'self'; form-action 'none'";
      res.setHeader('Content-Security-Policy', csp);
      return res.type('html').send(html);
    };
    app.get('/', (req, res) => {
      if (req.accepts(['html', 'json']) === 'json') {
        return res.json({ name:'google-sheets-mcp', mcpEndpoint:config.publicUrl, authMode:'multiuser', writesEnabled:config.writes });
      }
      const nonce = randomBytes(16).toString('base64');
      return sendHtml(res, provider.landingPageHtml(nonce), nonce);
    });
    app.get('/privacy', (_req, res) => sendHtml(res, provider.privacyPageHtml()));
    app.get('/terms', (_req, res) => sendHtml(res, provider.termsPageHtml()));
    app.use(mcpAuthMetadataRouter({
      oauthMetadata,
      resourceServerUrl: publicUrl,
      scopesSupported: [config.scope],
      resourceName: 'Google Sheets MCP'
    }));
    app.use('/.well-known/oauth-protected-resource', metadataHandler({
      resource: config.publicUrl,
      authorization_servers: [oauthMetadata.issuer],
      scopes_supported: [config.scope],
      resource_name: 'Google Sheets MCP',
      bearer_methods_supported: ['header']
    }));
    app.use(new URL(oauthMetadata.authorization_endpoint).pathname, authorizationHandler({ provider }));
    app.use(new URL(oauthMetadata.token_endpoint).pathname, tokenHandler({ provider }));
    app.use(new URL(oauthMetadata.registration_endpoint).pathname, clientRegistrationHandler({ clientsStore: provider.clientsStore }));
    app.use(new URL(oauthMetadata.revocation_endpoint).pathname, revocationHandler({ provider }));
    app.get('/oauth/google/callback', (req, res) => { void provider.handleGoogleCallback(req, res); });

    mountMcpEndpoint(app, config, {
      metadataUrl,
      publicUrl,
      authMiddleware: requireBearerAuth({
        verifier: provider,
        requiredScopes: [config.scope],
        resourceMetadataUrl: metadataUrl,
        expectedResource: publicUrl
      }),
      serviceResolver: extra => provider.serviceForUser(extra?.authInfo?.extra?.userId)
    });
  } else {
    const exactOrigins = new Set([publicUrl.origin, ...config.origins]);
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && !exactOrigins.has(origin)) return res.status(403).json({ error:'Origin denied' });
      next();
    });
    app.use(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], cors());
    app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (_req, res) => res.json({
      resource:config.publicUrl, authorization_servers:[config.issuer], scopes_supported:[config.scope], bearer_methods_supported:['header']
    }));
    const authMiddleware = async (req, res, next) => {
      const challenge = `Bearer resource_metadata="${metadataUrl}", scope="${config.scope}"`;
      const header = req.headers.authorization;
      if (typeof header !== 'string' || !/^Bearer [^\s]{1,16384}$/.test(header)) {
        res.setHeader('WWW-Authenticate', challenge);
        return res.status(401).json({ error:'Authentication required' });
      }
      try { await verify(header.slice(7)); next(); }
      catch {
        res.setHeader('WWW-Authenticate', `${challenge}, error="invalid_token"`);
        res.status(401).json({ error:'Invalid or unauthorized token' });
      }
    };
    mountMcpEndpoint(app, config, {
      metadataUrl,
      publicUrl,
      authMiddleware,
      serviceResolver: serviceOrProvider
    });
  }

  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error.type === 'entity.too.large') return res.status(413).json({ error:'Request body too large' });
    if (error instanceof SyntaxError || error.type === 'entity.parse.failed') return res.status(400).json({ error:'Invalid request body' });
    res.status(500).json({ error:'Internal server error' });
  });
  return app;
}
