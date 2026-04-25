import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Check, Pen, AlertCircle, Trash2, ArrowRight, FileSignature, Home,
  BadgeCheck, Percent, CalendarDays, ShieldCheck,
} from 'lucide-react';
import './ProspectSign.css';

// Public brokerage-order kiosk ("הסכם תיווך" sign flow).
//
// Two-step flow:
//   Step 1 — FULL order summary: agent identification, property,
//            transaction type, commission %, validity, exclusivity,
//            brokerage terms. The prospect reads the whole agreement
//            here and taps the CTA to confirm.
//   Step 2 — identity + signature.
//
// Gated by an unguessable 24h token. No login. Light-only theme —
// the public form should look the same for every signer regardless
// of their OS theme setting.

// ──────────────────────────────────────────────────────────────
// Helpers + presentational subcomponents (MUST be defined at
// MODULE scope, not inside the default export — re-creating them
// on every render would remount the child <input>s and drop focus
// on every keystroke, which is the bug users hit when typing.)
// ──────────────────────────────────────────────────────────────

function formatPrice(n) {
  if (n == null) return '';
  try { return new Intl.NumberFormat('he-IL').format(n); }
  catch { return String(n); }
}

function formatDateIL(d) {
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat('he-IL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(d);
  } catch { return ''; }
}

function todayDate() { return new Date(); }
function monthsFromNow(n) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d;
}

// Derive the industry-standard Hebrew transaction label from the
// property's assetClass + category enums.
function transactionLabel(property) {
  if (!property) return '';
  const isRent = property.category === 'RENT';
  const isCommercial = property.assetClass === 'COMMERCIAL';
  if (isCommercial) return isRent ? 'השכרת נכס מסחרי' : 'מכירת נכס מסחרי';
  return isRent ? 'שכירות למגורים' : 'רכישת נכס למגורים';
}

// Conservative allow-list for rendering the agent-supplied
// brokerageTermsHtml. No <script>, no event handlers, no <iframe>.
const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'DIV',
]);
function sanitizeHtml(raw) {
  if (!raw) return '';
  const tpl = document.createElement('template');
  tpl.innerHTML = String(raw);
  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!ALLOWED_TAGS.has(child.tagName)) {
          child.replaceWith(...Array.from(child.childNodes));
          continue;
        }
        for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name);
        walk(child);
      }
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

function Shell({ children }) {
  return (
    <div className="psn-page psn-light" dir="rtl">
      <header className="psn-brand-bar">
        <div className="psn-brand-mark" aria-hidden="true">◆</div>
        <div className="psn-brand-text">
          <strong>Estia</strong>
          <span>הסכם תיווך</span>
        </div>
      </header>
      <main className="psn-main">{children}</main>
      <footer className="psn-foot">מאובטח · החתימה נשמרת מוצפנת אצל המתווך/ת</footer>
    </div>
  );
}

function AgentHeader({ agent }) {
  if (!agent) return null;
  // SEC-036 — Public-token GET no longer returns the agent's broker
  // license, national ID, or business address (the URL travels over
  // unencrypted channels). The signed PDF, rendered server-side after
  // sign, still includes those fields for legal compliance.
  return (
    <div className="psn-agent-head">
      <div className="psn-agent-name">
        {agent.displayName || 'המתווך/ת'}
        {agent.agency && <span className="psn-agent-agency"> · {agent.agency}</span>}
      </div>
      {agent.phone && <div className="psn-agent-line" dir="ltr">{agent.phone}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────

export default function ProspectSign() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [step, setStep] = useState('summary'); // 'summary' | 'form'
  const [form, setForm] = useState({
    fullName: '',
    idType: 'ID',
    idNumber: '',
    address: '',
    email: '',
    notes: '',
  });
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const hasStroke = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`/api/prospects/public/${token}`);
        if (!resp.ok) {
          const j = await resp.json().catch(() => ({}));
          setErr(j?.error?.message || 'הקישור לא תקף');
          setLoading(false);
          return;
        }
        const json = await resp.json();
        setState(json);
        if (json?.prospect?.name) setForm((p) => ({ ...p, fullName: json.prospect.name }));
      } catch {
        setErr('תקלת רשת');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (step !== 'form' || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e1a14';
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [step, state]);

  const pt = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };
  const startStroke = (e) => { e.preventDefault(); drawing.current = true; last.current = pt(e); };
  const moveStroke = (e) => {
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

  const validate = () => {
    if (!form.fullName.trim()) return 'שם מלא חובה';
    if (!form.idNumber.trim()) return form.idType === 'PASSPORT' ? 'מספר דרכון חובה' : 'מספר ת.ז. חובה';
    if (!form.address.trim()) return 'כתובת מגורים חובה';
    if (!hasStroke.current) return 'נא לחתום במסגרת';
    return null;
  };

  const submit = async () => {
    setErr(null);
    const msg = validate();
    if (msg) { setErr(msg); return; }
    setBusy(true);
    try {
      const resp = await fetch(`/api/prospects/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.fullName.trim(),
          idType: form.idType,
          idNumber: form.idNumber.trim(),
          address: form.address.trim(),
          email: form.email || undefined,
          notes: form.notes || undefined,
          signatureDataUrl: canvasRef.current.toDataURL('image/png'),
        }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        setErr(j?.error?.message || 'שמירה נכשלה');
        return;
      }
      setSent(true);
    } catch {
      setErr('תקלת רשת');
    } finally {
      setBusy(false);
    }
  };

  const agentTermsHtml = useMemo(
    () => sanitizeHtml(state?.agent?.brokerageTermsHtml || ''),
    [state?.agent?.brokerageTermsHtml],
  );

  if (loading) {
    return (
      <Shell>
        <div className="psn-card psn-loading-card">
          <div className="psn-spinner" aria-hidden="true" />
          <p>טוען…</p>
        </div>
      </Shell>
    );
  }

  if (err && !state) {
    return (
      <Shell>
        <div className="psn-card psn-err">
          <AlertCircle size={32} />
          <h2>הקישור לא תקף</h2>
          <p>{err}</p>
        </div>
      </Shell>
    );
  }

  if (sent) {
    return (
      <Shell>
        <div className="psn-card psn-done">
          <div className="psn-done-ring"><Check size={36} /></div>
          <h2>תודה!</h2>
          <p>
            החתימה התקבלה.
            {state?.agent?.displayName
              ? ` ${state.agent.displayName} יחזרו אלייך בהקדם.`
              : ' ניצור עמך קשר בהקדם.'}
          </p>
        </div>
      </Shell>
    );
  }

  const { prospect, property, agent } = state;
  const txLabel = transactionLabel(property);
  const commissionPct = property?.agentCommissionPct ?? null; // read-only; agent-set
  const validFrom = todayDate();
  const validUntil = monthsFromNow(6); // industry-standard default validity

  // ── Step 1: full order summary (read-only review) ────────────
  if (step === 'summary') {
    return (
      <Shell>
        <div className="psn-card psn-intro">
          <AgentHeader agent={agent} />
          <div className="psn-rule" />

          <div className="psn-intro-icon"><FileSignature size={24} /></div>
          <h1>הסכם תיווך</h1>
          <p className="psn-law-cite">
            נדרש עפ"י חוק המתווכים במקרקעין, התשנ"ו-1996
          </p>

          <p className="psn-intro-copy">
            שלום {prospect.name}, להלן פרטי ההזמנה שלך למתווך.
            נא לעיין במלואם ולהמשיך לחתימה בתחתית העמוד.
          </p>

          {/* ── Property ───────────────────────────────────── */}
          {property && (
            <>
              <h3 className="psn-section-h">פרטי הנכס</h3>
              <div className="psn-prop">
                <Home size={16} aria-hidden="true" />
                <div>
                  <div className="psn-prop-title">
                    {property.type ? `${property.type} ` : ''}ב{property.street}, {property.city}
                  </div>
                  {property.neighborhood && (
                    <div className="psn-prop-sub">{property.neighborhood}</div>
                  )}
                  {property.marketingPrice != null && (
                    <div className="psn-prop-price">
                      מחיר מבוקש: ₪ {formatPrice(property.marketingPrice)}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── Transaction + commission block ─────────────── */}
          <h3 className="psn-section-h">תנאי העסקה</h3>
          <dl className="psn-terms-grid">
            <dt><BadgeCheck size={14} /> סוג עסקה</dt>
            <dd>{txLabel || '—'}</dd>

            <dt><Percent size={14} /> דמי תיווך</dt>
            <dd>
              {commissionPct != null
                ? `${commissionPct}% ממחיר העסקה + מע"מ`
                : 'כמוסכם ביני לבין המתווך/ת'}
            </dd>

            <dt><CalendarDays size={14} /> תוקף הזמנה</dt>
            <dd>{formatDateIL(validFrom)} — {formatDateIL(validUntil)}</dd>

            <dt><ShieldCheck size={14} /> בלעדיות</dt>
            <dd>לא</dd>
          </dl>

          {/* ── Agent brokerage terms (full legal text) ────── */}
          <h3 className="psn-section-h">נוסח הסכם התיווך</h3>
          {agentTermsHtml ? (
            <div
              className="psn-terms psn-terms-html"
              dangerouslySetInnerHTML={{ __html: agentTermsHtml }}
            />
          ) : (
            <div className="psn-terms">
              <p>
                הלקוח/ה מזמין/ה בזאת מהמתווך שירותי תיווך בקשר לנכס המפורט לעיל,
                בהתאם להוראות חוק המתווכים במקרקעין, התשנ"ו-1996 ותקנותיו.
              </p>
              <p>
                הלקוח/ה מתחייב/ת להודיע למתווך באופן מיידי על כל משא ומתן או חתימה
                על הסכם מחייב ביחס לנכס, ולשלם למתווך את דמי התיווך כמוסכם לעיל
                מיד עם ביצוע העסקה.
              </p>
              <p>
                הלקוח/ה מצהיר/ה כי הנכס הוצג בפניו/ה באמצעות המתווך, וכי ההתקשרות
                הזו חלה גם על רוכשים/שוכרים מטעמו/ה (בני משפחה, חברה בשליטתו/ה וכו').
              </p>
              <p className="psn-terms-note">
                * זהו נוסח כללי. המתווך/ת יכולים להחליף אותו בנוסח מלא שלהם
                בהגדרות חשבון הסוכן.
              </p>
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary psn-cta psn-cta-hero"
            onClick={() => setStep('form')}
          >
            <Pen size={18} />
            <span>קראתי ואני מסכים/ה — המשך לחתימה</span>
          </button>

          <ul className="psn-checks">
            <li><Check size={14} /> קישור אישי ומוצפן</li>
            <li><Check size={14} /> תקף ל-24 שעות</li>
            <li><Check size={14} /> ללא הורדת אפליקציה</li>
          </ul>
        </div>
      </Shell>
    );
  }

  // ── Step 2: identity + signature ─────────────────────────────
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Shell>
      <div className="psn-card psn-form">
        <div className="psn-form-head">
          <button
            type="button"
            className="btn btn-ghost psn-back"
            onClick={() => { setErr(null); setStep('summary'); }}
            aria-label="חזור"
          >
            <ArrowRight size={16} /> חזור
          </button>
          <h2>פרטי חותם/ת</h2>
        </div>

        <label className="psn-label" htmlFor="psn-fullname">שם מלא *</label>
        <input
          id="psn-fullname"
          type="text"
          autoComplete="name"
          className="psn-input"
          value={form.fullName}
          onChange={(e) => update('fullName', e.target.value)}
          placeholder="שם פרטי ושם משפחה"
          dir="rtl"
        />

        <label className="psn-label" id="psn-idtype-label">סוג מסמך זיהוי *</label>
        <div className="psn-segmented" role="radiogroup" aria-labelledby="psn-idtype-label">
          {[
            { value: 'ID',       label: 'ת.ז.' },
            { value: 'PASSPORT', label: 'דרכון' },
          ].map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={form.idType === o.value}
              className={`psn-seg-btn ${form.idType === o.value ? 'is-on' : ''}`}
              onClick={() => update('idType', o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>

        <label className="psn-label" htmlFor="psn-idnum">
          {form.idType === 'PASSPORT' ? 'מספר דרכון *' : 'מספר ת.ז. *'}
        </label>
        <input
          id="psn-idnum"
          type="text"
          inputMode={form.idType === 'PASSPORT' ? 'text' : 'numeric'}
          autoComplete="off"
          className="psn-input"
          value={form.idNumber}
          onChange={(e) => update('idNumber', e.target.value)}
          dir="ltr"
          placeholder={form.idType === 'PASSPORT' ? 'ABC123456' : '9 ספרות'}
        />

        <label className="psn-label" htmlFor="psn-addr">כתובת מגורים *</label>
        <input
          id="psn-addr"
          type="text"
          autoComplete="street-address"
          className="psn-input"
          value={form.address}
          onChange={(e) => update('address', e.target.value)}
          placeholder="רחוב ומספר, עיר"
          dir="rtl"
        />

        <label className="psn-label" htmlFor="psn-email">אימייל (אופציונלי)</label>
        <input
          id="psn-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          dir="ltr"
          className="psn-input"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          placeholder="name@example.com"
        />

        <label className="psn-label" htmlFor="psn-notes">הערות (אופציונלי)</label>
        <textarea
          id="psn-notes"
          className="psn-textarea"
          rows={3}
          dir="auto"
          autoCapitalize="sentences"
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          placeholder="פרטים נוספים שחשוב שהמתווך/ת ידעו"
        />

        <div className="psn-sign-head">
          <label className="psn-label">חתימה *</label>
          <button type="button" className="psn-clear" onClick={clearCanvas}>
            <Trash2 size={12} /> נקה
          </button>
        </div>
        <div className="psn-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="psn-canvas"
            onMouseDown={startStroke} onMouseMove={moveStroke} onMouseUp={endStroke} onMouseLeave={endStroke}
            onTouchStart={startStroke} onTouchMove={moveStroke} onTouchEnd={endStroke}
          />
          <div className="psn-canvas-hint"><Pen size={18} /> חתום/י כאן</div>
        </div>

        {err && <div className="psn-err-inline"><AlertCircle size={14} /> {err}</div>}

        <div className="psn-form-actions">
          <button
            className="btn btn-primary psn-cta"
            onClick={submit}
            disabled={busy}
          >
            <Check size={16} /> {busy ? 'שומר…' : 'אישור וחתימה'}
          </button>
        </div>
      </div>
    </Shell>
  );
}
