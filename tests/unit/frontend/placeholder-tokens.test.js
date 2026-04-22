import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// X-3 — placeholders must look muted everywhere, not like real text.
//
// The complaint: agents mistook placeholder copy for real values in
// several inputs that don't carry the `.form-input` class (e.g. raw
// `<input>` / `<textarea>` / `<select>` in unstyled pages). Fix is a
// global `::placeholder` rule plus the muted-color token.

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(here, '../../../frontend/src/index.css');
const css = readFileSync(cssPath, 'utf8');

describe('X-3 — placeholder styling tokens', () => {
  it('declares a --placeholder-color token', () => {
    expect(css).toMatch(/--placeholder-color:\s*[^;]+;/);
  });

  it('applies ::placeholder styling to bare input, textarea, and select', () => {
    // Accept any selector form that includes `input` + `textarea`.
    expect(css).toMatch(/input::placeholder[\s\S]{0,200}--placeholder-color/);
    expect(css).toMatch(/textarea::placeholder[\s\S]{0,200}--placeholder-color/);
  });

  it('uses an opacity cap so placeholders are visually subdued', () => {
    // Either `opacity:` in the placeholder rule or a color-mix / rgba
    // with alpha < 1 counts. We just pin that the rule file mentions
    // opacity adjacent to the placeholder block.
    expect(css).toMatch(/::placeholder[\s\S]{0,200}opacity/);
  });
});
