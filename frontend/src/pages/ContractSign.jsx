// Public customer-facing contract-sign kiosk.
//
// Mounted at `/contracts/sign/:token` (unauth block in App.jsx). The
// agent shares this URL with the customer; the customer reviews the
// agreement and signs without logging in. Token is generated at
// contract-create time and expires 30 days later. After successful
// sign, the row is locked and the customer can download the signed
// PDF from the thank-you panel.
//
// Two-step flow modelled on ProspectSign:
//   Step 1 — review the agent, the customer details, the property /
//            properties list (BUYER_BROKERAGE), and the clause text.
//   Step 2 — identity form + canvas signature pad.
//
// The canvas + identity-form code is intentionally copy-pasted from
// ProspectSign.jsx rather than shared. ProspectSign belongs to the
// Prospect domain (purchase-offer kiosk) and we don't want a shared
// dependency that drags either page's evolution behind the other.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowRight, AlertCircle, Check, Pen, Trash2, FileSignature,
  ShieldCheck, Download, Home,
} from 'lucide-react';
import api from '../lib/api';

// Cream / gold / espresso DT tokens — matches ContractDetail + the
// rest of the contract surface.
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

const TYPE_LABEL = {
  EXCLUSIVITY:     'הסכם בלעדיות',
  BROKERAGE:       'הזמנת שירותי תיווך',
  BUYER_BROKERAGE: 'הזמנת שירותי תיווך לקניה',
  OFFER:           'הצעת רכישה',
};

function formatIlDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(dt);
}

function formatPrice(n) {
  if (n == null) return '—';
  try { return `₪${new Intl.NumberFormat('he-IL').format(n)}`; }
  catch { return `₪${n}`; }
}

function shortContractRef(id) {
  return id ? id.slice(-8).toUpperCase() : '';
}

function Shell({ children }) {
  return (
    <div dir="rtl" style={{
      ...FONT, minHeight: '100vh', background: DT.cream, color: DT.ink,
    }}>
      <header style={{
        background: DT.white, borderBottom: `1px solid ${DT.border}`,
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          color: DT.ink, display: 'grid', placeItems: 'center',
          fontWeight: 800, fontSize: 16,
        }} aria-hidden="true">◆</div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <strong style={{ fontSize: 15 }}>Estia</strong>
          <span style={{ fontSize: 11, color: DT.muted }}>חתימה דיגיטלית</span>
        </div>
      </header>
      <main style={{ padding: '20px 16px', maxWidth: 720, margin: '0 auto' }}>
        {children}
      </main>
      <footer style={{
        textAlign: 'center', padding: '18px 12px',
        fontSize: 11, color: DT.muted,
      }}>
        מאובטח · החתימה נשמרת מוצפנת אצל המתווך/ת
      </footer>
    </div>
  );
}

function AgentHeader({ agent }) {
  if (!agent) return null;
  // Public-token GET returns full agent identification — the legal
  // sign flow requires the signer to see who they're contracting with
  // (broker license + ID under חוק המתווכים במקרקעין).
  return (
    <div style={{
      borderBottom: `1px solid ${DT.border}`, paddingBottom: 12, marginBottom: 14,
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: DT.ink }}>
        {agent.displayName || 'המתווך/ת'}
        {agent.agency && (
          <span style={{ color: DT.muted, fontWeight: 600 }}>
            {' · '}{agent.agency}
          </span>
        )}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: DT.muted, lineHeight: 1.6 }}>
        {agent.phone && <div dir="ltr" style={{ textAlign: 'right' }}>טל׳ {agent.phone}</div>}
        {agent.email && <div dir="ltr" style={{ textAlign: 'right' }}>{agent.email}</div>}
        {agent.licenseNumber && <div>מס׳ רישיון: {agent.licenseNumber}</div>}
        {agent.idNumber && <div>ת.ז.: {agent.idNumber}</div>}
        {agent.businessAddress && <div>{agent.businessAddress}</div>}
      </div>
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 14, padding: 20,
      boxShadow: '0 2px 8px rgba(30,26,20,0.04)',
      ...(style || {}),
    }}>
      {children}
    </div>
  );
}

export default function ContractSign() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [err, setErr]   = useState(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('review'); // 'review' | 'sign'
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    idType: 'ID',
    idNumber: '',
    address: '',
    email: '',
    notes: '',
    consent: false,
  });

  // Canvas refs — same set ProspectSign uses (mouse + touch handlers
  // tested against iOS / Android / desktop).
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last    = useRef(null);
  const hasStroke = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const j = await api.publicContract(token);
        setData(j);
        // Pre-fill the signer name from the contract's signerName so the
        // customer doesn't have to retype it — they can correct it if
        // the agent wrote it wrong.
        if (j?.contract?.signerName) {
          setForm((p) => ({ ...p, fullName: j.contract.signerName }));
        }
        if (j?.contract?.signerEmail) {
          setForm((p) => ({ ...p, email: j.contract.signerEmail }));
        }
      } catch (e) {
        setErr(e?.message || 'הקישור לא תקף');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Canvas sizing — re-runs on step change because the canvas only
  // mounts on step='sign'. Copy of ProspectSign's resize logic.
  useEffect(() => {
    if (step !== 'sign' || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width  = Math.floor(rect.width  * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.4;
      ctx.lineCap   = 'round';
      ctx.lineJoin  = 'round';
      ctx.strokeStyle = '#1e1a14';
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [step]);

  const pt = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }, []);
  const startStroke = (e) => { e.preventDefault(); drawing.current = true; last.current = pt(e); };
  const moveStroke  = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pt(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    hasStroke.current = true;
  };
  const endStroke = () => { drawing.current = false; last.current = null; };
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    hasStroke.current = false;
  };

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const validate = () => {
    if (!form.fullName.trim()) return 'שם מלא חובה';
    if (!form.idNumber.trim()) {
      return form.idType === 'PASSPORT' ? 'מספר דרכון חובה' : 'מספר ת.ז. חובה';
    }
    if (!form.address.trim()) return 'כתובת מגורים חובה';
    if (!hasStroke.current)   return 'נא לחתום במסגרת';
    if (!form.consent)        return 'יש לאשר את תוכן ההסכם ומדיניות הפרטיות';
    return null;
  };

  const submit = async () => {
    setErr(null);
    const msg = validate();
    if (msg) { setErr(msg); return; }
    setBusy(true);
    try {
      await api.signPublicContract(token, {
        signatureDataUrl: canvasRef.current.toDataURL('image/png'),
        signerName:    form.fullName.trim(),
        signerIdType:  form.idType,
        signerIdNumber: form.idNumber.trim(),
        signerAddress: form.address.trim(),
        signerEmail:   form.email || undefined,
        notes:         form.notes || undefined,
        consentAccepted: true,
      });
      setSent(true);
    } catch (e) {
      setErr(e?.message || 'שמירה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <Card>
          <div style={{ textAlign: 'center', padding: '20px 0', color: DT.muted }}>
            טוען…
          </div>
        </Card>
      </Shell>
    );
  }

  if (err && !data) {
    return (
      <Shell>
        <Card>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 10, padding: '20px 0',
          }}>
            <AlertCircle size={32} color={DT.danger} />
            <h2 style={{ margin: 0, fontSize: 18 }}>הקישור לא תקף</h2>
            <p style={{ color: DT.muted, fontSize: 13, textAlign: 'center', margin: 0 }}>
              {err}
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  if (sent) {
    return (
      <Shell>
        <Card>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 12, padding: '20px 0',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 32,
              background: 'rgba(21,128,61,0.12)', color: DT.success,
              display: 'grid', placeItems: 'center',
            }}>
              <Check size={32} />
            </div>
            <h2 style={{ margin: 0, fontSize: 20 }}>תודה — ההסכם נחתם</h2>
            <p style={{
              color: DT.muted, fontSize: 13, textAlign: 'center',
              margin: 0, lineHeight: 1.6,
            }}>
              עותק חתום נשמר אצל {data?.agent?.displayName || 'המתווך/ת'}.
              ניתן להוריד עותק לעצמך כעת.
            </p>
            <a
              href={api.publicContractPdfUrl(token)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...FONT,
                background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
                border: 'none', color: DT.ink,
                padding: '12px 22px', borderRadius: 10,
                fontSize: 14, fontWeight: 800,
                display: 'inline-flex', gap: 6, alignItems: 'center',
                textDecoration: 'none',
                boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
                marginTop: 4,
              }}
            >
              <Download size={15} /> הורד עותק חתום
            </a>
          </div>
        </Card>
      </Shell>
    );
  }

  const { contract, agent, baseContract } = data;
  const typeLabel = TYPE_LABEL[contract.type] || 'חוזה';
  const paragraphs = (contract.body || '')
    .split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const properties = Array.isArray(contract.propertiesSnapshot)
    ? contract.propertiesSnapshot : [];

  // ── Step 1 — review ──────────────────────────────────────────
  if (step === 'review') {
    return (
      <Shell>
        <Card>
          <AgentHeader agent={agent} />

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, marginBottom: 6,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: DT.goldSoft, color: DT.goldDark,
              display: 'grid', placeItems: 'center',
            }}>
              <FileSignature size={20} />
            </div>
          </div>
          <h1 style={{
            margin: 0, textAlign: 'center', fontSize: 22, fontWeight: 800,
          }}>
            {typeLabel}
          </h1>
          {contract.title && contract.title !== typeLabel && (
            <p style={{
              margin: '4px 0 0', textAlign: 'center', color: DT.goldDark,
              fontSize: 13, fontWeight: 600,
            }}>
              {contract.title}
            </p>
          )}
          <p style={{
            margin: '6px 0 18px', textAlign: 'center',
            fontSize: 11, color: DT.muted,
          }}>
            נדרש עפ״י חוק המתווכים במקרקעין, התשנ״ו-1996
          </p>

          {/* EXCLUSIVITY base-contract reference header */}
          {contract.type === 'EXCLUSIVITY' && baseContract && (
            <div style={{
              background: DT.cream4, borderRight: `3px solid ${DT.gold}`,
              padding: '10px 14px', borderRadius: 8, marginBottom: 14,
              fontSize: 12, color: DT.ink2, lineHeight: 1.6,
            }}>
              הסכם זה מהווה חלק בלתי נפרד מהזמנת שירותי תיווך מספר{' '}
              <strong>{shortContractRef(baseContract.id)}</strong>{' '}
              אשר נחתמה ביום{' '}
              {formatIlDate(baseContract.signedAt || baseContract.createdAt)}.
            </div>
          )}

          <SectionH>פרטי הלקוח</SectionH>
          <KvTable rows={[
            ['שם', contract.signerName],
            contract.signerPhone ? ['טלפון', contract.signerPhone] : null,
            contract.signerEmail ? ['דוא״ל', contract.signerEmail] : null,
          ].filter(Boolean)} />

          {/* BUYER_BROKERAGE — property table */}
          {contract.type === 'BUYER_BROKERAGE' && (
            <>
              <SectionH>רשימת נכסים</SectionH>
              {properties.length === 0 ? (
                <p style={{ color: DT.muted, fontSize: 13, margin: '0 0 14px' }}>
                  (אין נכסים מצורפים)
                </p>
              ) : (
                <div style={{
                  border: `1px solid ${DT.border}`, borderRadius: 10,
                  overflow: 'hidden', marginBottom: 14,
                }}>
                  {properties.map((p, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 12px',
                      borderTop: i === 0 ? 'none' : `1px solid ${DT.border}`,
                      background: i % 2 === 0 ? DT.white : DT.cream4,
                    }}>
                      <Home size={16} color={DT.muted} style={{ marginTop: 2, flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 700 }}>
                          {p.kind ? `${p.kind} · ` : ''}{p.address}
                          {p.city && `, ${p.city}`}
                        </div>
                        <div style={{ color: DT.muted, fontSize: 12, marginTop: 2 }}>
                          {p.rooms != null && <span>{p.rooms} חדרים · </span>}
                          {p.sqm   != null && <span>{p.sqm} מ״ר · </span>}
                          {p.marketingPrice != null && <span>{formatPrice(p.marketingPrice)}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Single property (any non-buyer-brokerage type) */}
          {contract.type !== 'BUYER_BROKERAGE' && properties.length > 0 && (
            <>
              <SectionH>פרטי הנכס</SectionH>
              <KvTable rows={[
                ['כתובת', `${properties[0].address}${properties[0].city ? ', ' + properties[0].city : ''}`],
                properties[0].rooms != null ? ['חדרים', String(properties[0].rooms)] : null,
                properties[0].sqm   != null ? ['שטח', `${properties[0].sqm} מ״ר`]   : null,
                properties[0].marketingPrice != null
                  ? ['מחיר מבוקש', formatPrice(properties[0].marketingPrice)]
                  : null,
              ].filter(Boolean)} />
            </>
          )}

          <SectionH>תנאי החוזה</SectionH>
          <div style={{
            background: DT.cream4, border: `1px solid ${DT.border}`,
            borderRadius: 10, padding: '14px 16px', marginBottom: 18,
            fontSize: 13, color: DT.ink, lineHeight: 1.75,
          }}>
            {paragraphs.length === 0 ? (
              <p style={{ margin: 0, color: DT.muted }}>(אין תוכן)</p>
            ) : paragraphs.map((p, i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : '10px 0 0' }}>{p}</p>
            ))}
          </div>

          <button
            type="button"
            onClick={() => { setErr(null); setStep('sign'); }}
            style={{
              ...FONT,
              width: '100%', justifyContent: 'center',
              background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
              border: 'none', color: DT.ink,
              padding: '14px 22px', borderRadius: 12, cursor: 'pointer',
              fontSize: 15, fontWeight: 800,
              display: 'inline-flex', gap: 8, alignItems: 'center',
              boxShadow: '0 6px 14px rgba(180,139,76,0.3)',
              minHeight: 52,
            }}
          >
            <Pen size={18} /> המשך לחתימה
          </button>

          <ul style={{
            listStyle: 'none', padding: 0, margin: '14px 0 0',
            display: 'flex', flexWrap: 'wrap', gap: 12,
            justifyContent: 'center', fontSize: 11, color: DT.muted,
          }}>
            <li style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Check size={12} /> קישור אישי ומוצפן
            </li>
            <li style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Check size={12} /> ללא הורדת אפליקציה
            </li>
            <li style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ShieldCheck size={12} /> חתימה דיגיטלית מאומתת
            </li>
          </ul>
        </Card>
      </Shell>
    );
  }

  // ── Step 2 — identity + signature ────────────────────────────
  return (
    <Shell>
      <Card>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        }}>
          <button
            type="button"
            onClick={() => { setErr(null); setStep('review'); }}
            style={{
              ...FONT,
              background: 'transparent', border: `1px solid ${DT.border}`,
              padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 700, color: DT.ink,
              display: 'inline-flex', gap: 4, alignItems: 'center',
            }}
          >
            <ArrowRight size={14} /> חזור
          </button>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            פרטי חותם/ת
          </h2>
        </div>

        <Label>שם מלא *</Label>
        <Input
          value={form.fullName}
          onChange={(e) => update('fullName', e.target.value)}
          autoComplete="name"
          placeholder="שם פרטי ושם משפחה"
        />

        <Label>סוג מסמך זיהוי *</Label>
        <div style={{
          display: 'flex', gap: 0,
          border: `1px solid ${DT.borderStrong}`, borderRadius: 10,
          overflow: 'hidden', marginBottom: 12,
        }} role="radiogroup">
          {[
            { v: 'ID',       l: 'ת.ז.' },
            { v: 'PASSPORT', l: 'דרכון' },
          ].map((o) => {
            const on = form.idType === o.v;
            return (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => update('idType', o.v)}
                style={{
                  ...FONT, flex: 1, border: 'none',
                  padding: '11px 0', cursor: 'pointer',
                  background: on ? DT.gold : DT.white,
                  color: on ? DT.white : DT.ink,
                  fontSize: 13, fontWeight: 700,
                }}
              >
                {o.l}
              </button>
            );
          })}
        </div>

        <Label>{form.idType === 'PASSPORT' ? 'מספר דרכון *' : 'מספר ת.ז. *'}</Label>
        <Input
          value={form.idNumber}
          onChange={(e) => update('idNumber', e.target.value)}
          dir="ltr"
          inputMode={form.idType === 'PASSPORT' ? 'text' : 'numeric'}
          placeholder={form.idType === 'PASSPORT' ? 'ABC123456' : '9 ספרות'}
        />

        <Label>כתובת מגורים *</Label>
        <Input
          value={form.address}
          onChange={(e) => update('address', e.target.value)}
          autoComplete="street-address"
          placeholder="רחוב ומספר, עיר"
        />

        <Label>אימייל (אופציונלי)</Label>
        <Input
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          dir="ltr"
          inputMode="email"
          type="email"
          placeholder="name@example.com"
        />

        <Label>הערות (אופציונלי)</Label>
        <textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={3}
          style={{
            ...FONT, width: '100%', boxSizing: 'border-box',
            border: `1px solid ${DT.borderStrong}`, borderRadius: 10,
            padding: '11px 14px', fontSize: 14, color: DT.ink,
            background: DT.white, marginBottom: 14, resize: 'vertical',
          }}
          placeholder="פרטים נוספים שחשוב שהמתווך/ת ידעו"
        />

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 6,
        }}>
          <Label style={{ margin: 0 }}>חתימה *</Label>
          <button
            type="button"
            onClick={clearCanvas}
            style={{
              ...FONT, background: 'transparent',
              border: `1px solid ${DT.border}`,
              padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
              fontSize: 11, fontWeight: 600, color: DT.muted,
              display: 'inline-flex', gap: 4, alignItems: 'center',
            }}
          >
            <Trash2 size={11} /> נקה
          </button>
        </div>
        <div style={{
          position: 'relative',
          border: `2px dashed ${DT.borderStrong}`, borderRadius: 12,
          background: DT.cream4, marginBottom: 14,
          height: 180,
        }}>
          <canvas
            ref={canvasRef}
            style={{
              width: '100%', height: '100%',
              display: 'block', touchAction: 'none',
            }}
            onMouseDown={startStroke}
            onMouseMove={moveStroke}
            onMouseUp={endStroke}
            onMouseLeave={endStroke}
            onTouchStart={startStroke}
            onTouchMove={moveStroke}
            onTouchEnd={endStroke}
          />
          <div style={{
            position: 'absolute', top: 8, right: 12,
            fontSize: 11, color: DT.muted,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            pointerEvents: 'none',
          }}>
            <Pen size={12} /> חתום/י כאן
          </div>
        </div>

        <label style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          fontSize: 13, color: DT.ink, marginBottom: 16, cursor: 'pointer',
          lineHeight: 1.5,
        }}>
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => update('consent', e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>
            בחתימתי אני מאשר/ת את תוכן ההסכם ואת מדיניות הפרטיות
          </span>
        </label>

        {err && (
          <div style={{
            background: 'rgba(185,28,28,0.08)', color: DT.danger,
            padding: '10px 12px', borderRadius: 10, marginBottom: 12,
            fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <AlertCircle size={14} /> {err}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          style={{
            ...FONT, width: '100%', justifyContent: 'center',
            background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
            border: 'none', color: DT.ink,
            padding: '14px 22px', borderRadius: 12,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            fontSize: 15, fontWeight: 800,
            display: 'inline-flex', gap: 8, alignItems: 'center',
            boxShadow: '0 6px 14px rgba(180,139,76,0.3)',
            minHeight: 52,
          }}
        >
          <Check size={18} /> {busy ? 'שומר…' : 'אישור וחתימה'}
        </button>
      </Card>
    </Shell>
  );
}

function SectionH({ children }) {
  return (
    <h3 style={{
      fontSize: 13, fontWeight: 800, color: DT.goldDark,
      textTransform: 'uppercase', letterSpacing: 0.4,
      margin: '0 0 8px',
    }}>
      {children}
    </h3>
  );
}
function Label({ children, style }) {
  return (
    <label style={{
      display: 'block', fontSize: 11, fontWeight: 700,
      color: DT.muted, textTransform: 'uppercase', letterSpacing: 0.3,
      marginBottom: 6, ...(style || {}),
    }}>
      {children}
    </label>
  );
}
function KvTable({ rows }) {
  return (
    <div style={{
      border: `1px solid ${DT.border}`, borderRadius: 10,
      overflow: 'hidden', marginBottom: 14,
    }}>
      {rows.map(([k, v], i) => (
        <div key={k} style={{
          display: 'flex', alignItems: 'center',
          padding: '9px 12px',
          borderTop: i === 0 ? 'none' : `1px solid ${DT.border}`,
          background: i % 2 === 0 ? DT.white : DT.cream4,
          fontSize: 13, gap: 12,
        }}>
          <span style={{
            color: DT.muted, fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 0.3,
            minWidth: 80,
          }}>{k}</span>
          <span style={{ flex: 1, color: DT.ink }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
function Input(props) {
  return (
    <input
      type="text"
      {...props}
      style={{
        ...FONT, width: '100%', boxSizing: 'border-box',
        border: `1px solid ${DT.borderStrong}`, borderRadius: 10,
        padding: '11px 14px', fontSize: 14, color: DT.ink,
        background: DT.white, marginBottom: 12,
        ...(props.style || {}),
      }}
    />
  );
}
