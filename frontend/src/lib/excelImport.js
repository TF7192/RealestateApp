import * as XLSX from 'xlsx';

// Parse an uploaded `.xlsx` / `.csv` File object into `{ headers, rows }`.
//
// Rows are plain dicts keyed by the raw header string (so the mapping
// step has stable keys to attach to). Empty trailing rows are stripped.
// Cell values stay in their native type (string / number / Date /
// boolean) — per-field normalization happens after the agent confirms
// the mapping, not here.
export async function parseSheetFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) throw new Error('הקובץ ריק או לא תקין');
  const ws = wb.Sheets[firstSheet];
  // `header: 1` gives us a 2-D array so we can extract the header row
  // exactly as typed (preserves Hebrew + spaces + ordering).
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false, defval: null });
  if (!Array.isArray(matrix) || matrix.length < 2) {
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
  return { headers, rows, sheetName: firstSheet };
}
