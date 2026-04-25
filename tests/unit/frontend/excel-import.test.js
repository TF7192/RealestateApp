// Regression net for the spreadsheet parser. The lib was switched from
// SheetJS (xlsx) to exceljs in SEC-012 to drop two unfixed High-severity
// advisories (GHSA-4r6h-8v6p-xvw6 proto pollution + GHSA-5pgg-2g8v-p4x9
// ReDoS). The exported signature is unchanged — these tests pin it.

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseSheetFile } from '../../../frontend/src/lib/excelImport.js';

// jsdom's polyfilled File doesn't implement `.arrayBuffer()` /
// `.text()`. Real browsers (Chrome, Safari, Edge) all do — and Node 20
// does too. So in tests we use a tiny shim that mirrors the browser
// File contract: `name` + `arrayBuffer()`. The shim returns whatever
// exceljs's xlsx.load and TextDecoder both accept (Uint8Array works
// for both, ArrayBuffer subtly doesn't because jsdom + native Buffer
// straddle two `ArrayBuffer` realms).
function makeFile(content, name) {
  let u8;
  if (content instanceof Uint8Array) {
    u8 = content;
  } else if (content instanceof ArrayBuffer) {
    u8 = new Uint8Array(content);
  } else if (typeof content === 'string') {
    u8 = new TextEncoder().encode(content);
  } else if (content && typeof content === 'object' && 'buffer' in content) {
    // Node Buffer — already a Uint8Array subclass.
    u8 = content;
  } else {
    u8 = new Uint8Array(content);
  }
  return {
    name,
    arrayBuffer: async () => u8,
  };
}

// Build a minimal in-memory .xlsx so `parseSheetFile` can ingest it.
async function buildXlsx(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return makeFile(buf, 'test.xlsx');
}

function buildCsv(text) {
  return makeFile(text, 'test.csv');
}

describe('parseSheetFile — xlsx', () => {
  it('extracts headers + rows from a Hebrew .xlsx', async () => {
    const file = await buildXlsx([
      ['name', 'phone'],
      ['יוסי', '050-1111111'],
      ['שרה', '050-2222222'],
    ]);
    const { headers, rows } = await parseSheetFile(file);
    expect(headers).toEqual(['name', 'phone']);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('יוסי');
    expect(rows[0].phone).toBe('050-1111111');
    expect(rows[1].name).toBe('שרה');
  });

  it('strips trailing blank rows', async () => {
    const file = await buildXlsx([
      ['name'],
      ['ABC'],
      [''],
      [null],
    ]);
    const { rows } = await parseSheetFile(file);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('ABC');
  });

  it('throws when no data rows are present', async () => {
    const file = await buildXlsx([['only-header']]);
    await expect(parseSheetFile(file)).rejects.toThrow();
  });
});

describe('parseSheetFile — csv', () => {
  it('extracts headers + rows from a Hebrew .csv', async () => {
    const file = buildCsv('name,phone\nיוסי,050-1111111\nשרה,050-2222222\n');
    const { headers, rows } = await parseSheetFile(file);
    expect(headers).toEqual(['name', 'phone']);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('יוסי');
    expect(rows[1].phone).toBe('050-2222222');
  });

  it('handles quoted cells with embedded commas', async () => {
    const file = buildCsv('name,notes\n"כהן, יוסי","הערה, עם פסיק"\n');
    const { rows } = await parseSheetFile(file);
    expect(rows[0].name).toBe('כהן, יוסי');
    expect(rows[0].notes).toBe('הערה, עם פסיק');
  });

  it('handles escaped quotes inside quoted cells', async () => {
    const file = buildCsv('name\n"He said ""hi"""\n');
    const { rows } = await parseSheetFile(file);
    expect(rows[0].name).toBe('He said "hi"');
  });

  it('strips trailing blank lines', async () => {
    const file = buildCsv('name\nABC\n\n\n');
    const { rows } = await parseSheetFile(file);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('ABC');
  });
});
