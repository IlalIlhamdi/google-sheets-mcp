export const ID = '1abcdefghijklmnopqrstuvwxyz_0123456789';
export function config(overrides = {}) {
  return { ids:new Set([ID]), writes:true, scopeMode:'readwrite', maxCells:5000, maxResponseBytes:200000,
    port:3000, publicUrl:'https://sheets.example.com/mcp', issuer:'https://auth.example.com/realms/sheets',
    jwksUri:'https://auth.example.com/realms/sheets/protocol/openid-connect/certs', scope:'sheets:mcp',
    subjects:new Set(['owner-123']), origins:new Set(), ...overrides };
}
export function fakeApi() {
  const calls = [];
  const record = (method, data) => async (args, options) => { calls.push({ method, args, options }); return { data }; };
  return { calls, spreadsheets:{
    get:record('get',{ spreadsheetId:ID, properties:{ title:'Fixture',locale:'en_US' }, sheets:[{ properties:{ sheetId:0,title:"Owner's Data",gridProperties:{rowCount:1000,columnCount:26} } }] }),
    batchUpdate:record('batchUpdate',{ replies:[{ addSheet:{ properties:{ sheetId:1,title:'New' } } }] }),
    values:{ get:record('values.get',{ range:"'Owner''s Data'!A1",values:[['fixture']] }),
      update:record('update',{ updatedCells:1 }), append:record('append',{ updates:{updatedRows:1} }) }
  } };
}
