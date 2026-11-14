import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';
import { ROOT } from '../src/config.mjs';
const client = new Client({ name:'sheets-smoke', version:'1.0.0' });
try {
  await client.connect(new StdioClientTransport({ command:process.execPath, args:[resolve(ROOT,'src/index.mjs')], stderr:'inherit' }));
  const tools = await client.listTools();
  console.log('MCP tools:', tools.tools.map(x => x.name).join(', '));
  const call = async (name,args) => {
    const result = await client.callTool({ name, arguments:args });
    if (result.isError) throw new Error(result.content[0]?.text);
    return JSON.parse(result.content[0].text);
  };
  const { spreadsheetIds } = await call('list_spreadsheets', {});
  for (const spreadsheetId of spreadsheetIds) {
    const tabs = await call('list_tabs', { spreadsheetId });
    const first = tabs.sheets.find(x => x.properties.gridProperties);
    if (first) await call('read_sheet', { spreadsheetId, sheet:first.properties.title, range:'A1' });
    console.log(`PASS: list_tabs + read_sheet for ${spreadsheetId} (cell contents not printed)`);
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { await client.close(); }
