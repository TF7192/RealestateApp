import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Search, Phone, Building2, X, MessageSquare, ChevronLeft } from 'lucide-react';
import api from '../lib/api';
import OwnerEditDialog from '../components/OwnerEditDialog';
import PullRefresh from '../components/PullRefresh';
import SwipeRow from '../components/SwipeRow';
import WhatsAppIcon from '../components/WhatsAppIcon';
import { useViewportMobile, useDelayedFlag } from '../hooks/mobile';
import PageTour from '../components/PageTour';
import { useToast } from '../lib/toast';
import { telUrl } from '../lib/waLink';
import { openWhatsApp } from '../native/share';
import { relativeDate } from '../lib/relativeDate';
import haptics from '../lib/haptics';
import './Owners.css';

/**
 * Owners — list of every property-owner the agent has captured.
 * Cards on desktop; dense 64px swipe-able rows on mobile.
 */
export default function Owners() {
  const isMobile = useViewportMobile(820);
  const toast = useToast();
  const navigate = useNavigate();
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (new) | owner (edit)
  const cardRefs = useRef({});

  const load = useCallback(async () => {
    try {
      const res = await api.listOwners();
      setOwners(res?.items || []);
    } catch (e) {
      toast?.error?.(e?.message || 'טעינת בעלי הנכסים נכשלה');
      setOwners([]);
    }
  }, [toast]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return owners;
    return owners.filter(
      (o) =>
        (o.name || '').toLowerCase().includes(s) ||
        (o.phone || '').includes(search.trim()) ||
        (o.email || '').toLowerCase().includes(s),
    );
  }, [owners, search]);

  const onSaved = async (saved) => {
    setEditing(null);
    if (saved?.message) toast?.success?.(saved.message);
    else toast?.success?.('בעל הנכס נשמר');
    await load();
  };

  const showSkel = useDelayedFlag(loading, 220);
  if (loading && showSkel) {
    return (
      <div className="owners-page app-wide-cap">
        <div className="page-header animate-in">
          <div className="page-header-info">
            <h2>בעלי נכסים</h2>
            <p>טוען…</p>
          </div>
        </div>
        <div className="owners-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="owner-card skel-card">
              <div className="skel skel-circle" />
              <div className="skel skel-line w-70" />
              <div className="skel skel-line w-50" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="owners-page app-wide-cap">
        <div className="page-header animate-in">
          <div className="page-header-info">
            <h2>בעלי נכסים</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PullRefresh onRefresh={load}>
      <PageTour
        pageKey="owners"
        steps={[
          { target: 'body', placement: 'center',
            title: 'בעלי הנכסים שלך',
            content: 'ספר המוכרים והמשכירים. כל בעל נכס מקושר לנכסים שלו. החליקו על שורה לחיוג, וואטסאפ או פתיחת הכרטיס המלא.' },
        ]}
      />
      <div className="owners-page app-wide-cap">
        <div className="page-header animate-in">
          <div className="page-header-info">
            <h2>בעלי נכסים</h2>
            <p>
              {filtered.length} מתוך {owners.length} בעלי נכסים
            </p>
          </div>
          <div className="page-header-actions owners-header-actions-desktop">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditing({})}
            >
              <UserPlus size={18} />
              בעל נכס חדש
            </button>
          </div>
        </div>

        <div className="owners-toolbar animate-in animate-in-delay-1">
          <div className="sticky-search owners-sticky-search">
            <div className="search-box owners-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="חיפוש לפי שם, טלפון או אימייל…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="owners-search-clear"
                  onClick={() => setSearch('')}
                  aria-label="נקה חיפוש"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="owners-empty animate-in animate-in-delay-2">
            <div className="oe-illustration">🏠</div>
            <h3>{owners.length === 0 ? 'עוד אין בעלי נכסים במערכת' : 'אין תוצאות לחיפוש'}</h3>
            <p>
              {owners.length === 0
                ? 'הוסף בעל נכס ראשון כדי להתחיל לעקוב אחרי קשרי הבעלות לנכסים.'
                : 'נסה לשנות את החיפוש או לנקות את השדה.'}
            </p>
            {owners.length === 0 && (
              <button className="btn btn-primary btn-lg" onClick={() => setEditing({})}>
                <UserPlus size={18} />
                בעל נכס חדש
              </button>
            )}
          </div>
        ) : isMobile ? (
          <div className="owners-list animate-in animate-in-delay-2">
            {filtered.map((o) => {
              const createdRel = o.createdAt ? relativeDate(o.createdAt) : null;
              const swipeActions = [
                {
                  icon: Phone,
                  label: 'התקשר',
                  color: 'gold',
                  onClick: () => {
                    if (!o.phone) return;
                    haptics.tap();
                    window.open(telUrl(o.phone), '_self');
                  },
                },
                {
                  icon: WhatsAppIcon,
                  label: 'וואטסאפ',
                  color: 'green',
                  onClick: () => {
                    if (!o.phone) return;
                    haptics.tap();
                    openWhatsApp({ phone: o.phone, text: `שלום ${o.name}` });
                  },
                },
                {
                  icon: ChevronLeft,
                  label: 'פתח',
                  color: 'gold-border',
                  onClick: () => {
                    haptics.tap();
                    navigate(`/owners/${o.id}`);
                  },
                },
              ];
              return (
                <div
                  key={o.id}
                  ref={(el) => { if (el) cardRefs.current[o.id] = el; }}
                  className="owner-row-wrap"
                >
                  <SwipeRow actions={swipeActions}>
                    <Link
                      to={`/owners/${o.id}`}
                      className="owner-row"
                      onClick={() => haptics.tap()}
                    >
                      <div className="owner-row-avatar" aria-hidden="true">
                        {(o.name || '?').charAt(0)}
                      </div>
                      <div className="owner-row-meta">
                        <strong className="owner-row-name">{o.name}</strong>
                        <span className="owner-row-phone">{o.phone || '—'}</span>
                        {createdRel && (
                          <span className="owner-row-created">
                            נוסף {createdRel.label}
                          </span>
                        )}
                      </div>
                      <span className="owner-pill" title={`${o.propertyCount || 0} נכסים`}>
                        <Building2 size={11} />
                        <strong>{o.propertyCount || 0}</strong>
                        <span>נכסים</span>
                      </span>
                      <span className="owner-row-chev" aria-hidden="true">
                        <ChevronLeft size={16} />
                      </span>
                    </Link>
                  </SwipeRow>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="owners-grid animate-in animate-in-delay-2">
            {filtered.map((o) => {
              const previews = (o.properties || []).slice(0, 2);
              const createdRel = o.createdAt ? relativeDate(o.createdAt) : null;
              return (
                <Link
                  key={o.id}
                  to={`/owners/${o.id}`}
                  className="owner-card"
                  ref={(el) => { if (el) cardRefs.current[o.id] = el; }}
                >
                  <div className="owner-card-head">
                    <div className="owner-card-avatar" aria-hidden="true">
                      {(o.name || '?').charAt(0)}
                    </div>
                    <div className="owner-card-info">
                      <strong className="owner-card-name">{o.name}</strong>
                      <span className="owner-card-phone">{o.phone || '—'}</span>
                      {o.email && <span className="owner-card-email">{o.email}</span>}
                      {createdRel && (
                        <span className="owner-card-created">נוסף {createdRel.label}</span>
                      )}
                    </div>
                    <span className="owner-pill" title={`${o.propertyCount || 0} נכסים`}>
                      <Building2 size={11} />
                      <strong>{o.propertyCount || 0}</strong>
                      <span>נכסים</span>
                    </span>
                  </div>
                  {previews.length > 0 && (
                    <div className="owner-card-preview">
                      {previews.map((p) => (
                        <span key={p.id} className="owner-card-prop">
                          {[p.street, p.city].filter(Boolean).join(', ')}
                        </span>
                      ))}
                      {o.properties && o.properties.length > previews.length && (
                        <span className="owner-card-more">
                          +{o.properties.length - previews.length} נוספים
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* Mobile-only floating FAB — adds a new owner */}
        {isMobile && (
          <button
            type="button"
            className="owners-fab"
            onClick={() => { haptics.tap(); setEditing({}); }}
            aria-label="בעל נכס חדש"
          >
            <UserPlus size={18} />
            <span>בעל נכס חדש</span>
          </button>
        )}

        {editing !== null && (
          <OwnerEditDialog
            owner={editing.id ? editing : null}
            onClose={() => setEditing(null)}
            onSaved={onSaved}
          />
        )}
      </div>
    </PullRefresh>
  );
}
