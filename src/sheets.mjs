import { sheets } from '@googleapis/sheets';
import { assertAllowed } from './config.mjs';
import { a1, bounds, matrix, sheetTitle, spreadsheetCandidate } from './validation.mjs';
import { UserError } from './errors.mjs';

export const googleApi = auth => sheets({ version:'v4', auth });
const requestOptions = { timeout:20000, retry:false };
async function readRequest(fn) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt >= 2 || ![429,500,502,503,504].includes(Number(e?.response?.status))) throw e;
      await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt + Math.random() * 100));
    }
  }
}
export async function metadata(api, id) {
  const { data } = await readRequest(() => api.spreadsheets.get({ spreadsheetId:id,
    fields:'spreadsheetId,spreadsheetUrl,properties(title,locale),sheets(properties(sheetId,title,index,gridProperties))'
  }, requestOptions));
  if (data.spreadsheetId !== id) throw new UserError('Google did not confirm this spreadsheet ID.');
  return data;
}
export class SheetsService {
  constructor(config, api, { auth = null, driveEnabled = false, fetchImpl = fetch } = {}) {
    this.config = config;
    this.api = api;
    this.auth = auth;
    this.driveEnabled = driveEnabled;
    this.fetchImpl = fetchImpl;
  }
  resolveId(input) {
    const id = typeof input === 'string' && input.startsWith('https://') ? spreadsheetCandidate(input) : input;
    assertAllowed(this.config, id);
    return id;
  }
  allowed(id) { assertAllowed(this.config, id); }
  writable(input, confirm) {
    const id = this.resolveId(input);
    if (!this.config.writes) throw new UserError('Writes disabled. Enable readwrite scope and ENABLE_WRITES, then authorize again.');
    if (confirm !== true) throw new UserError('Set confirm=true only after the user authorizes this exact change.');
    return id;
  }
  async listSpreadsheets({ query = '', maxResults = 20 } = {}) {
    if (this.config.authMode !== 'multiuser' || this.config.ids.size > 0) {
      return { spreadsheetIds:[...this.config.ids], writesEnabled:this.config.writes };
    }
    if (!this.driveEnabled || !this.auth) {
      return { spreadsheetIds:[], spreadsheets:[], writesEnabled:this.config.writes,
        note:'Drive listing permission is not enabled. Pass a spreadsheet ID or Google Sheets URL directly to list_tabs or read_sheet.' };
    }
    const { token } = await this.auth.getAccessToken();
    if (!token) throw new UserError('Google authorization expired. Reconnect this MCP server.');
    const safeQuery = String(query ?? '').trim().slice(0, 120).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
    let q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
    if (safeQuery) q += ` and name contains '${safeQuery}'`;
    const params = new URLSearchParams({
      q,
      pageSize: String(Math.min(Math.max(Number(maxResults) || 20, 1), 50)),
      orderBy: 'modifiedTime desc',
      fields: 'files(id,name,modifiedTime,webViewLink)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    });
    const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      const err = new Error('Google Drive list failed.');
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const files = (data.files ?? []).map(f => ({
      spreadsheetId: f.id,
      title: f.name,
      modifiedTime: f.modifiedTime,
      url: f.webViewLink
    }));
    return {
      spreadsheetIds: files.map(f => f.spreadsheetId),
      spreadsheets: files,
      writesEnabled: this.config.writes
    };
  }
  async listTabs({ spreadsheetId }) {
    const id = this.resolveId(spreadsheetId);
    return metadata(this.api, id);
  }
  async readSheet({ spreadsheetId, sheet, range, render = 'FORMATTED_VALUE' }) {
    const id = this.resolveId(spreadsheetId);
    const fullRange = a1(sheet, range, this.config.maxCells);
    if (!['FORMATTED_VALUE','UNFORMATTED_VALUE','FORMULA'].includes(render)) throw new UserError('Invalid render mode.');
    const { data } = await readRequest(() => this.api.spreadsheets.values.get({ spreadsheetId:id,
      range:fullRange, valueRenderOption:render, dateTimeRenderOption:'SERIAL_NUMBER', majorDimension:'ROWS'
    }, requestOptions));
    return { ...data, values:data.values ?? [] };
  }
  async writeCells({ spreadsheetId, sheet, range, values, confirm }) {
    const id = this.writable(spreadsheetId, confirm);
    const fullRange = a1(sheet, range, this.config.maxCells);
    const size = matrix(values, this.config.maxCells), target = bounds(range, this.config.maxCells);
    if (size.rows !== target.rows || size.columns !== target.columns) throw new UserError('Matrix dimensions must exactly match the destination range.');
    const { data } = await this.api.spreadsheets.values.update({ spreadsheetId:id, range:fullRange,
      valueInputOption:'RAW', requestBody:{ values }, includeValuesInResponse:false
    }, requestOptions);
    return data;
  }
  async appendRows({ spreadsheetId, sheet, tableRange, values, confirm }) {
    const id = this.writable(spreadsheetId, confirm);
    const fullRange = a1(sheet, tableRange, this.config.maxCells);
    const size = matrix(values, this.config.maxCells), table = bounds(tableRange, this.config.maxCells);
    if (size.columns > table.columns) throw new UserError('Appended row is wider than tableRange.');
    const { data } = await this.api.spreadsheets.values.append({ spreadsheetId:id, range:fullRange,
      valueInputOption:'RAW', insertDataOption:'INSERT_ROWS', includeValuesInResponse:false, requestBody:{ values }
    }, requestOptions);
    return data;
  }
  async createTab({ spreadsheetId, title, confirm }) {
    const id = this.writable(spreadsheetId, confirm); sheetTitle(title);
    const { data } = await this.api.spreadsheets.batchUpdate({ spreadsheetId:id,
      requestBody:{ requests:[{ addSheet:{ properties:{ title, gridProperties:{ rowCount:1000, columnCount:26 } } } }] }
    }, requestOptions);
    return { spreadsheetId:id, properties:data.replies?.[0]?.addSheet?.properties };
  }
  async setFormula({ spreadsheetId, sheet, cell, formula, confirm }) {
    const id = this.writable(spreadsheetId, confirm);
    if (!/^[A-Z]{1,3}[1-9][0-9]*$/.test(cell)) throw new UserError('Formula destination must be one cell.');
    if (typeof formula !== 'string' || !formula.startsWith('=') || formula.length > 10000)
      throw new UserError('Formula must start with = and be at most 10000 characters.');
    const fullRange = a1(sheet, cell, 1);
    const { data } = await this.api.spreadsheets.values.update({ spreadsheetId:id, range:fullRange,
      valueInputOption:'USER_ENTERED', requestBody:{ values:[[formula]] }, includeValuesInResponse:false
    }, requestOptions);
    return data;
  }
}
