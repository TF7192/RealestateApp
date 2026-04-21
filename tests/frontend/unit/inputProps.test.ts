import { describe, it, expect } from 'vitest';
// eslint-disable-next-line import/no-relative-packages
import * as ip from '@estia/frontend/lib/inputProps.js';

describe('inputProps helpers — iOS keyboard hints', () => {
  it('phone uses type=tel + inputMode=tel + LTR', () => {
    const p = ip.inputPropsForPhone();
    expect(p.type).toBe('tel');
    expect(p.inputMode).toBe('tel');
    expect(p.dir).toBe('ltr');
  });

  it('price / sqm / rooms use text+inputMode (not type=number) to avoid iOS stepper', () => {
    expect(ip.inputPropsForPrice().type).toBe('text');
    expect(ip.inputPropsForPrice().inputMode).toBe('numeric');
    expect(ip.inputPropsForSqm().type).toBe('text');
    expect(ip.inputPropsForRooms().inputMode).toBe('decimal');
  });

  it('floor accepts a leading minus (for basement levels)', () => {
    expect(ip.inputPropsForFloor().pattern).toBe('-?[0-9]*');
  });

  it('email turns off autocapitalize and spellcheck', () => {
    const p = ip.inputPropsForEmail();
    expect(p.autoCapitalize).toBe('off');
    expect(p.spellCheck).toBe(false);
    expect(p.type).toBe('email');
  });

  it('name + address + city use autoCapitalize=words', () => {
    expect(ip.inputPropsForName().autoCapitalize).toBe('words');
    expect(ip.inputPropsForAddress().autoCapitalize).toBe('words');
    expect(ip.inputPropsForCity().autoCapitalize).toBe('words');
  });

  it('search → type=search + enterKeyHint=search', () => {
    const p = ip.inputPropsForSearch();
    expect(p.type).toBe('search');
    expect(p.enterKeyHint).toBe('search');
  });

  it('url → LTR + "go" hint', () => {
    const p = ip.inputPropsForUrl();
    expect(p.type).toBe('url');
    expect(p.dir).toBe('ltr');
    expect(p.enterKeyHint).toBe('go');
  });

  it('notes uses dir="auto" so Hebrew/LTR numbers coexist', () => {
    expect(ip.inputPropsForNotes().dir).toBe('auto');
  });
});
