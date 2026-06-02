import { describe, it, expect } from 'vitest';
// eslint-disable-next-line import/no-relative-packages
import {
  buildVariables,
  renderTemplate,
  pickTemplateKind,
  TEMPLATE_KINDS,
  PLACEHOLDERS,
  LABEL_OF,
} from '@estia/frontend/lib/templates.js';

const baseProperty = {
  id: 'p1',
  slug: 'rothschild-45',
  type: 'דירה',
  street: 'רוטשילד',
  city: 'תל אביב',
  rooms: 4,
  sqm: 95,
  floor: 0,
  totalFloors: 5,
  marketingPrice: 2_500_000,
  assetClass: 'RESIDENTIAL',
  category: 'SALE',
  parking: true,
  storage: false,
  ac: true,
  elevator: true,
  safeRoom: true,
  balconySize: 12,
};
const baseAgent = {
  slug: 'יוסי',
  displayName: 'יוסי כהן',
  phone: '0501234567',
  agentProfile: { agency: 'רימקס', bio: 'Hello' },
};

describe('TEMPLATE_KINDS + PLACEHOLDERS', () => {
  it('exposes the four kinds the backend knows', () => {
    // TEMPLATE_KINDS still includes the historical TRANSFER entry on
    // the client (templates.js trims happen in §7 of the removal
    // manifest); the backend no longer accepts it.
    const keys = TEMPLATE_KINDS.map((k) => k.key);
    for (const k of ['BUY_COMMERCIAL', 'BUY_PRIVATE', 'RENT_COMMERCIAL', 'RENT_PRIVATE']) {
      expect(keys).toContain(k);
    }
  });

  it('LABEL_OF covers every placeholder', () => {
    for (const p of PLACEHOLDERS) {
      expect(LABEL_OF[p.key]).toBe(p.label);
    }
  });
});

describe('buildVariables', () => {
  it('renders ground floor as "קרקע" (Task 2 regression)', () => {
    const v = buildVariables({ ...baseProperty, floor: 0 }, baseAgent);
    expect(v.floor).toBe('קרקע');
  });

  it('joins features with " · " and omits ones the property lacks', () => {
    const v = buildVariables({
      ...baseProperty,
      parking: true, storage: false, ac: true, elevator: false,
      safeRoom: false, balconySize: 0,
    }, baseAgent);
    expect(v.features).toBe('חניה · מזגנים');
  });

  it('yes/no helpers return Hebrew strings', () => {
    const v = buildVariables(baseProperty, baseAgent);
    expect(v.parking).toBe('יש');
    expect(v.storage).toBe('אין');
  });

  it('formats the URL using the SEO slug path when both slugs exist', () => {
    const v = buildVariables(baseProperty, baseAgent);
    expect(v.propertyUrl).toContain('/agents/');
    expect(v.propertyUrl).toContain('/rothschild-45');
  });

  it('returns {} for null property', () => {
    expect(buildVariables(null as any, baseAgent)).toEqual({});
  });
});

describe('renderTemplate', () => {
  it('substitutes {{vars}}', () => {
    const out = renderTemplate('{{type}} ב{{city}}', { type: 'דירה', city: 'ת״א' });
    expect(out).toBe('דירה בת״א');
  });

  it('leaves unknown placeholders as empty', () => {
    const out = renderTemplate('{{type}} / {{unknown}}', { type: 'דירה' });
    expect(out).toBe('דירה /');
  });

  it('drops lines that collapse to ONLY emoji + whitespace + punctuation after substitution', () => {
    // The filter in renderTemplate strips emoji, whitespace, em-dash,
    // colon, middle-dot, hyphen, pipe — so "📷 " with no value collapses
    // to empty and the line is dropped. Hebrew label text is treated as
    // real content, so "💰 מחיר:" survives even with an empty value.
    const body = [
      '📷 {{propertyUrl}}',
      '🛏️ {{rooms}} חדרים',
    ].join('\n');
    const out = renderTemplate(body, { rooms: '4', propertyUrl: '' });
    expect(out).not.toMatch(/📷/);
    expect(out).toMatch(/4 חדרים/);
  });

  it('collapses 3+ consecutive blank lines to 2', () => {
    const out = renderTemplate('a\n\n\n\nb', {});
    expect(out).toBe('a\n\nb');
  });

  it('empty / null body returns empty string', () => {
    expect(renderTemplate('', {})).toBe('');
    expect(renderTemplate(null as any, {})).toBe('');
  });
});

describe('pickTemplateKind', () => {
  it.each([
    ['RESIDENTIAL', 'SALE', 'BUY_PRIVATE'],
    ['RESIDENTIAL', 'RENT', 'RENT_PRIVATE'],
    ['COMMERCIAL',  'SALE', 'BUY_COMMERCIAL'],
    ['COMMERCIAL',  'RENT', 'RENT_COMMERCIAL'],
  ])('%s + %s → %s (client mode)', (assetClass, category, expected) => {
    expect(pickTemplateKind({ ...baseProperty, assetClass, category }, 'client')).toBe(expected);
  });

  it('defaults to BUY_PRIVATE for an unknown property shape', () => {
    expect(pickTemplateKind({})).toBe('BUY_PRIVATE');
  });
});
