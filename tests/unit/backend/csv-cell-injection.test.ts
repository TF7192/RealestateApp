import { describe, it, expect } from 'vitest';
import { csvCell } from '../../../backend/src/routes/reports.js';

// SEC-013 — CSV injection guard.
// A malicious lead-form submission containing a leading `=`, `+`, `-`,
// `@`, `\t`, or `\r` is interpreted by Excel/Numbers/LibreOffice as a
// formula when an agent later opens the export. We prefix-escape such
// cells with an apostrophe so Excel renders the literal text instead.
describe('csvCell — SEC-013 formula-injection guard', () => {
  it('prefix-escapes a cell starting with `=` with an apostrophe', () => {
    // The cell is also wrapped because the apostrophe + `=A1+1` itself
    // contains no structural chars, but `=cmd|'/c calc'!A1` does — so
    // we test the standalone path AND the quoted path.
    expect(csvCell('=A1+1')).toBe("'=A1+1");
  });

  it('prefix-escapes leading `+`', () => {
    expect(csvCell('+1+1')).toBe("'+1+1");
  });

  it('prefix-escapes leading `-`', () => {
    expect(csvCell('-1+1')).toBe("'-1+1");
  });

  it('prefix-escapes leading `@`', () => {
    expect(csvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
  });

  it('prefix-escapes leading TAB (\\t)', () => {
    expect(csvCell('\t=A1')).toBe("'\t=A1");
  });

  it('prefix-escapes leading CR (\\r), and wraps because CR is structural', () => {
    // Leading CR triggers prefix escape AND the structural-char wrap
    // (because \r is in [",\n\r]). Result: `"'\r"`.
    expect(csvCell('\r')).toBe('"\'\r"');
  });

  it('leaves a normal string untouched', () => {
    expect(csvCell('hello')).toBe('hello');
  });

  it('preserves existing comma-wrap behavior', () => {
    expect(csvCell('foo,bar')).toBe('"foo,bar"');
  });

  it('preserves null → empty-string behavior', () => {
    expect(csvCell(null)).toBe('');
  });

  it('preserves undefined → empty-string behavior', () => {
    expect(csvCell(undefined)).toBe('');
  });

  it('combines prefix-escape with quote-wrapping when needed', () => {
    // `=cmd|'/c calc'!A1` — the canonical SEC-013 attack payload. The
    // single-quote inside is structurally fine, but the leading `=`
    // forces apostrophe-escape; no commas/newlines so no wrap.
    expect(csvCell("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
  });

  it('combines prefix-escape with quote-wrap when payload also has a comma', () => {
    expect(csvCell('=A1,B1')).toBe('"\'=A1,B1"');
  });
});
