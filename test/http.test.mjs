import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { generateKeyPair, SignJWT } from 'jose';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpApp, tokenVerifier } from '../src/http.mjs';
import { SheetsService } from '../src/sheets.mjs';
import { config, fakeApi, ID } from './helpers.mjs';

test('JWT validation rejects wrong issuer/audience/scope/subject/expiry/signature', async () => {
  const c = config(), keys = await generateKeyPair('RS256');
  const verify = tokenVerifier(c,keys.publicKey);
  const sign = (claims = {},key=keys.privateKey) => new SignJWT({scope:c.scope,...claims}).setProtectedHeader({alg:'RS256'})
    .setIssuer(claims.iss ?? c.issuer).setAudience(claims.aud ?? c.publicUrl).setSubject(claims.sub ?? 'owner-123')
    .setIssuedAt().setExpirationTime(claims.exp ?? '5m').sign(key);
  await verify(await sign());
  for (const claims of [{iss:'https://evil.example'},{aud:'https://wrong.example'},{scope:'openid'},{sub:'stranger'},{exp:1}])
    await assert.rejects(verify(await sign(claims)));
  const other = await generateKeyPair('RS256'); await assert.rejects(verify(await sign({},other.privateKey)));
});
test('real HTTP metadata, 401 challenge, Host/Origin checks, and authenticated MCP calls', async t => {
  const keys = await generateKeyPair('RS256'), c = config();
  const listener = await new Promise(resolve => { const server = createServer().listen(0,'127.0.0.1',()=>resolve(server)); });
  c.port = listener.address().port;
  listener.on('request',createHttpApp(c,new SheetsService(c,fakeApi()),tokenVerifier(c,keys.publicKey)));
  t.after(() => new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); }));
  const base = `http://127.0.0.1:${listener.address().port}`;
  const headers = {};
  const meta = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`,{headers});
  assert.equal((await meta.json()).resource,c.publicUrl);
  const denied = await fetch(`${base}/mcp`,{method:'POST',headers});
  assert.equal(denied.status,401); assert.match(denied.headers.get('www-authenticate'),/resource_metadata/);
  assert.equal((await fetch(`${base}/mcp`,{headers:{...headers,Origin:'https://evil.example'}})).status,403);
  const badHostStatus = await new Promise((resolve,reject) => {
    get(`${base}/mcp`,{headers:{Host:'evil.example'}},res => { res.resume(); resolve(res.statusCode); }).on('error',reject);
  });
  assert.equal(badHostStatus,403);
  const token = await new SignJWT({scope:c.scope}).setProtectedHeader({alg:'RS256'}).setIssuer(c.issuer)
    .setAudience(c.publicUrl).setSubject('owner-123').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
  const client = new Client({name:'http-test',version:'1'}); t.after(()=>client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`),{requestInit:{headers:{...headers,Authorization:`Bearer ${token}`}}}));
  assert.equal((await client.listTools()).tools.length,7);
  const read = await client.callTool({name:'read_sheet',arguments:{spreadsheetId:ID,sheet:'Data',range:'A1'}});
  assert.ok(!read.isError);
  assert.equal((await fetch(`${base}/mcp`,{method:'DELETE',headers:{...headers,Authorization:`Bearer ${token}`}})).status,405);
});
