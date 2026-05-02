import { describe, it, expect } from 'vitest';
import { runChatTool } from '../../../backend/src/lib/aiChatTools.js';

/**
 * lookup_feature is the catalog-backed tool the AI chat calls to answer
 * "how do I X" questions. The tool reads backend/src/data/featureGuide.json
 * (~80+ entries spanning every page and dialog) and scores entries by
 * keyword overlap. These tests pin the contract so the catalog can grow
 * without regressing the matching for the most common user questions.
 *
 * agentId is irrelevant for this tool (it doesn't touch the DB) — passed
 * as 'unused' to satisfy the ctx signature.
 */
const ctx = { agentId: 'unused' };

describe('lookup_feature tool', () => {
  it('returns no items for empty query', async () => {
    const out = (await runChatTool('lookup_feature', { query: '' }, ctx)) as any;
    expect(out.count).toBe(0);
  });

  it('finds the property-share entry for "איך משתפים נכס בוואטסאפ"', async () => {
    const out = (await runChatTool(
      'lookup_feature',
      { query: 'איך משתפים נכס בוואטסאפ' },
      ctx,
    )) as any;
    expect(out.count).toBeGreaterThan(0);
    const ids = out.items.map((it: any) => it.id);
    // The two entries that directly answer this question:
    expect(ids).toContain('property-share');
    // And the more specific transfer-to-agent answer should also rank.
    const includesTransferOrPicker =
      ids.includes('property-transfer') || ids.includes('property-share-via-lead-picker');
    expect(includesTransferOrPicker).toBe(true);
  });

  it('finds the transfer-property entry for "להעביר נכס לסוכן אחר"', async () => {
    const out = (await runChatTool(
      'lookup_feature',
      { query: 'להעביר נכס לסוכן אחר' },
      ctx,
    )) as any;
    const ids = out.items.map((it: any) => it.id);
    expect(ids).toContain('property-transfer');
  });

  it('finds the lead-create entry for English "create new lead"', async () => {
    const out = (await runChatTool(
      'lookup_feature',
      { query: 'create new lead' },
      ctx,
    )) as any;
    const ids = out.items.map((it: any) => it.id);
    expect(ids).toContain('leads-create');
  });

  it('finds the Yad2 import entry for "ייבוא מ-Yad2"', async () => {
    const out = (await runChatTool(
      'lookup_feature',
      { query: 'ייבוא מ-Yad2' },
      ctx,
    )) as any;
    const ids = out.items.map((it: any) => it.id);
    expect(ids).toContain('property-yad2-import');
  });

  it('finds the Google Calendar connect entry', async () => {
    const out = (await runChatTool(
      'lookup_feature',
      { query: 'איך מחברים את גוגל קלנדר' },
      ctx,
    )) as any;
    const ids = out.items.map((it: any) => it.id);
    expect(ids.some((id: string) => id.includes('calendar') || id.includes('google'))).toBe(true);
  });

  it('returns top entries sorted by score (descending)', async () => {
    const out = (await runChatTool(
      'lookup_feature',
      { query: 'WhatsApp share property broker' },
      ctx,
    )) as any;
    const scores = out.items.map((it: any) => it.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  it('caps results at 8 even when limit is larger', async () => {
    const out = (await runChatTool(
      'lookup_feature',
      { query: 'נכס', limit: 50 },
      ctx,
    )) as any;
    expect(out.items.length).toBeLessThanOrEqual(8);
  });

  it('returns property-public-matches as #1 for "שיתוף לבריכה הפומבית" / "פומביות" (regression: AI confused with lead-ai-matches)', async () => {
    const out = (await runChatTool(
      'lookup_feature',
      { query: 'איך אני משתף את הנכס שלי להתאמות הפומביות' },
      ctx,
    )) as any;
    expect(out.items[0].id).toBe('property-public-matches');
    expect(out.topScore).toBeGreaterThanOrEqual(10);
  });

  it('does NOT confuse התאמות חכמות (lead drawer) with התאמות פומביות (public pool)', async () => {
    const out = (await runChatTool(
      'lookup_feature',
      { query: 'התאמות פומביות' },
      ctx,
    )) as any;
    // property-public-matches must rank above lead-ai-matches.
    const ids = out.items.map((it: any) => it.id);
    const idxPublic = ids.indexOf('property-public-matches');
    const idxLead = ids.indexOf('lead-ai-matches');
    expect(idxPublic).toBeGreaterThanOrEqual(0);
    if (idxLead >= 0) {
      expect(idxPublic).toBeLessThan(idxLead);
    }
  });

  it('returns the deletion entry for "מחיקת חשבון"', async () => {
    const out = (await runChatTool(
      'lookup_feature',
      { query: 'מחיקת חשבון' },
      ctx,
    )) as any;
    const ids = out.items.map((it: any) => it.id);
    expect(ids).toContain('settings-main');
  });
});
