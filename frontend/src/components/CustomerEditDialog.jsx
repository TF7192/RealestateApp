// CustomerEditDialog — edit an existing Lead/Customer. Ported to inline
// Cream & Gold DT styles as part of Sprint 3 (CRM write surfaces).
// Backdrop-cover + centered cream card matches OwnerEditDialog and the
// NewLead sectioned-card vocabulary. Preserves every field wire-up and
// the full api.updateLead POST body shape (validation/normalization
// untouched).
import { useId, useRef, useState } from 'react';
import {
  X, AlertCircle, Save, Sparkles,
  UserCircle, Search, Home, SlidersHorizontal, StickyNote, Shield, Briefcase,
} from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import { NumberField, PhoneField, SelectField, Segmented } from './SmartFields';
import useFocusTrap from '../hooks/useFocusTrap';
import {
  inputPropsForName,
  inputPropsForEmail,
  inputPropsForCity,
  inputPropsForAddress,
  inputPropsForRooms,
} from '../lib/inputProps';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function CustomerEditDialog({ lead, onClose, onSaved }) {
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
    // Commercial-lead brief fields — only surfaced when interestType === 'COMMERCIAL'.
    sqmGrossMin: lead.sqmGrossMin ?? null,
    sqmNetMin: lead.sqmNetMin ?? null,
    workstationsMin: lead.workstationsMin ?? null,
    buildStateRequired: lead.buildStateRequired || '',
    accessibilityRequired: !!lead.accessibilityRequired,
    kitchenetteRequired: !!lead.kitchenetteRequired,
    floorShelterRequired: !!lead.floorShelterRequired,
    inOfficeToiletsRequired: !!lead.inOfficeToiletsRequired,
    onFloorToiletsRequired: !!lead.onFloorToiletsRequired,
    openSpaceRequired: !!lead.openSpaceRequired,
    status: lead.status || 'WARM',
    source: lead.source || '',
    notes: lead.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const panelRef = useRef(null);
  useFocusTrap(panelRef, { onEscape: onClose });

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      // L-13 — the backend's lead zod schema rejects non-integer
      // budgets (`z.number().int()`) and email strings that don't pass
      // `z.string().email()`. Coerce / drop client-side so a user who
      // left a half-typed email doesn't see a bare "invalid data" from
      // the server. `rooms` is a free-text string server-side; coerce
      // to trimmed string or null.
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
        sqmGrossMin: form.sqmGrossMin != null && form.sqmGrossMin !== ''
          ? Math.max(0, Math.round(Number(form.sqmGrossMin))) : null,
        sqmNetMin: form.sqmNetMin != null && form.sqmNetMin !== ''
          ? Math.max(0, Math.round(Number(form.sqmNetMin))) : null,
        workstationsMin: form.workstationsMin != null && form.workstationsMin !== ''
          ? Math.max(0, Math.round(Number(form.workstationsMin))) : null,
        buildStateRequired: form.buildStateRequired || null,
        accessibilityRequired: form.accessibilityRequired,
        kitchenetteRequired: form.kitchenetteRequired,
        floorShelterRequired: form.floorShelterRequired,
        inOfficeToiletsRequired: form.inOfficeToiletsRequired,
        onFloorToiletsRequired: form.onFloorToiletsRequired,
        openSpaceRequired: form.openSpaceRequired,
        status: form.status,
        source: form.source || null,
        notes: form.notes || null,
      };
      await api.updateLead(lead.id, body);
      onSaved();
    } catch (e) {
      setErr(e.message || 'שמירה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const titleId = useId();

  return (
    <Portal>
      <div
        dir="rtl"
        onClick={onClose}
        style={{
          ...FONT,
          position: 'fixed', inset: 0,
          background: 'rgba(30,26,20,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
          zIndex: 1200,
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 640,
            maxHeight: 'calc(100dvh - 60px)',
            display: 'flex', flexDirection: 'column',
            background: DT.cream,
            color: DT.ink,
            border: `1px solid ${DT.border}`,
            borderRadius: 14,
            boxShadow: '0 26px 70px rgba(30,26,20,0.3)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <header style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: 12, padding: '20px 24px 14px',
            borderBottom: `1px solid ${DT.border}`,
            background: DT.white,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                id={titleId}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  margin: 0, fontSize: 18, fontWeight: 800,
                  color: DT.ink, letterSpacing: -0.3,
                }}
              >
                <UserCircle size={18} aria-hidden="true" style={{ color: DT.gold }} />
                עריכת לקוח
              </h3>
              {lead?.name && (
                <p style={{
                  margin: '4px 0 0', color: DT.muted, fontSize: 13,
                }}>
                  {lead.name}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              style={{
                ...FONT,
                width: 34, height: 34, borderRadius: 99,
                background: DT.cream4,
                border: `1px solid ${DT.border}`,
                color: DT.muted,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X size={18} />
            </button>
          </header>

          {/* Body (scrollable) */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: 24,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {err && (
              <div
                role="alert"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'rgba(185,28,28,0.08)',
                  color: DT.danger,
                  border: `1px solid rgba(185,28,28,0.2)`,
                  padding: '10px 12px', borderRadius: 10,
                  fontSize: 13,
                }}
              >
                <AlertCircle size={14} />
                {err}
              </div>
            )}

            {/* AI-edit panel — free-form Hebrew instruction → backend
                extracts a partial patch via Haiku. */}
            <LeadAiEditPanel leadId={lead.id} onApplied={() => { onSaved?.(); onClose?.(); }} />

            {/* Section 1 — פרטי לקוח */}
            <section style={sectionCard()} aria-label="פרטי לקוח">
              <h4 style={sectionTitle()}>
                <UserCircle size={16} /> פרטי לקוח
              </h4>
              <div style={gridRow2()}>
                <Field label="שם">
                  <input
                    {...inputPropsForName()}
                    className="form-input"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                  />
                </Field>
                <Field label="טלפון">
                  <PhoneField value={form.phone} onChange={(v) => update('phone', v)} />
                </Field>
              </div>
              <div style={gridRow2()}>
                <Field label="אימייל">
                  <input
                    {...inputPropsForEmail()}
                    className="form-input"
                    value={form.email}
                    onChange={(e) => update('email', e.target.value)}
                  />
                </Field>
                <Field label="מקור">
                  <input
                    dir="auto"
                    autoCapitalize="words"
                    autoCorrect="off"
                    enterKeyHint="next"
                    className="form-input"
                    value={form.source}
                    onChange={(e) => update('source', e.target.value)}
                  />
                </Field>
              </div>
              <div style={gridRow2()}>
                <Field label="סטטוס">
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
                </Field>
                <Field label="סוג התעניינות">
                  <Segmented
                    value={form.interestType}
                    onChange={(v) => update('interestType', v)}
                    options={[
                      { value: 'PRIVATE', label: 'פרטי' },
                      { value: 'COMMERCIAL', label: 'מסחרי' },
                    ]}
                    ariaLabel="סוג התעניינות"
                  />
                </Field>
              </div>
            </section>

            {/* Section 2 — מה הוא מחפש */}
            <section style={sectionCard()} aria-label="מה הוא מחפש">
              <h4 style={sectionTitle()}>
                <Search size={16} /> מה הוא מחפש
              </h4>
              <div style={gridRow2()}>
                <Field label="קנייה / שכירות">
                  <Segmented
                    value={form.lookingFor}
                    onChange={(v) => update('lookingFor', v)}
                    options={[
                      { value: 'BUY', label: 'קנייה' },
                      { value: 'RENT', label: 'שכירות' },
                    ]}
                    ariaLabel="קנייה או שכירות"
                  />
                </Field>
                <Field label="מגזר">
                  <SelectField
                    value={form.sector}
                    onChange={(v) => update('sector', v)}
                    options={['כללי', 'דתי', 'חרדי', 'ערבי']}
                  />
                </Field>
              </div>
              <div style={gridRow2()}>
                <Field label="עיר">
                  <input
                    {...inputPropsForCity()}
                    className="form-input"
                    value={form.city}
                    onChange={(e) => update('city', e.target.value)}
                  />
                </Field>
                <Field label="רחוב">
                  <input
                    {...inputPropsForAddress()}
                    className="form-input"
                    value={form.street}
                    onChange={(e) => update('street', e.target.value)}
                  />
                </Field>
              </div>
              <Field label="קירבה לבית ספר">
                <SelectField
                  value={form.schoolProximity}
                  onChange={(v) => update('schoolProximity', v)}
                  placeholder="לא חשוב"
                  options={['עד 200 מטר', 'עד 500 מטר', 'הליכה', 'עד ק״מ']}
                />
              </Field>
            </section>

            {/* Section 3 — תקציב וחדרים */}
            <section style={sectionCard()} aria-label="תקציב וחדרים">
              <h4 style={sectionTitle()}>
                <Home size={16} /> תקציב וחדרים
              </h4>
              <div style={gridRow2()}>
                <Field label="חדרים">
                  <input
                    {...inputPropsForRooms()}
                    className="form-input"
                    value={form.rooms}
                    onChange={(e) => update('rooms', e.target.value)}
                  />
                </Field>
                <Field label="טווח מחיר (טקסט)">
                  <input
                    dir="auto"
                    autoCapitalize="off"
                    autoCorrect="off"
                    enterKeyHint="next"
                    className="form-input"
                    value={form.priceRangeLabel}
                    onChange={(e) => update('priceRangeLabel', e.target.value)}
                  />
                </Field>
              </div>
              <Field label="תקציב">
                <NumberField
                  unit="₪"
                  placeholder="2,500,000"
                  showShort
                  value={form.budget}
                  onChange={(v) => update('budget', v)}
                />
              </Field>
            </section>

            {/* Section 4 — דרישות */}
            <section style={sectionCard()} aria-label="דרישות">
              <h4 style={sectionTitle()}>
                <SlidersHorizontal size={16} /> דרישות
              </h4>
              <div style={{
                display: 'grid', gap: 8,
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              }}>
                {[
                  { key: 'preApproval', label: 'אישור עקרוני' },
                  { key: 'balconyRequired', label: 'מרפסת' },
                  { key: 'parkingRequired', label: 'חניה' },
                  { key: 'elevatorRequired', label: 'מעלית' },
                  { key: 'safeRoomRequired', label: 'ממ״ד' },
                  { key: 'acRequired', label: 'מזגנים' },
                  { key: 'storageRequired', label: 'מחסן' },
                ].map(({ key, label }) => (
                  <CheckboxItem
                    key={key}
                    checked={!!form[key]}
                    onChange={(v) => update(key, v)}
                    label={label}
                  />
                ))}
              </div>
            </section>

            {/* Section 5 — commercial-only brief */}
            {form.interestType === 'COMMERCIAL' && (
              <section style={sectionCard()} aria-label="דרישות עסקיות">
                <h4 style={sectionTitle()}>
                  <Briefcase size={16} /> דרישות עסקיות
                </h4>
                <div style={gridRow2()}>
                  <Field label="מ״ר ברוטו (מינ׳)">
                    <NumberField
                      unit="מ״ר"
                      placeholder="60"
                      value={form.sqmGrossMin}
                      onChange={(v) => update('sqmGrossMin', v)}
                    />
                  </Field>
                  <Field label="מ״ר נטו (מינ׳)">
                    <NumberField
                      unit="מ״ר"
                      placeholder="48"
                      value={form.sqmNetMin}
                      onChange={(v) => update('sqmNetMin', v)}
                    />
                  </Field>
                </div>
                <div style={gridRow2()}>
                  <Field label="מס׳ עמדות עבודה">
                    <NumberField
                      placeholder="3"
                      value={form.workstationsMin}
                      onChange={(v) => update('workstationsMin', v)}
                    />
                  </Field>
                  <Field label="מעטפת / גמר">
                    <SelectField
                      value={form.buildStateRequired}
                      onChange={(v) => update('buildStateRequired', v)}
                      placeholder="לא משנה"
                      options={['מעטפת', 'גמר', 'חדש מקבלן', 'משופץ']}
                    />
                  </Field>
                </div>
                <div style={{
                  display: 'grid', gap: 8, marginTop: 8,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                }}>
                  {[
                    { key: 'openSpaceRequired', label: 'חלל פתוח' },
                    { key: 'kitchenetteRequired', label: 'מטבחון' },
                    { key: 'inOfficeToiletsRequired', label: 'שירותים במשרד' },
                    { key: 'onFloorToiletsRequired', label: 'שירותים בקומה' },
                    { key: 'floorShelterRequired', label: 'ממ״ק' },
                    { key: 'accessibilityRequired', label: 'גישה לנכים' },
                  ].map(({ key, label }) => (
                    <CheckboxItem
                      key={key}
                      checked={!!form[key]}
                      onChange={(v) => update(key, v)}
                      label={label}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section 6 — הערות */}
            <section style={sectionCard()} aria-label="הערות">
              <h4 style={sectionTitle()}>
                <StickyNote size={16} /> הערות
              </h4>
              <textarea
                className="form-textarea"
                rows={4}
                dir="auto"
                autoCapitalize="sentences"
                enterKeyHint="enter"
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
              />
            </section>
          </div>

          {/* Footer */}
          <footer style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap',
            padding: '14px 24px calc(14px + env(safe-area-inset-bottom))',
            borderTop: `1px solid ${DT.border}`,
            background: DT.white,
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={ghostBtn(busy)}
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              style={primaryBtn(busy)}
            >
              <Save size={14} />
              {busy ? 'שומר…' : 'שמור שינויים'}
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}

// ── Lead AI-edit panel ────────────────────────────────────────────────
function LeadAiEditPanel({ leadId, onApplied }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.aiEditLead(leadId, t);
      setText('');
      onApplied?.();
    } catch (e) {
      setErr(e?.message || 'AI לא הצליח לעדכן');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section style={{
      ...sectionCard(),
      borderColor: DT.gold,
      background: `linear-gradient(160deg, ${DT.cream4} 0%, ${DT.white} 100%)`,
    }}>
      <h4 style={sectionTitle()}>
        <Sparkles size={16} style={{ color: DT.gold }} /> עריכה עם AI
      </h4>
      <p style={{ margin: '0 0 8px', color: DT.muted, fontSize: 13 }}>
        תארו בעברית מה לשנות, למשל: "תעדכן את התקציב ל-3 מיליון ושים סטטוס חם".
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          className="form-input"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="תשנה את ה…"
          dir="auto"
          enterKeyHint="send"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          style={{ flex: 1, resize: 'vertical' }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !text.trim()}
          className="btn btn-primary"
          style={{ alignSelf: 'flex-end', minWidth: 96 }}
        >
          {busy ? '…' : 'בצע עדכון'}
        </button>
      </div>
      {err && (
        <div style={{ marginTop: 8, color: DT.danger, fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <AlertCircle size={14} /> {err}
        </div>
      )}
    </section>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────

function Field({ label, children, wide }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      gridColumn: wide ? '1 / -1' : 'auto',
      marginBottom: 10,
    }}>
      <label style={labelStyle()}>{label}</label>
      {children}
    </div>
  );
}

function CheckboxItem({ checked, onChange, label }) {
  return (
    <label style={{
      ...FONT,
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: checked ? DT.goldSoft : DT.white,
      border: `1px solid ${checked ? DT.gold : DT.border}`,
      borderRadius: 10, padding: '10px 12px',
      cursor: 'pointer', fontSize: 13, color: DT.ink,
      fontWeight: checked ? 700 : 500,
      transition: 'background 0.12s, border-color 0.12s',
    }}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: DT.gold, width: 16, height: 16, flexShrink: 0 }}
      />
      <span>{label}</span>
    </label>
  );
}

function sectionCard() {
  return {
    background: DT.cream4,
    border: `1px solid ${DT.border}`,
    borderRadius: 12,
    padding: 16,
  };
}
function sectionTitle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 14, fontWeight: 800, margin: '0 0 12px', color: DT.gold,
    letterSpacing: -0.2,
    borderBottom: `1px solid ${DT.border}`,
    paddingBottom: 8,
    width: '100%',
  };
}
function labelStyle() {
  return {
    fontSize: 11, fontWeight: 700, color: DT.muted,
    textTransform: 'uppercase', letterSpacing: 0.3,
    display: 'block',
  };
}
function gridRow2() {
  return {
    display: 'grid', gap: 12,
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    marginBottom: 6,
  };
}
function primaryBtn(busy = false) {
  return {
    ...FONT,
    background: busy ? '#d8cfbf' : `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '10px 18px', borderRadius: 10,
    cursor: busy ? 'wait' : 'pointer',
    fontSize: 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: busy ? 'none' : '0 4px 10px rgba(180,139,76,0.3)',
  };
}
function ghostBtn(busy = false) {
  return {
    ...FONT,
    background: 'transparent',
    border: `1px solid ${DT.border}`,
    padding: '10px 16px', borderRadius: 10,
    cursor: busy ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 700,
    color: DT.ink,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    opacity: busy ? 0.6 : 1,
  };
}
