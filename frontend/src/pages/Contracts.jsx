// Sprint 6 / ScreenContract — list page for in-house digital contracts.
//
// Inline Cream & Gold palette, matches ContractDetail. Shows one row
// per contract, links into the detail page, and tags each by type +
// signed/unsigned state. Thin by design — the bulk of the contract UX
// lives on the detail page (preview + sign).

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ShieldCheck, Clock, AlertCircle } from 'lucide-react';
import api from '../lib/api';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const TYPE_LABEL = {
  EXCLUSIVITY: 'הסכם בלעדיות',
  BROKERAGE:   'הסכם תיווך',
  OFFER:       'הצעת רכישה',
};

function formatIlDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
}

export default function Contracts() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listContracts();
      setItems(res?.items || []);
    } catch (e) {
      setError(e?.message || 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 18,
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
          חוזים
        </h1>
        <span style={{ fontSize: 12, color: DT.muted }}>
          {items.length ? `${items.length} חוזים` : null}
        </span>
      </div>

      {loading && (
        <div style={{ color: DT.muted, fontSize: 14 }}>טוען…</div>
      )}

      {error && !loading && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(185,28,28,0.08)', color: DT.danger,
          padding: '10px 14px', borderRadius: 10, fontSize: 13,
        }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div style={{
          background: DT.white, border: `1px solid ${DT.border}`,
          borderRadius: 14, padding: 28,
          display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: DT.cream3, color: DT.goldDark,
            display: 'grid', placeItems: 'center',
          }}>
            <FileText size={24} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
            עוד אין חוזים
          </h2>
          <p style={{ margin: 0, color: DT.muted, fontSize: 13, lineHeight: 1.6 }}>
            חוזים נוצרים מתוך דף נכס (בלעדיות / הצעת רכישה) או מדף לקוח
            (הסכם תיווך). כל חוזה חתום נעול באופן סופי עם חתימה דיגיטלית,
            חותמת זמן ותעודת אימות (SHA-256).
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((c) => {
            const signed = !!c.signedAt;
            return (
              <li key={c.id}>
                <Link
                  to={`/contracts/${c.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 16px', borderRadius: 12,
                    border: `1px solid ${DT.border}`, background: DT.white,
                    textDecoration: 'none', color: DT.ink,
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                    background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
                    color: DT.ink, display: 'grid', placeItems: 'center',
                  }}>
                    <FileText size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 800, fontSize: 14, color: DT.ink,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {c.title || TYPE_LABEL[c.type] || 'חוזה'}
                    </div>
                    <div style={{
                      fontSize: 12, color: DT.muted, marginTop: 3, display: 'flex', gap: 8,
                      flexWrap: 'wrap',
                    }}>
                      <span style={{
                        background: DT.goldSoft, color: DT.goldDark,
                        padding: '2px 8px', borderRadius: 99, fontWeight: 700, fontSize: 11,
                      }}>
                        {TYPE_LABEL[c.type] || c.type}
                      </span>
                      <span>חותם: {c.signerName}</span>
                      <span>· נוצר {formatIlDate(c.createdAt)}</span>
                    </div>
                  </div>
                  {signed ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: 'rgba(21,128,61,0.08)', color: DT.success,
                      padding: '5px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                      flexShrink: 0,
                    }}>
                      <ShieldCheck size={12} /> נחתם
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: DT.cream3, color: DT.ink2,
                      padding: '5px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                      flexShrink: 0,
                    }}>
                      <Clock size={12} /> טרם נחתם
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
