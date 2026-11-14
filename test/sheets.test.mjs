import test from 'node:test';
import assert from 'node:assert/strict';
import { SheetsService, metadata } from '../src/sheets.mjs';
import { config, fakeApi, ID } from './helpers.mjs';

test('every tool denies non-allowlisted spreadsheet before contacting Google', async () => {
  const api = fakeApi(), service = new SheetsService(config(),api);
  for (const method of ['listTabs','readSheet','writeCells','appendRows','createTab','setFormula'])
    await assert.rejects(service[method]({ spreadsheetId:'outside',confirm:true }),/not in ALLOWED/);
  assert.equal(api.calls.length,0);
});
test('read-only mode and explicit write intent are enforced in service', async () => {
  const api = fakeApi();
  await assert.rejects(new SheetsService(config({writes:false}),api).createTab({spreadsheetId:ID,title:'New',confirm:true}),/disabled/);
  await assert.rejects(new SheetsService(config(),api).createTab({spreadsheetId:ID,title:'New'}),/confirm/);
  assert.equal(api.calls.length,0);
});
test('tab quoting, formula reads, and exact RAW writes preserve spreadsheet boundaries', async () => {
  const api = fakeApi(), service = new SheetsService(config(),api);
  await service.readSheet({spreadsheetId:ID,sheet:"Owner's Data",range:'A1',render:'FORMULA'});
  assert.equal(api.calls[0].args.range,"'Owner''s Data'!A1");
  assert.equal(api.calls[0].args.valueRenderOption,'FORMULA');
  await service.writeCells({spreadsheetId:ID,sheet:'Data',range:'A1',values:[['=IMPORTXML("x","y")']],confirm:true});
  assert.equal(api.calls[1].args.valueInputOption,'RAW');
  await assert.rejects(service.writeCells({spreadsheetId:ID,sheet:'Data',range:'A1:B2',values:[[1]],confirm:true}),/exactly match/);
});
test('append, create tab, and formula map to intended API methods', async () => {
  const api = fakeApi(), service = new SheetsService(config(),api);
  await service.appendRows({spreadsheetId:ID,sheet:'Data',tableRange:'A1:B100',values:[[1,2]],confirm:true});
  await service.createTab({spreadsheetId:ID,title:'New',confirm:true});
  await service.setFormula({spreadsheetId:ID,sheet:'Data',cell:'C2',formula:'=SUM(A2:B2)',confirm:true});
  assert.deepEqual(api.calls.map(x => x.method),['append','batchUpdate','update']);
  assert.equal(api.calls[0].args.insertDataOption,'INSERT_ROWS');
  assert.equal(api.calls[2].args.valueInputOption,'USER_ENTERED');
  assert.ok(api.calls.every(x => x.options.retry === false));
  await assert.rejects(service.setFormula({spreadsheetId:ID,sheet:'Data',cell:'A1:B1',formula:'=1',confirm:true}));
});
test('ambiguous failed writes are attempted only once', async () => {
  const api = fakeApi(); let attempts = 0;
  api.spreadsheets.values.append = async () => { attempts++; throw Object.assign(new Error('network'),{response:{status:503}}); };
  const service = new SheetsService(config(),api);
  await assert.rejects(service.appendRows({spreadsheetId:ID,sheet:'Data',tableRange:'A1:B10',values:[[1,2]],confirm:true}));
  assert.equal(attempts,1);
});
test('metadata verification requires Google to return the same spreadsheet ID', async () => {
  const api = fakeApi(); await assert.rejects(metadata(api,'different-id'),/did not confirm/);
});
