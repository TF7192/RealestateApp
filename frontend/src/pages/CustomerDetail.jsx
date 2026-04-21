import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
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
} from 'lucide-react';
import api from '../lib/api';
import WhatsAppIcon from '../components/WhatsAppIcon';
import LeadMeetingDialog from '../components/LeadMeetingDialog';
import { NumberField, PhoneField, SelectField, Segmented } from '../components/SmartFields';
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

function statusLabel(status) {
  return { HOT: 'חם', WARM: 'חמים', COLD: 'קר' }[status] || status;
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
  const { id } = useParams();
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [matchCount, setMatchCount] = useState(0);
  const [meetingOpen, setMeetingOpen] = useState(false);

  const loadLead = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Prefer the dedicated endpoint; gracefully fall back to a list scan.
      let fetched = null;
      if (typeof api.getLead === 'function') {
        try { fetched = await api.getLead(id); }
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
      if (!fetched) throw new Error('הלקוח לא נמצא');
      setLead(fetched);
    } catch (e) {
      setError(e.message || 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, [id]);

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
        <div className="cd-skel">טוען…</div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="customer-detail-page">
        <div className="cd-error">
          <AlertCircle size={20} />
          <span>{error || 'הלקוח לא נמצא'}</span>
          <Link to="/customers" className="btn btn-secondary btn-sm">חזור ללקוחות</Link>
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
            לקוחות
          </Link>
          <span className="cd-crumb-sep">/</span>
          <strong className="cd-crumb-name">{lead.name}</strong>
          <span className={`badge ${statusBadgeClass(lead.status)} cd-status-pill`}>
            {statusIcon(lead.status)}
            {statusLabel(lead.status)}
          </span>
          {matchCount > 0 && (
            <Link
              to={`/properties${lead.city ? `?city=${encodeURIComponent(lead.city)}` : ''}`}
              className="cd-match-pill"
              title="נכסים תואמים בקריטריונים שלך"
            >
              <Sparkles size={12} />
              <strong>{matchCount}</strong>
              <span>נכסים תואמים</span>
            </Link>
          )}
        </div>
        <div className="cd-toolbar-actions">
          <Link to="/templates" className="btn btn-secondary btn-sm cd-tpl-btn" title="ערוך תבניות הודעה">
            <FileText size={14} />
            ערוך תבניות הודעה
          </Link>
          <a
            href={telUrl(lead.phone)}
            className="btn btn-secondary btn-sm"
            onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
            title={lead.phone || 'התקשר'}
          >
            <Phone size={14} />
            התקשר
          </a>
          <a
            href={waUrl(lead.phone, `שלום ${lead.name}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm cd-wa-btn"
            onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
            title="וואטסאפ"
          >
            <WhatsAppIcon size={14} className="wa-green" />
            וואטסאפ
          </a>
          <a
            href={`sms:${lead.phone}`}
            className="btn btn-secondary btn-sm"
            onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
            title="הודעת SMS"
          >
            <MessageSquare size={14} />
            SMS
          </a>
          {/* 7.2 — Schedule meeting. Opens LeadMeetingDialog which
              checks Google Calendar connection; if not connected, the
              dialog still lets the agent create a local record with a
              nudge to connect. */}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { haptics.tap(); setMeetingOpen(true); }}
            title="קבע פגישה"
          >
            <Calendar size={14} />
            קבע פגישה
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

      <div className="cd-grid">
        <CustomerEditForm
          lead={lead}
          onSaved={async (next) => {
            setLead((cur) => ({ ...cur, ...next }));
            toast.success('הפרטים נשמרו');
            // Re-fetch to pick up any server-derived fields
            try { await loadLead(); } catch { /* ignore */ }
          }}
          toast={toast}
        />
        <ActivityTimeline lead={lead} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// CustomerEditForm — inline edit form (mirrors CustomerEditDialog,
// without the modal chrome; saves via api.updateLead).
// ──────────────────────────────────────────────────────────────────
function CustomerEditForm({ lead, onSaved, toast }) {
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
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        name: form.name,
        phone: form.phone,
        email: form.email || null,
        interestType: form.interestType,
        lookingFor: form.lookingFor,
        city: form.city || null,
        street: form.street || null,
        rooms: form.rooms || null,
        priceRangeLabel: form.priceRangeLabel || null,
        budget: form.budget != null && form.budget !== '' ? Number(form.budget) : null,
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
      };
      await api.updateLead(lead.id, body);
      onSaved(body);
    } catch (e) {
      const msg = e.message || 'שמירה נכשלה';
      setErr(msg);
      toast?.error?.(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cd-form-col">
      <div className="cd-section">
        <h3 className="cd-section-title">פרטי הלקוח</h3>
        {err && <div className="cd-form-error"><AlertCircle size={14} />{err}</div>}

        <div className="deal-form-grid">
          <div className="form-group">
            <label className="form-label">שם</label>
            <input {...inputPropsForName()} className="form-input" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">טלפון</label>
            <PhoneField value={form.phone} onChange={(v) => update('phone', v)} />
          </div>
          <div className="form-group">
            <label className="form-label">אימייל</label>
            <input {...inputPropsForEmail()} className="form-input" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">סטטוס</label>
            <Segmented
              value={form.status}
              onChange={(v) => update('status', v)}
              options={[
                { value: 'HOT', label: 'חם' },
                { value: 'WARM', label: 'חמים' },
                { value: 'COLD', label: 'קר' },
              ]}
              ariaLabel="סטטוס"
            />
          </div>
          <div className="form-group">
            <label className="form-label">סוג התעניינות</label>
            <Segmented
              value={form.interestType}
              onChange={(v) => update('interestType', v)}
              options={[
                { value: 'PRIVATE', label: 'פרטי' },
                { value: 'COMMERCIAL', label: 'מסחרי' },
              ]}
              ariaLabel="סוג התעניינות"
            />
          </div>
          <div className="form-group">
            <label className="form-label">קנייה / שכירות</label>
            <Segmented
              value={form.lookingFor}
              onChange={(v) => update('lookingFor', v)}
              options={[
                { value: 'BUY', label: 'קנייה' },
                { value: 'RENT', label: 'שכירות' },
              ]}
              ariaLabel="קנייה או שכירות"
            />
          </div>
          <div className="form-group">
            <label className="form-label">עיר</label>
            <input {...inputPropsForCity()} className="form-input" value={form.city} onChange={(e) => update('city', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">רחוב</label>
            <input {...inputPropsForAddress()} className="form-input" value={form.street} onChange={(e) => update('street', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">חדרים</label>
            <input {...inputPropsForRooms()} className="form-input" value={form.rooms} onChange={(e) => update('rooms', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">טווח מחיר (טקסט)</label>
            <input dir="auto" autoCapitalize="off" autoCorrect="off" enterKeyHint="next" className="form-input" value={form.priceRangeLabel} onChange={(e) => update('priceRangeLabel', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">תקציב</label>
            <NumberField
              unit="₪"
              placeholder="2,500,000"
              showShort
              value={form.budget}
              onChange={(v) => update('budget', v)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">מגזר</label>
            <SelectField
              value={form.sector}
              onChange={(v) => update('sector', v)}
              options={['כללי', 'דתי', 'חרדי', 'ערבי']}
            />
          </div>
          <div className="form-group">
            <label className="form-label">קירבה לבית ספר</label>
            <SelectField
              value={form.schoolProximity}
              onChange={(v) => update('schoolProximity', v)}
              placeholder="לא חשוב"
              options={['עד 200 מטר', 'עד 500 מטר', 'הליכה', 'עד ק״מ']}
            />
          </div>
          <div className="form-group">
            <label className="form-label">מקור</label>
            <input dir="auto" autoCapitalize="words" enterKeyHint="next" autoCorrect="off" className="form-input" value={form.source} onChange={(e) => update('source', e.target.value)} />
          </div>
          <div className="form-group form-group-wide">
            <label className="form-label">הערות</label>
            <textarea
              {...inputPropsForNotes()}
              className="form-textarea"
              rows={3}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>
        </div>

        <div className="checkbox-grid">
          {[
            { key: 'preApproval', label: 'אישור עקרוני' },
            { key: 'balconyRequired', label: 'מרפסת' },
            { key: 'parkingRequired', label: 'חניה' },
            { key: 'elevatorRequired', label: 'מעלית' },
            { key: 'safeRoomRequired', label: 'ממ״ד' },
            { key: 'acRequired', label: 'מזגנים' },
            { key: 'storageRequired', label: 'מחסן' },
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
            {busy ? 'שומר…' : 'שמור שינויים'}
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
  const events = useMemo(() => {
    const items = [];
    if (lead.lastContact) {
      const rel = relativeDate(lead.lastContact);
      const days = Math.round((Date.now() - new Date(lead.lastContact).getTime()) / 86400000);
      const daysSuffix = days >= 0 ? `קשר אחרון לפני ${days} ימים` : 'קשר אחרון מתוכנן';
      items.push({
        kind: 'contact',
        ts: new Date(lead.lastContact).getTime(),
        icon: Phone,
        title: daysSuffix,
        sub: rel.label,
        absolute: absoluteTime(lead.lastContact),
      });
    }
    if (lead.statusUpdatedAt) {
      items.push({
        kind: 'status',
        ts: new Date(lead.statusUpdatedAt).getTime(),
        icon: Sparkles,
        title: `סטטוס עודכן ל${statusLabel(lead.status)}`,
        sub: relativeTime(lead.statusUpdatedAt),
        absolute: absoluteTime(lead.statusUpdatedAt),
      });
    }
    if (lead.createdAt) {
      items.push({
        kind: 'created',
        ts: new Date(lead.createdAt).getTime(),
        icon: Building2,
        title: 'הליד נוצר',
        sub: relativeTime(lead.createdAt),
        absolute: absoluteTime(lead.createdAt),
      });
    }
    // Sort by timestamp descending — most recent first
    items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return items;
  }, [lead]);

  return (
    <div className="cd-timeline-col">
      <div className="cd-section cd-timeline-section">
        <h3 className="cd-section-title">
          <History size={16} />
          ציר פעילות
        </h3>
        {events.length === 0 ? (
          <div className="cd-timeline-empty">
            <p>עדיין אין פעילות לתצוגה. עדכן קשר או חתום הסכם כדי להתחיל לעקוב.</p>
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
