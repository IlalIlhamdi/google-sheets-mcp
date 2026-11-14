import { loadConfig, requireIds, validateRemote } from './config.mjs';
import { authorize, googleAuth, revoke, scopeFor } from './google-auth.mjs';
import { googleApi, metadata } from './sheets.mjs';
import { spreadsheetCandidate } from './validation.mjs';
import { checkProvider } from './http.mjs';
import { OAuthStateStore } from './oauth-store.mjs';
import { MultiUserGoogleProvider } from './multiuser-auth.mjs';
import { safeError, UserError } from './errors.mjs';

try {
  const config = loadConfig(), command = process.argv[2];
  if (command === 'auth') await authorize(config);
  else if (command === 'revoke') await revoke(config);
  else if (command === 'verify') {
    const id = spreadsheetCandidate(process.argv[3] ?? '');
    // Explicit operator command, not an MCP tool: candidate lookup before adding allowlist.
    const data = await metadata(googleApi(await googleAuth(config)), id);
    console.log(JSON.stringify({ verified:true, spreadsheetId:data.spreadsheetId, title:data.properties?.title,
      spreadsheetUrl:data.spreadsheetUrl, next:'Put this verified ID in ALLOWED_SPREADSHEET_IDS.' }, null, 2));
  } else if (command === 'doctor') {
    const remote = process.argv.includes('--remote');
    if (remote && config.authMode === 'multiuser') {
      validateRemote(config);
      const store = await OAuthStateStore.open(config);
      await store.persist();
      const provider = new MultiUserGoogleProvider(config, store);
      console.log(JSON.stringify({
        ok: true,
        authMode: 'multiuser',
        publicUrl: config.publicUrl,
        googleRedirectUri: provider.googleCallbackUri,
        scopeMode: config.scopeMode,
        writesEnabled: config.writes,
        driveListEnabled: config.driveListEnabled,
        registeredClients: store.clients.size,
        authorizedUsers: store.users.size
      }, null, 2));
    } else {
      requireIds(config);
      const auth = await googleAuth(config);
      const { token } = await auth.getAccessToken();
      const info = await auth.getTokenInfo(token);
      if (!info.scopes.includes(scopeFor(config.scopeMode))) throw new UserError('Required scope missing. Reauthorize.');
      const api = googleApi(auth);
      for (const id of config.ids) {
        const data = await metadata(api, id);
        console.log(JSON.stringify({ spreadsheetId:id, ok:true, title:data.properties?.title, tabs:data.sheets?.map(x => x.properties.title) }));
      }
      if (remote) { validateRemote(config); await checkProvider(config); console.log('OAuth provider discovery: OK. User login and ChatGPT connection still require an end-to-end test.'); }
      console.log('Read-only connection check passed. No cells modified.');
    }
  } else throw new UserError('Commands: auth | verify <ID-or-Sheets-URL> | doctor [--remote] | revoke');
} catch (error) { console.error(safeError(error)); process.exitCode = 1; }
