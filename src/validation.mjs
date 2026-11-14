import { UserError } from './errors.mjs';
import { validId } from './config.mjs';

export function spreadsheetCandidate(input) {
  if (validId(input)) return input;
  let url;
  try { url = new URL(input); } catch { throw new UserError('Use a spreadsheet ID or docs.google.com/spreadsheets/d/... URL.'); }
  const match = /^\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,200})(?:\/|$)/.exec(url.pathname);
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !match)
    throw new UserError('A Drive file URL is not proof of a spreadsheet. Open/convert the file in Google Sheets and copy its Sheets URL.');
  return match[1];
}
export function sheetTitle(title) {
  if (typeof title !== 'string' || !title.trim() || title.length > 100 || /[\x00-\x1f:\\/?*\[\]]/.test(title))
    throw new UserError('Invalid tab name (1-100 characters; no : \\ / ? * [ ] or control characters).');
  return title;
}
const column = text => [...text].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
export function bounds(range, maxCells) {
  const match = /^([A-Z]{1,3})([1-9][0-9]*)(?::([A-Z]{1,3})([1-9][0-9]*))?$/.exec(range);
  if (!match) throw new UserError('Use a bounded A1 range such as A1 or A1:D20, without a tab name.');
  const c1 = column(match[1]), r1 = Number(match[2]);
  const c2 = column(match[3] ?? match[1]), r2 = Number(match[4] ?? match[2]);
  if (c1 > c2 || r1 > r2 || c2 > 18278 || r2 > 10000000 || (c2 - c1 + 1) * (r2 - r1 + 1) > maxCells)
    throw new UserError('Range is reversed, outside Sheets limits, or exceeds MAX_CELLS.');
  return { rows: r2-r1+1, columns: c2-c1+1 };
}
export function a1(sheet, range, maxCells) {
  sheetTitle(sheet); bounds(range, maxCells);
  return `'${sheet.replaceAll("'", "''")}'!${range}`;
}
export function matrix(values, maxCells) {
  if (!Array.isArray(values) || !values.length || !Array.isArray(values[0]) || !values[0].length)
    throw new UserError('values must be a non-empty rectangular array.');
  const width = values[0].length;
  if (width * values.length > maxCells || values.some(row => !Array.isArray(row) || row.length !== width))
    throw new UserError('values must be rectangular and within MAX_CELLS.');
  for (const row of values) for (const cell of row) {
    if (!['string','number','boolean'].includes(typeof cell) || (typeof cell === 'number' && !Number.isFinite(cell)))
      throw new UserError('Cells must be strings, finite numbers, or booleans. Use an empty string to clear a cell.');
    if (typeof cell === 'string' && cell.length > 10000) throw new UserError('Cell text exceeds 10000 characters.');
  }
  if (Buffer.byteLength(JSON.stringify(values)) > 200000) throw new UserError('Write payload exceeds 200000 bytes.');
  return { rows: values.length, columns: width };
}
