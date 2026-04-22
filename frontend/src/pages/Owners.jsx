import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Search, Phone, Building2, X, MessageSquare, ChevronLeft } from 'lucide-react';
import api from '../lib/api';
import { useRouteScrollRestore } from '../hooks/useScrollRestore';
import OwnerEditDialog from '../components/OwnerEditDialog';
import PullRefresh from '../components/PullRefresh';
import SwipeRow from '../components/SwipeRow';
import WhatsAppIcon from '../components/WhatsAppIcon';
import FavoriteStar from '../components/FavoriteStar';
import { useViewportMobile, useDelayedFlag } from '../hooks/mobile';
import PageTour from '../components/PageTour';
import { pageCache } from '../lib/pageCache';
import { useToast } from '../lib/toast';
import { telUrl } from '../lib/waLink';
import { openWhatsApp } from '../native/share';
import { relativeDate } from '../lib/relativeDate';
import Pagination from '../components/Pagination';
import { paginate } from '../lib/pagination';
import useInfiniteScroll from '../lib/useInfiniteScroll';
import haptics from '../lib/haptics';
import ViewToggle from '../components/ViewToggle';
import DataTable from '../components/DataTable';
import { useViewMode } from '../lib/useViewMode';
import './Owners.css';

/**
 * Owners — list of every property-owner the agent has captured.
 * Cards on desktop; dense 64px swipe-able rows on mobile.
 */
export default function Owners() {
  const isMobile = useViewportMobile(820);
  const [viewMode, setViewMode] = useViewMode('owners', 'cards');
  const toast = useToast();
  const navigate = useNavigate();
  useRouteScrollRestore();
  // Seed from cache so a return trip paints instantly.
  const _cached = pageCache.get('owners');
  const [owners, setOwners] = useState(_cached || []);
  const [loading, setLoading] = useState(!_cached);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (new) | owner (edit)
  // Lane 2 — favorite ids for OWNER entities. Seeded from /api/favorites
  // so the star on each card reflects the current state before any toggle.
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const cardRefs = useRef({});

  const load = useCallback(async () => {
    try {
      const res = await api.listOwners();
      const next = res?.items || [];
      setOwners(next);
      pageCache.set('owners', next);
    } catch (e) {
      toast?.error?.(e?.message || 'טעינת בעלי הנכסים נכשלה');
      setOwners([]);
    }
  }, [toast]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    // Seed favorite stars for OWNER — failures are non-fatal, each card
    // simply shows an empty star until the agent toggles it.
    api.listFavorites('OWNER')
      .then((r) => {
        const ids = new Set((r?.items || []).map((f) => f.entityId));
        setFavoriteIds(ids);
      })
      .catch(() => { /* ignore */ });
  }, [load]);

  // Toggle an owner's favorite state with an optimistic update that
  // rolls back on failure. Mirrors the Customers page pattern so the
  // star flips the moment the agent taps.
  const handleToggleFavorite = async (ownerId, nextActive) => {
    setFavoriteIds((cur) => {
      const copy = new Set(cur);
      if (nextActive) copy.add(ownerId);
      else copy.delete(ownerId);
      return copy;
    });
    try {
      if (nextActive) {
        await api.addFavorite({ entityType: 'OWNER', entityId: ownerId });
      } else {
        await api.removeFavorite('OWNER', ownerId);
      }
    } catch (e) {
      setFavoriteIds((cur) => {
        const copy = new Set(cur);
        if (nextActive) copy.delete(ownerId);
        else copy.add(ownerId);
        return copy;
      });
      toast?.error?.(e?.message || 'שינוי המועדפים נכשל');
    }
  };

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

  // Table view → numbered pager; card/mobile list → infinite scroll.
  // Both reset when the search narrows.
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search]);
  const paged = useMemo(() => paginate(filtered, { page, pageSize: 8 }), [filtered, page]);
  const infinite = useInfiniteScroll(filtered.length, { pageSize: 8, initial: 8 });
  const cardVisible = useMemo(() => filtered.slice(0, infinite.visible), [filtered, infinite.visible]);

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
            <ViewToggle value={viewMode} onChange={setViewMode} />
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
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
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
            {cardVisible.map((o) => {
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
                      {/* Lane 2 — favorite toggle sits at the row start
                          (top-left in RTL). stopPropagation keeps the
                          tap from opening the owner detail page. */}
                      <span className="owner-row-fav" onClick={(e) => e.stopPropagation()}>
                        <FavoriteStar
                          active={favoriteIds.has(o.id)}
                          onToggle={(next) => handleToggleFavorite(o.id, next)}
                          className="fav-star-sm"
                        />
                      </span>
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
            {infinite.hasMore && (
              <div ref={infinite.sentinelRef} className="infinite-sentinel" aria-hidden="true" />
            )}
          </div>
        ) : (viewMode === 'table' && !isMobile) ? (
          <DataTable
            ariaLabel="טבלת בעלי נכסים"
            rows={paged.slice}
            rowKey={(o) => o.id}
            onRowClick={(o) => navigate(`/owners/${o.id}`)}
            columns={[
              {
                key: 'name', header: 'שם', sortable: true,
                sortValue: (o) => o.name || '',
                render: (o) => <strong>{o.name}</strong>,
              },
              {
                key: 'phone', header: 'טלפון',
                render: (o) => o.phone || <span className="cell-muted">—</span>,
              },
              {
                key: 'email', header: 'אימייל',
                render: (o) => o.email || <span className="cell-muted">—</span>,
              },
              {
                key: 'propertyCount', header: 'נכסים', sortable: true, className: 'cell-num',
                sortValue: (o) => o.propertyCount || 0,
                render: (o) => <span className="cell-pill">{o.propertyCount || 0}</span>,
              },
              {
                key: 'preview', header: 'כתובת ראשונה',
                render: (o) => {
                  const p = (o.properties || [])[0];
                  return p
                    ? <span className="cell-muted">{[p.street, p.city].filter(Boolean).join(', ')}</span>
                    : <span className="cell-muted">—</span>;
                },
              },
              {
                key: 'created', header: 'נוסף', sortable: true,
                sortValue: (o) => (o.createdAt ? new Date(o.createdAt).getTime() : 0),
                render: (o) => {
                  const r = o.createdAt ? relativeDate(o.createdAt) : null;
                  return r ? <span className="cell-muted">{r.label}</span> : <span className="cell-muted">—</span>;
                },
              },
            ]}
          />
        ) : (
          <div className="owners-grid animate-in animate-in-delay-2">
            {cardVisible.map((o) => {
              const previews = (o.properties || []).slice(0, 2);
              const createdRel = o.createdAt ? relativeDate(o.createdAt) : null;
              return (
                <Link
                  key={o.id}
                  to={`/owners/${o.id}`}
                  className="owner-card"
                  ref={(el) => { if (el) cardRefs.current[o.id] = el; }}
                >
                  {/* Lane 2 — favorite toggle anchored top-left of each
                      card. FavoriteStar stops click propagation so it
                      won't also fire the card's <Link> navigation. */}
                  <span className="owner-card-fav" onClick={(e) => e.stopPropagation()}>
                    <FavoriteStar
                      active={favoriteIds.has(o.id)}
                      onToggle={(next) => handleToggleFavorite(o.id, next)}
                      className="fav-star-sm"
                    />
                  </span>
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
            {/* Card/mobile list → infinite-scroll sentinel. Hook
                disconnects itself once the full list is revealed. */}
            {infinite.hasMore && (
              <div ref={infinite.sentinelRef} className="infinite-sentinel" aria-hidden="true" />
            )}
          </div>
        )}

        {/* Table view keeps the numbered pager. */}
        {viewMode === 'table' && !isMobile && paged.needsPager && (
          <Pagination page={paged.page} pageCount={paged.pageCount} onPage={setPage} />
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
