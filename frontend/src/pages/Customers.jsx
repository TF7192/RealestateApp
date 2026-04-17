import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  UserPlus,
  Search,
  Phone,
  MessageCircle,
  Flame,
  Thermometer,
  Snowflake,
  Calendar,
  FileSignature,
  FileCheck2,
  ShoppingCart,
  KeyRound,
  Edit3,
  Trash2,
  HelpCircle,
  Sparkles,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react';
import api from '../lib/api';
import AgreementDialog from '../components/AgreementDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import CustomerEditDialog from '../components/CustomerEditDialog';
import InlineText from '../components/InlineText';
import Chip from '../components/Chip';
import { useToast, optimisticUpdate } from '../lib/toast';
import { relativeTime, absoluteTime } from '../lib/time';
import './Customers.css';

// Heuristic "active" client = brokerage agreement signed and not yet expired.
function isActiveClient(lead) {
  if (!lead.brokerageSignedAt) return false;
  if (!lead.brokerageExpiresAt) return true;
  return new Date(lead.brokerageExpiresAt) > new Date();
}

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

export default function Customers() {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('leads'); // 'leads' | 'active'
  const [lookingForFilter, setLookingForFilter] = useState('all'); // all | BUY | RENT
  const [interestFilter, setInterestFilter] = useState('all'); // all | PRIVATE | COMMERCIAL
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const [agreementDialog, setAgreementDialog] = useState(null);
  const [editDialog, setEditDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('estia-customers-view') || 'cards'; }
    catch { return 'cards'; }
  });
  const cardRefs = useRef({});

  const changeView = (v) => {
    setView(v);
    try { localStorage.setItem('estia-customers-view', v); } catch { /* ignore */ }
  };

  const loadLeads = async () => {
    const r = await api.listLeads();
    setLeads(r.items || []);
  };

  useEffect(() => {
    loadLeads().finally(() => setLoading(false));
  }, []);

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
    const t = searchParams.get('tab');
    if (t === 'active' || t === 'leads') setTab(t);
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

  const { leadsGroup, activeGroup } = useMemo(() => {
    const active = [];
    const pending = [];
    for (const l of leads) (isActiveClient(l) ? active : pending).push(l);
    return { leadsGroup: pending, activeGroup: active };
  }, [leads]);

  const filtered = useMemo(() => {
    const base = tab === 'leads' ? leadsGroup : activeGroup;
    return base.filter((l) => {
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
  }, [tab, leadsGroup, activeGroup, lookingForFilter, interestFilter, statusFilter, search]);

  const handleWhatsApp = (lead) => {
    const text = `שלום ${lead.name},`;
    const digits = (lead.phone || '').replace(/[^0-9]/g, '');
    window.open(
      `https://wa.me/${digits}?text=${encodeURIComponent(text)}`,
      '_blank'
    );
  };

  const openAgreementDialog = (lead) => setAgreementDialog({ lead });

  const onAgreementChange = async () => {
    setAgreementDialog(null);
    await loadLeads();
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

      {/* Top-level tabs: לידים vs לקוחות פעילים */}
      <div className="customers-main-tabs animate-in animate-in-delay-1">
        <button
          className={`cmt-tab ${tab === 'leads' ? 'active' : ''}`}
          onClick={() => setTab('leads')}
        >
          <div className="cmt-tab-title">
            <ShoppingCart size={16} />
            פניות חדשות
          </div>
          <div className="cmt-tab-sub">
            לפני חתימה על הסכם תיווך · {leadsGroup.length}
          </div>
        </button>
        <button
          className={`cmt-tab ${tab === 'active' ? 'active' : ''}`}
          onClick={() => setTab('active')}
        >
          <div className="cmt-tab-title">
            <KeyRound size={16} />
            לקוחות פעילים
          </div>
          <div className="cmt-tab-sub">
            עם הסכם תיווך בתוקף · {activeGroup.length}
          </div>
        </button>
      </div>

      {/* Filter strip */}
      <div className="filters-bar animate-in animate-in-delay-2">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="חיפוש לפי שם, עיר, טלפון..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
        {tab === 'leads' && (
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
        )}
      </div>

      {view === 'list' ? (
        <CustomerList
          leads={filtered}
          highlightId={highlightId}
          cardRefs={cardRefs}
          onStatusChange={handleStatusChange}
          onEdit={setEditDialog}
          onDelete={setDeleteTarget}
          onAgreement={openAgreementDialog}
          onWhatsApp={handleWhatsApp}
        />
      ) : (
      <div className="customers-grid animate-in animate-in-delay-3">
        {filtered.map((lead) => {
          const active = isActiveClient(lead);
          const hasSignedFile = (lead.agreements || []).some((a) => a.status === 'SIGNED' && a.fileId);
          return (
            <div
              key={lead.id}
              ref={(el) => { if (el) cardRefs.current[lead.id] = el; }}
              className={`customer-card ${highlightId === lead.id ? 'highlight' : ''} ${active ? 'active-client' : ''}`}
            >
              <div className="customer-card-header">
                <div className="customer-avatar">
                  {lead.name.charAt(0)}
                </div>
                <div className="customer-info">
                  <h4>{lead.name}</h4>
                  <span className="customer-source">
                    {lead.source || '—'}
                  </span>
                </div>
                <div className="customer-badges">
                  <StatusPicker lead={lead} onChange={handleStatusChange} />
                  {active && (
                    <span className="badge badge-success">
                      <KeyRound size={12} />
                      לקוח פעיל
                    </span>
                  )}
                </div>
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
                  <span className="cc-value">
                    <InlineText
                      value={lead.city || ''}
                      onCommit={(v) => patchLead(lead.id, { city: v || null }, { success: 'עיר עודכנה' })}
                      placeholder="הוסף עיר"
                    />
                  </span>
                </div>
                <div className="cc-row">
                  <span className="cc-label">חדרים</span>
                  <span className="cc-value">
                    <InlineText
                      value={lead.rooms || ''}
                      onCommit={(v) => patchLead(lead.id, { rooms: v || null })}
                      placeholder="—"
                    />
                  </span>
                </div>
                <div className="cc-row">
                  <span className="cc-label">תקציב</span>
                  <span className="cc-value">
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
                {(lead.brokerageSignedAt || lead.brokerageExpiresAt) && (
                  <div className="cc-row cc-agreement-row">
                    <span className="cc-label">הסכם תיווך</span>
                    <span className="cc-value">
                      {lead.brokerageSignedAt
                        ? new Date(lead.brokerageSignedAt).toLocaleDateString('he-IL')
                        : '—'}
                      {lead.brokerageExpiresAt && (
                        <> → {new Date(lead.brokerageExpiresAt).toLocaleDateString('he-IL')}</>
                      )}
                      {hasSignedFile && (
                        <span className="cc-signed-chip">
                          <FileCheck2 size={12} />
                          חתום
                        </span>
                      )}
                    </span>
                  </div>
                )}
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

              {/* eslint-disable-next-line react/jsx-no-useless-fragment */}

              <div className="customer-card-footer">
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
                  <a href={`tel:${lead.phone}`} className="btn btn-ghost btn-sm" title={lead.phone}>
                    <Phone size={14} />
                    <span className="hide-sm">{lead.phone}</span>
                  </a>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleWhatsApp(lead)}
                    title="שלח בוואטסאפ"
                  >
                    <MessageCircle size={14} />
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => openAgreementDialog(lead)}
                    title="ניהול הסכם תיווך"
                  >
                    <FileSignature size={14} />
                    הסכם תיווך
                  </button>
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

      {agreementDialog && (
        <AgreementDialog
          lead={agreementDialog.lead}
          onClose={() => setAgreementDialog(null)}
          onChange={onAgreementChange}
        />
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
    </div>
  );
}

// Compact row-based list view. One lead per row, all essential fields visible,
// quick actions on the left edge. Optimized for scanning many leads at once.
function CustomerList({
  leads,
  highlightId,
  cardRefs,
  onStatusChange,
  onEdit,
  onDelete,
  onAgreement,
  onWhatsApp,
}) {
  return (
    <div className="customer-list animate-in animate-in-delay-3">
      <div className="customer-list-head">
        <span>שם</span>
        <span>סטטוס</span>
        <span>סוג</span>
        <span>עיר</span>
        <span>חדרים</span>
        <span>תקציב</span>
        <span>הסכם תיווך</span>
        <span>קשר אחרון</span>
        <span className="cl-actions-head">פעולות</span>
      </div>
      {leads.map((lead) => {
        const active = isActiveClient(lead);
        const hasSignedFile = (lead.agreements || []).some((a) => a.status === 'SIGNED' && a.fileId);
        return (
          <div
            key={lead.id}
            ref={(el) => { if (el) cardRefs.current[lead.id] = el; }}
            className={`customer-list-row ${highlightId === lead.id ? 'highlight' : ''} ${active ? 'is-active' : ''}`}
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
            <span className="cl-agreement">
              {lead.brokerageSignedAt ? (
                <>
                  <span>{new Date(lead.brokerageSignedAt).toLocaleDateString('he-IL')}</span>
                  {lead.brokerageExpiresAt && (
                    <small>→ {new Date(lead.brokerageExpiresAt).toLocaleDateString('he-IL')}</small>
                  )}
                  {hasSignedFile && <span className="cl-signed-dot" title="קובץ חתום" />}
                </>
              ) : (
                <span className="cl-muted">—</span>
              )}
            </span>
            <span className="cl-muted" title={lead.lastContact ? absoluteTime(lead.lastContact) : ''}>
              {lead.lastContact ? relativeTime(lead.lastContact) : '—'}
            </span>
            <span className="cl-actions">
              <a href={`tel:${lead.phone}`} className="cl-btn" title={lead.phone}>
                <Phone size={13} />
              </a>
              <button className="cl-btn" title="וואטסאפ" onClick={() => onWhatsApp(lead)}>
                <MessageCircle size={13} />
              </button>
              <button className="cl-btn" title="הסכם תיווך" onClick={() => onAgreement(lead)}>
                <FileSignature size={13} />
              </button>
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
