// Test-only subprocess. Production entrypoint never imports this fixture.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../../src/mcp.mjs';
import { SheetsService } from '../../src/sheets.mjs';
import { config, fakeApi } from '../helpers.mjs';
const settings = config({writes:process.argv.includes('--writes')});
await createMcpServer(settings,new SheetsService(settings,fakeApi())).connect(new StdioServerTransport());
