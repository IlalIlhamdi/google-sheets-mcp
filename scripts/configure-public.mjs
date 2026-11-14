import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { ROOT } from '../src/config.mjs';

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1].trim() : '';
}

function cleanSingleLine(name, value) {
  if (!value || /[\r\n]/.test(value)) {
    throw new Error(`${name} cannot be empty or contain line breaks.`);
  }
  return value.trim();
}

function normalizeDomain(input) {
  const raw = cleanSingleLine('Domain', input).replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(raw)) {
    throw new Error('Invalid domain format (expected e.g. sheets-mcp.domainanda.com).');
  }
  return raw;
}

async function promptIfEmpty(rl, current, label) {
  if (current) return current;
  return (await rl.question(`${label}: `)).trim();
}

async function main() {
  let domain = argValue('--domain');
  let clientId = argValue('--client-id');
  let clientSecret = argValue('--client-secret');
  let tunnelToken = argValue('--tunnel-token');

  if (!domain || !clientId || !clientSecret) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      domain = await promptIfEmpty(rl, domain, 'Domain publik (contoh: sheets-mcp.domainanda.com)');
      clientId = await promptIfEmpty(rl, clientId, 'GOOGLE_WEB_CLIENT_ID');
      clientSecret = await promptIfEmpty(rl, clientSecret, 'GOOGLE_WEB_CLIENT_SECRET');
      if (!tunnelToken && process.platform === 'linux') {
        tunnelToken = (await rl.question('Cloudflare Tunnel Token (kosongkan jika sudah pasang service): ')).trim();
      }
    } finally {
      rl.close();
    }
  }

  const host = normalizeDomain(domain);
  const safeClientId = cleanSingleLine('GOOGLE_WEB_CLIENT_ID', clientId);
  const safeClientSecret = cleanSingleLine('GOOGLE_WEB_CLIENT_SECRET', clientSecret);
  const publicUrl = `https://${host}/mcp`;

  mkdirSync(resolve(ROOT, '.secrets'), { recursive: true, mode: 0o700 });
  mkdirSync(resolve(ROOT, '.data'), { recursive: true, mode: 0o700 });

  const envContent = [
    'MCP_AUTH_MODE=multiuser',
    'HTTP_HOST=127.0.0.1',
    'HTTP_PORT=3000',
    'MCP_TRUST_PROXY=loopback',
    `MCP_PUBLIC_URL=${publicUrl}`,
    `GOOGLE_WEB_CLIENT_ID=${safeClientId}`,
    `GOOGLE_WEB_CLIENT_SECRET=${safeClientSecret}`,
    'GOOGLE_SCOPE_MODE=readwrite',
    'ENABLE_WRITES=true',
    'GOOGLE_DRIVE_LIST=true',
    'ALLOWED_SPREADSHEET_IDS=',
    'MCP_OAUTH_STORE_FILE=.data/oauth-store.json',
    'MCP_MASTER_KEY_FILE=.secrets/master.key',
    'MCP_REQUIRED_SCOPE=sheets:mcp',
    'MCP_ALLOW_ANY_HTTPS_ORIGIN=true',
    'MAX_CELLS=5000',
    'MAX_RESPONSE_BYTES=200000',
    ''
  ].join('\n');

  const envPath = resolve(ROOT, '.env');
  writeFileSync(envPath, envContent, { mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(envPath, 0o600);

  const doctor = spawnSync(process.execPath, [resolve(ROOT, 'src/cli.mjs'), 'doctor', '--remote'], {
    cwd: ROOT,
    stdio: 'inherit'
  });
  if (doctor.status !== 0) process.exit(doctor.status ?? 1);

  if (tunnelToken && process.platform === 'linux') {
    const safeToken = cleanSingleLine('Cloudflare Tunnel Token', tunnelToken);
    spawnSync('cloudflared', ['service', 'uninstall'], { stdio: 'ignore' });
    const cf = spawnSync('cloudflared', ['service', 'install', safeToken], { stdio: 'inherit' });
    if (cf.status !== 0) {
      console.error('Failed to install cloudflared service.');
      process.exit(cf.status ?? 1);
    }
  }

  if (process.platform === 'linux') {
    const pm2Start = spawnSync('pm2', ['startOrReload', resolve(ROOT, 'ecosystem.config.cjs')], {
      cwd: ROOT,
      stdio: 'inherit'
    });
    if (pm2Start.status !== 0) process.exit(pm2Start.status ?? 1);
    spawnSync('pm2', ['save'], { cwd: ROOT, stdio: 'inherit' });
  }

  console.log(`\nSiap! MCP Endpoint: ${publicUrl}`);
  console.log(`Pastikan Authorized Redirect URI di Google Cloud Console: https://${host}/oauth/google/callback`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
