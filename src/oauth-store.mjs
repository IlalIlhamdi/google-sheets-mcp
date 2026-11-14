import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { SignJWT, jwtVerify } from 'jose';
import { OAuthClientMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import { UserError } from './errors.mjs';

const MAX_CLIENTS = 5000;
const MAX_EPHEMERAL = 2000;
const MAX_CIMD_CACHE = 500;
const PENDING_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const CIMD_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_SEC = 3600;
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 3600;
const FORBIDDEN_REDIRECT_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    await rename(temp, path);
  } finally {
    await unlink(temp).catch(() => {});
  }
}

export async function loadOrCreateMasterKey(config) {
  if (config.tokenSecret) {
    if (config.tokenSecret.length < 16) throw new UserError('MCP_TOKEN_SECRET must be at least 16 characters.');
    return createHash('sha256').update(config.tokenSecret, 'utf8').digest();
  }
  try {
    const raw = (await readFile(config.masterKeyFile, 'utf8')).trim();
    const key = Buffer.from(raw, 'hex');
    if (key.length !== 32) throw new UserError('Invalid MCP_MASTER_KEY_FILE length.');
    return key;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const key = randomBytes(32);
    await mkdir(dirname(config.masterKeyFile), { recursive: true, mode: 0o700 });
    const temp = `${config.masterKeyFile}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, key.toString('hex'), { mode: 0o600, flag: 'wx' });
      await rename(temp, config.masterKeyFile);
    } finally {
      await unlink(temp).catch(() => {});
    }
    return key;
  }
}

export function isValidRedirectUri(value) {
  let u;
  try { u = new URL(value); } catch { return false; }
  if (FORBIDDEN_REDIRECT_SCHEMES.has(u.protocol)) return false;
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:') return LOOPBACK_HOSTS.has(u.hostname);
  return /^[a-z][a-z0-9+.-]{1,31}:$/.test(u.protocol);
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

export function isDisallowedIp(ip) {
  let addr = ip.toLowerCase();
  if (addr.startsWith('::ffff:')) {
    const v4 = addr.slice(7);
    if (isIP(v4) === 4) addr = v4;
  }
  if (isIP(addr) === 4) {
    const n = ipv4ToInt(addr);
    const inCidr = (base, bits) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    };
    return (
      inCidr('0.0.0.0', 8) || inCidr('10.0.0.0', 8) || inCidr('100.64.0.0', 10) ||
      inCidr('127.0.0.0', 8) || inCidr('169.254.0.0', 16) || inCidr('172.16.0.0', 12) ||
      inCidr('192.0.0.0', 24) || inCidr('192.0.2.0', 24) || inCidr('192.168.0.0', 16) ||
      inCidr('198.18.0.0', 15) || inCidr('198.51.100.0', 24) || inCidr('203.0.113.0', 24) ||
      inCidr('224.0.0.0', 4) || inCidr('240.0.0.0', 4)
    );
  }
  if (isIP(addr) === 6) {
    return (
      addr === '::' || addr === '::1' || addr.startsWith('fc') || addr.startsWith('fd') ||
      addr.startsWith('fe8') || addr.startsWith('fe9') || addr.startsWith('fea') || addr.startsWith('feb') ||
      addr.startsWith('ff') || addr.startsWith('2001:db8:')
    );
  }
  return true;
}

/**
 * Persistent encrypted store for multi-user Google OAuth grants, DCR/CIMD clients,
 * and signed MCP JWT issuance/revocation.
 */
export class OAuthStateStore {
  constructor({ storeFile, masterKey, fetchImpl = fetch, lookupImpl = dnsLookup }) {
    this.storeFile = storeFile;
    this.masterKey = masterKey;
    this.encKey = Buffer.from(hkdfSync('sha256', masterKey, Buffer.from('google-sheets-mcp'), Buffer.from('token-encryption-v1'), 32));
    this.jwtKey = new Uint8Array(hkdfSync('sha256', masterKey, Buffer.from('google-sheets-mcp'), Buffer.from('mcp-jwt-signing-v1'), 32));
    this.fetchImpl = fetchImpl;
    this.lookupImpl = lookupImpl;
    this.clients = new Map();
    this.users = new Map();
    this.revokedJtis = new Map();
    this.pendingAuths = new Map();
    this.authCodes = new Map();
    this.cimdCache = new Map();
    this._writeChain = Promise.resolve();
  }

  static async open(config, opts = {}) {
    const masterKey = await loadOrCreateMasterKey(config);
    const store = new OAuthStateStore({ storeFile: config.storeFile, masterKey, ...opts });
    await store.load();
    return store;
  }

  async load() {
    let raw;
    try { raw = JSON.parse(await readFile(this.storeFile, 'utf8')); }
    catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    for (const [id, client] of Object.entries(raw.clients ?? {})) this.clients.set(id, client);
    for (const [id, user] of Object.entries(raw.users ?? {})) this.users.set(id, user);
    for (const [jti, exp] of Object.entries(raw.revokedJtis ?? {})) {
      if (typeof exp === 'number' && exp > nowSec) this.revokedJtis.set(jti, exp);
    }
  }

  persist() {
    const nowSec = Math.floor(Date.now() / 1000);
    for (const [jti, exp] of this.revokedJtis) {
      if (exp <= nowSec) this.revokedJtis.delete(jti);
    }
    const snapshot = {
      version: 1,
      clients: Object.fromEntries(this.clients),
      users: Object.fromEntries(this.users),
      revokedJtis: Object.fromEntries(this.revokedJtis)
    };
    this._writeChain = this._writeChain.then(() => atomicWriteJson(this.storeFile, snapshot));
    return this._writeChain;
  }

  encryptJson(obj) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { v: 1, iv: iv.toString('base64url'), tag: tag.toString('base64url'), ct: ct.toString('base64url') };
  }

  decryptJson(blob) {
    if (!blob || blob.v !== 1) throw new UserError('Unsupported encrypted token format.');
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(blob.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64url'));
    const pt = Buffer.concat([decipher.update(Buffer.from(blob.ct, 'base64url')), decipher.final()]);
    return JSON.parse(pt.toString('utf8'));
  }

  userIdForGoogleSub(googleSub) {
    return createHmac('sha256', this.masterKey).update(`google-sub:${googleSub}`).digest('hex').slice(0, 32);
  }

  _pruneEphemeral() {
    const now = Date.now();
    for (const [k, v] of this.pendingAuths) if (now - v.createdAt > PENDING_TTL_MS) this.pendingAuths.delete(k);
    for (const [k, v] of this.authCodes) if (now - v.createdAt > CODE_TTL_MS) this.authCodes.delete(k);
    for (const [k, v] of this.cimdCache) if (now > v.expiresAt) this.cimdCache.delete(k);
  }

  createPendingAuth(data) {
    this._pruneEphemeral();
    if (this.pendingAuths.size >= MAX_EPHEMERAL) {
      const oldest = this.pendingAuths.keys().next().value;
      if (oldest) this.pendingAuths.delete(oldest);
    }
    const state = randomBytes(32).toString('base64url');
    this.pendingAuths.set(state, { ...data, createdAt: Date.now() });
    return state;
  }

  consumePendingAuth(state) {
    this._pruneEphemeral();
    if (typeof state !== 'string' || !this.pendingAuths.has(state)) return null;
    const data = this.pendingAuths.get(state);
    this.pendingAuths.delete(state);
    return data;
  }

  createAuthCode(data) {
    this._pruneEphemeral();
    if (this.authCodes.size >= MAX_EPHEMERAL) {
      const oldest = this.authCodes.keys().next().value;
      if (oldest) this.authCodes.delete(oldest);
    }
    const code = randomBytes(32).toString('base64url');
    this.authCodes.set(code, { ...data, createdAt: Date.now() });
    return code;
  }

  peekAuthCode(code) {
    this._pruneEphemeral();
    return typeof code === 'string' ? this.authCodes.get(code) ?? null : null;
  }

  consumeAuthCode(code) {
    this._pruneEphemeral();
    if (typeof code !== 'string' || !this.authCodes.has(code)) return null;
    const data = this.authCodes.get(code);
    this.authCodes.delete(code);
    return data;
  }

  async registerClient(clientMetadata) {
    if (!Array.isArray(clientMetadata.redirect_uris) || !clientMetadata.redirect_uris.length) {
      throw new UserError('Client registration requires at least one redirect_uri.');
    }
    if (!clientMetadata.redirect_uris.every(isValidRedirectUri)) {
      throw new UserError('Unsupported redirect_uri scheme.');
    }
    if (this.clients.size >= MAX_CLIENTS) {
      let oldestId = null, oldestAt = Infinity;
      for (const [id, entry] of this.clients) {
        if ((entry.lastUsedAt ?? 0) < oldestAt) { oldestAt = entry.lastUsedAt ?? 0; oldestId = id; }
      }
      if (oldestId) this.clients.delete(oldestId);
    }
    const record = { ...clientMetadata, lastUsedAt: Date.now() };
    this.clients.set(record.client_id, record);
    await this.persist();
    return clientMetadata;
  }

  async getClient(clientId) {
    if (typeof clientId !== 'string' || !clientId) return undefined;
    const existing = this.clients.get(clientId);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing;
    }
    if (clientId.startsWith('https://')) {
      return this.fetchCimdClient(clientId);
    }
    return undefined;
  }

  async fetchCimdClient(clientId) {
    this._pruneEphemeral();
    const cached = this.cimdCache.get(clientId);
    if (cached && cached.expiresAt > Date.now()) return cached.client;
    let url;
    try { url = new URL(clientId); } catch { return undefined; }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.pathname === '/') return undefined;
    if (isIP(url.hostname) && isDisallowedIp(url.hostname)) return undefined;
    try {
      const addresses = await this.lookupImpl(url.hostname, { all: true });
      if (!addresses.length || addresses.some(a => isDisallowedIp(a.address))) return undefined;
      const res = await this.fetchImpl(clientId, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) return undefined;
      const text = await res.text();
      if (Buffer.byteLength(text, 'utf8') > 32768) return undefined;
      const raw = JSON.parse(text);
      if (raw?.client_id !== clientId) return undefined;
      const parsed = OAuthClientMetadataSchema.safeParse(raw);
      if (!parsed.success || !parsed.data.redirect_uris.length) return undefined;
      if (!parsed.data.redirect_uris.every(isValidRedirectUri)) return undefined;
      const client = { ...parsed.data, client_id: clientId, token_endpoint_auth_method: 'none' };
      delete client.client_secret;
      if (this.cimdCache.size >= MAX_CIMD_CACHE) {
        const oldest = this.cimdCache.keys().next().value;
        if (oldest) this.cimdCache.delete(oldest);
      }
      this.cimdCache.set(clientId, { client, expiresAt: Date.now() + CIMD_TTL_MS });
      return client;
    } catch {
      return undefined;
    }
  }

  async upsertUserGrant({ googleSub, email, name, tokens, driveGranted }) {
    const userId = this.userIdForGoogleSub(googleSub);
    const prev = this.users.get(userId);
    let prevTokens = {};
    if (prev?.encryptedGoogleToken) {
      try { prevTokens = this.decryptJson(prev.encryptedGoogleToken); } catch { prevTokens = {}; }
    }
    const merged = {
      refresh_token: tokens.refresh_token || prevTokens.refresh_token,
      access_token: tokens.access_token || prevTokens.access_token,
      expiry_date: tokens.expiry_date ?? prevTokens.expiry_date
    };
    if (!merged.refresh_token) throw new UserError('Google did not issue a refresh token. Please revoke and reconnect.');
    const now = Date.now();
    this.users.set(userId, {
      email: email ?? prev?.email ?? '',
      name: name ?? prev?.name ?? '',
      driveGranted: driveGranted ?? prev?.driveGranted ?? false,
      tokenVersion: prev?.tokenVersion ?? 1,
      encryptedGoogleToken: this.encryptJson(merged),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now
    });
    await this.persist();
    return userId;
  }

  async updateUserTokens(userId, tokens) {
    const user = this.users.get(userId);
    if (!user) return;
    const prev = this.decryptJson(user.encryptedGoogleToken);
    const updated = {
      refresh_token: tokens.refresh_token || prev.refresh_token,
      access_token: tokens.access_token || prev.access_token,
      expiry_date: tokens.expiry_date ?? prev.expiry_date
    };
    user.encryptedGoogleToken = this.encryptJson(updated);
    user.updatedAt = Date.now();
    await this.persist();
  }

  getUserGrant(userId) {
    const user = this.users.get(userId);
    if (!user?.encryptedGoogleToken) return null;
    return { ...user, tokens: this.decryptJson(user.encryptedGoogleToken) };
  }

  async signTokenPair({ issuer, audience, userId, clientId, scopes }) {
    const user = this.users.get(userId);
    if (!user) throw new UserError('User grant not found.');
    const scopeStr = scopes.join(' ');
    const accessToken = await new SignJWT({ typ: 'at', cid: clientId, scope: scopeStr })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
      .sign(this.jwtKey);
    const refreshToken = await new SignJWT({ typ: 'rt', cid: clientId, scope: scopeStr, tv: user.tokenVersion })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${REFRESH_TOKEN_TTL_SEC}s`)
      .sign(this.jwtKey);
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SEC,
      refresh_token: refreshToken,
      scope: scopeStr
    };
  }

  async verifyJwt(token, { issuer, expectedTyp }) {
    const { payload } = await jwtVerify(token, this.jwtKey, {
      issuer,
      algorithms: ['HS256'],
      requiredClaims: ['exp', 'sub', 'iat', 'jti', 'aud'],
      clockTolerance: 5
    });
    if (payload.typ !== expectedTyp) throw new Error('Wrong token type.');
    if (payload.jti && this.revokedJtis.has(payload.jti)) throw new Error('Token revoked.');
    const user = this.users.get(payload.sub);
    if (!user) throw new Error('User grant missing.');
    if (expectedTyp === 'rt' && payload.tv !== user.tokenVersion) throw new Error('Refresh token revoked.');
    return { payload, user };
  }

  async revokeToken({ token, issuer, clientId }) {
    try {
      const { payload } = await jwtVerify(token, this.jwtKey, { issuer, algorithms: ['HS256'] });
      if (payload.cid !== clientId) return;
      if (payload.typ === 'at' && payload.jti && typeof payload.exp === 'number') {
        this.revokedJtis.set(payload.jti, payload.exp);
        await this.persist();
      } else if (payload.typ === 'rt') {
        const user = this.users.get(payload.sub);
        if (user) {
          user.tokenVersion += 1;
          await this.persist();
        }
      }
    } catch {
      // Per RFC 7009, invalid or already-revoked tokens succeed without leaking state.
    }
  }
}
