// Unit tests for the per-property landing-page zod schema.
//
// Phase 6 of the landing-editor feature. These pin:
//   - The default config the renderer falls back to when an agent
//     hasn't customized anything → produces a valid config and
//     contains every required block.
//   - Size guard: pathological pastes (>50 KB) reject before zod even
//     runs.
//   - URL allowlists: VIDEO accepts youtube/vimeo only; VIRTUAL_TOUR
//     accepts arbitrary https hosts.
//   - Required-section invariant: missing HERO / AGENT_CARD /
//     INQUIRY is rejected even if the rest of the config is fine.
//   - Copy length caps: an oversize string fails parse.

import { describe, it, expect } from 'vitest';
import {
  parseLandingConfig,
  defaultLandingConfig,
  assertVideoUrlSafe,
  assertTourUrlSafe,
  REQUIRED_SECTIONS,
  LATEST_VERSION,
} from '../../../backend/src/lib/landingConfig.js';

describe('defaultLandingConfig()', () => {
  it('produces a valid config for a residential property', () => {
    const cfg = defaultLandingConfig({ assetClass: 'RESIDENTIAL' });
    expect(cfg.version).toBe(LATEST_VERSION);
    expect(cfg.template).toBe('RESIDENTIAL');
    // Round-trip through the parser — the synthesizer's output must
    // satisfy the parser at all times, otherwise null-config rows
    // would render fine but fail to save.
    expect(() => parseLandingConfig(cfg)).not.toThrow();
  });

  it('flips to the COMMERCIAL template for commercial properties', () => {
    const cfg = defaultLandingConfig({ assetClass: 'COMMERCIAL' });
    expect(cfg.template).toBe('COMMERCIAL');
  });

  it('includes every required section type', () => {
    const cfg = defaultLandingConfig({ assetClass: 'RESIDENTIAL' });
    const present = new Set(cfg.sections.map((s) => s.type));
    for (const t of REQUIRED_SECTIONS) {
      expect(present.has(t)).toBe(true);
    }
  });
});

describe('parseLandingConfig()', () => {
  const base = () => defaultLandingConfig({ assetClass: 'RESIDENTIAL' });

  it('accepts the default config', () => {
    expect(() => parseLandingConfig(base())).not.toThrow();
  });

  it('rejects a config missing HERO', () => {
    const cfg = base();
    cfg.sections = cfg.sections.filter((s) => s.type !== 'HERO');
    expect(() => parseLandingConfig(cfg)).toThrow();
  });

  it('rejects a config missing AGENT_CARD', () => {
    const cfg = base();
    cfg.sections = cfg.sections.filter((s) => s.type !== 'AGENT_CARD');
    expect(() => parseLandingConfig(cfg)).toThrow();
  });

  it('rejects a config missing INQUIRY', () => {
    const cfg = base();
    cfg.sections = cfg.sections.filter((s) => s.type !== 'INQUIRY');
    expect(() => parseLandingConfig(cfg)).toThrow();
  });

  it('rejects a payload larger than 50 KB before parsing', () => {
    const cfg = base();
    // Stuff a giant fake field in. The schema would still pass at the
    // shape level, but the size guard runs first.
    const huge = { ...cfg, __payload: 'x'.repeat(60_000) };
    expect(() => parseLandingConfig(huge)).toThrow(/too large/);
  });

  it('rejects oversize description body', () => {
    const cfg = base();
    cfg.sections.push({
      id: '00000000-0000-4000-8000-000000000001',
      type: 'DESCRIPTION',
      visible: true,
      props: { heading: '', body: 'x'.repeat(1500) },
    });
    expect(() => parseLandingConfig(cfg)).toThrow();
  });

  it('caps amenities items at the documented max', () => {
    const cfg = base();
    cfg.sections.push({
      id: '00000000-0000-4000-8000-000000000002',
      type: 'AMENITIES',
      visible: true,
      props: { heading: '', items: Array.from({ length: 50 }, (_, i) => `item ${i}`) },
    });
    expect(() => parseLandingConfig(cfg)).toThrow();
  });

  it('rejects an unknown block type', () => {
    const cfg = base() as any;
    cfg.sections.push({
      id: '00000000-0000-4000-8000-000000000003',
      type: 'TOTALLY_INVENTED',
      visible: true,
      props: {},
    });
    expect(() => parseLandingConfig(cfg)).toThrow();
  });
});

describe('assertVideoUrlSafe()', () => {
  it('allows youtube.com', () => {
    expect(() => assertVideoUrlSafe('https://www.youtube.com/watch?v=abc')).not.toThrow();
  });
  it('allows youtu.be short links', () => {
    expect(() => assertVideoUrlSafe('https://youtu.be/abc')).not.toThrow();
  });
  it('allows vimeo.com', () => {
    expect(() => assertVideoUrlSafe('https://vimeo.com/12345')).not.toThrow();
  });
  it('rejects off-allowlist hosts (tiktok)', () => {
    expect(() => assertVideoUrlSafe('https://www.tiktok.com/@user/video/123')).toThrow();
  });
  it('rejects http (no TLS)', () => {
    expect(() => assertVideoUrlSafe('http://youtube.com/watch?v=abc')).toThrow();
  });
  it('rejects javascript: URLs', () => {
    expect(() => assertVideoUrlSafe('javascript:alert(1)')).toThrow();
  });
  it('treats empty string as "no video" (allowed)', () => {
    expect(() => assertVideoUrlSafe('')).not.toThrow();
  });
});

describe('assertTourUrlSafe()', () => {
  it('allows arbitrary https hosts (Matterport, Kuula, …)', () => {
    expect(() => assertTourUrlSafe('https://my.matterport.com/show?m=abc')).not.toThrow();
    expect(() => assertTourUrlSafe('https://kuula.co/share/collection/xyz')).not.toThrow();
  });
  it('rejects non-https', () => {
    expect(() => assertTourUrlSafe('http://my.matterport.com/show?m=abc')).toThrow();
  });
  it('rejects garbage', () => {
    expect(() => assertTourUrlSafe('not a url')).toThrow();
  });
  it('treats empty string as "no tour" (allowed)', () => {
    expect(() => assertTourUrlSafe('')).not.toThrow();
  });
});
