// ContractCreateDialog — single entry point for creating any of the
// four Estia digital-contract types:
//   BROKERAGE       — הזמנת שירותי תיווך (non-exclusive seller order)
//   EXCLUSIVITY    — הסכם בלעדיות (supplements a BROKERAGE order)
//   BUYER_BROKERAGE — הזמנת שירותי תיווך לקניה (buyer order over a
//                     captured list of properties)
//   OFFER           — הצעת רכישה (buyer's price offer against a listing)
//
// Two-step UX: pick the type (Step 1), then fill the type-specific form
// (Step 2). Step 1 is skipped when the caller seeds `defaultType`.
//
// All four types go through POST /api/contracts. When `body` is omitted
// the server falls back to DEFAULT_BODIES per type — that's the
// happy-path for the seller-side documents (clause text is canned, the
// agent only fills the metadata).
//
// Replaces the inline plumbing on PropertyDetail / CustomerDetail /
// Contracts list — those callsites now mount this dialog and route to
// `/contracts/:id` via onCreated.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  FileText,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Check,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import useFocusTrap from '../hooks/useFocusTrap';
import { useToast } from '../lib/toast';
import { PhoneField, SelectField } from './SmartFields';

// Cream & Gold tokens — matches ShareDialog / CustomerEditDialog /
// ContractDetail so the dialog feels part of the same family.
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const TYPE_META = {
  BROKERAGE: {
    label: 'הזמנת שירותי תיווך',
    sub: 'הזמנה רגילה ללא בלעדיות',
    icon: FileText,
  },
  EXCLUSIVITY: {
    label: 'הסכם בלעדיות',
    sub: 'תקופת בלעדיות עם מתווך',
    icon: ShieldCheck,
  },
  BUYER_BROKERAGE: {
    label: 'הזמנת שירותי תיווך לקניה',
    sub: 'ללקוח שמחפש לרכוש או לשכור',
    icon: ShoppingBag,
  },
  OFFER: {
    label: 'הצעת רכישה',
    sub: 'מהקונה אל המוכר',
    icon: Tag,
  },
};
const TYPE_KEYS = Object.keys(TYPE_META);

// Default ISO date string (yyyy-mm-dd) for the date inputs.
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function defaultExclusivityEnd() {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return isoDate(d);
}
function fmtPrice(n) {
  if (!Number.isFinite(Number(n)) || !n) return '—';
  return `₪${Number(n).toLocaleString('he-IL')}`;
}

export default function ContractCreateDialog({
  open,
  onClose,
  onCreated,
  context = {},
}) {
  const toast = useToast();
  const panelRef = useRef(null);
  useFocusTrap(panelRef, { onEscape: onClose });

  // ── Wizard state ─────────────────────────────────────────────────
  // When `defaultType` is provided we skip Step 1 entirely.
  const [type, setType] = useState(context.defaultType || null);

  // Shared signer fields.
  const [signerName, setSignerName]   = useState(context.signerName  || '');
  const [signerPhone, setSignerPhone] = useState(context.signerPhone || '');
  const [signerEmail, setSignerEmail] = useState(context.signerEmail || '');
  const [title, setTitle]             = useState('');

  // BROKERAGE / EXCLUSIVITY: seller-side commission + property pick.
  const [commissionPct, setCommissionPct] = useState(2);
  const [vatIncluded, setVatIncluded]     = useState(false);
  const [pickedPropertyId, setPickedPropertyId] = useState(context.propertyId || '');

  // EXCLUSIVITY-only.
  const [exclusivityStart, setExclusivityStart] = useState(isoDate(new Date()));
  const [exclusivityEnd, setExclusivityEnd]     = useState(defaultExclusivityEnd());
  const [baseContractId, setBaseContractId]     = useState('');

  // BUYER_BROKERAGE-only: multi-property picker + manual-row list.
  const [selectedPropertyIds, setSelectedPropertyIds] = useState([]);
  const [manualRows, setManualRows] = useState([]); // [{address, city, rooms, sqm, marketingPrice, kind}]

  // OFFER-only.
  const [offerPrice, setOfferPrice] = useState('');
  const [offerNotes, setOfferNotes] = useState('');

  // ── Server data — properties + base contracts (load lazily) ──────
  const [properties, setProperties]   = useState(null); // null = not loaded
  const [propsLoading, setPropsLoading] = useState(false);
  const [baseContracts, setBaseContracts] = useState(null);
  const [baseLoading, setBaseLoading] = useState(false);

  // ── Submit state ─────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);

  // Reset when re-opened — keeps stale state out of a fresh launch.
  useEffect(() => {
    if (!open) return;
    setType(context.defaultType || null);
    setSignerName(context.signerName || '');
    setSignerPhone(context.signerPhone || '');
    setSignerEmail(context.signerEmail || '');
    setTitle('');
    setCommissionPct(2);
    setVatIncluded(false);
    setPickedPropertyId(context.propertyId || '');
    setExclusivityStart(isoDate(new Date()));
    setExclusivityEnd(defaultExclusivityEnd());
    setBaseContractId('');
    setSelectedPropertyIds([]);
    setManualRows([]);
    setOfferPrice('');
    setOfferNotes('');
    setErr(null);
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch properties whenever we're on a property-bound type. Even when
  // the caller seeds `context.propertyId`, we still need the full list
  // so `seededProperty` can resolve into the chip below — otherwise the
  // chip stays in its "loading" state forever (the 2026-06-02 hang).
  const needsPropertyList =
    type === 'BUYER_BROKERAGE' ||
    type === 'BROKERAGE' ||
    type === 'EXCLUSIVITY';
  useEffect(() => {
    if (!open || !needsPropertyList || properties !== null) return;
    let cancelled = false;
    setPropsLoading(true);
    api.listProperties({ mine: '1' })
      .then((res) => {
        if (cancelled) return;
        const items = res?.items || res || [];
        setProperties(Array.isArray(items) ? items : []);
      })
      .catch(() => { if (!cancelled) setProperties([]); })
      .finally(() => { if (!cancelled) setPropsLoading(false); });
    return () => { cancelled = true; };
  }, [open, needsPropertyList, properties]);

  // EXCLUSIVITY — load existing BROKERAGE contracts the agent can
  // anchor this addendum to. Scoped by propertyId when we have one.
  useEffect(() => {
    if (!open || type !== 'EXCLUSIVITY' || baseContracts !== null) return;
    let cancelled = false;
    setBaseLoading(true);
    const params = { type: 'BROKERAGE' };
    if (context.propertyId) params.propertyId = context.propertyId;
    api.listContracts(params)
      .then((res) => {
        if (cancelled) return;
        setBaseContracts(res?.items || []);
      })
      .catch(() => { if (!cancelled) setBaseContracts([]); })
      .finally(() => { if (!cancelled) setBaseLoading(false); });
    return () => { cancelled = true; };
  }, [open, type, context.propertyId, baseContracts]);

  // Title — defaults to the type label, agent can edit before submit.
  useEffect(() => {
    if (type && !title) setTitle(TYPE_META[type].label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Resolve the read-only property summary chip (BROKERAGE /
  // EXCLUSIVITY when a propertyId was seeded by the caller).
  const seededProperty = useMemo(() => {
    if (!context.propertyId) return null;
    if (Array.isArray(properties)) {
      return properties.find((p) => p.id === context.propertyId) || null;
    }
    return null;
  }, [context.propertyId, properties]);

  const toggleSelectedProperty = (id) => {
    setSelectedPropertyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addManualRow = () => {
    setManualRows((prev) => [
      ...prev,
      { address: '', city: '', rooms: '', sqm: '', marketingPrice: '', kind: '' },
    ]);
  };
  const updateManualRow = (idx, key, value) => {
    setManualRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r))
    );
  };
  const removeManualRow = (idx) => {
    setManualRows((prev) => prev.filter((_, i) => i !== idx));
  };

  // Compose `propertiesSnapshot` from selected listings + manual rows.
  const buildPropertiesSnapshot = () => {
    const fromListings = (properties || [])
      .filter((p) => selectedPropertyIds.includes(p.id))
      .map((p) => ({
        propertyId:     p.id,
        address:        [p.street, p.unitNumber ? `יח׳ ${p.unitNumber}` : null]
                          .filter(Boolean).join(' '),
        city:           p.city || undefined,
        rooms:          p.rooms != null ? Number(p.rooms) : null,
        sqm:            p.sqm   != null ? Number(p.sqm)   : null,
        marketingPrice: p.marketingPrice != null ? Number(p.marketingPrice) : null,
        kind:           p.type || undefined,
      }));
    const fromManual = manualRows
      .filter((r) => r.address && r.address.trim())
      .map((r) => ({
        address:        r.address.trim(),
        city:           r.city?.trim() || undefined,
        rooms:          r.rooms !== '' && !Number.isNaN(Number(r.rooms))
                          ? Number(r.rooms) : null,
        sqm:            r.sqm !== '' && !Number.isNaN(Number(r.sqm))
                          ? Number(r.sqm) : null,
        marketingPrice: r.marketingPrice !== '' && !Number.isNaN(Number(r.marketingPrice))
                          ? Number(r.marketingPrice) : null,
        kind:           r.kind?.trim() || undefined,
      }));
    return [...fromListings, ...fromManual];
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setErr(null);

    if (!type) { setErr('יש לבחור סוג חוזה'); return; }
    if (!signerName.trim()) { setErr('יש להזין את שם החותם'); return; }

    // Per-type pre-flight validation.
    let propertyIdToSend = context.propertyId || undefined;
    let propertiesSnapshotToSend;
    let baseContractIdToSend;

    if (type === 'BROKERAGE' || type === 'EXCLUSIVITY' || type === 'OFFER') {
      if (!propertyIdToSend) {
        if (!pickedPropertyId) {
          setErr('יש לבחור נכס עבור החוזה');
          return;
        }
        propertyIdToSend = pickedPropertyId;
      }
    }

    if (type === 'EXCLUSIVITY') {
      if (!exclusivityStart || !exclusivityEnd) {
        setErr('יש להגדיר תאריכי תחילת וסיום הבלעדיות');
        return;
      }
      // baseContractId may legitimately be empty ("ללא הסכם תיווך בסיס").
      baseContractIdToSend = baseContractId || undefined;
    }

    if (type === 'BUYER_BROKERAGE') {
      propertiesSnapshotToSend = buildPropertiesSnapshot();
      // Buyer order is legally formed without a property list (you can
      // sign a buyer-broker before showing them anything), so we don't
      // require non-empty here — just stamp whatever the agent picked.
    }

    // Compose the body for OFFER (price + notes) — the seller-side
    // documents fall back to DEFAULT_BODIES on the server.
    let bodyText;
    if (type === 'OFFER') {
      const priceN = Number(offerPrice);
      if (!Number.isFinite(priceN) || priceN <= 0) {
        setErr('יש להזין מחיר הצעה תקין');
        return;
      }
      const lines = [
        `הצעת רכישה בסך ${fmtPrice(priceN)}.`,
        'אני הח"מ מציע/ה לרכוש את הנכס בתמורה לסכום הנקוב לעיל.',
        'הצעה זו תקפה לתקופה של 7 ימים מיום חתימתה, ומותנית בקבלת ' +
          'משכנתא ובבדיקת רישום הזכויות בנכס.',
        'במידה וההצעה תתקבל, אני מתחייב/ת לחתום על זכרון דברים תוך 14 יום.',
      ];
      if (offerNotes.trim()) {
        lines.push(`הערות נוספות: ${offerNotes.trim()}`);
      }
      bodyText = lines.join('\n\n');
    }

    // Optional commission line on BROKERAGE / EXCLUSIVITY — we let the
    // server use DEFAULT_BODIES for the clause text (matches task brief)
    // but stamp the agent's commission into the title so the contract
    // row is still searchable by rate.
    const vatSuffix = vatIncluded ? '' : ' + מע"מ';
    let finalTitle = title.trim() || TYPE_META[type].label;
    if ((type === 'BROKERAGE' || type === 'EXCLUSIVITY') && commissionPct) {
      // Append the commission only if the agent didn't already mention
      // a percent sign — avoids "Title 2% — 2%+מע"מ" double-stamping.
      if (!/%/.test(finalTitle)) {
        finalTitle = `${finalTitle} — ${commissionPct}%${vatSuffix}`;
      }
    }

    const payload = {
      type,
      title:        finalTitle,
      signerName:   signerName.trim(),
      signerPhone:  signerPhone.trim() || undefined,
      signerEmail:  signerEmail.trim() || undefined,
      propertyId:   propertyIdToSend,
      leadId:       context.leadId || undefined,
      propertiesSnapshot: propertiesSnapshotToSend,
      baseContractId:     baseContractIdToSend,
      body:         bodyText,
    };

    setBusy(true);
    try {
      const res = await api.createContract(payload);
      const contract = res?.contract || res;
      toast?.success?.('החוזה נוצר. ניתן לשלוח אותו לחתימה.');
      onCreated?.(contract);
      onClose?.();
    } catch (e2) {
      setErr(e2?.message || 'יצירת החוזה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <Portal>
      <div
        dir="rtl"
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
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
        <form
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ccd-title"
          onSubmit={submit}
          autoComplete="off"
          style={{
            width: '100%', maxWidth: 720,
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
            gap: 12, padding: '18px 20px 14px',
            borderBottom: `1px solid ${DT.border}`,
            background: DT.white,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                id="ccd-title"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  margin: 0, fontSize: 18, fontWeight: 800,
                  color: DT.ink, letterSpacing: -0.3,
                }}
              >
                <FileText size={18} aria-hidden="true" style={{ color: DT.gold }} />
                {type ? TYPE_META[type].label : 'יצירת חוזה חדש'}
              </h3>
              <p style={{ margin: '4px 0 0', color: DT.muted, fontSize: 12 }}>
                {type
                  ? 'מלא את פרטי החוזה ושלח לחתימה דיגיטלית'
                  : 'בחר את סוג החוזה כדי להתחיל'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              style={{
                width: 34, height: 34, borderRadius: 99,
                background: DT.cream4, border: `1px solid ${DT.border}`,
                color: DT.muted, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            ><X size={18} /></button>
          </header>

          {/* Body */}
          <div style={{ padding: 18, overflow: 'auto', flex: 1 }}>
            {!type && (
              <TypeGrid onPick={(t) => setType(t)} />
            )}

            {type && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Type chip + change-type link when no defaultType */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, flexWrap: 'wrap',
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: DT.goldSoft, color: DT.goldDark,
                    padding: '4px 10px', borderRadius: 99,
                    fontWeight: 800, fontSize: 12,
                  }}>
                    <Check size={12} /> {TYPE_META[type].label}
                  </span>
                  {!context.defaultType && (
                    <button
                      type="button"
                      onClick={() => setType(null)}
                      style={{
                        ...FONT,
                        background: 'transparent', border: 'none',
                        color: DT.goldDark, fontWeight: 700, fontSize: 12,
                        cursor: 'pointer', padding: 0,
                      }}
                    >
                      שנה סוג חוזה
                    </button>
                  )}
                </div>

                {/* Title */}
                <Field label="כותרת החוזה">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={inputStyle()}
                    placeholder={TYPE_META[type].label}
                  />
                </Field>

                {/* Signer block — shared by all 4 types. */}
                <Fieldset legend="פרטי החותם">
                  <Grid2>
                    <Field label="שם מלא *">
                      <input
                        type="text"
                        required
                        value={signerName}
                        onChange={(e) => setSignerName(e.target.value)}
                        style={inputStyle()}
                        placeholder="ישראל ישראלי"
                      />
                    </Field>
                    <Field label="טלפון">
                      <PhoneField
                        value={signerPhone}
                        onChange={setSignerPhone}
                      />
                    </Field>
                    <Field label="דוא״ל">
                      <input
                        type="email"
                        value={signerEmail}
                        onChange={(e) => setSignerEmail(e.target.value)}
                        style={{ ...inputStyle(), direction: 'ltr', textAlign: 'right' }}
                        placeholder="name@example.com"
                      />
                    </Field>
                  </Grid2>
                </Fieldset>

                {/* Type-specific blocks */}
                {(type === 'BROKERAGE' || type === 'EXCLUSIVITY') && (
                  <Fieldset legend="פרטי הנכס ועמלה">
                    {seededProperty
                      ? <PropertyChip property={seededProperty} />
                      : context.propertyId
                        ? <PropertyChipLoading />
                        : (
                          <Field label="נכס *">
                            <SelectField
                              value={pickedPropertyId}
                              onChange={setPickedPropertyId}
                              placeholder={propsLoading ? 'טוען נכסים…' : 'בחר נכס'}
                              options={(properties || []).map((p) => ({
                                value: p.id,
                                label: `${p.street || ''}${p.city ? `, ${p.city}` : ''}`
                                  + (p.marketingPrice ? ` — ${fmtPrice(p.marketingPrice)}` : ''),
                              }))}
                            />
                          </Field>
                        )
                    }
                    <Grid2>
                      <Field label="עמלה (%)">
                        <input
                          type="number" min="0" max="20" step="0.1"
                          value={commissionPct}
                          onChange={(e) => setCommissionPct(e.target.value)}
                          style={{ ...inputStyle(), direction: 'ltr', textAlign: 'right' }}
                        />
                      </Field>
                      <Field label="מע״מ">
                        <label style={{
                          display: 'inline-flex', alignItems: 'center', gap: 8,
                          fontSize: 13, fontWeight: 700, color: DT.ink,
                          paddingBlockStart: 6,
                        }}>
                          <input
                            type="checkbox"
                            checked={vatIncluded}
                            onChange={(e) => setVatIncluded(e.target.checked)}
                            style={{ accentColor: DT.gold, width: 18, height: 18 }}
                          />
                          <span>מע״מ כלול במחיר ({vatIncluded ? 'כן' : '+ מע״מ'})</span>
                        </label>
                      </Field>
                    </Grid2>
                  </Fieldset>
                )}

                {type === 'EXCLUSIVITY' && (
                  <Fieldset legend="תקופת הבלעדיות">
                    <Grid2>
                      <Field label="תחילה *">
                        <input
                          type="date"
                          value={exclusivityStart}
                          onChange={(e) => setExclusivityStart(e.target.value)}
                          style={{ ...inputStyle(), direction: 'ltr', textAlign: 'right' }}
                        />
                      </Field>
                      <Field label="סיום *">
                        <input
                          type="date"
                          value={exclusivityEnd}
                          onChange={(e) => setExclusivityEnd(e.target.value)}
                          style={{ ...inputStyle(), direction: 'ltr', textAlign: 'right' }}
                        />
                      </Field>
                    </Grid2>
                    <Field label="הסכם תיווך בסיס">
                      <SelectField
                        value={baseContractId}
                        onChange={setBaseContractId}
                        placeholder={baseLoading ? 'טוען הסכמי תיווך…' : undefined}
                        options={[
                          { value: '', label: 'ללא הסכם תיווך בסיס' },
                          ...((baseContracts || []).map((c) => ({
                            value: c.id,
                            label: `${c.title || 'הזמנת שירותי תיווך'} — ${c.signerName}`,
                          }))),
                        ]}
                      />
                    </Field>
                  </Fieldset>
                )}

                {type === 'BUYER_BROKERAGE' && (
                  <Fieldset legend="רשימת נכסים">
                    {propsLoading && (
                      <div style={{ color: DT.muted, fontSize: 13, padding: '6px 0' }}>
                        טוען נכסים…
                      </div>
                    )}
                    {properties && properties.length > 0 && (
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 6,
                        maxHeight: 260, overflow: 'auto',
                        background: DT.white, border: `1px solid ${DT.border}`,
                        borderRadius: 10, padding: 8,
                      }}>
                        {properties.map((p) => {
                          const selected = selectedPropertyIds.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 10px', borderRadius: 8,
                                background: selected ? DT.goldSoft : 'transparent',
                                border: `1px solid ${selected ? DT.gold : 'transparent'}`,
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleSelectedProperty(p.id)}
                                style={{ accentColor: DT.gold, width: 16, height: 16 }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: 13, fontWeight: 700, color: DT.ink,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {p.street}{p.city ? `, ${p.city}` : ''}
                                </div>
                                <div style={{ fontSize: 11, color: DT.muted, marginTop: 2 }}>
                                  {[
                                    p.rooms != null ? `${p.rooms} חד׳` : null,
                                    p.sqm   != null ? `${p.sqm} מ״ר`   : null,
                                    p.marketingPrice ? fmtPrice(p.marketingPrice) : null,
                                  ].filter(Boolean).join(' · ')}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {properties && properties.length === 0 && !propsLoading && (
                      <div style={{ color: DT.muted, fontSize: 13 }}>
                        לא נמצאו נכסים שלך — ניתן להוסיף שורות ידנית למטה.
                      </div>
                    )}

                    {/* Manual rows — for off-market properties the agent
                        shows the customer but didn't list in Estia. */}
                    {manualRows.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                        {manualRows.map((row, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: DT.white, border: `1px solid ${DT.border}`,
                              borderRadius: 10, padding: 10,
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr)) auto',
                              gap: 8, alignItems: 'flex-end',
                            }}
                          >
                            <Field compact label="כתובת">
                              <input
                                type="text"
                                value={row.address}
                                onChange={(e) => updateManualRow(idx, 'address', e.target.value)}
                                style={inputStyle()}
                                placeholder="רחוב + מספר"
                              />
                            </Field>
                            <Field compact label="עיר">
                              <input
                                type="text"
                                value={row.city}
                                onChange={(e) => updateManualRow(idx, 'city', e.target.value)}
                                style={inputStyle()}
                              />
                            </Field>
                            <Field compact label="חדרים">
                              <input
                                type="number" min="0" step="0.5"
                                value={row.rooms}
                                onChange={(e) => updateManualRow(idx, 'rooms', e.target.value)}
                                style={{ ...inputStyle(), direction: 'ltr', textAlign: 'right' }}
                              />
                            </Field>
                            <Field compact label="מ״ר">
                              <input
                                type="number" min="0"
                                value={row.sqm}
                                onChange={(e) => updateManualRow(idx, 'sqm', e.target.value)}
                                style={{ ...inputStyle(), direction: 'ltr', textAlign: 'right' }}
                              />
                            </Field>
                            <Field compact label="מחיר">
                              <input
                                type="number" min="0"
                                value={row.marketingPrice}
                                onChange={(e) => updateManualRow(idx, 'marketingPrice', e.target.value)}
                                style={{ ...inputStyle(), direction: 'ltr', textAlign: 'right' }}
                              />
                            </Field>
                            <button
                              type="button"
                              onClick={() => removeManualRow(idx)}
                              aria-label="הסר שורה"
                              style={{
                                width: 34, height: 34, borderRadius: 8,
                                background: 'rgba(185,28,28,0.08)',
                                border: 'none', color: DT.danger,
                                cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            ><Trash2 size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={addManualRow}
                        style={{
                          ...FONT,
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          background: DT.white, border: `1px dashed ${DT.gold}`,
                          color: DT.goldDark, fontWeight: 700, fontSize: 13,
                          padding: '8px 14px', borderRadius: 99,
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={14} /> הוסף שורת נכס ידנית
                      </button>
                    </div>
                  </Fieldset>
                )}

                {type === 'OFFER' && (
                  <Fieldset legend="פרטי ההצעה">
                    {!context.propertyId && (
                      <Field label="נכס *">
                        <SelectField
                          value={pickedPropertyId}
                          onChange={setPickedPropertyId}
                          placeholder={propsLoading ? 'טוען נכסים…' : 'בחר נכס'}
                          options={(properties || []).map((p) => ({
                            value: p.id,
                            label: `${p.street || ''}${p.city ? `, ${p.city}` : ''}`,
                          }))}
                        />
                      </Field>
                    )}
                    {seededProperty && <PropertyChip property={seededProperty} />}
                    <Field label="מחיר הצעה (₪) *">
                      <input
                        type="number" min="0" step="1000"
                        value={offerPrice}
                        onChange={(e) => setOfferPrice(e.target.value)}
                        style={{ ...inputStyle(), direction: 'ltr', textAlign: 'right' }}
                        placeholder="0"
                      />
                    </Field>
                    <Field label="הערות">
                      <textarea
                        rows={3}
                        value={offerNotes}
                        onChange={(e) => setOfferNotes(e.target.value)}
                        style={{ ...inputStyle(), resize: 'vertical' }}
                        placeholder="תנאים מיוחדים, תנאי תשלום, וכו׳"
                      />
                    </Field>
                  </Fieldset>
                )}

                {err && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(185,28,28,0.08)', color: DT.danger,
                    padding: '8px 12px', borderRadius: 8,
                    fontSize: 13, fontWeight: 700,
                  }}>
                    <AlertCircle size={14} /> {err}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <footer style={{
            display: 'flex', gap: 8, justifyContent: 'flex-end',
            padding: '12px 18px', borderTop: `1px solid ${DT.border}`,
            background: DT.white,
          }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={busy}
            >
              ביטול
            </button>
            {type && (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy}
              >
                <FileText size={14} />
                {busy ? 'יוצר…' : 'צור חוזה'}
              </button>
            )}
          </footer>
        </form>
      </div>
    </Portal>
  );
}

// ── Step 1 — Type picker grid ────────────────────────────────────────
function TypeGrid({ onPick }) {
  return (
    <div
      className="estia-contract-type-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
      }}
    >
      {TYPE_KEYS.map((key) => {
        const meta = TYPE_META[key];
        const Icon = meta.icon;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            style={{
              ...FONT,
              textAlign: 'center',
              background: DT.white,
              border: `1px solid ${DT.border}`,
              borderRadius: 14,
              padding: '20px 16px 18px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              minHeight: 168,
              transition: 'border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = DT.gold;
              e.currentTarget.style.boxShadow = '0 10px 30px rgba(180,139,76,0.18)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = DT.border;
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <span style={{
              width: 48, height: 48, borderRadius: 14,
              background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
              color: DT.ink,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(180,139,76,0.25)',
            }}>
              <Icon size={22} aria-hidden="true" />
            </span>
            <div style={{
              fontWeight: 800, fontSize: 14, color: DT.ink,
              lineHeight: 1.3,
            }}>
              {meta.label}
            </div>
            <div style={{
              fontSize: 12, color: DT.muted,
              lineHeight: 1.4,
              marginTop: 'auto',
            }}>
              {meta.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Tiny styling helpers ─────────────────────────────────────────────
function Field({ label, children, compact }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column',
      gap: 4,
      fontSize: compact ? 11 : 12,
    }}>
      <span style={{ fontWeight: 700, color: DT.ink }}>{label}</span>
      {children}
    </label>
  );
}

function Fieldset({ legend, children }) {
  return (
    <fieldset style={{
      border: `1px solid ${DT.border}`,
      borderRadius: 12,
      padding: '12px 14px 14px',
      background: DT.white,
      margin: 0,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <legend style={{
        fontSize: 11, fontWeight: 800, color: DT.gold,
        letterSpacing: 0.5, padding: '0 6px',
      }}>{legend}</legend>
      {children}
    </fieldset>
  );
}

function Grid2({ children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 10,
    }}>
      {children}
    </div>
  );
}

function inputStyle() {
  return {
    ...FONT,
    width: '100%',
    background: DT.white,
    border: `1px solid ${DT.borderStrong}`,
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 14,
    color: DT.ink,
    boxSizing: 'border-box',
  };
}

function PropertyChip({ property }) {
  return (
    <div style={{
      background: DT.cream4,
      border: `1px solid ${DT.border}`,
      borderRadius: 10,
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <span style={{ fontSize: 11, color: DT.muted, fontWeight: 700 }}>נכס</span>
      <strong style={{ fontSize: 13, color: DT.ink }}>
        {property.street}{property.city ? `, ${property.city}` : ''}
      </strong>
      {property.marketingPrice != null && (
        <span style={{ fontSize: 12, color: DT.goldDark, fontWeight: 700 }}>
          {fmtPrice(property.marketingPrice)}
        </span>
      )}
    </div>
  );
}

function PropertyChipLoading() {
  return (
    <div style={{
      background: DT.cream4,
      border: `1px dashed ${DT.border}`,
      borderRadius: 10,
      padding: '10px 12px',
      fontSize: 12, color: DT.muted,
    }}>
      טוען פרטי נכס…
    </div>
  );
}
