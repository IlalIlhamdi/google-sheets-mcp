import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';
import { ROOT, loadConfig, assertAllowed } from '../src/config.mjs';

const id = process.argv[2];
if (!id || !process.argv.includes('--confirm')) {
  console.error('Usage: npm run smoke:write -- <ALLOWLISTED_SPREADSHEET_ID> --confirm\nCreates and leaves one MCP_Test_* tab. Use a disposable spreadsheet.');
  process.exit(1);
}
const config = loadConfig(); assertAllowed(config,id);
if (!config.writes) { console.error('Writes disabled. Configure readwrite OAuth first.'); process.exit(1); }
const client = new Client({ name:'sheets-write-test', version:'1.0.0' });
const sheet = `MCP_Test_${Date.now()}`;
try {
  await client.connect(new StdioClientTransport({ command:process.execPath, args:[resolve(ROOT,'src/index.mjs')], stderr:'inherit' }));
  const call = async (name,args) => {
    const result = await client.callTool({ name, arguments:{ spreadsheetId:id, ...args } });
    if (result.isError) throw new Error(result.content[0]?.text);
    return JSON.parse(result.content[0].text);
  };
  await call('create_tab',{ title:sheet, confirm:true });
  await call('write_cells',{ sheet, range:'A1:B2', values:[['X','Y'],[2,3]], confirm:true });
  await call('set_formula',{ sheet, cell:'C2', formula:'=SUM(A2:B2)', confirm:true });
  await call('append_rows',{ sheet, tableRange:'A1:B1000', values:[[4,5]], confirm:true });
  const value = await call('read_sheet',{ sheet, range:'C2', render:'UNFORMATTED_VALUE' });
  assert.equal(value.values[0][0],5);
  const formula = await call('read_sheet',{ sheet, range:'C2', render:'FORMULA' });
  assert.equal(formula.values[0][0],'=SUM(A2:B2)');
  const rows = await call('read_sheet',{ sheet, range:'A3:B3', render:'UNFORMATTED_VALUE' });
  assert.deepEqual(rows.values,[[4,5]]);
  console.log(`PASS: create_tab, write_cells, append_rows, set_formula, readback. Tab retained: ${sheet}`);
} catch (e) { console.error(`Test incomplete: ${e.message}. Inspect ${sheet} before retrying.`); process.exitCode = 1; }
finally { await client.close(); }
