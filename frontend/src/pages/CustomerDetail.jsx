import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Phone,
  MessageSquare,
  Calendar,
  FileText,
  AlertCircle,
  Save,
  History,
  Flame,
  Thermometer,
  Snowflake,
  Building2,
  Sparkles,
  Printer,
  Maximize2,
} from 'lucide-react';
import { popoutCurrentRoute } from '../lib/popout';
import { printPage } from '../lib/print';
import api from '../lib/api';
import WhatsAppIcon from '../components/WhatsAppIcon';
import LeadMeetingDialog from '../components/LeadMeetingDialog';
import TagPicker from '../components/TagPicker';
import RemindersPanel from '../components/RemindersPanel';
import MatchingList from '../components/MatchingList';
import CustomerEditDialog from '../components/CustomerEditDialog';
import { Edit3 } from 'lucide-react';
import ActivityPanel from '../components/ActivityPanel';
// LeadSearchProfilesEditor removed from the detail page — the main
// search prefs (city, street, rooms, price, purpose) are already in
// the LeadSummaryPanel + CustomerEditDialog. Agents consistently
// couldn't tell what the "פרופילי חיפוש" block was meant for.
import { NumberField, PhoneField, SelectField, Segmented } from '../components/SmartFields';
import {
  CUSTOMER_STATUS_LABELS,
  QUICK_LEAD_STATUS_LABELS,
  SERIOUSNESS_LABELS,
  CUSTOMER_PURPOSE_LABELS,
  labelsToOptions,
} from '../lib/mlsLabels';
import {
  inputPropsForName,
  inputPropsForEmail,
  inputPropsForCity,
  inputPropsForAddress,
  inputPropsForRooms,
  inputPropsForNotes,
} from '../lib/inputProps';
import { useToast } from '../lib/toast';
import { relativeDate } from '../lib/relativeDate';
import { relativeTime, absoluteTime } from '../lib/time';
import { waUrl, telUrl } from '../lib/waLink';
import { leadMatchesProperty } from './Properties';
import { primeContactBump } from '../hooks/mobile';
import haptics from '../lib/haptics';
import './CustomerDetail.css';

function statusBadgeClass(status) {
  return {
    HOT: 'badge-danger',
    WARM: 'badge-warning',
    COLD: 'badge-info',
  }[status] || 'badge-gold';
}

// Translate a status code into its Hebrew label. `t` comes from the
// customers namespace so callers outside the default component scope
// (ActivityTimeline) can still resolve copy.
function statusLabel(t, status) {
  return {
    HOT: t('detail.options.status.hot'),
    WARM: t('detail.options.status.warm'),
    COLD: t('detail.options.status.cold'),
  }[status] || status;
}

function statusIcon(status) {
  switch (status) {
    case 'HOT': return <Flame size={13} />;
    case 'WARM': return <Thermometer size={13} />;
    case 'COLD': return <Snowflake size={13} />;
    default: return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// CustomerDetail — full per-lead profile page (P0-D5).
// LEFT (≥1100 px): full edit form. RIGHT: derived activity timeline.
// Mobile (<900 px): stacks form on top, timeline below.
// ──────────────────────────────────────────────────────────────────
export default function CustomerDetail() {
  const { t } = useTranslation('customers');
  const { id } = useParams();
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [matchCount, setMatchCount] = useState(0);
  const [meetingOpen, setMeetingOpen] = useState(false);
  // L-12 — replace inline edit form with a modal, mirroring the edit
  // button pattern on the property detail page. Detail view is now
  // read-only + actionable; editing is a deliberate "open the form"
  // gesture, not a background state the agent is always in.
  const [editOpen, setEditOpen] = useState(false);

  const loadLead = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Prefer the dedicated endpoint; gracefully fall back to a list scan.
      // Note: GET /api/leads/:id responds with `{ lead }` — unwrap so the
      // state holds the bare record. Without this the edit-dialog seeds
      // (`lead.name || ''` etc.) all resolved to undefined → empty fields.
      let fetched = null;
      if (typeof api.getLead === 'function') {
        try {
          const res = await api.getLead(id);
          fetched = res?.lead ?? res;
        }
        catch (e) {
          if (e?.status !== 404) {
            const list = await api.listLeads();
            fetched = (list?.items || []).find((l) => String(l.id) === String(id)) || null;
          }
        }
      }
      if (!fetched) {
        const list = await api.listLeads();
        fetched = (list?.items || []).find((l) => String(l.id) === String(id)) || null;
      }
      if (!fetched) throw new Error(t('detail.notFound'));
      setLead(fetched);
    } catch (e) {
      setError(e.message || t('detail.loadError'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => { loadLead(); }, [loadLead]);

  // Side-load matching properties so we can show the gold pill.
  useEffect(() => {
    if (!lead) return undefined;
    let cancelled = false;
    api.listProperties({ mine: '1' })
      .then((res) => {
        if (cancelled) return;
        const props = res?.items || [];
        const n = props.filter((p) => leadMatchesProperty(lead, p)).length;
        setMatchCount(n);
      })
      .catch(() => { /* ignore — pill stays at 0 */ });
    return () => { cancelled = true; };
  }, [lead]);

  if (loading) {
    return (
      <div className="customer-detail-page">
        <div className="cd-skel">{t('detail.loading')}</div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="customer-detail-page">
        <div className="cd-error">
          <AlertCircle size={20} />
          <span>{error || t('detail.notFound')}</span>
          <Link to="/customers" className="btn btn-secondary btn-sm">{t('detail.backToCustomers')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-detail-page">
      {/* Top toolbar — breadcrumb + status + contact actions + templates */}
      <div className="cd-toolbar">
        <div className="cd-crumb">
          <Link to="/customers" className="cd-crumb-link">
            <ArrowRight size={16} />
            {t('detail.crumbCustomers')}
          </Link>
          <span className="cd-crumb-sep">/</span>
          <strong className="cd-crumb-name">{lead.name}</strong>
          <span className={`badge ${statusBadgeClass(lead.status)} cd-status-pill`}>
            {statusIcon(lead.status)}
            {statusLabel(t, lead.status)}
          </span>
          {matchCount > 0 && (
            <Link
              to={`/properties${lead.city ? `?city=${encodeURIComponent(lead.city)}` : ''}`}
              className="cd-match-pill"
              title={t('detail.matchingTitle')}
            >
              <Sparkles size={12} />
              <strong>{matchCount}</strong>
              <span>{t('detail.matchLabel')}</span>
            </Link>
          )}
        </div>
        <div className="cd-toolbar-actions">
          <Link to="/templates" className="btn btn-secondary btn-sm cd-tpl-btn" title={t('detail.toolbar.templatesTitle')}>
            <FileText size={14} />
            {t('detail.toolbar.templates')}
          </Link>
          <a
            href={telUrl(lead.phone)}
            className="btn btn-secondary btn-sm"
            onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
            title={lead.phone || t('detail.toolbar.callFallback')}
          >
            <Phone size={14} />
            {t('detail.toolbar.call')}
          </a>
          <a
            href={waUrl(lead.phone, t('detail.toolbar.whatsappHello', { name: lead.name }))}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm cd-wa-btn"
            onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
            title={t('detail.toolbar.whatsappTitle')}
          >
            <WhatsAppIcon size={14} className="wa-green" />
            {t('detail.toolbar.whatsapp')}
          </a>
          <a
            href={`sms:${lead.phone}`}
            className="btn btn-secondary btn-sm"
            onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
            title={t('detail.toolbar.smsTitle')}
          >
            <MessageSquare size={14} />
            {t('detail.toolbar.sms')}
          </a>
          {/* 7.2 — Schedule meeting. Opens LeadMeetingDialog which
              checks Google Calendar connection; if not connected, the
              dialog still lets the agent create a local record with a
              nudge to connect. */}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { haptics.tap(); setMeetingOpen(true); }}
            title={t('detail.toolbar.scheduleMeetingTitle')}
          >
            <Calendar size={14} />
            {t('detail.toolbar.scheduleMeeting')}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { haptics.tap(); setEditOpen(true); }}
            title="ערוך פרטי לקוח"
          >
            <Edit3 size={14} />
            ערוך
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => printPage()} title={t('detail.toolbar.printTitle')}>
            <Printer size={14} />
            {t('detail.toolbar.print')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => popoutCurrentRoute()} title={t('detail.toolbar.popoutTitle')}>
            <Maximize2 size={14} />
            {t('detail.toolbar.popout')}
          </button>
        </div>
      </div>

      {meetingOpen && (
        <LeadMeetingDialog
          lead={lead}
          onClose={() => setMeetingOpen(false)}
          onCreated={() => { /* could re-load meeting list here */ }}
        />
      )}

      {/* H3 lead-side / A2 tags / D1 reminders / C3 matching / K4 profiles
          — all additive. The existing edit form + derived timeline move
          left; the new MLS-parity panels stack in the right column. */}
      <div className="cd-grid">
        <div className="cd-form-col">
          {/* Property matches lead the way — this is the primary
              reason an agent opens a lead's page (who can I pitch to
              them today?). Matches component already lives in the
              codebase; pulling it up into the left column so it sits
              above the lead summary. */}
          <div className="cd-section cd-section-embedded">
            <MatchingList leadId={lead.id} title="נכסים תואמים" />
          </div>
          <LeadSummaryPanel lead={lead} onEdit={() => setEditOpen(true)} />
          <section className="cd-section cd-tags-section" aria-label={t('detail.sections.tagsAria')}>
            <h3 className="cd-section-title">{t('detail.sections.tags')}</h3>
            <TagPicker entityType="LEAD" entityId={lead.id} />
          </section>
        </div>
        <div className="cd-timeline-col">
          <div className="cd-section cd-section-embedded">
            <RemindersPanel leadId={lead.id} />
          </div>
          <div className="cd-section cd-section-embedded">
            <ActivityPanel entityType="Lead" entityId={lead.id} />
          </div>
          <ActivityTimeline lead={lead} />
        </div>
      </div>

      {editOpen && (
        <CustomerEditDialog
          lead={lead}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            toast.success(t('detail.saved'));
            try { await loadLead(); } catch { /* ignore */ }
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// LeadSummaryPanel — read-only snapshot of the lead's profile. Used
// to be an inline form that looked like an "edit" view; replaced with
// a summary card matching the property detail page pattern so the
// lead page defaults to "here's what you need to act on", with a
// deliberate "ערוך" button to open the edit dialog.
// ──────────────────────────────────────────────────────────────────
function LeadSummaryPanel({ lead, onEdit }) {
  const { t } = useTranslation('customers');

  const fmtPrice = (n) => {
    if (!Number.isFinite(n) || n === 0) return null;
    if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `₪${Math.round(n / 1_000)}K`;
    return `₪${n.toLocaleString('he-IL')}`;
  };
  const priceRange = (() => {
    const lo = fmtPrice(lead.priceMin);
    const hi = fmtPrice(lead.priceMax);
    if (lo && hi) return `${lo} – ${hi}`;
    if (lo) return `מ-${lo}`;
    if (hi) return `עד ${hi}`;
    return null;
  })();
  const roomsRange = (() => {
    const lo = Number.isFinite(lead.roomsMin) ? lead.roomsMin : null;
    const hi = Number.isFinite(lead.roomsMax) ? lead.roomsMax : null;
    if (lo != null && hi != null) return lo === hi ? `${lo}` : `${lo} – ${hi}`;
    if (lo != null) return `מ-${lo}`;
    if (hi != null) return `עד ${hi}`;
    return null;
  })();
  const lookingLabel = lead.lookingFor === 'RENT' ? 'שכירות' : 'קנייה';
  const interestLabel = lead.interestType === 'COMMERCIAL' ? 'מסחרי' : 'פרטי';

  // The short list of "what an agent needs to know at a glance". Nulls
  // drop out so the card doesn't read as a pile of em-dashes on a new
  // lead with sparse data.
  const rows = [
    ['טלפון',            lead.phone],
    ['אימייל',           lead.email],
    ['עיר מבוקשת',       lead.city],
    ['רחוב מבוקש',       lead.street],
    ['מחפש',             `${lookingLabel} · ${interestLabel}`],
    ['טווח מחיר',        priceRange],
    ['חדרים',            roomsRange],
    ['מקור',             lead.source],
    ['סקטור',            lead.sector],
    ['אישור עקרוני',     lead.preApproval ? 'יש' : null],
  ].filter(([, v]) => v != null && v !== '');

  return (
    <section className="cd-section cd-summary" aria-label="פרטי לקוח">
      <header className="cd-summary-head">
        <h3 className="cd-section-title">פרטי לקוח</h3>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onEdit}
          title="ערוך פרטי לקוח"
        >
          <Edit3 size={14} />
          ערוך
        </button>
      </header>

      {rows.length === 0 ? (
        <p className="cd-summary-empty">
          {t('detail.notes.emptyLead', { defaultValue: 'עוד לא מולאו פרטים על הלקוח הזה.' })}
        </p>
      ) : (
        <dl className="cd-summary-grid">
          {rows.map(([label, value]) => (
            <div className="cd-summary-row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {lead.notes && (
        <div className="cd-summary-notes">
          <span className="cd-summary-notes-label">הערות</span>
          <p>{lead.notes}</p>
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// CustomerEditForm — inline edit form (mirrors CustomerEditDialog,
// without the modal chrome; saves via api.updateLead).
// ──────────────────────────────────────────────────────────────────
function CustomerEditForm({ lead, onSaved, toast }) {
  const { t } = useTranslation('customers');
  const [form, setForm] = useState({
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    interestType: lead.interestType || 'PRIVATE',
    lookingFor: lead.lookingFor || 'BUY',
    city: lead.city || '',
    street: lead.street || '',
    rooms: lead.rooms || '',
    priceRangeLabel: lead.priceRangeLabel || '',
    budget: lead.budget ?? null,
    sector: lead.sector || 'כללי',
    schoolProximity: lead.schoolProximity || '',
    balconyRequired: !!lead.balconyRequired,
    parkingRequired: !!lead.parkingRequired,
    elevatorRequired: !!lead.elevatorRequired,
    safeRoomRequired: !!lead.safeRoomRequired,
    acRequired: !!lead.acRequired,
    storageRequired: !!lead.storageRequired,
    preApproval: !!lead.preApproval,
    status: lead.status || 'WARM',
    source: lead.source || '',
    notes: lead.notes || '',

    // K1 — contact / identity.
    firstName: lead.firstName || '',
    lastName:  lead.lastName  || '',
    companyName: lead.companyName || '',
    address: lead.address || '',
    cityText: lead.cityText || '',
    zip: lead.zip || '',
    primaryPhone: lead.primaryPhone || '',
    phone1: lead.phone1 || '',
    phone2: lead.phone2 || '',
    fax: lead.fax || '',
    personalId: lead.personalId || '',
    description: lead.description || '',

    // K2 — admin.
    customerStatus: lead.customerStatus || 'ACTIVE',
    commissionPct: lead.commissionPct ?? null,
    isPrivate: !!lead.isPrivate,
    purposes: Array.isArray(lead.purposes) ? lead.purposes : [],
    seriousnessOverride: lead.seriousnessOverride || 'NONE',

    // L1 — quick lead status.
    leadStatus: lead.leadStatus || 'NEW',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      // L-13 — coerce / drop values that would fail zod on the server:
      // half-typed emails, non-integer budgets, whitespace-only strings.
      const normalizedEmail =
        typeof form.email === 'string' && form.email.trim()
          ? form.email.trim()
          : null;
      const isLikelyEmail = normalizedEmail && /.+@.+\..+/.test(normalizedEmail);
      const budgetNum = form.budget != null && form.budget !== ''
        ? Math.max(0, Math.round(Number(form.budget)))
        : null;
      const body = {
        name: form.name?.trim() || '',
        phone: form.phone?.trim() || '',
        email: isLikelyEmail ? normalizedEmail : null,
        interestType: form.interestType,
        lookingFor: form.lookingFor,
        city: form.city || null,
        street: form.street || null,
        rooms: (form.rooms && String(form.rooms).trim()) || null,
        priceRangeLabel: form.priceRangeLabel || null,
        budget: Number.isFinite(budgetNum) ? budgetNum : null,
        sector: form.sector || null,
        schoolProximity: form.schoolProximity || null,
        balconyRequired: form.balconyRequired,
        parkingRequired: form.parkingRequired,
        elevatorRequired: form.elevatorRequired,
        safeRoomRequired: form.safeRoomRequired,
        acRequired: form.acRequired,
        storageRequired: form.storageRequired,
        preApproval: form.preApproval,
        status: form.status,
        source: form.source || null,
        notes: form.notes || null,

        // K1 / K2 / L1 — mirror of NewLead submit shape.
        firstName:   form.firstName?.trim()   || null,
        lastName:    form.lastName?.trim()    || null,
        companyName: form.companyName?.trim() || null,
        address:     form.address?.trim()     || null,
        cityText:    form.cityText?.trim()    || null,
        zip:         form.zip?.trim()         || null,
        primaryPhone: form.primaryPhone?.trim() || null,
        phone1:      form.phone1?.trim()      || null,
        phone2:      form.phone2?.trim()      || null,
        fax:         form.fax?.trim()         || null,
        personalId:  form.personalId?.trim()  || null,
        description: form.description?.trim() || null,
        customerStatus: form.customerStatus || 'ACTIVE',
        commissionPct: form.commissionPct != null && form.commissionPct !== ''
          ? Number(form.commissionPct)
          : null,
        isPrivate: !!form.isPrivate,
        purposes: Array.isArray(form.purposes) ? form.purposes : [],
        seriousnessOverride: form.seriousnessOverride || 'NONE',
        leadStatus: form.leadStatus || 'NEW',
      };
      await api.updateLead(lead.id, body);
      onSaved(body);
    } catch (e) {
      const msg = e.message || t('detail.saveError');
      setErr(msg);
      toast?.error?.(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cd-form-col">
      <div className="cd-section">
        <h3 className="cd-section-title">{t('detail.sections.customerDetails')}</h3>
        {err && <div className="cd-form-error"><AlertCircle size={14} />{err}</div>}

        <div className="deal-form-grid">
          <div className="form-group">
            <label className="form-label">{t('detail.fields.name')}</label>
            <input {...inputPropsForName()} className="form-input" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.phone')}</label>
            <PhoneField value={form.phone} onChange={(v) => update('phone', v)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.email')}</label>
            <input {...inputPropsForEmail()} className="form-input" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.status')}</label>
            <Segmented
              value={form.status}
              onChange={(v) => update('status', v)}
              options={[
                { value: 'HOT', label: t('detail.options.status.hot') },
                { value: 'WARM', label: t('detail.options.status.warm') },
                { value: 'COLD', label: t('detail.options.status.cold') },
              ]}
              ariaLabel={t('detail.fields.statusAria')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.interestType')}</label>
            <Segmented
              value={form.interestType}
              onChange={(v) => update('interestType', v)}
              options={[
                { value: 'PRIVATE', label: t('detail.options.interestType.private') },
                { value: 'COMMERCIAL', label: t('detail.options.interestType.commercial') },
              ]}
              ariaLabel={t('detail.fields.interestTypeAria')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.lookingFor')}</label>
            <Segmented
              value={form.lookingFor}
              onChange={(v) => update('lookingFor', v)}
              options={[
                { value: 'BUY', label: t('detail.options.lookingFor.buy') },
                { value: 'RENT', label: t('detail.options.lookingFor.rent') },
              ]}
              ariaLabel={t('detail.fields.lookingForAria')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.city')}</label>
            <input {...inputPropsForCity()} className="form-input" value={form.city} onChange={(e) => update('city', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.street')}</label>
            <input {...inputPropsForAddress()} className="form-input" value={form.street} onChange={(e) => update('street', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.rooms')}</label>
            <input {...inputPropsForRooms()} className="form-input" value={form.rooms} onChange={(e) => update('rooms', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.priceText')}</label>
            <input dir="auto" autoCapitalize="off" autoCorrect="off" enterKeyHint="next" className="form-input" value={form.priceRangeLabel} onChange={(e) => update('priceRangeLabel', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.budget')}</label>
            <NumberField
              unit="₪"
              placeholder={t('detail.fields.budgetPlaceholder')}
              showShort
              value={form.budget}
              onChange={(v) => update('budget', v)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.sector')}</label>
            <SelectField
              value={form.sector}
              onChange={(v) => update('sector', v)}
              options={[t('detail.options.sectors.general'), t('detail.options.sectors.religious'), t('detail.options.sectors.haredi'), t('detail.options.sectors.arab')]}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.schoolProximity')}</label>
            <SelectField
              value={form.schoolProximity}
              onChange={(v) => update('schoolProximity', v)}
              placeholder={t('detail.fields.schoolProximityNotImportant')}
              options={[t('detail.options.school.m200'), t('detail.options.school.m500'), t('detail.options.school.walk'), t('detail.options.school.km')]}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('detail.fields.source')}</label>
            <input dir="auto" autoCapitalize="words" enterKeyHint="next" autoCorrect="off" className="form-input" value={form.source} onChange={(e) => update('source', e.target.value)} />
          </div>
          <div className="form-group form-group-wide">
            <label className="form-label">{t('detail.fields.notes')}</label>
            <textarea
              {...inputPropsForNotes()}
              className="form-textarea"
              rows={3}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>
        </div>

        {/* K1 — contact identity block (additive). */}
        <div className="cd-subsection">
          <h4 className="cd-subsection-title">{t('detail.sections.extended')}</h4>
          <div className="deal-form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="cd-k1-first">{t('detail.fields.firstName')}</label>
              <input id="cd-k1-first" className="form-input" dir="auto" value={form.firstName}
                onChange={(e) => update('firstName', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cd-k1-last">{t('detail.fields.lastName')}</label>
              <input id="cd-k1-last" className="form-input" dir="auto" value={form.lastName}
                onChange={(e) => update('lastName', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cd-k1-company">{t('detail.fields.companyName')}</label>
              <input id="cd-k1-company" className="form-input" dir="auto" value={form.companyName}
                onChange={(e) => update('companyName', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cd-k1-pid">{t('detail.fields.personalId')}</label>
              <input id="cd-k1-pid" className="form-input" dir="ltr" inputMode="numeric" value={form.personalId}
                onChange={(e) => update('personalId', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cd-k1-address">{t('detail.fields.address')}</label>
              <input id="cd-k1-address" className="form-input" dir="auto" value={form.address}
                onChange={(e) => update('address', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cd-k1-citytext">{t('detail.fields.cityFree')}</label>
              <input id="cd-k1-citytext" className="form-input" dir="auto" value={form.cityText}
                onChange={(e) => update('cityText', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cd-k1-zip">{t('detail.fields.zip')}</label>
              <input id="cd-k1-zip" className="form-input" dir="ltr" inputMode="numeric" value={form.zip}
                onChange={(e) => update('zip', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('detail.fields.primaryPhone')}</label>
              <PhoneField value={form.primaryPhone} onChange={(v) => update('primaryPhone', v)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('detail.fields.phone1')}</label>
              <PhoneField value={form.phone1} onChange={(v) => update('phone1', v)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('detail.fields.phone2')}</label>
              <PhoneField value={form.phone2} onChange={(v) => update('phone2', v)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cd-k1-fax">{t('detail.fields.fax')}</label>
              <input id="cd-k1-fax" className="form-input" dir="ltr" inputMode="tel" value={form.fax}
                onChange={(e) => update('fax', e.target.value)} />
            </div>
            <div className="form-group form-group-wide">
              <label className="form-label" htmlFor="cd-k1-desc">{t('detail.fields.description')}</label>
              <input id="cd-k1-desc" className="form-input" dir="auto" value={form.description}
                onChange={(e) => update('description', e.target.value)} />
            </div>
          </div>
        </div>

        {/* K2 + L1 — admin block. */}
        <div className="cd-subsection">
          <h4 className="cd-subsection-title">{t('detail.sections.admin')}</h4>
          <div className="deal-form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="cd-k2-cs">{t('detail.fields.customerStatus')}</label>
              <SelectField
                id="cd-k2-cs"
                value={form.customerStatus}
                onChange={(v) => update('customerStatus', v)}
                options={labelsToOptions(CUSTOMER_STATUS_LABELS)}
                aria-label={t('detail.fields.customerStatus')}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cd-k2-ls">{t('detail.fields.leadStatus')}</label>
              <SelectField
                id="cd-k2-ls"
                value={form.leadStatus}
                onChange={(v) => update('leadStatus', v)}
                options={labelsToOptions(QUICK_LEAD_STATUS_LABELS)}
                aria-label={t('detail.fields.leadStatus')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('detail.fields.commissionPct')}</label>
              <NumberField
                value={form.commissionPct}
                onChange={(n) => update('commissionPct', n)}
                unit="%"
                min={0}
                max={100}
                placeholder={t('detail.fields.commissionPctPlaceholder')}
                aria-label={t('detail.fields.commissionPct')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('detail.fields.seriousness')}</label>
              <Segmented
                value={form.seriousnessOverride}
                onChange={(v) => update('seriousnessOverride', v)}
                options={labelsToOptions(SERIOUSNESS_LABELS)}
                ariaLabel={t('detail.fields.seriousness')}
              />
            </div>
            <div className="form-group form-group-wide">
              <span className="form-label">{t('detail.fields.purposes')}</span>
              <div className="checkbox-grid" role="group" aria-label={t('detail.fields.purposes')}>
                {Object.keys(CUSTOMER_PURPOSE_LABELS).map((val) => {
                  const checked = form.purposes?.includes(val);
                  return (
                    <label key={val} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={!!checked}
                        onChange={(e) => {
                          const set = new Set(form.purposes || []);
                          if (e.target.checked) set.add(val);
                          else set.delete(val);
                          update('purposes', Array.from(set));
                        }}
                      />
                      <span className="checkbox-custom" />
                      {CUSTOMER_PURPOSE_LABELS[val]}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="form-group form-group-wide">
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={!!form.isPrivate}
                  onChange={(e) => update('isPrivate', e.target.checked)}
                />
                <span className="checkbox-custom" />
                {t('detail.fields.privateCustomer')}
              </label>
            </div>
          </div>
        </div>

        <div className="checkbox-grid">
          {[
            { key: 'preApproval', label: t('detail.amenities.preApproval') },
            { key: 'balconyRequired', label: t('detail.amenities.balcony') },
            { key: 'parkingRequired', label: t('detail.amenities.parking') },
            { key: 'elevatorRequired', label: t('detail.amenities.elevator') },
            { key: 'safeRoomRequired', label: t('detail.amenities.safeRoom') },
            { key: 'acRequired', label: t('detail.amenities.ac') },
            { key: 'storageRequired', label: t('detail.amenities.storage') },
          ].map(({ key, label }) => (
            <label key={key} className="checkbox-item">
              <input type="checkbox" checked={form[key]} onChange={(e) => update(key, e.target.checked)} />
              <span className="checkbox-custom" />
              {label}
            </label>
          ))}
        </div>

        <div className="cd-form-actions">
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            <Save size={16} />
            {busy ? t('detail.actions.saving') : t('detail.actions.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// ActivityTimeline — derived events from the lead's existing fields.
// ──────────────────────────────────────────────────────────────────
function ActivityTimeline({ lead }) {
  const { t } = useTranslation('customers');
  const events = useMemo(() => {
    const items = [];
    if (lead.lastContact) {
      const rel = relativeDate(lead.lastContact);
      const days = Math.round((Date.now() - new Date(lead.lastContact).getTime()) / 86400000);
      const title = days >= 0
        ? t('detail.timeline.lastContactDaysAgo', { days })
        : t('detail.timeline.lastContactPlanned');
      items.push({
        kind: 'contact',
        ts: new Date(lead.lastContact).getTime(),
        icon: Phone,
        title,
        sub: rel.label,
        absolute: absoluteTime(lead.lastContact),
      });
    }
    if (lead.statusUpdatedAt) {
      items.push({
        kind: 'status',
        ts: new Date(lead.statusUpdatedAt).getTime(),
        icon: Sparkles,
        title: t('detail.timeline.statusUpdatedTo', { status: statusLabel(t, lead.status) }),
        sub: relativeTime(lead.statusUpdatedAt),
        absolute: absoluteTime(lead.statusUpdatedAt),
      });
    }
    if (lead.createdAt) {
      items.push({
        kind: 'created',
        ts: new Date(lead.createdAt).getTime(),
        icon: Building2,
        title: t('detail.timeline.created'),
        sub: relativeTime(lead.createdAt),
        absolute: absoluteTime(lead.createdAt),
      });
    }
    // Sort by timestamp descending — most recent first
    items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return items;
  }, [lead, t]);

  return (
    <div className="cd-timeline-col">
      <div className="cd-section cd-timeline-section">
        <h3 className="cd-section-title">
          <History size={16} />
          {t('detail.timeline.title')}
        </h3>
        {events.length === 0 ? (
          <div className="cd-timeline-empty">
            <p>{t('detail.timeline.empty')}</p>
          </div>
        ) : (
          <ul className="cd-timeline">
            {events.map((ev, idx) => {
              const Icon = ev.icon || Calendar;
              return (
                <li key={`${ev.kind}-${idx}`} className={`cd-tl-item cd-tl-${ev.kind}`}>
                  <span className={`cd-tl-dot ${ev.severity ? `sev-${ev.severity}` : ''}`}>
                    <Icon size={14} />
                  </span>
                  <div className="cd-tl-body">
                    <div className="cd-tl-title">{ev.title}</div>
                    <div className="cd-tl-sub" title={ev.absolute || ''}>{ev.sub}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
