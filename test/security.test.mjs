import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, validateRemote } from '../src/config.mjs';
import { spreadsheetCandidate, bounds, matrix } from '../src/validation.mjs';
import { stateMatches } from '../src/google-auth.mjs';
import { saveToken, readToken } from '../src/vault.mjs';
import { safeError } from '../src/errors.mjs';
import { config, ID } from './helpers.mjs';

test('Drive URL is rejected; Sheets URL is only a candidate until API verification', () => {
  assert.throws(() => spreadsheetCandidate('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view'));
  assert.equal(spreadsheetCandidate(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`),ID);
  assert.throws(() => spreadsheetCandidate(`https://docs.google.com.evil.test/spreadsheets/d/${ID}/edit`));
});
test('range and payload bounds reject whole columns, reversed ranges, huge cells, and ragged matrices', () => {
  for (const value of ['A:A','A1:Z99999','Z4:A1','A0','A1!B2','A99999999999999999999']) assert.throws(() => bounds(value,5000));
  assert.deepEqual(bounds('B2:C3',5000),{rows:2,columns:2});
  assert.throws(() => matrix([[1,2],[3]],5000));
  assert.throws(() => matrix([[null]],5000));
  assert.throws(() => matrix([['x'.repeat(10001)]],5000));
});
test('configuration fails closed for missing remote auth or conflicting Google scopes', () => {
  assert.throws(() => loadConfig({ MCP_ENV_FILE:'does-not-exist-test.env', ENABLE_WRITES:'true', GOOGLE_SCOPE_MODE:'readonly' }));
  assert.throws(() => validateRemote(config({ subjects:new Set() })));
  assert.throws(() => validateRemote(config({ publicUrl:'http://sheets.example.com/mcp' })));
  assert.throws(() => validateRemote(config({ publicUrl:'https://sheets.example.com/not-mcp' })));
  validateRemote(config());
});
test('OAuth callback validates state and never accepts missing state', () => {
  assert.equal(stateMatches('correct','correct'),true);
  assert.equal(stateMatches('wrong','correct'),false);
  assert.equal(stateMatches(null,'correct'),false);
});
test('provider errors never expose request tokens or raw error messages', () => {
  const error = Object.assign(new Error('SECRET_TOKEN'),{ response:{status:403,data:{token:'SECRET_TOKEN'}} });
  assert.doesNotMatch(safeError(error),/SECRET_TOKEN/);
  assert.match(safeError(error),/denied access/);
});
test('token vault round-trip and Windows DPAPI ciphertext at rest', async () => {
  const dir = await mkdtemp(join(tmpdir(),'sheets-mcp-vault-'));
  const path = join(dir,'token.json');
  const token = { refresh_token:'FAKE_TEST_REFRESH_SECRET',clientId:'test',scopeMode:'readonly' };
  try {
    await saveToken(path,token); assert.deepEqual(await readToken(path),token);
    if (process.platform === 'win32') assert.doesNotMatch(await readFile(path,'utf8'),/FAKE_TEST_REFRESH_SECRET/);
  } finally { await unlink(path).catch(() => {}); await rmdir(dir); }
});
