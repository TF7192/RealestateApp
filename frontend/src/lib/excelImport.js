// Parse an uploaded `.xlsx` / `.csv` File object into `{ headers, rows }`.
//
// Rows are plain dicts keyed by the raw header string (so the mapping
// step has stable keys to attach to). Empty trailing rows are stripped.
// Cell values stay in their native type (string / number / Date /
// boolean) — per-field normalization happens after the agent confirms
// the mapping, not here.
//
// Implementation note (SEC-012): we used to use SheetJS (`xlsx`) but
// it ships two unfixed High-severity advisories with no patched npm
// release (proto pollution + ReDoS). The .xlsx path now uses exceljs
// (lazy-imported so it doesn't bloat the main bundle), and the .csv
// path uses an in-house RFC4180-ish splitter — handles quoted cells,
// embedded commas, and escaped quotes, which is all the Hebrew CRM
// importer needs. Exported signature is unchanged.

const XLSX_EXT_RE = /\.xlsx$/i;
const CSV_EXT_RE = /\.csv$/i;

export async function parseSheetFile(file) {
  const name = (file && file.name) || '';
  if (CSV_EXT_RE.test(name)) {
    return parseCsv(file);
  }
  if (XLSX_EXT_RE.test(name)) {
    return parseXlsx(file);
  }
  // Default to xlsx — keeps backwards compatibility with the previous
  // SheetJS-based parser, which auto-detected by content type.
  return parseXlsx(file);
}

// ── XLSX path ────────────────────────────────────────────────────────
async function parseXlsx(file) {
  // Lazy import: exceljs is ~250KB gzipped + only the import wizard
  // route ever needs it. The wizard itself is already lazy-loaded
  // (frontend/src/App.jsx:67) so this keeps the chunk isolated.
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = ExcelJSModule.default || ExcelJSModule;
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('הקובץ ריק או לא תקין');

  // exceljs row API is 1-indexed; row 0 is reserved for the metadata
  // sentinel. Walk via getRow so empty trailing rows don't confuse us.
  const matrix = [];
  // rowCount may include trailing blanks — we filter those below.
  for (let i = 1; i <= ws.rowCount; i += 1) {
    const row = ws.getRow(i);
    // exceljs values array is 1-indexed too (index 0 is null); slice
    // to land on a normal 0-indexed array.
    const raw = Array.isArray(row.values) ? row.values.slice(1) : [];
    matrix.push(raw.map(cellToValue));
  }
  if (matrix.length < 2) {
    throw new Error('הקובץ לא כולל שורת כותרת + שורות נתונים');
  }
  const headers = matrix[0].map((h) => (h == null ? '' : String(h).trim()));
  const rows = matrix.slice(1)
    .filter((r) => Array.isArray(r) && r.some((v) => v != null && String(v).trim() !== ''))
    .map((r) => {
      const rec = {};
      headers.forEach((h, i) => { rec[h] = r[i] ?? null; });
      return rec;
    });
  if (rows.length === 0) {
    throw new Error('הקובץ לא כולל שורת כותרת + שורות נתונים');
  }
  return { headers, rows, sheetName: ws.name };
}

// exceljs returns rich cell objects for some types (formulas, hyperlinks,
// rich text). Flatten to the same primitives SheetJS produced so the
// downstream mapping step doesn't need to special-case anything.
function cellToValue(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  // Rich text — joined runs.
  if (typeof v === 'object' && Array.isArray(v.richText)) {
    return v.richText.map((r) => r.text).join('');
  }
  // Hyperlink — keep the visible text.
  if (typeof v === 'object' && 'text' in v && typeof v.text !== 'object') {
    return v.text;
  }
  // Formula result wrapper.
  if (typeof v === 'object' && 'result' in v) {
    return v.result == null ? null : v.result;
  }
  // Error sentinel — surface as null rather than the raw enum.
  if (typeof v === 'object' && 'error' in v) return null;
  // Plain primitive.
  return v;
}

// ── CSV path ─────────────────────────────────────────────────────────
async function parseCsv(file) {
  // Read via arrayBuffer + TextDecoder so it works under jsdom too
  // (jsdom's File polyfill doesn't expose `.text()`). UTF-8 covers
  // Hebrew, which is all the CRM importer needs.
  const buf = await file.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf);
  const matrix = parseCsvText(text);
  if (matrix.length < 2) {
    throw new Error('הקובץ לא כולל שורת כותרת + שורות נתונים');
  }
  const headers = matrix[0].map((h) => (h == null ? '' : String(h).trim()));
  const rows = matrix.slice(1)
    .filter((r) => Array.isArray(r) && r.some((v) => v != null && String(v).trim() !== ''))
    .map((r) => {
      const rec = {};
      headers.forEach((h, i) => { rec[h] = r[i] ?? null; });
      return rec;
    });
  if (rows.length === 0) {
    throw new Error('הקובץ לא כולל שורת כותרת + שורות נתונים');
  }
  return { headers, rows, sheetName: 'CSV' };
}

// RFC4180-ish state-machine splitter. Handles:
//   - Quoted cells (commas + newlines inside)
//   - "" → " (escaped quote inside quoted cell)
//   - CR / LF / CRLF line endings
//   - Trailing newline at EOF (no spurious empty row)
// This is plenty for the CRM importer; we don't need a full lib.
export function parseCsvText(text) {
  if (text == null || text === '') return [];
  // Strip a leading BOM if Excel saved one.
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const out = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          // Escaped quote inside a quoted cell.
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      // Skip — handled by the \n branch (or treated as terminator if no \n follows).
      const next = text[i + 1];
      if (next !== '\n') {
        row.push(cell);
        out.push(row);
        row = [];
        cell = '';
      }
    } else if (ch === '\n') {
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  // Flush the final cell / row if the file didn't end with a newline.
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  return out;
}
