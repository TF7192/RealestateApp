import { describe, it, expect } from 'vitest';
import { buildAiGreeting } from '../../../frontend/src/lib/aiGreeting.js';

describe('buildAiGreeting', () => {
  it('returns an assistant-role message', () => {
    const msg = buildAiGreeting({ isPremium: true, userName: 'יוסי כהן' });
    expect(msg.role).toBe('assistant');
    expect(typeof msg.content).toBe('string');
    expect(msg.content.length).toBeGreaterThan(20);
  });

  it('uses the first name when userName is provided', () => {
    const msg = buildAiGreeting({ isPremium: true, userName: 'יוסי כהן' });
    expect(msg.content.startsWith('שלום יוסי!')).toBe(true);
  });

  it('falls back to a generic hello when userName is missing', () => {
    const msg = buildAiGreeting({ isPremium: true });
    expect(msg.content.startsWith('שלום!')).toBe(true);
  });

  it('omits the Premium teaser for premium users', () => {
    const msg = buildAiGreeting({ isPremium: true });
    expect(msg.content).not.toContain('Premium');
  });

  it('appends the Premium teaser for non-premium users', () => {
    const msg = buildAiGreeting({ isPremium: false });
    expect(msg.content).toContain('Premium');
    expect(msg.content).toContain('💡');
  });

  it('treats missing options as a non-premium anonymous user', () => {
    const msg = buildAiGreeting();
    expect(msg.content.startsWith('שלום!')).toBe(true);
    expect(msg.content).toContain('Premium');
  });
});
