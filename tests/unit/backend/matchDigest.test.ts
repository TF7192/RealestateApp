// 2026-05-06 — covers the three contracts the user explicitly asked
// us to land:
//
//   (a) Every email template the project ships renders RTL HTML
//       (dir="rtl" on <html> + <body>; tables tagged dir="rtl"; td
//        align="right"; LTR spans wrap Latin numerals).
//
//   (b) The digest scheduler picks up un-dispatched
//       NotificationDispatch rows, sends ONE email per agent listing
//       all of them, and stamps `dispatchedAt`.
//
//   (c) Running the scheduler twice in quick succession sends ZERO
//       duplicate emails — the dedup is the unique
//       (agentId, leadId, marketListingId) index plus the
//       `dispatchedAt` stamp.
//
// We don't touch the database — the scheduler accepts an injected
// prisma-shaped object so we can keep this in the unit project (no
// Postgres required).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderRtlEmail,
  renderDigestBody,
  buildDigestSubject,
  ltrSpan,
  escapeHtml,
} from '../../../backend/src/lib/email.ts';
import { runDigestOnce } from '../../../backend/src/workers/matchDigest.ts';

describe('renderRtlEmail', () => {
  it('emits dir="rtl" on <html> and <body>', () => {
    const html = renderRtlEmail({ title: 'נכס חדש', bodyHtml: '<p>שלום</p>' });
    expect(html).toMatch(/<html dir="rtl"/);
    expect(html).toMatch(/<body[^>]*direction:rtl/);
    expect(html).toMatch(/lang="he"/);
  });

  it('tags every nested <table> with dir="rtl"', () => {
    const html = renderRtlEmail({ title: 't', bodyHtml: '' });
    const tableTags = html.match(/<table[^>]*>/g) || [];
    expect(tableTags.length).toBeGreaterThan(0);
    for (const tag of tableTags) {
      expect(tag).toMatch(/dir="rtl"/);
    }
  });

  it('places text-align:right on the body td', () => {
    const html = renderRtlEmail({ title: 't', bodyHtml: 'x' });
    expect(html).toMatch(/text-align:right/);
  });

  it('escapes HTML in the title and body', () => {
    const html = renderRtlEmail({
      title: 'a<b>"',
      bodyHtml: '<p>safe-already-escaped</p>',
    });
    expect(html).toContain('a&lt;b&gt;&quot;');
    // bodyHtml is passed through verbatim — caller's responsibility.
    expect(html).toContain('<p>safe-already-escaped</p>');
  });

  it('ltrSpan wraps Latin numerals so Bidi keeps digits in order', () => {
    const out = ltrSpan('₪ 2,300,000');
    expect(out).toMatch(/dir="ltr"/);
    expect(out).toMatch(/unicode-bidi:embed/);
    expect(out).toContain('₪');
  });

  it('escapeHtml protects against tag injection', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('renderDigestBody', () => {
  it('subject line follows the spec', () => {
    expect(buildDigestSubject(7)).toBe('התאמות חדשות ב-Estia · 7 לידים חדשים');
  });

  it('groups leads by property and includes the count headline', () => {
    const out = renderDigestBody({
      to: 'agent@example.com',
      totalLeads: 3,
      properties: [
        {
          marketListingId: 'L1',
          street: 'דיזנגוף 5',
          city: 'תל אביב',
          neighborhood: null,
          rooms: 3,
          sizeSqm: 80,
          price: 2_300_000,
          originalUrl: 'https://yad2.co.il/x',
          appLink: '/market-discovery?listing=L1',
          leads: [
            { name: 'דנה לוי', phone: '050-1234567', matchScore: 80 },
            { name: 'רון כהן', phone: null,           matchScore: 60 },
          ],
        },
        {
          marketListingId: 'L2',
          street: 'הרצל 12',
          city: 'רמת גן',
          neighborhood: null,
          rooms: 4,
          sizeSqm: null,
          price: null,
          originalUrl: null,
          appLink: '/market-discovery?listing=L2',
          leads: [{ name: 'תומר אבני', phone: '052-9876543', matchScore: 45 }],
        },
      ],
    });
    expect(out.html).toMatch(/dir="rtl"/);
    expect(out.html).toContain('נכס: דיזנגוף 5, תל אביב — 2 לידים חדשים');
    expect(out.html).toContain('נכס: הרצל 12, רמת גן — 1 לידים חדשים');
    expect(out.html).toContain('דנה לוי');
    // Latin-numeral phone wrapped in LTR span.
    expect(out.html).toMatch(/<span dir="ltr"[^>]*>050-1234567<\/span>/);
    expect(out.text).toContain('נכס: דיזנגוף 5, תל אביב — 2 לידים חדשים');
    expect(out.text).toContain('• דנה לוי — 050-1234567');
  });
});

// ─────────────────────────────────────────────────────────────────
// Digest scheduler — exercised against an in-memory Prisma stub.
//
// The stub mimics the subset of the prisma client the worker uses:
//   notificationDispatch.{groupBy, findMany, updateMany}
//   userNotificationPreference.findUnique
//   marketListing.findMany
//   lead.findMany
//
// Keeping the stub small forces us to think hard about which queries
// we actually fire — if we accidentally add a new round-trip in the
// worker, this test is the canary.

type DispatchRow = {
  id: string;
  agentId: string;
  leadId: string;
  marketListingId: string;
  matchScore: number;
  dispatchedAt: Date | null;
  createdAt: Date;
};

function makeStub() {
  const dispatches: DispatchRow[] = [];
  const listings = [
    {
      id: 'L1',
      street: 'דיזנגוף 5', city: 'תל אביב', neighborhood: null,
      rooms: 3, sizeSqm: 80, price: 2_300_000,
      originalUrl: 'https://yad2.example/L1',
    },
    {
      id: 'L2',
      street: 'הרצל 12', city: 'רמת גן', neighborhood: null,
      rooms: 4, sizeSqm: null, price: null,
      originalUrl: 'https://yad2.example/L2',
    },
  ];
  const leads = [
    { id: 'lead-A', name: 'דנה לוי',  phone: '050-1111111' },
    { id: 'lead-B', name: 'רון כהן',  phone: '052-2222222' },
  ];
  const prefs: Record<string, any> = {
    'agent-1': {
      userId: 'agent-1',
      marketMatchEmailEnabled: true,
      customDeliveryEmail: null,
      user: { email: 'agent1@estia.co.il' },
    },
  };

  return {
    dispatches,
    db: {
      notificationDispatch: {
        async groupBy({ where }: any) {
          const filtered = dispatches.filter(
            (d) => (where.dispatchedAt === null ? d.dispatchedAt === null : true),
          );
          const map = new Map<string, number>();
          for (const r of filtered) {
            map.set(r.agentId, (map.get(r.agentId) || 0) + 1);
          }
          return Array.from(map, ([agentId, n]) => ({
            agentId,
            _count: { _all: n },
          }));
        },
        async findMany({ where, orderBy }: any) {
          let out = dispatches.filter((d) => d.agentId === where.agentId);
          if (where.dispatchedAt === null) out = out.filter((d) => d.dispatchedAt === null);
          if (orderBy?.createdAt === 'asc') {
            out = [...out].sort((a, b) => +a.createdAt - +b.createdAt);
          }
          return out;
        },
        async updateMany({ where, data }: any) {
          const ids: string[] = where.id.in;
          let count = 0;
          for (const r of dispatches) {
            if (ids.includes(r.id)) {
              if ('dispatchedAt' in data) r.dispatchedAt = data.dispatchedAt;
              count += 1;
            }
          }
          return { count };
        },
      },
      userNotificationPreference: {
        async findUnique({ where }: any) {
          return prefs[where.userId] ?? null;
        },
      },
      marketListing: {
        async findMany({ where }: any) {
          const ids: string[] = where.id.in;
          return listings.filter((l) => ids.includes(l.id));
        },
      },
      lead: {
        async findMany({ where }: any) {
          const ids: string[] = where.id.in;
          return leads.filter((l) => ids.includes(l.id));
        },
      },
    },
  };
}

describe('runDigestOnce', () => {
  let send: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    send = vi.fn().mockResolvedValue(undefined);
  });

  it('sends one email per agent listing every un-dispatched match, then marks them dispatched', async () => {
    const stub = makeStub();
    // Two properties × two leads for the same agent — should land in
    // ONE digest, not four.
    stub.dispatches.push(
      { id: 'd1', agentId: 'agent-1', leadId: 'lead-A', marketListingId: 'L1', matchScore: 80, dispatchedAt: null, createdAt: new Date(1) },
      { id: 'd2', agentId: 'agent-1', leadId: 'lead-B', marketListingId: 'L1', matchScore: 60, dispatchedAt: null, createdAt: new Date(2) },
      { id: 'd3', agentId: 'agent-1', leadId: 'lead-A', marketListingId: 'L2', matchScore: 50, dispatchedAt: null, createdAt: new Date(3) },
    );

    const sent = await runDigestOnce({ prismaClient: stub.db as any, send: send as any });
    expect(sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.to).toBe('agent1@estia.co.il');
    expect(arg.totalLeads).toBe(3);
    expect(arg.properties).toHaveLength(2);

    // All three rows now have a dispatchedAt timestamp.
    for (const row of stub.dispatches) {
      expect(row.dispatchedAt).toBeInstanceOf(Date);
    }
  });

  it('does NOT include rows that were already dispatched in a prior window', async () => {
    const stub = makeStub();
    stub.dispatches.push(
      // Already-dispatched row from the previous window — must NOT
      // appear in the new digest.
      { id: 'old', agentId: 'agent-1', leadId: 'lead-A', marketListingId: 'L1', matchScore: 80, dispatchedAt: new Date(0), createdAt: new Date(0) },
      // Fresh, un-dispatched row.
      { id: 'new', agentId: 'agent-1', leadId: 'lead-B', marketListingId: 'L1', matchScore: 60, dispatchedAt: null, createdAt: new Date(1) },
    );

    await runDigestOnce({ prismaClient: stub.db as any, send: send as any });
    const arg = send.mock.calls[0][0];
    expect(arg.totalLeads).toBe(1);
    const onlyLead = arg.properties[0].leads[0];
    expect(onlyLead.name).toBe('רון כהן');
  });

  it('running the scheduler twice in quick succession sends 0 duplicate emails', async () => {
    const stub = makeStub();
    stub.dispatches.push(
      { id: 'd1', agentId: 'agent-1', leadId: 'lead-A', marketListingId: 'L1', matchScore: 80, dispatchedAt: null, createdAt: new Date(1) },
    );

    const first = await runDigestOnce({ prismaClient: stub.db as any, send: send as any });
    const second = await runDigestOnce({ prismaClient: stub.db as any, send: send as any });

    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not email an agent who toggled email OFF (still flushes the rows)', async () => {
    const stub = makeStub();
    stub.dispatches.push(
      { id: 'd1', agentId: 'agent-2', leadId: 'lead-A', marketListingId: 'L1', matchScore: 80, dispatchedAt: null, createdAt: new Date(1) },
    );
    // No pref row for 'agent-2' → optedIn is false.
    await runDigestOnce({ prismaClient: stub.db as any, send: send as any });
    expect(send).not.toHaveBeenCalled();
    // Row still gets flushed so it doesn't sit in the queue forever.
    expect(stub.dispatches[0].dispatchedAt).toBeInstanceOf(Date);
  });
});
