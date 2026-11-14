import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { UserError } from './errors.mjs';

// Windows DPAPI CurrentUser: secrets never enter command-line arguments or logs.
function dpapi(input, decrypt) {
  const operation = decrypt ? 'Unprotect' : 'Protect';
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($s); $r=[Security.Cryptography.ProtectedData]::${operation}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], { windowsHide:true, stdio:['pipe','pipe','pipe'] });
    let out = '';
    proc.stdout.on('data', chunk => { out += chunk; });
    proc.stderr.resume();
    proc.on('error', () => reject(new UserError('Windows DPAPI unavailable.')));
    proc.on('close', code => code === 0 ? resolve(Buffer.from(out.trim(), 'base64')) : reject(new UserError('Cannot access token vault. Use the same Windows account or authorize again.')));
    proc.stdin.on('error', () => {});
    proc.stdin.end(Buffer.from(input).toString('base64'));
  });
}
export async function saveToken(path, data) {
  const bytes = Buffer.from(JSON.stringify(data));
  const envelope = process.platform === 'win32'
    ? { format:'dpapi-current-user-v1', data:(await dpapi(bytes, false)).toString('base64') }
    : { format:'plaintext-posix-v1', data };
  await mkdir(dirname(path), { recursive:true, mode:0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(envelope), { mode:0o600, flag:'wx' });
    await rename(temp, path);
  } finally { await unlink(temp).catch(() => {}); }
}
export async function readToken(path) {
  let envelope;
  try { envelope = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new UserError('Google token missing or unreadable. Run npm run auth.'); }
  if (envelope.format === 'dpapi-current-user-v1' && process.platform === 'win32')
    return JSON.parse((await dpapi(Buffer.from(envelope.data, 'base64'), true)).toString('utf8'));
  if (envelope.format === 'plaintext-posix-v1' && process.platform !== 'win32') return envelope.data;
  throw new UserError('Token vault format does not match this OS. Authorize on this machine again.');
}
