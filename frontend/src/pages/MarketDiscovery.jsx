// Market Discovery — מודעות חדשות בשוק.
//
// Phase 1: list + duplicate. Filter UI, match-status surfacing,
// notification deep-linking, and pull-to-refresh land in Phase 2.
// See MARKET_DISCOVERY_PLAN.md.
//
// LEGAL/SAFETY: this page only renders metadata returned from
// /api/market-discovery/listings — the backend stores no images,
// descriptions, phone numbers, or HTML. Every card surfaces the
// "פתח במקור" link so the source remains canonical.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ExternalLink, Copy as CopyIcon } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { displayPriceShort } from '../lib/display';
import { relLabel } from '../lib/relativeDate';
import EmptyState from '../components/EmptyState';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', white: '#fff',
  ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldDark: '#7a5c2c', goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function MarketDiscovery() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    api.get('/market-discovery/listings').then(
      (res) => { if (!cancelled) { setItems(res?.items || []); setLoading(false); } },
      (err) => { if (!cancelled) { setError(err?.message || 'טעינה נכשלה'); setLoading(false); } },
    );
    return () => { cancelled = true; };
  }, []);

  const duplicate = async (listingId) => {
    try {
      const res = await api.post(`/market-discovery/listings/${listingId}/duplicate`, {});
      toast.success?.('הנכס הועתק לרשימה שלך');
      navigate(`/properties/${res.propertyId}/edit`);
    } catch (err) {
      toast.error?.(err?.message || 'שכפול נכשל');
    }
  };

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>
          מודעות חדשות בשוק
        </h1>
        <div style={{ fontSize: 13, color: DT.muted, marginTop: 4 }}>
          {loading ? 'טוען…' : `${items.length} מודעות חדשות נמצאו במהלך השעה האחרונה`}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: 'rgba(220, 38, 38, 0.08)', color: '#b91c1c', padding: 12, borderRadius: 10, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {!loading && items.length === 0 && (
        <EmptyState
          icon={<Building2 size={28} />}
          title="אין מודעות חדשות כרגע"
          body="הסורק רץ פעם בשעה ויאסוף מודעות חדשות מ-Yad2 ומקורות נוספים. חזור/חזרי אחר כך."
        />
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((l) => (
          <article key={l.id} style={{
            background: DT.white, border: `1px solid ${DT.border}`, borderRadius: 14,
            padding: 14, display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 14, alignItems: 'center',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[l.street, l.neighborhood, l.city].filter(Boolean).join(' · ') || 'נכס'}
              </div>
              <div style={{ fontSize: 12, color: DT.muted, marginBottom: 6 }}>
                {[
                  l.propertyType,
                  l.rooms != null ? `${l.rooms} חד׳` : null,
                  l.sizeSqm != null ? `${l.sizeSqm} מ״ר` : null,
                  l.floor != null ? `קומה ${l.floor}` : null,
                ].filter(Boolean).join(' · ')}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                {l.price != null && (
                  <span style={{ fontSize: 18, fontWeight: 800, color: DT.gold }}>
                    {displayPriceShort(l.price)}
                  </span>
                )}
                {l.pricePerSqm != null && (
                  <span style={{ fontSize: 12, color: DT.muted }}>
                    {`₪${l.pricePerSqm.toLocaleString('he-IL')} / מ״ר`}
                  </span>
                )}
                <span style={{ fontSize: 11, color: DT.muted }}>
                  נראה לראשונה {relLabel(l.firstSeenAt)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 130 }}>
              <a
                href={l.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...FONT, textDecoration: 'none', textAlign: 'center',
                  background: DT.cream2, color: DT.ink, border: `1px solid ${DT.border}`,
                  padding: '8px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center',
                  minHeight: 40,
                }}
              >
                <ExternalLink size={13} /> פתח במקור
              </a>
              <button
                type="button"
                onClick={() => duplicate(l.id)}
                style={{
                  ...FONT, cursor: 'pointer', textAlign: 'center',
                  background: `linear-gradient(135deg, ${DT.gold}, ${DT.goldDark})`,
                  color: DT.ink, border: 'none',
                  padding: '8px 10px', borderRadius: 10, fontSize: 12, fontWeight: 800,
                  display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center',
                  minHeight: 44, boxShadow: '0 4px 12px rgba(180,139,76,0.28)',
                }}
              >
                <CopyIcon size={13} /> שכפל לנכסים שלי
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
