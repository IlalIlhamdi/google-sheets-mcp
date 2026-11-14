import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, requireIds, validateRemote } from './config.mjs';
import { googleAuth } from './google-auth.mjs';
import { googleApi, SheetsService } from './sheets.mjs';
import { createMcpServer } from './mcp.mjs';
import { checkProvider, createHttpApp } from './http.mjs';
import { OAuthStateStore } from './oauth-store.mjs';
import { MultiUserGoogleProvider } from './multiuser-auth.mjs';
import { safeError } from './errors.mjs';

try {
  const config = loadConfig();
  const remote = process.argv.includes('--http');
  if (remote) {
    validateRemote(config);
    let app;
    if (config.authMode === 'multiuser') {
      const store = await OAuthStateStore.open(config);
      const provider = new MultiUserGoogleProvider(config, store);
      app = createHttpApp(config, provider);
    } else {
      requireIds(config);
      const service = new SheetsService(config, googleApi(await googleAuth(config)));
      await checkProvider(config);
      app = createHttpApp(config, service);
    }
    const listener = app.listen(config.port, config.host, () =>
      console.error(`MCP HTTP ready (${config.authMode}) on ${config.host}:${config.port}; public URL ${config.publicUrl}`)
    );
    listener.on('error', () => { console.error('Cannot bind HTTP port.'); process.exitCode = 1; });
    const stop = () => { listener.close(); listener.closeAllConnections(); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } else {
    requireIds(config);
    const service = new SheetsService(config, googleApi(await googleAuth(config)));
    const server = createMcpServer(config, service);
    await server.connect(new StdioServerTransport());
    const stop = async () => { await server.close(); process.exit(0); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
} catch (error) { console.error(safeError(error)); process.exitCode = 1; }
