import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Building2,
  MapPin,
  Bed,
  Maximize,
  LinkIcon,
  Check,
  SlidersHorizontal,
  Star,
  X,
  Navigation,
  Trash2,
  MoreHorizontal,
  Share2,
  ArrowLeftRight,
  Phone,
  CheckSquare,
  Square,
  Copy,
  Edit3,
  StickyNote,
} from 'lucide-react';
import api from '../lib/api';
import { formatFloor } from '../lib/formatFloor';
import { useAuth } from '../lib/auth';
import ConfirmDialog from '../components/ConfirmDialog';
import QuickEditDrawer from '../components/QuickEditDrawer';
import EmptyState from '../components/EmptyState';
import { useRouteScrollRestore } from '../hooks/useScrollRestore';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import WhatsAppSheet from '../components/WhatsAppSheet';
import PullRefresh from '../components/PullRefresh';
import LeadPickerSheet from '../components/LeadPickerSheet';
import TransferPropertyDialog from '../components/TransferPropertyDialog';
import SwipeRow from '../components/SwipeRow';
import WhatsAppIcon from '../components/WhatsAppIcon';
import StickyActionBar from '../components/StickyActionBar';
import { OverflowSheet } from '../components/MobilePickers';
import { useViewportMobile, useDelayedFlag } from '../hooks/mobile';
import PageTour from '../components/PageTour';
import { pageCache } from '../lib/pageCache';
import { shareSheet, openWhatsApp, shareWithPhotos } from '../native/share';
import { telUrl, wazeUrl } from '../lib/waLink';
import haptics from '../lib/haptics';
import { useToast } from '../lib/toast';
import {
  buildVariables as tplBuildVars,
  renderTemplate as tplRender,
  pickTemplateKind as tplPickKind,
} from '../lib/templates';
import {
  getDistanceKm,
  resolveLocation,
  allLocationNames,
} from '../data/mockData';
import FavoriteStar from '../components/FavoriteStar';
import ViewToggle from '../components/ViewToggle';
import DataTable from '../components/DataTable';
import { useViewMode } from '../lib/useViewMode';
import SavedSearchMenu from '../components/SavedSearchMenu';
import AdvancedFilters from '../components/AdvancedFilters';
import './Properties.css';

function formatPrice(price) {
  if (!price) return '—';
  if (price < 10000) return `₪${price.toLocaleString('he-IL')}/חודש`;
  return `₪${price.toLocaleString('he-IL')}`;
}

function buildWhatsAppMessage(prop, agent) {
  const lines = [];
  lines.push(`*${prop.type} — ${prop.street}, ${prop.city}*`);
  lines.push('');
  lines.push(`מחיר: ${formatPrice(prop.marketingPrice)}`);
  lines.push(`שטח: ${prop.sqm} מ״ר`);
  if (prop.rooms != null) lines.push(`חדרים: ${prop.rooms}`);
  if (prop.floor != null) lines.push(`קומה: ${formatFloor(prop.floor, prop.totalFloors)}`);
  if (prop.balconySize > 0) lines.push(`מרפסת: ${prop.balconySize} מ״ר`);
  lines.push(`חניה: ${prop.parking ? 'יש' : 'אין'}`);
  lines.push(`מחסן: ${prop.storage ? 'יש' : 'אין'}`);
  lines.push(`מזגנים: ${prop.ac ? 'יש' : 'אין'}`);
  if (prop.assetClass === 'RESIDENTIAL') {
    lines.push(`ממ״ד: ${prop.safeRoom ? 'יש' : 'אין'}`);
  }
  lines.push(`מעלית: ${prop.elevator ? 'יש' : 'אין'}`);
  if (prop.airDirections) lines.push(`כיווני אוויר: ${prop.airDirections}`);
  lines.push(`מצב: ${prop.renovated || '—'}`);
  if (prop.buildingAge != null) lines.push(`בניין בן: ${prop.buildingAge === 0 ? 'חדש' : `${prop.buildingAge} שנים`}`);
  if (prop.vacancyDate) lines.push(`פינוי: ${prop.vacancyDate}`);
  if (prop.notes) { lines.push(''); lines.push(prop.notes); }
  lines.push('');
  lines.push(`📷 תמונות ופרטים נוספים:`);
  const pUrl = prop.slug && agent?.slug
    ? `${window.location.origin}/agents/${encodeURI(agent.slug)}/${encodeURI(prop.slug)}`
    : `${window.location.origin}/p/${prop.id}`;
  lines.push(pUrl);
  if (agent?.displayName) {
    lines.push('');
    lines.push(`${agent.displayName} | ${agent.agency || ''} | ${agent.phone || ''}`);
  }
  return lines.join('\n');
}

// P3-M8 / P3-M9 — does a lead "match" a property? Returns boolean.
// Criteria: same assetClass, same interest (BUY↔SALE, RENT↔RENT),
// same city, price within [budget*0.85 .. budget*1.15] if budget set
// (lead model has no min/max), rooms within ±1.
export function leadMatchesProperty(lead, property) {
  if (!lead || !property) return false;
  // Asset class: lead.interestType (PRIVATE/COMMERCIAL) ↔ property.assetClass (RESIDENTIAL/COMMERCIAL)
  const leadAsset = lead.assetClass || (lead.interestType === 'COMMERCIAL' ? 'COMMERCIAL' : 'RESIDENTIAL');
  if (leadAsset !== property.assetClass) return false;
  // Category: lead.lookingFor (BUY/RENT) ↔ property.category (SALE/RENT)
  const wantsSale = lead.lookingFor === 'BUY' || lead.interest === 'BUY';
  const wantsRent = lead.lookingFor === 'RENT' || lead.interest === 'RENT';
  if (wantsSale && property.category !== 'SALE') return false;
  if (wantsRent && property.category !== 'RENT') return false;
  // City
  if (lead.city && property.city &&
      String(lead.city).trim() !== String(property.city).trim()) return false;
  // Price: support either explicit min/max or single budget number
  const price = property.marketingPrice;
  if (price) {
    const min = Number(lead.priceMin) || (lead.budget ? Math.round(lead.budget * 0.85) : null);
    const max = Number(lead.priceMax) || (lead.budget ? Math.round(lead.budget * 1.15) : null);
    if (min && price < min) return false;
    if (max && price > max) return false;
  }
  // Rooms within ±1 (lead.rooms may be a string like "3" or "3-4")
  const pr = parseFloat(property.rooms);
  if (!isNaN(pr) && lead.rooms != null && lead.rooms !== '') {
    const tokens = String(lead.rooms).match(/\d+(\.\d+)?/g) || [];
    if (tokens.length) {
      const nums = tokens.map(Number);
      const lo = Math.min(...nums);
      const hi = Math.max(...nums);
      if (pr < lo - 1 || pr > hi + 1) return false;
    }
  }
  return true;
}

// N-9 — "קישור ללקוח" previously pointed at `/share?...` which isn't a
// registered route (404). The correct public-facing destination is the
// agent's own portal (`/agents/:slug` or `/a/:agentId`) with filter
// query params the portal hydrates into its own state.
function buildShareUrl(agent, filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, val]) => {
    if (val && val !== 'all') params.set(key, val);
  });
  const base = agent?.slug
    ? `${window.location.origin}/agents/${encodeURI(agent.slug)}`
    : `${window.location.origin}/a/${agent?.id || ''}`;
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default function Properties() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isMobile = useViewportMobile(820);
  // Desktop-only view-mode toggle. Mobile always uses compact cards.
  const [viewMode, setViewMode] = useViewMode('properties', 'cards');
  // F-6.3 — preserve scroll when the agent goes deep into a property
  // card and pops back. Critical for 500-row lists on desktop.
  useRouteScrollRestore();

  // Seed state from the in-memory pageCache so a return to this tab
  // paints the previous result INSTANTLY — no empty-page flash while
  // the background fetch runs. First visit: cache is null so we fall
  // back to empty + show skeleton.
  const toast = useToast();
  const _cached = pageCache.get('properties');
  const [items, setItems] = useState(_cached || []);
  const [loading, setLoading] = useState(!_cached);
  const showPropsSkel = useDelayedFlag(loading, 220);
  // F-6.5 — filters live in URL so they survive refresh and are
  // shareable. Seed each piece of state from `searchParams`; writes
  // flow back via setSearchParams below.
  const [filter, setFilter] = useState(() => searchParams.get('cat') || 'all');
  const [assetClassFilter, setAssetClassFilter] = useState(() => searchParams.get('ac') || 'all');
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [showAdvanced, setShowAdvanced] = useState(() => searchParams.get('adv') === '1');
  const [copiedLink, setCopiedLink] = useState(false);
  const [locationQuery, setLocationQuery] = useState(() => searchParams.get('near') || '');
  const [locationRadius, setLocationRadius] = useState(() => Number(searchParams.get('km')) || 5);
  const [advFilters, setAdvFilters] = useState(() => ({
    city:     searchParams.get('city') || '',
    minPrice: searchParams.get('minP') || null,
    maxPrice: searchParams.get('maxP') || null,
    minRooms: searchParams.get('minR') || '',
    maxRooms: searchParams.get('maxR') || '',
    minSqm:   searchParams.get('minS') || null,
    maxSqm:   searchParams.get('maxS') || null,
  }));
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // N-10 — "רק מועדפים" toggle state. Declared UP HERE (not next to the
  // other favorite state lower in the component) because the URL-sync
  // effect below depends on it; the bundle minifier TDZ trap that F-6.5
  // already warns about would otherwise crash the /properties route.
  const [onlyFavorites, setOnlyFavorites] = useState(() => searchParams.get('fav') === '1');

  // F-6.5 — write filters back to the URL so refresh / share link /
  // back-forward all land on the same view. MUST sit after the state
  // declarations it depends on — in the minified prod bundle, putting
  // this effect ABOVE the useStates it references triggers a TDZ
  // ("Cannot access 'v' before initialization") that crashes the
  // /properties route inside RootErrorBoundary. Dev mode doesn't mind;
  // the rolldown minifier reorders aggressively.
  useEffect(() => {
    const next = new URLSearchParams();
    if (search)                     next.set('q', search);
    if (filter !== 'all')           next.set('cat', filter);
    if (assetClassFilter !== 'all') next.set('ac', assetClassFilter);
    if (showAdvanced)               next.set('adv', '1');
    if (locationQuery)              next.set('near', locationQuery);
    if (locationRadius !== 5)       next.set('km', String(locationRadius));
    if (advFilters.city)            next.set('city', advFilters.city);
    if (advFilters.minPrice)        next.set('minP', String(advFilters.minPrice));
    if (advFilters.maxPrice)        next.set('maxP', String(advFilters.maxPrice));
    if (advFilters.minRooms)        next.set('minR', String(advFilters.minRooms));
    if (advFilters.maxRooms)        next.set('maxR', String(advFilters.maxRooms));
    if (advFilters.minSqm)          next.set('minS', String(advFilters.minSqm));
    if (advFilters.maxSqm)          next.set('maxS', String(advFilters.maxSqm));
    if (onlyFavorites)              next.set('fav', '1');
    const nextStr = next.toString();
    const curStr = searchParams.toString();
    if (nextStr !== curStr) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter, assetClassFilter, showAdvanced, locationQuery, locationRadius, advFilters, onlyFavorites]);

  // Bulk selection mode. When `selectMode` is true, card taps toggle
  // membership in `selectedIds` instead of navigating to the detail page.
  // Long-press anywhere on a card also enters selection mode + selects.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total }

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Press-and-hold on a card enters selection mode + selects that card.
  // Mirrors iOS native pattern. Touch + mouse handled together via the
  // custom hook below; the timer resets on early move/up so a normal
  // tap or scroll doesn't accidentally trigger select.
  const longPressBind = useCallback((id) => ({
    onTouchStart: () => {
      const t = setTimeout(() => {
        haptics.press();
        setSelectMode(true);
        setSelectedIds((cur) => {
          const next = new Set(cur); next.add(id); return next;
        });
      }, 450);
      const cancel = () => clearTimeout(t);
      const root = document;
      root.addEventListener('touchmove', cancel, { once: true, passive: true });
      root.addEventListener('touchend',  cancel, { once: true, passive: true });
      root.addEventListener('touchcancel', cancel, { once: true, passive: true });
    },
  }), []);

  // ESC exits selection mode on desktop.
  useEffect(() => {
    if (!selectMode) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') exitSelect(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode, exitSelect]);

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    setBulkProgress({ done: 0, total: ids.length });
    let done = 0;
    let failed = 0;
    // F-3 — snapshot what's about to be deleted so the undo toast can
    // best-effort re-create them. Photos are NOT restorable (the delete
    // path cleans S3 keys). That limitation is surfaced in the undo
    // toast copy ("ללא תמונות").
    const snapshots = items.filter((p) => selectedIds.has(p.id));
    for (const id of ids) {
      try {
        await api.deleteProperty(id);
        done++;
      } catch {
        failed++;
      } finally {
        setBulkProgress({ done: done + failed, total: ids.length });
      }
    }
    setBulkBusy(false);
    setBulkProgress(null);
    setBulkConfirm(false);
    exitSelect();
    await load();
    if (failed === 0) {
      toast?.success?.(`נמחקו ${done} נכסים · ללא תמונות אחרי שחזור`, {
        duration: 10_000,
        action: {
          label: 'בטל',
          onClick: async () => {
            let restored = 0;
            for (const p of snapshots) {
              try {
                await api.createProperty({
                  assetClass: p.assetClass || 'RESIDENTIAL',
                  category: p.category || 'SALE',
                  street: p.street,
                  city: p.city,
                  owner: p.owner || 'שחזור',
                  ownerPhone: p.ownerPhone || '',
                  marketingPrice: p.marketingPrice,
                  sqm: p.sqm,
                  type: p.type,
                  rooms: p.rooms,
                  floor: p.floor,
                  notes: p.notes,
                });
                restored++;
              } catch { /* continue */ }
            }
            await load();
            toast?.success?.(`שוחזרו ${restored} נכסים`);
          },
        },
      });
      haptics.success();
    } else if (done === 0) {
      toast?.error?.('המחיקה נכשלה');
      haptics.error();
    } else {
      toast?.warning?.(`נמחקו ${done} מתוך ${ids.length} — ${failed} נכשלו`);
    }
  };
  const [waShare, setWaShare] = useState(null); // { text, title }
  const [templates, setTemplates] = useState(null);
  const [leads, setLeads] = useState([]);
  const [leadPickerFor, setLeadPickerFor] = useState(null); // prop being shared
  const [overflowFor, setOverflowFor] = useState(null); // prop for ⋯ menu
  const [similarFor, setSimilarFor] = useState(null); // prop for "חפש דומים"
  const [transferProp, setTransferProp] = useState(null);
  // N-7 removed the page-level ⋯ sheet; `pageOverflowOpen` is gone and the
  // two actions it hid now live in the toolbar as direct buttons.
  const [matchesPickerFor, setMatchesPickerFor] = useState(null); // P3-M8: { prop, leads }

  // Sprint 7 B4 — favorites for properties. Seed the id set once so each
  // card's star reflects the current state without waiting for the first
  // toggle. Empty set on failure is fine; the star just starts inactive.
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());

  useEffect(() => {
    api.listTemplates().then((r) => setTemplates(r.templates || [])).catch(() => {});
    api.listLeads().then((r) => setLeads(r.items || r.leads || [])).catch(() => {});
    api.listFavorites('PROPERTY')
      .then((r) => {
        const ids = new Set((r?.items || []).map((f) => f.entityId));
        setFavoriteIds(ids);
      })
      .catch(() => { /* ignore — empty set is the safe default */ });
  }, []);

  // Sprint 7 B4 — optimistic toggle. Flip the set immediately; roll back
  // and surface a toast if the API call fails.
  const handleToggleFavorite = async (propertyId, nextActive) => {
    setFavoriteIds((cur) => {
      const copy = new Set(cur);
      if (nextActive) copy.add(propertyId);
      else copy.delete(propertyId);
      return copy;
    });
    try {
      if (nextActive) {
        await api.addFavorite({ entityType: 'PROPERTY', entityId: propertyId });
      } else {
        await api.removeFavorite('PROPERTY', propertyId);
      }
    } catch (e) {
      setFavoriteIds((cur) => {
        const copy = new Set(cur);
        if (nextActive) copy.delete(propertyId);
        else copy.add(propertyId);
        return copy;
      });
      toast?.error?.(e?.message || 'שינוי המועדפים נכשל');
    }
  };

  // Sprint 7 B3 — snapshot the current filter set as a plain object the
  // SavedSearchMenu can persist, and apply a loaded snapshot back to
  // local state. Keys match the `?assetClass=…&category=…&city=…&search=…`
  // URL contract so saved searches double as shareable links.
  const currentSavedFilters = useMemo(() => ({
    assetClass: assetClassFilter,
    category: filter,
    city: advFilters.city || '',
    search: search || '',
  }), [assetClassFilter, filter, advFilters.city, search]);

  const handleLoadSavedSearch = (filters) => {
    const f = filters || {};
    setAssetClassFilter(f.assetClass || 'all');
    setFilter(f.category || 'all');
    setAdvFilters((prev) => ({ ...prev, city: f.city || '' }));
    setSearch(f.search || '');
    // The URL-sync effect above writes these state changes back to
    // searchParams on the next tick; the properties list already reacts
    // to `filter`/`assetClassFilter`/`advFilters.city`/`search` via the
    // `filtered` memo, so no explicit refetch is needed here.
  };

  const load = async () => {
    try {
      const res = await api.listProperties({ mine: '1' });
      const next = res.items || [];
      setItems(next);
      pageCache.set('properties', next);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // T3 — when the list has ≤1 asset the content already fits the viewport
  // (or there's just a single 96px card). Disable iOS rubber-band bounce
  // while we're on the page so swiping up doesn't tug a basically-empty
  // canvas. Restore the default on unmount so other pages keep their
  // native bounce. Doesn't affect PullRefresh — that's JS-driven.
  useEffect(() => {
    if (items.length > 1) return undefined;
    const prev = document.body.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = 'none';
    return () => { document.body.style.overscrollBehaviorY = prev; };
  }, [items.length]);

  // S12: Dashboard "היום" strip deep-links here with ?filter=unmarketed to
  // show only properties where no marketing action has been ticked yet. Stored
  // as its own flag so the existing SALE/RENT `filter` doesn't conflict.
  const [unmarketedOnly, setUnmarketedOnly] = useState(false);

  useEffect(() => {
    const ac = searchParams.get('assetClass');
    if (ac === 'residential') setAssetClassFilter('RESIDENTIAL');
    if (ac === 'commercial') setAssetClassFilter('COMMERCIAL');
    const cat = searchParams.get('category');
    if (cat === 'sale') setFilter('SALE');
    if (cat === 'rent') setFilter('RENT');
    setUnmarketedOnly(searchParams.get('filter') === 'unmarketed');
  }, [searchParams]);

  const locationCenter = useMemo(() => resolveLocation(locationQuery), [locationQuery]);

  // F-3.4 + F-8.5 — debounce the search input so the 500-row list isn't
  // re-filtered on every keystroke. 200ms is tight enough to feel
  // live; bigger lists should consider 300ms.
  const debouncedSearch = useDebouncedValue(search, 200);
  const filtered = useMemo(() => {
    return items
      .map((p) => {
        let distance = null;
        if (locationCenter && p.lat && p.lng) {
          distance = getDistanceKm(locationCenter.lat, locationCenter.lng, p.lat, p.lng);
        }
        return { ...p, _distance: distance };
      })
      .filter((p) => {
        if (filter === 'SALE' && p.category !== 'SALE') return false;
        if (filter === 'RENT' && p.category !== 'RENT') return false;
        if (assetClassFilter === 'RESIDENTIAL' && p.assetClass !== 'RESIDENTIAL') return false;
        if (assetClassFilter === 'COMMERCIAL' && p.assetClass !== 'COMMERCIAL') return false;
        if (advFilters.city && p.city !== advFilters.city) return false;
        if (advFilters.minPrice && p.marketingPrice < Number(advFilters.minPrice)) return false;
        if (advFilters.maxPrice && p.marketingPrice > Number(advFilters.maxPrice)) return false;
        if (advFilters.minRooms && p.rooms != null && p.rooms < Number(advFilters.minRooms)) return false;
        if (advFilters.maxRooms && p.rooms != null && p.rooms > Number(advFilters.maxRooms)) return false;
        if (advFilters.minSqm && p.sqm < Number(advFilters.minSqm)) return false;
        if (advFilters.maxSqm && p.sqm > Number(advFilters.maxSqm)) return false;
        if (unmarketedOnly) {
          const acts = Object.values(p.marketingActions || {});
          const anyDone = acts.some((v) => !!v);
          if (anyDone) return false;
        }
        // N-10 — favorites-only toggle narrows the list to the starred
        // property set. Mirrors the pattern already on /customers.
        if (onlyFavorites && !favoriteIds.has(p.id)) return false;
        if (locationCenter && p._distance != null && p._distance > locationRadius) return false;
        if (debouncedSearch) {
          const s = debouncedSearch.toLowerCase();
          return (
            p.street?.toLowerCase().includes(s) ||
            p.city?.toLowerCase().includes(s) ||
            p.owner?.toLowerCase().includes(s) ||
            p.type?.toLowerCase().includes(s)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (a._distance != null && b._distance != null) return a._distance - b._distance;
        return 0;
      });
  }, [items, filter, assetClassFilter, advFilters, debouncedSearch, locationCenter, locationRadius, unmarketedOnly, onlyFavorites, favoriteIds]);

  const cities = [...new Set(items.map((p) => p.city))];

  // P3-M8 — pre-compute matched leads per property
  const matchesByProp = useMemo(() => {
    const map = new Map();
    items.forEach((p) => {
      const matches = (leads || []).filter((l) => leadMatchesProperty(l, p));
      map.set(p.id, matches);
    });
    return map;
  }, [items, leads]);

  // P1-M16 — push count into the breadcrumb on mobile
  useEffect(() => {
    if (!isMobile) return undefined;
    window.dispatchEvent(new CustomEvent('estia:title', { detail: `נכסים · ${filtered.length}` }));
    return () => {
      window.dispatchEvent(new CustomEvent('estia:title', { detail: '' }));
    };
  }, [isMobile, filtered.length]);

  const agentInfo = {
    displayName: user?.displayName,
    agency: user?.agentProfile?.agency,
    phone: user?.phone,
  };

  const buildMessageForProp = (prop) => {
    const kind = tplPickKind(prop, 'client');
    const tpl = templates?.find((t) => t.kind === kind);
    if (tpl?.body) {
      const vars = tplBuildVars(prop, user, { stripAgent: false });
      return tplRender(tpl.body, vars);
    }
    return buildWhatsAppMessage(prop, agentInfo);
  };

  // Entry point for sharing: show lead picker first; fall back to WhatsAppSheet
  // (no recipient) if user taps "פתח ללא נמען".
  const handleWhatsApp = (e, prop) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    haptics.tap();
    setLeadPickerFor(prop);
  };

  const handlePickLead = async (lead, editedText, opts) => {
    const prop = leadPickerFor;
    setLeadPickerFor(null);
    if (!prop) return;
    const text = editedText || buildMessageForProp(prop);
    const url = prop.slug && user?.slug
      ? `${window.location.origin}/agents/${encodeURI(user.slug)}/${encodeURI(prop.slug)}`
      : `${window.location.origin}/p/${prop.id}`;
    // Native iOS only: share with photos via OS share sheet
    if (opts?.withPhotos) {
      await shareWithPhotos({
        photos: opts.photos,
        text,
        title: `${prop.street}, ${prop.city}`,
        url,
      });
      return;
    }
    await openWhatsApp({ phone: lead?.phone, text });
  };

  const handleGenerateLink = () => {
    const shareFilters = {
      assetClass: assetClassFilter,
      category: filter,
      city: advFilters.city,
      minPrice: advFilters.minPrice,
      maxPrice: advFilters.maxPrice,
      minRooms: advFilters.minRooms,
      maxRooms: advFilters.maxRooms,
      minSqm: advFilters.minSqm,
      maxSqm: advFilters.maxSqm,
    };
    const url = buildShareUrl(user, shareFilters);
    navigator.clipboard.writeText(url);
    toast?.success?.('הקישור הועתק');
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const activeFilterCount = (
    (advFilters.city ? 1 : 0) +
    (advFilters.minPrice ? 1 : 0) +
    (advFilters.maxPrice ? 1 : 0) +
    (advFilters.minRooms ? 1 : 0) +
    (advFilters.maxRooms ? 1 : 0) +
    (advFilters.minSqm ? 1 : 0) +
    (advFilters.maxSqm ? 1 : 0) +
    (locationQuery ? 1 : 0)
  );
  const hasActiveFilters = activeFilterCount > 0;
  const anyFilterActive = hasActiveFilters || filter !== 'all' || assetClassFilter !== 'all' || (search || '').trim().length > 0 || onlyFavorites;
  // N-12 — "נקה סינון" not only resets the fields but also COLLAPSES the
  // `סינון מתקדם` panel. Previously the panel stayed open after clearing,
  // forcing the agent to close it manually.
  const clearAllFilters = () => {
    setSearch('');
    setFilter('all');
    setAssetClassFilter('all');
    setAdvFilters({ city: '', minRooms: '', maxRooms: '', minSqm: null, maxSqm: null, minPrice: null, maxPrice: null });
    setLocationQuery('');
    setLocationRadius(5);
    setOnlyFavorites(false);
    setShowAdvanced(false);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteProperty(toDelete.id);
      setToDelete(null);
      await load();
    } catch { /* ignore */ }
    setDeleting(false);
  };

  const openOverflow = (e, prop) => {
    e.preventDefault();
    e.stopPropagation();
    setOverflowFor(prop);
  };

  // 5.1 — Duplicate action. Backend creates a fresh draft with "(עותק)"
  // appended; we navigate straight to the edit screen so the agent can
  // tweak the address/price — the common reason to duplicate.
  const navigate = useNavigate();
  const [duplicating, setDuplicating] = useState(null);
  const handleDuplicate = async (e, prop) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (duplicating) return;
    setDuplicating(prop.id);
    try {
      const { property: created } = await api.duplicateProperty(prop.id);
      haptics?.press?.();
      // Hand off to the edit screen — agents almost always want to tweak
      // address/price before the duplicate goes live.
      navigate(`/properties/${created.id}/edit?duplicated=1`);
    } catch (err) {
      // Surface the failure through the shared toast system (the project
      // convention — no console.log/error in shipped code). Falls back to
      // a generic Hebrew message when the server didn't send one.
      toast.error(err?.message || 'שכפול הנכס נכשל');
    } finally {
      setDuplicating(null);
    }
  };

  // 5.2 — Quick-edit drawer. Opens the most commonly edited fields
  // (price, status, notes) inline without leaving the list page.
  const [quickEditFor, setQuickEditFor] = useState(null);
  const openQuickEdit = (e, prop) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setQuickEditFor(prop);
  };

  const openSimilar = (e, prop) => {
    e.preventDefault();
    e.stopPropagation();
    setSimilarFor(prop);
  };

  const applySimilarRooms = (prop) => {
    if (prop.rooms == null) return;
    setAdvFilters((f) => ({
      ...f,
      minRooms: String(prop.rooms),
      maxRooms: String(prop.rooms),
    }));
    setShowAdvanced(true);
  };

  const applySimilarSqm = (prop) => {
    const band = 10;
    setAdvFilters((f) => ({
      ...f,
      minSqm: Math.max(0, prop.sqm - band),
      maxSqm: prop.sqm + band,
    }));
    setShowAdvanced(true);
  };

  const applySimilarCity = (prop) => {
    setAdvFilters((f) => ({ ...f, city: prop.city }));
    setShowAdvanced(true);
  };

  const handleShareProp = async (prop) => {
    const url = prop.slug && user?.slug
      ? `${window.location.origin}/agents/${encodeURI(user.slug)}/${encodeURI(prop.slug)}`
      : `${window.location.origin}/p/${prop.id}`;
    await shareSheet({
      title: `${prop.street}, ${prop.city}`,
      text: `${prop.type} — ${formatPrice(prop.marketingPrice)}`,
      url,
    });
  };

  const overflowActions = overflowFor
    ? [
        {
          label: 'עריכה מהירה',
          icon: Edit3,
          onClick: () => openQuickEdit(null, overflowFor),
        },
        {
          label: 'שכפל נכס',
          icon: Copy,
          onClick: () => handleDuplicate(null, overflowFor),
        },
        {
          label: 'חיפוש נכסים דומים',
          icon: MoreHorizontal,
          onClick: () => setSimilarFor(overflowFor),
        },
        {
          label: 'שיתוף',
          icon: Share2,
          onClick: () => handleShareProp(overflowFor),
        },
        {
          label: 'העברה לסוכן אחר',
          icon: ArrowLeftRight,
          onClick: () => setTransferProp(overflowFor),
        },
        {
          label: 'מחק נכס',
          icon: Trash2,
          color: 'danger',
          onClick: () => setToDelete(overflowFor),
        },
      ]
    : [];

  const similarActions = similarFor
    ? [
        ...(similarFor.rooms != null
          ? [{
              label: `נכסים עם ${similarFor.rooms} חדרים`,
              icon: Bed,
              onClick: () => applySimilarRooms(similarFor),
            }]
          : []),
        {
          label: `נכסים בגודל דומה (${similarFor.sqm} מ״ר)`,
          icon: Maximize,
          onClick: () => applySimilarSqm(similarFor),
        },
        {
          label: `נכסים בעיר ${similarFor.city}`,
          icon: Building2,
          onClick: () => applySimilarCity(similarFor),
        },
      ]
    : [];

  return (
    <PullRefresh onRefresh={load}>
    <>
    <PageTour
      pageKey="properties"
      steps={[
        { target: 'body', placement: 'center',
          title: 'הנכסים שלך',
          content: 'כל הנכסים במקום אחד. לחצו על כרטיס כדי לפתוח, החליקו ימינה לפעולות מהירות, או הוסיפו נכס חדש בכפתור ה-+.' },
      ]}
    />
    <div className="properties-page app-wide-cap">
      {/* P1-M16 — desktop-only page header. Mobile uses breadcrumb + ⋯ + bottom FAB. */}
      {!isMobile && (
        <div className="page-header animate-in">
          <div className="page-header-info">
            <h2>הנכסים שלי</h2>
            <p>{filtered.length} מתוך {items.length} נכסים</p>
          </div>
          <div className="page-header-actions">
            {/* N-7 — the top-left ⋯ menu previously hid "בחירה מרובה" and
                "קישור ללקוח" inside a popover. Per the punch list both are
                now exposed as direct toolbar buttons so the action surface
                is always visible. The ⋯ is gone entirely on desktop. */}
            <ViewToggle value={viewMode} onChange={setViewMode} />
            {/* Sprint 7 B3 — saved-search menu for the current filter set. */}
            <SavedSearchMenu
              entityType="PROPERTY"
              currentFilters={currentSavedFilters}
              onLoad={handleLoadSavedSearch}
            />
            {/* N-10 — favorites-only toggle, same pattern as /customers. */}
            <button
              type="button"
              className={`btn btn-ghost btn-sm ${onlyFavorites ? 'is-active' : ''}`}
              onClick={() => setOnlyFavorites((v) => !v)}
              aria-pressed={onlyFavorites}
              aria-label="רק מועדפים"
              title="הצג רק נכסים במועדפים"
            >
              <Star size={14} aria-hidden="true" fill={onlyFavorites ? 'currentColor' : 'none'} />
              <span>רק מועדפים</span>
            </button>
            <button
              type="button"
              className={`btn btn-ghost btn-sm ${selectMode ? 'is-active' : ''}`}
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              aria-pressed={selectMode}
              title="בחר כמה נכסים בבת אחת"
            >
              <CheckSquare size={14} aria-hidden="true" />
              <span>{selectMode ? 'יציאה מבחירה' : 'בחירה מרובה'}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleGenerateLink}
              title="העתק קישור ציבורי ללקוח עם הסינון הנוכחי"
            >
              {copiedLink ? <Check size={14} aria-hidden="true" /> : <LinkIcon size={14} aria-hidden="true" />}
              <span>{copiedLink ? 'הקישור הועתק' : 'קישור ללקוח'}</span>
            </button>
            <Link to="/properties/new" className="btn btn-primary">
              <Plus size={18} />
              קליטת נכס חדש
            </Link>
          </div>
        </div>
      )}

      <div className="filters-bar animate-in animate-in-delay-1">
        {/* P1-M12 — sticky search wrapper. N-7 removed the mobile ⋯ that
            hid "בחירה מרובה" + "קישור ללקוח"; both are now exposed in
            the filter bar below on every viewport. */}
        <div className="sticky-search properties-sticky-search">
          <div className="search-box">
            <Search size={18} />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="חיפוש לפי כתובת, עיר או בעל נכס..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="filter-tabs">
          {[
            { key: 'all', label: 'הכל' },
            { key: 'RESIDENTIAL', label: 'מגורים' },
            { key: 'COMMERCIAL', label: 'מסחרי' },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-tab ${assetClassFilter === f.key ? 'active' : ''}`}
              onClick={() => setAssetClassFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="filter-tabs">
          {[
            { key: 'all', label: 'הכל' },
            { key: 'SALE', label: 'מכירה' },
            { key: 'RENT', label: 'השכרה' },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-tab ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          className={`btn btn-ghost btn-sm ${showAdvanced ? 'active' : ''} ${hasActiveFilters ? 'has-filters' : ''}`}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <SlidersHorizontal size={16} />
          {hasActiveFilters ? `סינון מתקדם · ${activeFilterCount}` : 'סינון מתקדם'}
        </button>
        {/* N-10 — favorites-only toggle (mobile parity: desktop also shows
            it here for discoverability, but the header-actions copy is the
            "canonical" one). */}
        {isMobile && (
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${onlyFavorites ? 'is-active' : ''}`}
            onClick={() => setOnlyFavorites((v) => !v)}
            aria-pressed={onlyFavorites}
            aria-label="רק מועדפים"
            title="הצג רק נכסים במועדפים"
          >
            <Star size={14} aria-hidden="true" fill={onlyFavorites ? 'currentColor' : 'none'} />
            <span>רק מועדפים</span>
          </button>
        )}
        {/* N-7 — mobile: direct "בחירה מרובה" + "קישור ללקוח" (no ⋯ menu). */}
        {isMobile && (
          <>
            <button
              type="button"
              className={`btn btn-ghost btn-sm ${selectMode ? 'is-active' : ''}`}
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              aria-pressed={selectMode}
              title="בחר כמה נכסים בבת אחת"
            >
              <CheckSquare size={14} aria-hidden="true" />
              <span>{selectMode ? 'יציאה' : 'בחירה מרובה'}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleGenerateLink}
              title="העתק קישור ציבורי ללקוח עם הסינון הנוכחי"
            >
              {copiedLink ? <Check size={14} aria-hidden="true" /> : <LinkIcon size={14} aria-hidden="true" />}
              <span>{copiedLink ? 'הועתק' : 'קישור ללקוח'}</span>
            </button>
          </>
        )}
        {anyFilterActive && (
          <button
            type="button"
            className="btn btn-ghost btn-sm filter-clear-all"
            onClick={clearAllFilters}
            title="נקה את כל הסינונים"
          >
            <X size={13} /> נקה הכל
          </button>
        )}
      </div>

      {showAdvanced && (
        /* N-11 — extracted into <AdvancedFilters> so Sub-5 can reuse the
         * shape for the leads page with lead-specific fields (rooms
         * desired, category desired, seriousness). The panel is a dumb
         * presentational component; this page still owns the state +
         * URL sync. N-13 — proximity input now follows the .form-input
         * theme (done inside AdvancedFilters.css). */
        <AdvancedFilters
          className="animate-in"
          locations={allLocationNames}
          config={{
            fields: ['proximity', 'city', 'price', 'rooms', 'sqm'],
            cities,
          }}
          values={{
            city: advFilters.city,
            minPrice: advFilters.minPrice,
            maxPrice: advFilters.maxPrice,
            minRooms: advFilters.minRooms,
            maxRooms: advFilters.maxRooms,
            minSqm: advFilters.minSqm,
            maxSqm: advFilters.maxSqm,
            locationQuery,
            locationRadius,
            locationCenter,
          }}
          onChange={(k, v) => {
            if (k === 'locationQuery') setLocationQuery(v);
            else if (k === 'locationRadius') setLocationRadius(v);
            else setAdvFilters((prev) => ({ ...prev, [k]: v }));
          }}
          onClear={() => {
            // N-12 — "נקה סינון" resets the fields AND collapses the
            // advanced panel so the agent doesn't have to close it too.
            setAdvFilters({
              city: '', minPrice: null, maxPrice: null,
              minRooms: '', maxRooms: '', minSqm: null, maxSqm: null,
            });
            setLocationQuery('');
            setLocationRadius(5);
            setShowAdvanced(false);
          }}
        />
      )}

      {loading && showPropsSkel ? (
        <div className="empty-state">
          <Building2 size={48} />
          <h3>טוען נכסים…</h3>
        </div>
      ) : loading ? (
        // Fast-load window: render the filters/header but nothing where
        // the grid will appear, so fast fetches swap straight to real
        // data without a "loading" placeholder flash.
        null
      ) : (viewMode === 'table' && !isMobile) ? (
        <DataTable
          ariaLabel="טבלת נכסים"
          rows={filtered}
          rowKey={(p) => p.id}
          onRowClick={(p) => navigate(`/properties/${p.id}`)}
          columns={[
            {
              key: 'thumb', header: '', className: 'cell-thumb',
              render: (p) => p.images?.[0]
                ? <img src={p.images[0]} alt="" loading="lazy" decoding="async" />
                : <div className="cell-thumb-placeholder" aria-hidden="true" />,
            },
            {
              key: 'address', header: 'כתובת', sortable: true,
              sortValue: (p) => `${p.city || ''} ${p.street || ''}`.trim(),
              render: (p) => <span>{p.street}{p.city ? `, ${p.city}` : ''}</span>,
            },
            {
              key: 'type', header: 'סוג', sortable: true,
              sortValue: (p) => p.type || '',
              render: (p) => <span className="cell-muted">{p.type || '—'}</span>,
            },
            {
              key: 'category', header: 'עסקה', sortable: true,
              sortValue: (p) => p.category || '',
              render: (p) => (
                <span className={`cell-pill ${p.category === 'SALE' ? 'is-gold' : 'is-blue'}`}>
                  {p.category === 'SALE' ? 'מכירה' : 'השכרה'}
                </span>
              ),
            },
            {
              key: 'rooms', header: 'חד׳', sortable: true, className: 'cell-num',
              sortValue: (p) => p.rooms,
              render: (p) => p.rooms ?? '—',
            },
            {
              key: 'sqm', header: 'מ״ר', sortable: true, className: 'cell-num',
              sortValue: (p) => p.sqm,
              render: (p) => p.sqm ?? '—',
            },
            {
              key: 'price', header: 'מחיר', sortable: true, className: 'cell-num',
              sortValue: (p) => p.marketingPrice,
              render: (p) => <strong>{formatPrice(p.marketingPrice)}</strong>,
            },
            {
              key: 'owner', header: 'בעלים', sortable: true,
              sortValue: (p) => p.owner || '',
              render: (p) => <span className="cell-muted">{p.owner || '—'}</span>,
            },
            {
              key: 'progress', header: 'שיווק',
              render: (p) => {
                const done = Object.values(p.marketingActions || {}).filter(Boolean).length;
                const total = Object.values(p.marketingActions || {}).length || 22;
                const pct = Math.round((done / total) * 100);
                return (
                  <span className="cell-progress">
                    <span className="cell-progress-bar">
                      <span className="cell-progress-fill" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="cell-progress-label">{pct}%</span>
                  </span>
                );
              },
            },
          ]}
        />
      ) : (
        <div className="properties-grid">
          {filtered.map((prop, i) => {
            // S-perf: the first card's image is the LCP on /properties.
            // Lighthouse flagged it as lazy + no fetchpriority; eager-load
            // the first one and let the rest stay lazy as before.
            const isLcpCandidate = i === 0;
            const actions = prop.marketingActions || {};
            const done = Object.values(actions).filter(Boolean).length;
            const total = Object.values(actions).length || 22;
            const pct = Math.round((done / total) * 100);
            const delayClass = `animate-in-delay-${Math.min(i + 1, 5)}`;
            const thumb = prop.images?.[0];

            const swipeActions = [
              {
                icon: Phone,
                label: 'התקשר',
                color: 'gold',
                onClick: () => { window.location.href = `tel:${prop.ownerPhone}`; },
              },
              {
                icon: WhatsAppIcon,
                label: 'וואטסאפ',
                color: 'green',
                onClick: () => handleWhatsApp(null, prop),
              },
              {
                icon: Navigation,
                label: 'ניווט',
                color: 'blue',
                onClick: () => {
                  const url = `https://waze.com/ul?q=${encodeURIComponent(prop.street + ' ' + prop.city)}`;
                  window.open(url, '_system');
                },
              },
            ];

            if (isMobile) {
              // ── Compact 96px mobile row ─────────────────────────────
              const matchCount = matchesByProp.get(prop.id)?.length || 0;
              const isPicked = selectedIds.has(prop.id);
              const handleCardTap = (e) => {
                if (selectMode) {
                  e.preventDefault();
                  e.stopPropagation();
                  haptics.tap();
                  toggleSelect(prop.id);
                }
              };
              return (
                <div
                  key={prop.id}
                  className={`property-card property-card-compact animate-in ${delayClass} ${selectMode ? 'is-selectable' : ''} ${isPicked ? 'is-selected' : ''}`}
                  {...longPressBind(prop.id)}
                >
                  <SwipeRow actions={selectMode ? [] : swipeActions}>
                    <div className="pc-compact-inner">
                      {/* Sprint 7 B4 — favorite star, top-left of the row. */}
                      <FavoriteStar
                        className="property-fav-star property-fav-star-compact"
                        active={favoriteIds.has(prop.id)}
                        onToggle={(next) => handleToggleFavorite(prop.id, next)}
                      />
                      <Link to={`/properties/${prop.id}`} className="pc-compact-link" onClick={handleCardTap}>
                        {selectMode && (
                          <span className="pc-pick" aria-hidden="true">
                            {isPicked ? <CheckSquare size={20} /> : <Square size={20} />}
                          </span>
                        )}
                        <div className="pc-compact-thumb">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={prop.street}
                              loading={isLcpCandidate ? 'eager' : 'lazy'}
                              fetchpriority={isLcpCandidate ? 'high' : undefined}
                              decoding="async"
                            />
                          ) : (
                            <Building2 size={26} />
                          )}
                        </div>
                        <div className="pc-compact-meta">
                          <div className="pc-compact-title">
                            {prop.street}, {prop.city}
                          </div>
                          <div className="pc-compact-price">
                            {formatPrice(prop.marketingPrice)}
                          </div>
                          <div className="pc-compact-specs">
                            {prop.rooms != null && (
                              <span><Bed size={12} /> {prop.rooms} חד׳</span>
                            )}
                            <span><Maximize size={12} /> {prop.sqm} מ״ר</span>
                            {prop._distance != null && (
                              <span className="pc-distance">
                                <Navigation size={11} />
                                {prop._distance.toFixed(1)} ק״מ
                              </span>
                            )}
                          </div>
                          {matchCount > 0 && (
                            <button
                              type="button"
                              className="pc-match-pill"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                haptics.tap();
                                setMatchesPickerFor(prop);
                              }}
                              aria-label={`${matchCount} לידים תואמים — ${prop.street}`}
                            >
                              {matchCount} לידים תואמים
                            </button>
                          )}
                        </div>
                      </Link>

                      <button
                        className="pc-overflow-btn touch-target"
                        onClick={(e) => openOverflow(e, prop)}
                        aria-label={`אפשרויות נוספות ${prop.street}`}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {/* The 'חפש דומים' pill was overlapping the thumb
                          photo and clipping the title at 375px — its
                          action is now inside the ⋯ overflow sheet
                          ('חיפוש נכסים דומים'). Still rendered on
                          desktop via the CSS below. */}
                      <button
                        className="pc-similar-btn pc-similar-btn-desktop"
                        onClick={(e) => openSimilar(e, prop)}
                        aria-label={`חיפוש נכסים דומים ל-${prop.street}`}
                      >
                        <MoreHorizontal size={12} /> חפש דומים
                      </button>

                      {/* P0-M10 / P1-M14 — 48×48 icon-only quick-action rail */}
                      <div className="pc-rail" role="group" aria-label={`פעולות מהירות ${prop.street}`}>
                        <a
                          href={telUrl(prop.ownerPhone)}
                          className="pc-rail-btn pc-rail-call"
                          aria-label={`התקשר לבעלי ${prop.street}`}
                          onClick={(e) => { e.stopPropagation(); haptics.tap(); }}
                        >
                          <Phone />
                          <span>התקשר</span>
                        </a>
                        <button
                          type="button"
                          className="pc-rail-btn pc-rail-wa"
                          onClick={(e) => handleWhatsApp(e, prop)}
                          aria-label={`שלח את ${prop.street} בוואטסאפ`}
                        >
                          <WhatsAppIcon />
                          <span>שלח בוואטסאפ</span>
                        </button>
                        <a
                          href={wazeUrl(`${prop.street} ${prop.city}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pc-rail-btn pc-rail-nav"
                          aria-label={`נווט אל ${prop.street}`}
                          onClick={(e) => { e.stopPropagation(); haptics.tap(); }}
                        >
                          <Navigation />
                          <span>ניווט</span>
                        </a>
                      </div>
                    </div>
                  </SwipeRow>
                </div>
              );
            }

            // ── Desktop richer card ────────────────────────────────
            const matchCount = matchesByProp.get(prop.id)?.length || 0;
            const isPicked = selectedIds.has(prop.id);
            const handleCardTap = (e) => {
              if (selectMode) {
                e.preventDefault();
                e.stopPropagation();
                haptics.tap();
                toggleSelect(prop.id);
              }
            };
            return (
              <div
                key={prop.id}
                className={`property-card animate-in ${delayClass} ${selectMode ? 'is-selectable' : ''} ${isPicked ? 'is-selected' : ''}`}
                {...longPressBind(prop.id)}
              >
                {selectMode && (
                  <span className="pc-pick pc-pick-desktop" aria-hidden="true">
                    {isPicked ? <CheckSquare size={22} /> : <Square size={22} />}
                  </span>
                )}
                {/* Sprint 7 B4 — favorite toggle pinned to the visual
                    top-left of the card. Lives outside the Link so taps
                    never navigate; FavoriteStar stops its own propagation. */}
                <FavoriteStar
                  className="property-fav-star"
                  active={favoriteIds.has(prop.id)}
                  onToggle={(next) => handleToggleFavorite(prop.id, next)}
                />

                <Link to={`/properties/${prop.id}`} className="property-card-link" onClick={handleCardTap}>
                  <div className="property-image">
                    <img
                      src={prop.images?.[0] || 'https://via.placeholder.com/800x450'}
                      alt={prop.street}
                      loading={isLcpCandidate ? 'eager' : 'lazy'}
                      fetchpriority={isLcpCandidate ? 'high' : undefined}
                      decoding="async"
                    />
                    <div className="property-badges">
                      <span className={`badge ${prop.assetClass === 'COMMERCIAL' ? 'badge-warning' : 'badge-success'}`}>
                        {prop.assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים'}
                      </span>
                      <span className={`badge ${prop.category === 'SALE' ? 'badge-gold' : 'badge-info'}`}>
                        {prop.category === 'SALE' ? 'מכירה' : 'השכרה'}
                      </span>
                    </div>
                    {matchCount > 0 && (
                      <button
                        type="button"
                        className="property-match-pill"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMatchesPickerFor(prop);
                        }}
                        aria-label={`${matchCount} לידים תואמים — ${prop.street}`}
                      >
                        {matchCount} לידים תואמים
                      </button>
                    )}
                    <div className="property-price-overlay">
                      {formatPrice(prop.marketingPrice)}
                    </div>
                  </div>
                  <div className="property-card-body">
                    <div className="property-address">
                      <MapPin size={14} />
                      <span>{prop.street}, {prop.city}</span>
                    </div>
                    <div className="property-specs">
                      {prop.rooms != null && (
                        <button
                          type="button"
                          className="spec-chip"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            applySimilarRooms(prop);
                          }}
                          title="הצג את כל הנכסים עם מספר חדרים זהה"
                        >
                          <Bed size={14} />{prop.rooms} חד׳
                        </button>
                      )}
                      <button
                        type="button"
                        className="spec-chip"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          applySimilarSqm(prop);
                        }}
                        title="הצג נכסים בגודל דומה"
                      >
                        <Maximize size={14} />{prop.sqm} מ״ר
                      </button>
                      <button
                        type="button"
                        className="spec-chip"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          applySimilarCity(prop);
                        }}
                        title={`הצג נכסים ב${prop.city}`}
                      >
                        <Building2 size={14} />{prop.type}
                      </button>
                    </div>
                    {prop._distance != null && (
                      <div className="property-distance-badge">
                        <Navigation size={12} />
                        {prop._distance.toFixed(1)} ק״מ
                      </div>
                    )}
                    <div className="property-card-footer">
                      <div className="property-owner">
                        <div className="owner-avatar">{prop.owner?.charAt(0)}</div>
                        <span>{prop.owner}</span>
                      </div>
                      <div className="marketing-mini-progress">
                        <div className="progress-bar small">
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span>{pct}%</span>
                      </div>
                    </div>
                  </div>
                </Link>
                <button
                  className="property-wa-btn"
                  onClick={(e) => handleWhatsApp(e, prop)}
                  title="שלח את כל פרטי הנכס + תמונות בוואטסאפ"
                >
                  <WhatsAppIcon size={16} />
                  <span>שלח בוואטסאפ</span>
                </button>
                {/* N-3 — direct card actions. Duplicate + quick-edit icons
                 * sit next to the ⋯ menu at the card's logical-end corner
                 * (visual top-left). The overflow menu stays for the long
                 * tail (transfer, similar, delete). */}
                <div className="property-quick-actions" aria-label={`פעולות מהירות ${prop.street}`}>
                  <button
                    type="button"
                    className="property-quick-btn"
                    onClick={(e) => openQuickEdit(e, prop)}
                    title="עריכה מהירה"
                    aria-label={`עריכה מהירה ${prop.street}`}
                  >
                    <Edit3 size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="property-quick-btn"
                    onClick={(e) => handleDuplicate(e, prop)}
                    disabled={duplicating === prop.id}
                    title="שכפל נכס"
                    aria-label={`שכפל ${prop.street}`}
                  >
                    <Copy size={14} aria-hidden="true" />
                  </button>
                </div>
                {/* N-3 — share icon pinned to the bottom-left of the card. */}
                <button
                  type="button"
                  className="property-share-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleShareProp(prop);
                  }}
                  title="שתף נכס"
                  aria-label={`שתף ${prop.street}`}
                >
                  <Share2 size={14} aria-hidden="true" />
                </button>
                <button
                  className="property-overflow-btn"
                  onClick={(e) => openOverflow(e, prop)}
                  title="אפשרויות נוספות"
                  aria-label="אפשרויות נוספות"
                >
                  <MoreHorizontal size={14} />
                </button>
                {/* N-14 — inline "הוסף הערות" affordance beneath the card,
                 * mirroring the leads-card pattern. Opens the quick-edit
                 * drawer scrolled to the notes field (the drawer already
                 * exposes notes among its common fields). */}
                <button
                  type="button"
                  className="property-add-note-btn"
                  onClick={(e) => openQuickEdit(e, prop)}
                  title="הוסף הערות לנכס"
                >
                  <StickyNote size={13} aria-hidden="true" />
                  <span>{prop.notes ? 'עריכת הערות' : 'הוסף הערות'}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* F-4.1 — distinguish "first time, no properties yet" (onboarding,
          big CTA) from "filtered to nothing" (clear-filters CTA). */}
      {!loading && filtered.length === 0 && (
        items.length === 0 ? (
          <EmptyState
            variant="first"
            icon={<Building2 size={44} />}
            title="עוד אין נכסים במערכת"
            description="העלה/י את הנכס הראשון — שיווק מלא, סטטוס בלעדיות, שיתוף בוואטסאפ — הכל ממקום אחד."
            action={{
              label: 'הוסף נכס ראשון',
              icon: <Plus size={14} />,
              onClick: () => navigate('/properties/new'),
            }}
            secondary={{
              label: 'ייבא מ-Yad2',
              onClick: () => navigate('/integrations/yad2'),
            }}
          />
        ) : (
          <EmptyState
            variant="filtered"
            icon={<Building2 size={44} />}
            title="אין תוצאות לסינון הנוכחי"
            description="נסה/י ביטוי חיפוש אחר, או נקה/י את המסננים הפעילים."
            action={{
              label: 'נקה מסננים',
              icon: <X size={14} />,
              onClick: () => {
                setSearch('');
                setFilter('all');
                setAssetClassFilter('all');
                setAdvFilters({
                  city: '', minRooms: '', maxRooms: '',
                  minSqm: '', maxSqm: '', minPrice: '', maxPrice: '',
                });
                setShowAdvanced(false);
                setLocationQuery('');
              },
            }}
          />
        )
      )}

      {toDelete && (
        <ConfirmDialog
          title="מחיקת נכס"
          message={`למחוק את "${toDelete.street}, ${toDelete.city}"? הפעולה אינה הפיכה.`}
          confirmLabel="מחק"
          onConfirm={confirmDelete}
          onClose={() => setToDelete(null)}
          busy={deleting}
        />
      )}

      {quickEditFor && (
        <QuickEditDrawer
          property={quickEditFor}
          onClose={() => setQuickEditFor(null)}
          onSaved={(updated) => {
            // Optimistic: patch the row in place so the list reflects
            // the edit without a round-trip.
            setItems((list) => list.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
          }}
        />
      )}

      {bulkConfirm && (() => {
        // UX review F-8.1 — list up to 5 addresses so the agent can
        // verify the selection before deleting. Safer than a bare count.
        const selected = items.filter((p) => selectedIds.has(p.id));
        const shown = selected.slice(0, 5);
        const rest = selected.length - shown.length;
        const list = shown.map((p) => `• ${p.street}, ${p.city}`).join('\n');
        const tail = rest > 0 ? `\n• ועוד ${rest}` : '';
        return (
          <ConfirmDialog
            title="מחיקה מרובה"
            message={`למחוק ${selectedIds.size} נכסים?\n\n${list}${tail}\n\nהפעולה אינה הפיכה.`}
            confirmLabel={`מחק ${selectedIds.size}`}
            onConfirm={bulkDelete}
            onClose={() => setBulkConfirm(false)}
            busy={bulkBusy}
          />
        );
      })()}

      {/* Floating bulk action bar — slides up from the bottom thumb
          zone the moment selection mode kicks in. Empty state shows
          "בחר נכסים…" hint so the agent doesn't think the screen is
          frozen. Action button stays disabled until ≥1 picked. */}
      {selectMode && (
        <div className="bulk-bar" role="region" aria-label="פעולות על מספר נכסים">
          <div className="bulk-bar-inner">
            <span className="bulk-bar-count">
              {selectedIds.size > 0
                ? <><strong>{selectedIds.size}</strong> נבחרו</>
                : 'בחר נכסים'}
            </span>
            <div className="bulk-bar-actions">
              <button
                type="button"
                className="bulk-bar-btn bulk-bar-danger"
                disabled={selectedIds.size === 0 || bulkBusy}
                onClick={() => { haptics.press(); setBulkConfirm(true); }}
              >
                <Trash2 size={16} />
                {bulkBusy && bulkProgress
                  ? `מוחק ${bulkProgress.done}/${bulkProgress.total}…`
                  : 'מחק'}
              </button>
              <button
                type="button"
                className="bulk-bar-btn bulk-bar-ghost"
                onClick={exitSelect}
                disabled={bulkBusy}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {waShare && (
        <WhatsAppSheet
          title={waShare.title}
          subtitle="ערוך את ההודעה — לחיצה על 'פתח בוואטסאפ' תעביר לבחירת נמען"
          message={waShare.text}
          onClose={() => setWaShare(null)}
        />
      )}

      {leadPickerFor && (
        <LeadPickerSheet
          property={leadPickerFor}
          leads={leads}
          previewText={buildMessageForProp(leadPickerFor)}
          onPick={handlePickLead}
          onClose={() => setLeadPickerFor(null)}
        />
      )}

      <OverflowSheet
        open={!!overflowFor}
        onClose={() => setOverflowFor(null)}
        title={overflowFor ? `${overflowFor.street}, ${overflowFor.city}` : ''}
        actions={overflowActions}
      />

      <OverflowSheet
        open={!!similarFor}
        onClose={() => setSimilarFor(null)}
        title="חיפוש נכסים דומים"
        actions={similarActions}
      />

      {transferProp && (
        <TransferPropertyDialog
          property={transferProp}
          onClose={() => setTransferProp(null)}
          onDone={() => { setTransferProp(null); load(); }}
        />
      )}

      {/* P3-M8 — picker filtered to matching leads only */}
      {matchesPickerFor && (
        <LeadPickerSheet
          property={matchesPickerFor}
          leads={matchesByProp.get(matchesPickerFor.id) || []}
          previewText={buildMessageForProp(matchesPickerFor)}
          onPick={(lead, editedText) => {
            const prop = matchesPickerFor;
            setMatchesPickerFor(null);
            if (!prop) return;
            const text = editedText || buildMessageForProp(prop);
            if (lead === null) {
              window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
              return;
            }
            const phone = (lead.phone || '').replace(/[^\d]/g, '');
            const intl = phone.startsWith('0') ? '972' + phone.slice(1) : phone;
            window.open('https://wa.me/' + intl + '?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
          }}
          onClose={() => setMatchesPickerFor(null)}
        />
      )}

      {/* N-7 — the page-level ⋯ sheet was removed; its two actions
          ("בחירה מרובה" + "קישור ללקוח") are now direct buttons in the
          toolbar / filter bar on every viewport. */}

      {/* (FAB removed — the bottom tab bar's central "+" already exposes
       *  the create-property action; the floating button visually clung to
       *  the last card and confused the layout.) */}
    </div>
    </>
    </PullRefresh>
  );
}
