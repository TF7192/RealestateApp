import { describe, it, expect } from 'vitest';
// eslint-disable-next-line import/no-relative-packages
import {
  agentPublicUrl,
  propertyPublicUrl,
  agentPublicPath,
  propertyPublicPath,
} from '@estia/frontend/lib/publicUrl.js';

describe('agentPublicUrl / agentPublicPath', () => {
  it('prefers the SEO slug', () => {
    expect(agentPublicPath({ id: 'abc', slug: 'יוסי-כהן' })).toBe('/agents/%D7%99%D7%95%D7%A1%D7%99-%D7%9B%D7%94%D7%9F');
  });
  it('falls back to /a/:id when slug is missing', () => {
    expect(agentPublicPath({ id: 'abc' })).toBe('/a/abc');
  });
  it('falls back to "/" when the agent has neither', () => {
    expect(agentPublicPath({})).toBe('/');
    expect(agentPublicPath(null as any)).toBe('/');
  });
  it('agentPublicUrl embeds window.origin', () => {
    expect(agentPublicUrl({ slug: 'foo' })).toBe(`${window.location.origin}/agents/foo`);
  });
});

describe('propertyPublicUrl / propertyPublicPath', () => {
  it('builds the slugged URL when both slugs exist', () => {
    expect(
      propertyPublicPath({ id: '1', slug: 'rothschild-45' }, { slug: 'יוסי' })
    ).toBe('/agents/%D7%99%D7%95%D7%A1%D7%99/rothschild-45');
  });
  it('accepts property.agentSlug as an alternative to agent.slug', () => {
    expect(
      propertyPublicPath({ id: '1', slug: 'rothschild-45', agentSlug: 'a' })
    ).toBe('/agents/a/rothschild-45');
  });
  it('falls back to /p/:id when slugs are missing', () => {
    expect(propertyPublicPath({ id: 'abc' })).toBe('/p/abc');
  });
  it('falls back to "/" with nothing', () => {
    expect(propertyPublicPath({})).toBe('/');
  });
  it('URL variant prepends origin', () => {
    const u = propertyPublicUrl({ id: 'x', slug: 's' }, { slug: 'a' });
    expect(u.startsWith(window.location.origin)).toBe(true);
  });
});
