import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  UserPlus,
  Search,
  Phone,
  MessageSquare,
  Flame,
  Thermometer,
  Snowflake,
  Calendar,
  FileText,
  Edit3,
  Trash2,
  HelpCircle,
  Sparkles,
  LayoutGrid,
  List as ListIcon,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  X,
  SlidersHorizontal,
  Home,
  Briefcase,
  CheckCircle2,
} from 'lucide-react';
import api from '../lib/api';
import ConfirmDialog from '../components/ConfirmDialog';
import CustomerEditDialog from '../components/CustomerEditDialog';
import InlineText from '../components/InlineText';
import Chip from '../components/Chip';
import SwipeRow from '../components/SwipeRow';
import WhatsAppIcon from '../components/WhatsAppIcon';
import PullRefresh from '../components/PullRefresh';
import { OverflowSheet } from '../components/MobilePickers';
import { useVisibilityBump, primeContactBump, useViewportMobile } from '../hooks/mobile';
import haptics from '../lib/haptics';
import { useToast, optimisticUpdate } from '../lib/toast';
import { relativeTime, absoluteTime } from '../lib/time';
import { relativeDate } from '../lib/relativeDate';
import { waUrl, telUrl } from '../lib/waLink';
import { leadMatchesProperty } from './Properties';
import './Customers.css';

function statusIcon(status) {
  switch (status) {
    case 'HOT': return <Flame size={13} />;
    case 'WARM': return <Thermometer size={13} />;
    case 'COLD': return <Snowflake size={13} />;
    default: return null;
  }
}

function statusBadgeClass(status) {
  return {
    HOT: 'badge-danger',
    WARM: 'badge-warning',
    COLD: 'badge-info',
  }[status] || 'badge-gold';
}

function statusLabel(status) {
  return { HOT: 'חם', WARM: 'חמים', COLD: 'קר' }[status] || status;
}

// P2-M17: short reason pill — emoji + status word + relative-date suffix
function statusReason(lead) {
  const status = lead.status || 'WARM';
  const lastContactLabel = lead.lastContact ? relativeDate(lead.lastContact).label : null;
  const daysSince = lead.lastContact
    ? Math.round((Date.now() - new Date(lead.lastContact).getTime()) / 86400000)
    : null;

  if (status === 'HOT') {
    return { emoji: '🔥', label: 'חם', suffix: lastContactLabel || 'חדש' };
  }
  if (status === 'COLD') {
    if (daysSince != null && daysSince > 30) {
      return { emoji: '❄️', label: 'קר', suffix: `${daysSince} ימים ללא קשר` };
    }
    return { emoji: '❄️', label: 'קר', suffix: lastContactLabel || 'ללא קשר' };
  }
  return { emoji: '🟡', label: 'חמים', suffix: lastContactLabel || 'חדש' };
}

export default function Customers() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isMobile = useViewportMobile(820);
  const [leads, setLeads] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lookingForFilter, setLookingForFilter] = useState('all'); // all | BUY | RENT
  const [interestFilter, setInterestFilter] = useState('all'); // all | PRIVATE | COMMERCIAL
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const [editDialog, setEditDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState(null); // mobile: which card is open
  const [overflowLead, setOverflowLead] = useState(null); // mobile: ⋯ sheet target
  const [statusSheetLead, setStatusSheetLead] = useState(null); // mobile: status pill sheet
  const [filterSheetOpen, setFilterSheetOpen] = useState(false); // mobile: filter sheet
  // P1-M17: list-first on mobile, cards on desktop. User selection still wins via localStorage.
  const [view, setView] = useState(() => {
    try {
      const stored = localStorage.getItem('estia-customers-view');
      if (stored === 'cards' || stored === 'list') return stored;
    } catch { /* ignore */ }
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      return 'list';
    }
    return 'cards';
  });
  const cardRefs = useRef({});

  const changeView = (v) => {
    setView(v);
    try { localStorage.setItem('estia-customers-view', v); } catch { /* ignore */ }
  };

  const loadLeads = useCallback(async () => {
    const r = await api.listLeads();
    setLeads(r.items || []);
  }, []);

  useEffect(() => {
    loadLeads().finally(() => setLoading(false));
    // Load the agent's properties so we can show "N נכסים תואמים" pills (P3-D1).
    api.listProperties({ mine: '1' })
      .then((res) => setProperties(res?.items || []))
      .catch(() => { /* ignore — pills simply hide */ });
  }, [loadLeads]);

  // P3-D1: precompute match counts keyed by lead id
  const matchCountByLead = useMemo(() => {
    const out = {};
    if (!properties.length) return out;
    for (const lead of leads) {
      let n = 0;
      for (const p of properties) if (leadMatchesProperty(lead, p)) n += 1;
      if (n > 0) out[lead.id] = n;
    }
    return out;
  }, [leads, properties]);

  // P3-M1: when the user returns from tel:/wa: links, bump lastContact
  useVisibilityBump(async (leadId) => {
    try {
      await api.updateLead(leadId, { lastContact: new Date().toISOString() });
      await loadLeads();
    } catch { /* ignore */ }
  });

  useEffect(() => {
    const sel = searchParams.get('selected');
    if (sel) {
      setHighlightId(sel);
      const t = setTimeout(() => {
        const el = cardRefs.current[sel];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 250);
      return () => clearTimeout(t);
    }
    const f = searchParams.get('filter');
    if (f === 'hot' || f === 'warm' || f === 'cold') setStatusFilter(f.toUpperCase());
  }, [searchParams]);

  // Breadcrumb shown when the user arrived via an incoming filter
  const incomingFilterLabel = (() => {
    const f = searchParams.get('filter');
    if (f === 'hot') return 'לידים חמים';
    if (f === 'warm') return 'לידים חמימים';
    if (f === 'cold') return 'לידים קרים';
    return null;
  })();

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (lookingForFilter !== 'all' && l.lookingFor !== lookingForFilter) return false;
      if (interestFilter !== 'all' && l.interestType !== interestFilter) return false;
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        l.name?.toLowerCase().includes(s) ||
        l.city?.toLowerCase().includes(s) ||
        l.phone?.includes(s)
      );
    });
  }, [leads, lookingForFilter, interestFilter, statusFilter, search]);

  const handleWhatsApp = (lead) => {
    primeContactBump(lead.id);
    haptics.tap();
    window.open(waUrl(lead.phone, `שלום ${lead.name}`), '_blank');
  };

  const handleTel = (lead) => {
    primeContactBump(lead.id);
    haptics.tap();
    window.open(telUrl(lead.phone), '_self');
  };

  const handleSms = (lead) => {
    primeContactBump(lead.id);
    haptics.tap();
    window.open(`sms:${lead.phone}`, '_self');
  };

  // P1-M11: count of non-default filters active for the mobile filter pill
  const activeFilterCount =
    (lookingForFilter !== 'all' ? 1 : 0) +
    (interestFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setLookingForFilter('all');
    setInterestFilter('all');
    setStatusFilter('all');
  };

  const patchLead = async (leadId, patch, { label, success } = {}) => {
    // Optimistic in-place update
    setLeads((cur) => cur.map((l) => (l.id === leadId ? { ...l, ...patch } : l)));
    try {
      await optimisticUpdate(toast, {
        label: label || 'שומר…',
        success: success || 'נשמר',
        onSave: () => api.updateLead(leadId, patch),
      });
    } catch {
      // Rewind by re-fetching on failure
      await loadLeads();
    }
  };

  const handleStatusChange = (lead, newStatus) =>
    patchLead(lead.id, { status: newStatus }, { success: `סטטוס עודכן ל-${newStatus === 'HOT' ? 'חם' : newStatus === 'WARM' ? 'חמים' : 'קר'}` });

  const confirmDeleteLead = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteLead(deleteTarget.id);
      setDeleteTarget(null);
      await loadLeads();
    } catch (_) { /* ignore */ }
    setDeleting(false);
  };

  if (loading) {
    return (
      <div className="customers-page">
        <div className="page-header animate-in">
          <div className="page-header-info">
            <h2>לקוחות</h2>
            <p>טוען...</p>
          </div>
        </div>
        <div className="customers-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="customer-card skel-card">
              <div className="skel skel-circle" />
              <div className="skel skel-line w-70" />
              <div className="skel skel-line w-50" />
              <div className="skel skel-line w-90" />
              <div className="skel skel-line w-40" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <PullRefresh onRefresh={loadLeads}>
    <div className="customers-page">
      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>לקוחות</h2>
          <p>{filtered.length} מתוך {leads.length} לקוחות</p>
        </div>
        <div className="page-header-actions">
          <div className="view-toggle" role="group" aria-label="תצוגה">
            <button
              className={`view-toggle-btn ${view === 'cards' ? 'active' : ''}`}
              onClick={() => changeView('cards')}
              title="תצוגת כרטיסים"
            >
              <LayoutGrid size={14} />
              כרטיסים
            </button>
            <button
              className={`view-toggle-btn ${view === 'list' ? 'active' : ''}`}
              onClick={() => changeView('list')}
              title="תצוגת רשימה"
            >
              <ListIcon size={14} />
              רשימה
            </button>
          </div>
          <Link to="/templates" className="btn btn-secondary cust-tpl-btn" title="ערוך תבניות הודעה">
            <FileText size={16} />
            ערוך תבניות הודעה
          </Link>
          <Link to="/customers/new" className="btn btn-primary">
            <UserPlus size={18} />
            ליד חדש
          </Link>
        </div>
      </div>

      {incomingFilterLabel && statusFilter !== 'all' && (
        <div className="filter-breadcrumb animate-in">
          <span>מוצג: {incomingFilterLabel}</span>
          <button
            className="fb-clear"
            onClick={() => {
              setStatusFilter('all');
              window.history.replaceState({}, '', '/customers');
            }}
          >
            נקה סינון
          </button>
        </div>
      )}

      {/* Filter strip — search is sticky (P1-M12) */}
      <div className="filters-bar animate-in animate-in-delay-2">
        <div className="sticky-search">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="חיפוש לפי שם, עיר, טלפון..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* P1-M11: mobile gets ONE filter pill that opens a bottom sheet */}
        <div className="filters-mobile-row">
          <button
            type="button"
            className={`filters-pill ${activeFilterCount > 0 ? 'active' : ''}`}
            onClick={() => { haptics.tap(); setFilterSheetOpen(true); }}
            aria-label="פתח סינון"
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>סנן{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="filters-clear-link"
              onClick={() => { haptics.tap(); clearFilters(); }}
            >
              נקה סינון
            </button>
          )}
        </div>

        {/* Desktop keeps the 3-row layout */}
        <div className="filters-desktop">
          <div className="filter-tabs">
            {[
              { key: 'all', label: 'הכל' },
              { key: 'BUY', label: 'קונים' },
              { key: 'RENT', label: 'שוכרים' },
            ].map((f) => (
              <button
                key={f.key}
                className={`filter-tab ${lookingForFilter === f.key ? 'active' : ''}`}
                onClick={() => setLookingForFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="filter-tabs">
            {[
              { key: 'all', label: 'כל הסוגים' },
              { key: 'PRIVATE', label: 'פרטי' },
              { key: 'COMMERCIAL', label: 'מסחרי' },
            ].map((f) => (
              <button
                key={f.key}
                className={`filter-tab ${interestFilter === f.key ? 'active' : ''}`}
                onClick={() => setInterestFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="filter-tabs">
            {[
              { key: 'all', label: 'הכל' },
              { key: 'HOT', label: 'חם' },
              { key: 'WARM', label: 'חמים' },
              { key: 'COLD', label: 'קר' },
            ].map((f) => (
              <button
                key={f.key}
                className={`filter-tab ${statusFilter === f.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'list' ? (
        <CustomerList
          leads={filtered}
          highlightId={highlightId}
          cardRefs={cardRefs}
          isMobile={isMobile}
          matchCountByLead={matchCountByLead}
          onStatusChange={handleStatusChange}
          onEdit={setEditDialog}
          onDelete={setDeleteTarget}
          onNavigate={(id) => navigate(`/customers/${id}`)}
        />
      ) : (
      <div className="customers-grid animate-in animate-in-delay-3">
        {filtered.map((lead) => {
          const expanded = expandedId === lead.id;

          // ── Mobile: collapsed dense row + swipe actions + tap to expand ──
          if (isMobile) {
            const swipeActions = [
              {
                icon: Phone,
                label: 'התקשר',
                color: 'gold',
                onClick: () => handleTel(lead),
              },
              {
                icon: WhatsAppIcon,
                label: 'וואטסאפ',
                color: 'green',
                onClick: () => handleWhatsApp(lead),
              },
              {
                icon: MessageSquare,
                label: 'SMS',
                color: 'blue',
                onClick: () => handleSms(lead),
              },
            ];
            const reason = statusReason(lead);
            const reasonStatusClass = `ccm-reason-${lead.status || 'WARM'}`;
            const matchCountMobile = matchCountByLead[lead.id] || 0;
            return (
              <div
                key={lead.id}
                ref={(el) => { if (el) cardRefs.current[lead.id] = el; }}
                className={`customer-card customer-card-mobile ${highlightId === lead.id ? 'highlight' : ''} ${expanded ? 'is-expanded' : 'is-collapsed'}`}
              >
                <SwipeRow actions={swipeActions}>
                  <div className="ccm-body">
                    <div className="ccm-row-outer">
                      <div
                        role="button"
                        tabIndex={0}
                        className="ccm-row-btn"
                        onClick={() => {
                          haptics.tap();
                          setExpandedId(expanded ? null : lead.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            haptics.tap();
                            setExpandedId(expanded ? null : lead.id);
                          }
                        }}
                        aria-expanded={expanded}
                      >
                        <div className="ccm-avatar" aria-hidden="true">
                          {lead.name.charAt(0)}
                        </div>
                        <div className="ccm-mid">
                          <div className="ccm-name-row">
                            <strong className="ccm-name">{lead.name}</strong>
                            {/* P2-M17: status reason pill inline next to name */}
                            <span className={`ccm-reason-pill ${reasonStatusClass}`} title={lead.statusExplanation || ''}>
                              <span className="ccm-reason-emoji" aria-hidden="true">{reason.emoji}</span>
                              <strong>{reason.label}</strong>
                              <span className="ccm-reason-sep" aria-hidden="true">·</span>
                              <span className="ccm-reason-suffix">{reason.suffix}</span>
                            </span>
                            {lead.preApproval && (
                              <span className="ccm-active-pill" title="אישור עקרוני">
                                <CheckCircle2 size={10} />
                              </span>
                            )}
                            {matchCountMobile > 0 && (
                              <Link
                                to={`/properties${lead.city ? `?city=${encodeURIComponent(lead.city)}` : ''}`}
                                onClick={(e) => e.stopPropagation()}
                                className="cc-match-pill cc-match-pill-mobile"
                                title={`${matchCountMobile} נכסים תואמים`}
                              >
                                <Sparkles size={10} />
                                <strong>{matchCountMobile}</strong>
                              </Link>
                            )}
                          </div>
                          <div className="ccm-sub">
                            {[
                              lead.city,
                              lead.rooms && `${lead.rooms} חד׳`,
                              lead.priceRangeLabel,
                            ].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                        <span className={`ccm-chev ${expanded ? 'open' : ''}`} aria-hidden="true">
                          <ChevronDown size={16} />
                        </span>
                      </div>
                    </div>

                    {/* Expanded details */}
                    <div className={`ccm-expand ${expanded ? 'open' : ''}`}>
                      <div className="ccm-expand-inner">
                        {/* Status pill (tap to open sheet) */}
                        <div className="ccm-status-row">
                          <button
                            type="button"
                            className={`badge ${statusBadgeClass(lead.status)} status-badge-btn`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatusSheetLead(lead);
                            }}
                            title={lead.statusExplanation || 'שנה סטטוס'}
                          >
                            {statusIcon(lead.status)}
                            {statusLabel(lead.status)}
                            {lead.suggestedStatus && lead.status !== lead.suggestedStatus && (
                              <Sparkles size={11} className="sp-auto-hint" />
                            )}
                          </button>
                        </div>

                        <div className="customer-card-body">
                          <div className="cc-row">
                            <span className="cc-label">מחפש</span>
                            <span className="cc-value">
                              {lead.lookingFor === 'RENT' ? 'לשכור' : 'לקנות'} · {lead.interestType === 'COMMERCIAL' ? 'מסחרי' : 'פרטי'}
                            </span>
                          </div>
                          <div className="cc-row">
                            <span className="cc-label">עיר</span>
                            <span className="cc-value inline-edit">
                              <InlineText
                                value={lead.city || ''}
                                onCommit={(v) => patchLead(lead.id, { city: v || null }, { success: 'עיר עודכנה' })}
                                placeholder="הוסף עיר"
                              />
                            </span>
                          </div>
                          <div className="cc-row">
                            <span className="cc-label">חדרים</span>
                            <span className="cc-value inline-edit">
                              <InlineText
                                value={lead.rooms || ''}
                                onCommit={(v) => patchLead(lead.id, { rooms: v || null })}
                                placeholder="—"
                              />
                            </span>
                          </div>
                          <div className="cc-row">
                            <span className="cc-label">תקציב</span>
                            <span className="cc-value inline-edit">
                              <InlineText
                                value={lead.priceRangeLabel || ''}
                                onCommit={(v) => patchLead(lead.id, { priceRangeLabel: v || null })}
                                placeholder="הוסף תקציב"
                              />
                            </span>
                          </div>
                          {lead.sector && lead.sector !== 'כללי' && (
                            <div className="cc-row">
                              <span className="cc-label">מגזר</span>
                              <span className="cc-value">{lead.sector}</span>
                            </div>
                          )}
                          {lead.schoolProximity && (
                            <div className="cc-row">
                              <span className="cc-label">קירבה לבית ספר</span>
                              <span className="cc-value">{lead.schoolProximity}</span>
                            </div>
                          )}
                          <div className="cc-row">
                            <span className="cc-label">אישור עקרוני</span>
                            <span className="cc-value">
                              {lead.preApproval
                                ? <span className="cc-pos">יש</span>
                                : <span className="cc-muted">אין</span>}
                            </span>
                          </div>
                        </div>

                        <div className="customer-notes">
                          <InlineText
                            value={lead.notes || ''}
                            onCommit={(v) => patchLead(lead.id, { notes: v || null }, { success: 'הערות עודכנו' })}
                            multiline
                            placeholder="הוסף הערות..."
                            className="customer-notes-inline"
                          />
                        </div>

                        <div className="ccm-last-contact-wrap">
                          <button
                            type="button"
                            className="cc-last-contact"
                            title={lead.lastContact ? absoluteTime(lead.lastContact) : 'לחץ לעדכון קשר אחרון לעכשיו'}
                            onClick={(e) => {
                              e.stopPropagation();
                              patchLead(lead.id, { lastContact: new Date().toISOString() }, { success: 'קשר אחרון עודכן' });
                            }}
                          >
                            <Calendar size={12} />
                            {lead.lastContact ? relativeTime(lead.lastContact) : 'ללא קשר'}
                          </button>
                        </div>

                        {/* P0-M9/M10/M8 + P5-M10: 48x48 icon-only quick-action rail (tel/wa/sms anchors) + ⋯ overflow */}
                        <div className="ccm-actions ccm-rail">
                          <a
                            href={telUrl(lead.phone)}
                            className="ccm-rail-btn ccm-rail-call"
                            onClick={(e) => {
                              e.stopPropagation();
                              primeContactBump(lead.id);
                              haptics.tap();
                            }}
                            aria-label={`התקשר ל${lead.name}`}
                            title={`התקשר ל${lead.name}`}
                          >
                            <Phone size={20} aria-hidden="true" />
                          </a>
                          <a
                            href={waUrl(lead.phone, `שלום ${lead.name}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ccm-rail-btn ccm-rail-wa"
                            onClick={(e) => {
                              e.stopPropagation();
                              primeContactBump(lead.id);
                              haptics.tap();
                            }}
                            aria-label={`וואטסאפ ל${lead.name}`}
                            title={`וואטסאפ ל${lead.name}`}
                          >
                            <WhatsAppIcon size={22} />
                          </a>
                          <a
                            href={`sms:${lead.phone}`}
                            className="ccm-rail-btn ccm-rail-sms"
                            onClick={(e) => {
                              e.stopPropagation();
                              primeContactBump(lead.id);
                              haptics.tap();
                            }}
                            aria-label={`SMS ל${lead.name}`}
                            title={`SMS ל${lead.name}`}
                          >
                            <MessageSquare size={20} aria-hidden="true" />
                          </a>
                          <button
                            type="button"
                            className="ccm-rail-btn ccm-rail-more"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverflowLead(lead);
                            }}
                            aria-label={`פעולות נוספות ל${lead.name}`}
                            title="פעולות נוספות"
                          >
                            <MoreHorizontal size={20} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </SwipeRow>
              </div>
            );
          }

          // ── Desktop: tighter 3-block card (left avatar / middle stats / right pre-approval) ──
          const matchCount = matchCountByLead[lead.id] || 0;
          const lookingForLabel = lead.lookingFor === 'RENT' ? 'לשכור' : 'לקנות';
          const interestLabel =
            lead.interestType === 'COMMERCIAL' ? 'מסחרי' : 'פרטי';
          const InterestIcon = lead.interestType === 'COMMERCIAL' ? Briefcase : Home;
          return (
            <div
              key={lead.id}
              ref={(el) => { if (el) cardRefs.current[lead.id] = el; }}
              className={`customer-card cc-v2 ${highlightId === lead.id ? 'highlight' : ''}`}
            >
              <div className="cc-v2-grid">
                <div className="cc-v2-left">
                  <div className="customer-avatar">{lead.name.charAt(0)}</div>
                  <div className="cc-v2-name">
                    <Link to={`/customers/${lead.id}`} className="customer-name-link">
                      <strong>{lead.name}</strong>
                    </Link>
                    <StatusPicker lead={lead} onChange={handleStatusChange} />
                  </div>
                </div>

                <div className="cc-v2-mid">
                  <div className="cc-v2-mid-row cc-v2-headline">
                    <InterestIcon size={12} />
                    <span>
                      מחפש: <strong>{interestLabel}</strong> · <strong>{lookingForLabel}</strong>
                    </span>
                  </div>
                  <div className="cc-v2-mid-row">
                    <span className="cc-v2-chip">
                      {lead.city || 'עיר ?'}
                    </span>
                    <span className="cc-v2-chip">
                      {lead.rooms ? `${lead.rooms} חד׳` : '— חד׳'}
                    </span>
                    <span className="cc-v2-chip cc-v2-chip-budget">
                      {lead.priceRangeLabel
                        || (lead.budget ? `₪${Number(lead.budget).toLocaleString('he-IL')}` : 'תקציב ?')}
                    </span>
                  </div>
                  {matchCount > 0 && (
                    <Link
                      to={`/properties${lead.city ? `?city=${encodeURIComponent(lead.city)}` : ''}`}
                      className="cc-match-pill cc-v2-match-pill"
                      title={`${matchCount} נכסים שלך עונים לקריטריונים של ${lead.name}`}
                    >
                      <Sparkles size={11} />
                      <strong>{matchCount}</strong>
                      <span>נכסים תואמים</span>
                    </Link>
                  )}
                </div>

                <div className="cc-v2-right">
                  {lead.preApproval && (
                    <span className="cc-v2-preapproval" title="אישור עקרוני למשכנתא">
                      <CheckCircle2 size={12} />
                      אישור עקרוני
                    </span>
                  )}
                </div>
              </div>

              <div className="customer-notes cc-v2-notes">
                <InlineText
                  value={lead.notes || ''}
                  onCommit={(v) => patchLead(lead.id, { notes: v || null }, { success: 'הערות עודכנו' })}
                  multiline
                  placeholder="הוסף הערות..."
                  className="customer-notes-inline"
                />
              </div>

              <div className="customer-card-footer cc-v2-footer">
                <div className="customer-dates">
                  <button
                    className="cc-last-contact"
                    title={lead.lastContact ? absoluteTime(lead.lastContact) : 'לחץ לעדכון קשר אחרון לעכשיו'}
                    onClick={() => patchLead(lead.id, { lastContact: new Date().toISOString() }, { success: 'קשר אחרון עודכן' })}
                  >
                    <Calendar size={12} />
                    {lead.lastContact ? relativeTime(lead.lastContact) : 'ללא קשר'}
                  </button>
                </div>
                <div className="customer-actions">
                  <a
                    href={telUrl(lead.phone)}
                    className="btn btn-ghost btn-sm"
                    title={lead.phone}
                    aria-label={`התקשר ל${lead.name}`}
                    onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                  >
                    <Phone size={14} />
                    <span className="hide-sm">{lead.phone}</span>
                  </a>
                  <a
                    href={waUrl(lead.phone, `שלום ${lead.name}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    title="שלח בוואטסאפ"
                    aria-label={`וואטסאפ ל${lead.name}`}
                    onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                  >
                    <WhatsAppIcon size={14} className="wa-green" />
                  </a>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditDialog(lead)}
                    title="עריכה"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm danger-hover"
                    onClick={() => setDeleteTarget(lead)}
                    title="מחיקה"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="customers-empty rich">
            <div className="ce-illustration">👥</div>
            <h3>
              {leads.length === 0
                ? 'אין עדיין לקוחות במערכת'
                : 'אין לקוחות בסינון הנוכחי'}
            </h3>
            <p>
              {leads.length === 0
                ? 'הוסף את הליד הראשון שלך כדי להתחיל לעקוב אחר הלקוחות הפוטנציאליים.'
                : 'נסה לשנות את הסינון או לחפש לקוח בשם אחר.'}
            </p>
            <Link to="/customers/new" className="btn btn-primary btn-lg">
              <UserPlus size={18} />
              ליד חדש
            </Link>
          </div>
        )}
      </div>
      )}

      {editDialog && (
        <CustomerEditDialog
          lead={editDialog}
          onClose={() => setEditDialog(null)}
          onSaved={async () => {
            setEditDialog(null);
            await loadLeads();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="מחיקת לקוח"
          message={`למחוק את "${deleteTarget.name}"? הפעולה אינה הפיכה.`}
          confirmLabel="מחק"
          onConfirm={confirmDeleteLead}
          onClose={() => setDeleteTarget(null)}
          busy={deleting}
        />
      )}

      {/* Mobile ⋯ overflow sheet for per-lead secondary actions (P1-M8) */}
      <OverflowSheet
        open={!!overflowLead}
        onClose={() => setOverflowLead(null)}
        title={overflowLead ? overflowLead.name : ''}
        actions={overflowLead ? [
          {
            icon: Phone,
            label: 'התקשר',
            description: overflowLead.phone,
            onClick: () => handleTel(overflowLead),
          },
          {
            icon: Edit3,
            label: 'עריכה',
            onClick: () => setEditDialog(overflowLead),
          },
          {
            icon: Trash2,
            label: 'מחיקה',
            color: 'danger',
            onClick: () => setDeleteTarget(overflowLead),
          },
        ] : []}
      />

      {/* Mobile status-chip bottom sheet (P5-M3) */}
      <StatusInfoSheet
        lead={statusSheetLead}
        onClose={() => setStatusSheetLead(null)}
        onChange={(s) => {
          if (statusSheetLead && s !== statusSheetLead.status) {
            handleStatusChange(statusSheetLead, s);
          }
          setStatusSheetLead(null);
        }}
      />

      {/* P1-M11: Mobile filters bottom sheet */}
      {filterSheetOpen && (
        <FilterSheet
          lookingForFilter={lookingForFilter}
          interestFilter={interestFilter}
          statusFilter={statusFilter}
          onLookingForChange={setLookingForFilter}
          onInterestChange={setInterestFilter}
          onStatusChange={setStatusFilter}
          onClear={clearFilters}
          onClose={() => setFilterSheetOpen(false)}
        />
      )}
    </div>
    </PullRefresh>
  );
}

// CustomerList — at ≥900 px renders a real sortable table (P2-D13);
// below 900 px keeps the existing card-style list rows for mobile scanning.
function CustomerList({
  leads,
  highlightId,
  cardRefs,
  isMobile,
  matchCountByLead = {},
  onStatusChange,
  onEdit,
  onDelete,
  onNavigate,
}) {
  // P2-D13: sort state — clicking a header toggles asc/desc; clicking a
  // different one resets to asc.
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const sorted = useMemo(() => {
    const arr = [...leads];
    const dir = sortDir === 'asc' ? 1 : -1;
    const get = (l) => {
      switch (sortKey) {
        case 'name':       return (l.name || '').toLowerCase();
        case 'city':       return (l.city || '').toLowerCase();
        case 'rooms':      return parseFloat(l.rooms) || 0;
        case 'budget':     return Number(l.budget) || 0;
        case 'status':     return ({ HOT: 0, WARM: 1, COLD: 2 })[l.status] ?? 3;
        case 'lastContact':return l.lastContact ? new Date(l.lastContact).getTime() : 0;
        default:           return '';
      }
    };
    arr.sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [leads, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Helper that returns an icon node for a sortable column header.
  // Declared as a regular function (not a component) so React's
  // rules-of-hooks linter is happy with it being defined here.
  const renderSortIcon = (col) => {
    if (sortKey !== col) return <ArrowUpDown size={11} className="cl-sort-icon" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="cl-sort-icon active" />
      : <ChevronDown size={12} className="cl-sort-icon active" />;
  };

  // ── Real table on desktop (≥900px) ───────────────────────────────
  if (!isMobile) {
    return (
      <div className="customer-table-wrap animate-in animate-in-delay-3">
        <table className="customer-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('name')} className={`cl-th cl-th-sortable ${sortKey === 'name' ? 'sorted' : ''}`}>
                <span>שם</span>{renderSortIcon('name')}
              </th>
              <th onClick={() => toggleSort('city')} className={`cl-th cl-th-sortable ${sortKey === 'city' ? 'sorted' : ''}`}>
                <span>עיר</span>{renderSortIcon('city')}
              </th>
              <th onClick={() => toggleSort('rooms')} className={`cl-th cl-th-sortable cl-th-num ${sortKey === 'rooms' ? 'sorted' : ''}`}>
                <span>חדרים</span>{renderSortIcon('rooms')}
              </th>
              <th onClick={() => toggleSort('budget')} className={`cl-th cl-th-sortable cl-th-num ${sortKey === 'budget' ? 'sorted' : ''}`}>
                <span>תקציב</span>{renderSortIcon('budget')}
              </th>
              <th onClick={() => toggleSort('status')} className={`cl-th cl-th-sortable ${sortKey === 'status' ? 'sorted' : ''}`}>
                <span>סטטוס</span>{renderSortIcon('status')}
              </th>
              <th onClick={() => toggleSort('lastContact')} className={`cl-th cl-th-sortable cl-th-num ${sortKey === 'lastContact' ? 'sorted' : ''}`}>
                <span>קשר אחרון</span>{renderSortIcon('lastContact')}
              </th>
              <th className="cl-th cl-th-actions">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((lead) => {
              const matches = matchCountByLead[lead.id] || 0;
              const lastRel = lead.lastContact ? relativeDate(lead.lastContact) : null;
              return (
                <tr
                  key={lead.id}
                  ref={(el) => { if (el) cardRefs.current[lead.id] = el; }}
                  className={`cl-tr ${highlightId === lead.id ? 'highlight' : ''}`}
                  onClick={() => onNavigate?.(lead.id)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); onNavigate?.(lead.id); }
                  }}
                  title={`פתח כרטיס לקוח של ${lead.name}`}
                >
                  <td className="cl-td cl-td-name">
                    <span className="cl-avatar">{lead.name.charAt(0)}</span>
                    <span className="cl-name-text">
                      <strong>{lead.name}</strong>
                      <small>{lead.source || '—'}</small>
                    </span>
                    {matches > 0 && (
                      <span className="cl-match-pill" title={`${matches} נכסים תואמים`}>
                        <Sparkles size={10} />
                        {matches}
                      </span>
                    )}
                  </td>
                  <td className="cl-td cl-muted">{lead.city || '—'}</td>
                  <td className="cl-td cl-td-num cl-muted">{lead.rooms || '—'}</td>
                  <td className="cl-td cl-td-num cl-muted">
                    {lead.budget
                      ? `₪${Number(lead.budget).toLocaleString('he-IL')}`
                      : (lead.priceRangeLabel || '—')}
                  </td>
                  <td className="cl-td" onClick={(e) => e.stopPropagation()}>
                    <StatusPicker lead={lead} onChange={onStatusChange} />
                  </td>
                  <td
                    className="cl-td cl-td-num cl-muted"
                    title={lead.lastContact ? absoluteTime(lead.lastContact) : ''}
                  >
                    {lastRel ? lastRel.label : '—'}
                  </td>
                  <td className="cl-td cl-td-actions" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={telUrl(lead.phone)}
                      className="cl-btn"
                      title={lead.phone}
                      aria-label={`התקשר ל${lead.name}`}
                      onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                    >
                      <Phone size={13} />
                    </a>
                    <a
                      href={waUrl(lead.phone, `שלום ${lead.name}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cl-btn"
                      title="וואטסאפ"
                      aria-label={`וואטסאפ ל${lead.name}`}
                      onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                    >
                      <WhatsAppIcon size={13} className="wa-green" />
                    </a>
                    <button className="cl-btn" title="עריכה" onClick={() => onEdit(lead)}>
                      <Edit3 size={13} />
                    </button>
                    <button className="cl-btn danger" title="מחיקה" onClick={() => onDelete(lead)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="customers-empty">
            <p>אין לקוחות בסינון הנוכחי</p>
          </div>
        )}
      </div>
    );
  }

  // ── Mobile keeps the existing dense card-row list ─────────────────
  return (
    <div className="customer-list animate-in animate-in-delay-3">
      {leads.map((lead) => {
        return (
          <div
            key={lead.id}
            ref={(el) => { if (el) cardRefs.current[lead.id] = el; }}
            className={`customer-list-row ${highlightId === lead.id ? 'highlight' : ''}`}
          >
            <span className="cl-name">
              <span className="cl-avatar">{lead.name.charAt(0)}</span>
              <span className="cl-name-text">
                <strong>{lead.name}</strong>
                <small>{lead.source || '—'}</small>
              </span>
            </span>
            <span>
              <StatusPicker lead={lead} onChange={onStatusChange} />
            </span>
            <span className="cl-type">
              <Chip tone="neutral">
                {lead.interestType === 'COMMERCIAL' ? 'מסחרי' : 'פרטי'}
              </Chip>
              <Chip tone={lead.lookingFor === 'RENT' ? 'rent' : 'buy'}>
                {lead.lookingFor === 'RENT' ? 'שכירות' : 'קנייה'}
              </Chip>
            </span>
            <span className="cl-muted">{lead.city || '—'}</span>
            <span className="cl-muted">{lead.rooms || '—'}</span>
            <span className="cl-muted">{lead.priceRangeLabel || '—'}</span>
            <span className="cl-muted" title={lead.lastContact ? absoluteTime(lead.lastContact) : ''}>
              {lead.lastContact ? relativeTime(lead.lastContact) : '—'}
            </span>
            <span className="cl-actions">
              <a
                href={telUrl(lead.phone)}
                className="cl-btn"
                title={lead.phone}
                aria-label={`התקשר ל${lead.name}`}
                onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
              >
                <Phone size={13} />
              </a>
              <a
                href={waUrl(lead.phone, `שלום ${lead.name}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="cl-btn"
                title="וואטסאפ"
                aria-label={`וואטסאפ ל${lead.name}`}
                onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
              >
                <WhatsAppIcon size={13} className="wa-green" />
              </a>
              <button className="cl-btn" title="עריכה" onClick={() => onEdit(lead)}>
                <Edit3 size={13} />
              </button>
              <button className="cl-btn danger" title="מחיקה" onClick={() => onDelete(lead)}>
                <Trash2 size={13} />
              </button>
            </span>
          </div>
        );
      })}
      {leads.length === 0 && (
        <div className="customers-empty">
          <p>אין לקוחות בסינון הנוכחי</p>
        </div>
      )}
    </div>
  );
}

// Inline dropdown to pick HOT/WARM/COLD manually, with auto-suggestion badge.
function StatusPicker({ lead, onChange }) {
  const [open, setOpen] = useState(false);
  const isAutoMatch = lead.suggestedStatus && lead.status === lead.suggestedStatus;

  return (
    <div className="status-picker">
      <button
        className={`badge ${statusBadgeClass(lead.status)} status-badge-btn`}
        onClick={() => setOpen((v) => !v)}
        title={lead.statusExplanation || 'שנה סטטוס'}
      >
        {statusIcon(lead.status)}
        {statusLabel(lead.status)}
        {lead.suggestedStatus && !isAutoMatch && (
          <Sparkles size={11} className="sp-auto-hint" title="הצעה אוטומטית שונה מהסטטוס הנוכחי" />
        )}
      </button>
      {open && (
        <div className="status-menu" onMouseLeave={() => setOpen(false)}>
          <div className="status-menu-hint">
            <HelpCircle size={12} />
            <span>{lead.statusExplanation || 'בחר סטטוס לליד'}</span>
          </div>
          {['HOT', 'WARM', 'COLD'].map((s) => (
            <button
              key={s}
              className={`status-menu-item ${lead.status === s ? 'active' : ''}`}
              onClick={async () => {
                setOpen(false);
                if (s !== lead.status) await onChange(lead, s);
              }}
            >
              {statusIcon(s)}
              <span>{statusLabel(s)}</span>
              {lead.suggestedStatus === s && <span className="sp-auto">הצעה אוטומטית</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Mobile status-chip bottom sheet. Shows full explanation + quick-switch rows.
function StatusInfoSheet({ lead, onClose, onChange }) {
  useEffect(() => {
    if (!lead) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [lead]);

  if (!lead) return null;

  const statuses = [
    { key: 'HOT', label: 'חם', icon: <Flame size={18} /> },
    { key: 'WARM', label: 'חמים', icon: <Thermometer size={18} /> },
    { key: 'COLD', label: 'קר', icon: <Snowflake size={18} /> },
  ];

  return (
    <div className="mpk-back mpk-overflow-back" onClick={onClose} role="dialog">
      <div className="mpk-sheet mpk-overflow sis-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mpk-handle" />
        <header className="mpk-head">
          <h3>שנה סטטוס</h3>
          <button className="mpk-close" onClick={onClose} aria-label="סגור">
            <X size={18} />
          </button>
        </header>
        <div className="sis-explain">
          <div className="sis-current">
            <span className={`badge ${statusBadgeClass(lead.status)}`}>
              {statusIcon(lead.status)}
              {statusLabel(lead.status)}
            </span>
            <span className="sis-current-name">{lead.name}</span>
          </div>
          <p className="sis-reason">
            {lead.statusExplanation || 'לא זוהתה פעילות אחרונה. עדכן קשר או שלח וואטסאפ כדי לקדם את הליד.'}
          </p>
        </div>
        <div className="mpk-overflow-list">
          {statuses.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`mpk-overflow-row sis-row ${lead.status === s.key ? 'sel' : ''}`}
              onClick={() => onChange(s.key)}
            >
              {s.icon}
              <div className="mpk-overflow-meta">
                <strong>{s.label}</strong>
                {lead.suggestedStatus === s.key && <small>הצעה אוטומטית</small>}
              </div>
            </button>
          ))}
        </div>
        <button className="mpk-cancel" onClick={onClose}>ביטול</button>
      </div>
    </div>
  );
}

// P1-M11: Mobile filter bottom sheet — three groups stacked + clear
function FilterSheet({
  lookingForFilter,
  interestFilter,
  statusFilter,
  onLookingForChange,
  onInterestChange,
  onStatusChange,
  onClear,
  onClose,
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const Group = ({ title, options, value, onChange }) => (
    <div className="filter-sheet-group">
      <div className="filter-sheet-group-title">{title}</div>
      <div className="filter-sheet-chips">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`filter-sheet-chip ${value === o.key ? 'sel' : ''}`}
            onClick={() => onChange(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mpk-back mpk-overflow-back" onClick={onClose} role="dialog">
      <div className="mpk-sheet mpk-overflow filter-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mpk-handle" />
        <header className="mpk-head">
          <h3>סינון לקוחות</h3>
          <button className="mpk-close" onClick={onClose} aria-label="סגור">
            <X size={18} />
          </button>
        </header>
        <div className="filter-sheet-body">
          <Group
            title="חיפוש"
            options={[
              { key: 'all', label: 'הכל' },
              { key: 'BUY', label: 'קונים' },
              { key: 'RENT', label: 'שוכרים' },
            ]}
            value={lookingForFilter}
            onChange={onLookingForChange}
          />
          <Group
            title="סוג נכס"
            options={[
              { key: 'all', label: 'כל הסוגים' },
              { key: 'PRIVATE', label: 'פרטי' },
              { key: 'COMMERCIAL', label: 'מסחרי' },
            ]}
            value={interestFilter}
            onChange={onInterestChange}
          />
          <Group
            title="סטטוס"
            options={[
              { key: 'all', label: 'הכל' },
              { key: 'HOT', label: 'חם' },
              { key: 'WARM', label: 'חמים' },
              { key: 'COLD', label: 'קר' },
            ]}
            value={statusFilter}
            onChange={onStatusChange}
          />
        </div>
        <div className="filter-sheet-actions">
          <button
            type="button"
            className="filter-sheet-clear"
            onClick={() => { onClear(); }}
          >
            נקה סינון
          </button>
          <button
            type="button"
            className="filter-sheet-apply"
            onClick={onClose}
          >
            הצג תוצאות
          </button>
        </div>
      </div>
    </div>
  );
}
