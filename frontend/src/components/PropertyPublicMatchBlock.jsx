// Sprint 10 — התאמות פומביות opt-in + attribution widget on the
// property detail page. Only the property's owning agent sees this;
// non-owners already see the public version on /public-matches.
//
// Two states:
//  - Not shared: gold "Publish" CTA + small textarea for a publisher
//    note. The note surfaces at the top of the pool card so agents
//    can give context ("excellent schools", "ready for immediate
//    occupancy", etc.).
//  - Shared: status chip + unpublish CTA + list of agents who've
//    cloned this property (newest first).

import { useCallback, useEffect, useState } from 'react';
import { Share2, XCircle, Users, Clock } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';

const DT = {
  cream4: '#fbf7f0', white: '#ffffff',
  ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function PropertyPublicMatchBlock({ property, isOwner, onChange }) {
  const toast = useToast();
  const [note, setNote] = useState(property?.publicMatchNote || '');
  const [saving, setSaving] = useState(false);
  const [copies, setCopies] = useState([]);
  const [loadingCopies, setLoadingCopies] = useState(false);

  // Keep the controlled textarea in sync when the parent refetches.
  useEffect(() => { setNote(property?.publicMatchNote || ''); }, [property?.publicMatchNote]);

  const fetchCopies = useCallback(async () => {
    if (!property?.id || !isOwner) return;
    setLoadingCopies(true);
    try {
      const res = await api.publicMatchCopies(property.id);
      setCopies(res?.items || []);
    } catch {
      setCopies([]);
    } finally {
      setLoadingCopies(false);
    }
  }, [property?.id, isOwner]);

  useEffect(() => { fetchCopies(); }, [fetchCopies]);

  if (!property || !isOwner) return null;

  const isShared = !!property.isPublicMatch;

  const doPublish = async () => {
    setSaving(true);
    try {
      const res = await api.publishPublicMatch(property.id, { note: note.trim() || null });
      toast.success('הנכס שותף למאגר ההתאמות הפומביות');
      onChange?.({ ...property, ...res.property });
      window.dispatchEvent(new CustomEvent('estia:public-matches-changed'));
    } catch (e) {
      toast.error(e?.message || 'שיתוף הנכס נכשל');
    } finally {
      setSaving(false);
    }
  };

  const doUnpublish = async () => {
    setSaving(true);
    try {
      const res = await api.unpublishPublicMatch(property.id);
      toast.success('הנכס הוסר מהמאגר');
      onChange?.({ ...property, ...res.property });
      window.dispatchEvent(new CustomEvent('estia:public-matches-changed'));
    } catch (e) {
      toast.error(e?.message || 'הסרה מהמאגר נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      style={{
        ...FONT,
        background: DT.white, border: `1px solid ${isShared ? DT.gold : DT.border}`,
        borderRadius: 16, padding: 18,
        boxShadow: isShared
          ? '0 4px 14px rgba(180,139,76,0.15)'
          : '0 1px 0 rgba(30,26,20,0.03)',
      }}
    >
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 10,
            background: DT.goldSoft, color: DT.goldDark,
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}><Share2 size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: DT.ink }}>
              התאמות פומביות
            </div>
            <div style={{ fontSize: 12, color: DT.muted, lineHeight: 1.5 }}>
              {isShared
                ? 'הנכס משותף למאגר — סוכנים אחרים יכולים לשכפל אותו לרשימה שלהם.'
                : 'שתפו את הנכס למאגר משותף וסוכנים אחרים יוכלו לשכפל אותו לרשימה שלהם.'}
            </div>
          </div>
        </div>
        {isShared && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: DT.goldSoft, color: DT.goldDark,
            borderRadius: 99, padding: '3px 10px',
            fontSize: 11, fontWeight: 800,
          }}>פעיל · {copies.length} שכפולים</span>
        )}
      </header>

      {/* Body */}
      <div style={{ marginTop: 14 }}>
        {!isShared && (
          <>
            <label style={{
              display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10,
            }}>
              <span style={{ fontSize: 11, color: DT.muted, fontWeight: 700 }}>
                הערה לסוכן המשכפל (לא חובה)
              </span>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="מה חשוב שהסוכן ידע? למשל — רגיש לזמן, בעל פתוח למו״מ, דחוף למכירה…"
                style={{
                  ...FONT, fontSize: 13, color: DT.ink, background: DT.white,
                  border: `1px solid ${DT.border}`, borderRadius: 10,
                  padding: 10, resize: 'vertical', outline: 'none',
                }}
              />
            </label>
            <button
              type="button"
              onClick={doPublish}
              disabled={saving}
              style={{
                ...FONT,
                background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
                color: DT.ink, border: 'none',
                padding: '10px 16px', borderRadius: 10,
                fontSize: 13, fontWeight: 800, cursor: saving ? 'wait' : 'pointer',
                display: 'inline-flex', gap: 6, alignItems: 'center',
                boxShadow: '0 2px 6px rgba(180,139,76,0.25)',
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Share2 size={14} /> {saving ? 'משתף…' : 'שתף למאגר הפומבי'}
            </button>
          </>
        )}
        {isShared && (
          <>
            {property.publicMatchNote && (
              <div style={{
                fontSize: 12, color: DT.ink, background: DT.cream4,
                borderInlineStart: `3px solid ${DT.gold}`,
                padding: '8px 10px', borderRadius: 8, lineHeight: 1.55,
                marginBottom: 12,
              }}>
                „{property.publicMatchNote}"
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <button
                type="button"
                onClick={doUnpublish}
                disabled={saving}
                style={{
                  ...FONT,
                  background: DT.white, color: DT.danger,
                  border: `1px solid ${DT.danger}`,
                  padding: '9px 14px', borderRadius: 10,
                  fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
                  display: 'inline-flex', gap: 6, alignItems: 'center',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <XCircle size={14} /> {saving ? 'מסיר…' : 'הסר מהמאגר'}
              </button>
              <a
                href="/public-matches"
                style={{
                  ...FONT, background: DT.white, color: DT.ink,
                  border: `1px solid ${DT.border}`, padding: '9px 14px',
                  borderRadius: 10, fontSize: 12, fontWeight: 700,
                  display: 'inline-flex', gap: 6, alignItems: 'center',
                  textDecoration: 'none',
                }}
              >צפה במאגר</a>
            </div>

            {/* Attribution — who cloned this */}
            <div>
              <div style={{
                fontSize: 11, color: DT.muted, fontWeight: 700, marginBottom: 8,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                <Users size={12} /> סוכנים ששכפלו את הנכס ({copies.length})
              </div>
              {loadingCopies ? (
                <div style={{ fontSize: 12, color: DT.muted }}>טוען…</div>
              ) : copies.length === 0 ? (
                <div style={{ fontSize: 12, color: DT.muted, lineHeight: 1.6 }}>
                  אף סוכן לא שכפל את הנכס עדיין — ברגע שמישהו ישכפל, היא תקבלו התראה וגם תראי אותם כאן.
                </div>
              ) : (
                <ul style={{
                  listStyle: 'none', margin: 0, padding: 0,
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  {copies.map((c) => (
                    <li key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', background: DT.cream4,
                      border: `1px solid ${DT.border}`, borderRadius: 10,
                    }}>
                      {c.agent?.avatarUrl ? (
                        <img
                          src={c.agent.avatarUrl}
                          alt=""
                          style={{ width: 32, height: 32, borderRadius: 99, objectFit: 'cover' }}
                          loading="lazy"
                        />
                      ) : (
                        <div style={{
                          width: 32, height: 32, borderRadius: 99,
                          background: DT.goldSoft, color: DT.goldDark,
                          fontSize: 13, fontWeight: 800,
                          display: 'grid', placeItems: 'center',
                        }}>{(c.agent?.displayName || '?').slice(0, 1)}</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: DT.ink }}>
                          {c.agent?.displayName || 'סוכן'}
                        </div>
                        <div style={{
                          fontSize: 11, color: DT.muted,
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          {c.agent?.officeName && <span>{c.agent.officeName}</span>}
                          <Clock size={10} />
                          <span>{new Date(c.createdAt).toLocaleString('he-IL', {
                            day: '2-digit', month: '2-digit', year: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
