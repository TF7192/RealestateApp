// "הסכם בלעדיות" / "הסכם לבעל נכס" — owner-side exclusivity agreement.
// Distinct from the existing ProspectDialog (brokerage agreement on the
// buyer side). Captures the owner's identity, the asset details, the
// commission, and the exclusivity period, then creates a Contract row
// of type EXCLUSIVITY with a body composed from the form values plus
// original Hebrew clauses grounded in חוק המתווכים, התשנ"ו-1996 and
// תקנות המתווכים (פעולות ופרטים שיש לכלול בהזמנת שירותי תיווך), 1997.
//
// The composed body lands in Contract.body and is hashed at create time
// (documentHash) so any later tamper is detectable on the signed PDF.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import './PropertyInterestsPanel.css';

const _DT = {
  ink: '#1e1a14',
  muted: 'rgba(30,26,20,0.55)',
  white: '#ffffff',
  gold: '#b48b4c', goldLight: '#d9b774', goldSoft: 'rgba(180,139,76,0.10)',
  border: 'rgba(30,26,20,0.08)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Default exclusive-until = today + 6 months. חוק המתווכים places no
// upper bound; 6 months is the most common shape in the Israeli market
// and matches what most agency form templates default to.
function defaultExclusiveUntil() {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
}

// Hebrew currency format. Re-implemented locally so the dialog has no
// dependency on the page-level price formatter.
function fmtPrice(n) {
  if (!Number.isFinite(Number(n)) || !n) return '—';
  return `₪${Number(n).toLocaleString('he-IL')}`;
}

// Compose the contract body from form values. Each clause is original
// Estia wording covering a required content item from תקנה 1 לתקנות
// המתווכים (1997) (זיהוי הצדדים, זיהוי הנכס, סוג העיסקה, מחיר, עמלה,
// תקופת הבלעדיות) — the law fixes WHAT must appear, not the wording.
// The body is what gets stored on Contract.body and rendered into PDF.
function composeBody({ owner, property, terms }) {
  const exclusiveDateIl = terms.exclusiveUntil
    ? new Date(terms.exclusiveUntil).toLocaleDateString('he-IL')
    : '__/__/____';
  const dealKind = property.category === 'RENT' ? 'השכרה' : 'מכירה';
  const dealKindAct = property.category === 'RENT' ? 'להשכיר' : 'למכור';
  const addressLine = [
    property.street,
    property.unitNumber ? `יח׳ ${property.unitNumber}` : null,
    property.city,
  ].filter(Boolean).join(', ');
  const sizeBits = [];
  if (property.sqm) sizeBits.push(`${property.sqm} מ״ר`);
  if (property.rooms != null) sizeBits.push(`${property.rooms} חד׳`);
  if (property.floor != null) sizeBits.push(`קומה ${property.floor}`);
  const sizeLine = sizeBits.length ? ` (${sizeBits.join(' · ')})` : '';

  const clauses = [
    // 1. Identification of the owner.
    `אני הח"מ ${owner.name || '____'}${owner.nationalId ? `, ת.ז. ${owner.nationalId}` : ''}` +
      (owner.phone ? `, טלפון ${owner.phone}` : '') +
      ', בעל/ת הזכויות בנכס המתואר להלן (להלן: "הנכס"), חותם/ת על הסכם זה ביום החתימה הדיגיטלי המוטבע בתחתית המסמך.',

    // 2. Identification of the property + deal type.
    `הנכס: ${addressLine || '____'}${sizeLine}. ` +
      `סוג העיסקה: ${dealKind}. ` +
      `מחיר מבוקש: ${fmtPrice(property.marketingPrice)}.`,

    // 3. Grant of exclusivity to the broker until the chosen date.
    `אני מעניק/ה בזאת בלעדיות מלאה למתווך החתום מטה ${dealKindAct} את הנכס, וזאת עד ליום ${exclusiveDateIl} (להלן: "תקופת הבלעדיות").`,

    // 4. Owner's undertakings during exclusivity.
    'במהלך תקופת הבלעדיות, אני מתחייב/ת שלא להתקשר במישרין או בעקיפין עם מתווך אחר בקשר לנכס, להפנות כל פונה ישירות למתווך החתום, ולא לבצע פעולות שיווק עצמאיות שלא בתיאום עם המתווך.',

    // 5. Commission terms.
    `העמלה המוסכמת על פעילות המתווך הינה ${terms.commissionPct ? `${terms.commissionPct}%` : '____'} ממחיר העיסקה בפועל בתוספת מע"מ כדין. ` +
      'העמלה תשולם במועד חתימת זכרון הדברים או הסכם המכר/שכירות, לפי המוקדם.',

    // 6. חוק המתווכים compliance — required disclosure.
    'הסכם זה נחתם בכפוף להוראות חוק המתווכים במקרקעין, התשנ"ו-1996, ותקנות המתווכים (פעולות ופרטים שיש לכלול בהזמנת שירותי תיווך), התשנ"ז-1997. המתווך מצהיר כי הינו בעל רישיון תיווך תקף.',

    // 7. Breach clause.
    'הפרת הבלעדיות בתקופת ההסכם — לרבות מכירה/השכרה של הנכס שלא באמצעות המתווך — תזכה את המתווך במלוא העמלה המוסכמת, וזאת מבלי לגרוע מכל סעד אחר על פי דין.',

    // 8. Optional notes from the agent.
    ...(terms.notes ? [`הערות נוספות: ${terms.notes}`] : []),

    // 9. Acknowledgement.
    'הקראתי את ההסכם, הבנתי את תוכנו, ואני חותם/ת עליו מרצוני החופשי. החתימה הדיגיטלית המוטבעת מטה מחייבת אותי לכל דבר ועניין.',
  ];
  return clauses.join('\n\n');
}

// Consent paragraph the signer accepts before submitting. Snapshot is
// stored on Contract.consentText so we can prove what wording was shown.
const CONSENT_TEXT =
  'אני מאשר/ת שקראתי את ההסכם במלואו, הבנתי את הזכויות והחובות הנובעות ממנו, ' +
  'ואני מסכים/ה כי החתימה הדיגיטלית המוטבעת על המסמך תחייב אותי לכל דבר ועניין ' +
  'כחתימת יד מקובלת, בהתאם לחוק חתימה אלקטרונית, התשס"א-2001.';

export default function OwnerAgreementDialog({ property, onClose, onCreated }) {
  const toast = useToast();
  const panelRef = useRef(null);
  // Owner section pre-fills from the property's denormalized owner
  // fields. The agent can edit any of them before signing.
  const [owner, setOwner] = useState({
    name:        property?.owner || '',
    nationalId:  property?.ownerNationalId || '',
    phone:       property?.ownerPhone || '',
    email:       property?.ownerEmail || '',
  });
  const [terms, setTerms] = useState({
    commissionPct: property?.agentCommissionPct ?? 2,
    exclusiveUntil: property?.exclusiveEnd
      ? String(property.exclusiveEnd).slice(0, 10)
      : defaultExclusiveUntil(),
    notes: '',
  });
  const [consentChecked, setConsentChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    function onEsc(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const submit = async (e) => {
    e?.preventDefault?.();
    setErr(null);
    if (!owner.name.trim()) { setErr('יש להזין את שם בעל הנכס'); return; }
    if (!owner.phone.trim()) { setErr('יש להזין טלפון של בעל הנכס'); return; }
    if (!terms.exclusiveUntil) { setErr('יש לבחור תאריך סיום בלעדיות'); return; }
    if (!consentChecked) { setErr('יש לאשר את הצהרת ההסכמה לפני יצירת ההסכם'); return; }
    setBusy(true);
    try {
      const body = composeBody({ owner, property, terms });
      const created = await api.createContract({
        type: 'EXCLUSIVITY',
        title: `הסכם בלעדיות — ${property.street || ''}${property.city ? `, ${property.city}` : ''}`.trim() || 'הסכם בלעדיות',
        body,
        signerName: owner.name.trim(),
        signerPhone: owner.phone.trim() || undefined,
        signerEmail: owner.email.trim() || undefined,
        propertyId: property.id,
      });
      toast.success('הסכם הבלעדיות נוצר. נשלח לחתימה דיגיטלית של בעל הנכס.');
      onCreated?.(created?.contract || created);
      onClose?.();
    } catch (e2) {
      setErr(e2?.message || 'יצירת ההסכם נכשלה');
    } finally {
      setBusy(false);
    }
  };

  // 2026-05-10 — wrap in the shared .pi-popup-* shell so the dialog
  // matches the rest of the property-page popups (centered, animated,
  // sticky header). Portaled to body.
  return createPortal(
    <div
      className="pi-popup-back"
      role="dialog"
      aria-modal="true"
      aria-labelledby="oad-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <form
        ref={panelRef}
        dir="rtl"
        onSubmit={submit}
        autoComplete="off"
        className="pi-popup-card"
        style={{ ...FONT, width: 'min(640px, 100%)' }}
      >
        <header className="pi-popup-head">
          <div>
            <h3 id="oad-title" className="pi-popup-title" style={{ margin: 0 }}>
              הסכם בלעדיות לבעל הנכס
            </h3>
            <div style={{ fontSize: 12, color: _DT.muted, marginTop: 2 }}>
              {property?.street}{property?.city ? `, ${property.city}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="pi-popup-close"
          ><X size={18} /></button>
        </header>

        <div style={{ padding: 18, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Owner */}
          <fieldset style={fieldset()}>
            <legend style={legend()}>פרטי בעל הנכס</legend>
            <div style={grid2()}>
              <Field label="שם מלא*">
                <input
                  type="text" required name="estia-oa-owner-name"
                  autoComplete="off" autoCapitalize="words"
                  value={owner.name}
                  onChange={(e) => setOwner((p) => ({ ...p, name: e.target.value }))}
                  className="form-input" placeholder="ישראל ישראלי"
                />
              </Field>
              <Field label="ת.ז.">
                <input
                  type="text" inputMode="numeric" name="estia-oa-owner-id"
                  autoComplete="off" dir="ltr" style={{ textAlign: 'right' }}
                  value={owner.nationalId}
                  onChange={(e) => setOwner((p) => ({ ...p, nationalId: e.target.value }))}
                  className="form-input" placeholder="123456789" maxLength={20}
                />
              </Field>
              <Field label="סלולרי*">
                <input
                  type="tel" inputMode="tel" required name="estia-oa-owner-phone"
                  autoComplete="off" dir="ltr" style={{ textAlign: 'right' }}
                  value={owner.phone}
                  onChange={(e) => setOwner((p) => ({ ...p, phone: e.target.value }))}
                  className="form-input" placeholder="050-1234567"
                />
              </Field>
              <Field label="מייל">
                <input
                  type="email" name="estia-oa-owner-email"
                  autoComplete="off" dir="ltr" style={{ textAlign: 'right' }}
                  value={owner.email}
                  onChange={(e) => setOwner((p) => ({ ...p, email: e.target.value }))}
                  className="form-input" placeholder="name@example.com"
                />
              </Field>
            </div>
          </fieldset>

          {/* Property summary — read-only, sourced from the property prop. */}
          <fieldset style={fieldset()}>
            <legend style={legend()}>פרטי הנכס</legend>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 8, fontSize: 13, color: _DT.ink,
            }}>
              <Stat label="כתובת" value={[property?.street, property?.city].filter(Boolean).join(', ') || '—'} />
              <Stat label="סוג נכס" value={property?.type || '—'} />
              <Stat label="סוג עיסקה" value={property?.category === 'RENT' ? 'השכרה' : 'מכירה'} />
              <Stat label="מחיר מבוקש" value={fmtPrice(property?.marketingPrice)} />
              {property?.unitNumber ? <Stat label="יחידה" value={property.unitNumber} /> : null}
              {property?.floor != null ? <Stat label="קומה" value={String(property.floor)} /> : null}
              {property?.sqm ? <Stat label="שטח" value={`${property.sqm} מ״ר`} /> : null}
            </div>
          </fieldset>

          {/* Terms */}
          <fieldset style={fieldset()}>
            <legend style={legend()}>תנאי הבלעדיות</legend>
            <div style={grid2()}>
              <Field label="עמלה (%)*">
                <input
                  type="number" min="0" max="20" step="0.1" required
                  value={terms.commissionPct ?? ''}
                  onChange={(e) => setTerms((p) => ({ ...p, commissionPct: e.target.value }))}
                  className="form-input" dir="ltr" style={{ textAlign: 'right' }}
                />
              </Field>
              <Field label="בלעדי עד*">
                <input
                  type="date" required
                  value={terms.exclusiveUntil}
                  onChange={(e) => setTerms((p) => ({ ...p, exclusiveUntil: e.target.value }))}
                  className="form-input" dir="ltr" style={{ textAlign: 'right' }}
                />
              </Field>
            </div>
            <Field label="הערות נוספות">
              <textarea
                rows={3} dir="auto" autoCapitalize="sentences"
                value={terms.notes}
                onChange={(e) => setTerms((p) => ({ ...p, notes: e.target.value }))}
                className="form-textarea"
                placeholder="פרטים שיתווספו בתחתית ההסכם"
              />
            </Field>
          </fieldset>

          {/* Consent — required before submit. The wording is snapshotted
              on Contract.consentText at sign time so we can prove what
              the signer accepted, even if we change this paragraph later. */}
          <fieldset style={{ ...fieldset(), background: _DT.goldSoft, borderColor: 'rgba(180,139,76,0.30)' }}>
            <legend style={legend()}>הצהרת ההסכמה</legend>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: _DT.ink, lineHeight: 1.55 }}>
              {CONSENT_TEXT}
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                style={{ marginTop: 3, accentColor: _DT.gold, width: 18, height: 18 }}
              />
              <span>קראתי, הבנתי, ואני מאשר/ת את ההצהרה למעלה.</span>
            </label>
          </fieldset>

          {err && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(185,28,28,0.08)',
              color: _DT.danger, fontSize: 13, fontWeight: 700,
            }}>
              <AlertCircle size={14} />{err}
            </div>
          )}
        </div>

        <footer style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '12px 18px', borderTop: `1px solid ${_DT.border}`,
        }}>
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={busy}>
            ביטול
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Save size={14} />
            {busy ? 'יוצר…' : 'צור הסכם'}
          </button>
        </footer>
      </form>
    </div>,
    document.body
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: _DT.ink }}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      padding: '6px 10px', borderRadius: 8,
      background: _DT.white, border: `1px solid ${_DT.border}`,
    }}>
      <span style={{ fontSize: 10.5, color: _DT.muted, fontWeight: 700, letterSpacing: 0.2 }}>{label}</span>
      <strong style={{ fontSize: 13, color: _DT.ink }}>{value}</strong>
    </div>
  );
}

function fieldset() {
  return {
    border: `1px solid ${_DT.border}`,
    borderRadius: 12,
    padding: '12px 14px 14px',
    background: _DT.white,
    margin: 0,
  };
}
function legend() {
  return {
    fontSize: 11, fontWeight: 800, color: _DT.gold,
    letterSpacing: 0.5, padding: '0 6px',
  };
}
function grid2() {
  return {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10,
  };
}
