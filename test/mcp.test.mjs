import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { ID } from './helpers.mjs';

for (const writes of [false,true]) test(`real stdio handshake and tools with writes=${writes}`, async t => {
  const client = new Client({name:'test',version:'1'});
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command:process.execPath,
    args:[fileURLToPath(new URL('./fixtures/stdio-server.mjs',import.meta.url)),...(writes?['--writes']:[])], cwd:tmpdir(),stderr:'pipe' }));
  const list = await client.listTools();
  assert.equal(list.tools.length,writes?7:3);
  const read = await client.callTool({name:'read_sheet',arguments:{spreadsheetId:ID,sheet:'Data',range:'A1'}});
  assert.ok(!read.isError); assert.deepEqual(JSON.parse(read.content[0].text).values,[['fixture']]);
  const denied = await client.callTool({name:'list_tabs',arguments:{spreadsheetId:'0'.repeat(30)}});
  assert.equal(denied.isError,true);
  if (writes) {
    assert.equal(list.tools.find(x => x.name==='append_rows').annotations.idempotentHint,false);
    const invalid = await client.callTool({name:'write_cells',arguments:{spreadsheetId:ID,sheet:'Data',range:'A1',values:[[1]]}});
    assert.equal(invalid.isError,true);
    const success = await client.callTool({name:'set_formula',arguments:{spreadsheetId:ID,sheet:'Data',cell:'A1',formula:'=1',confirm:true}});
    assert.ok(!success.isError);
  }
});
