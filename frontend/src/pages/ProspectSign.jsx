import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Pen, AlertCircle, Trash2, ArrowRight, FileSignature, Home } from 'lucide-react';
import './ProspectSign.css';

// Public prospect-sign kiosk. Two-step flow that mirrors the formal
// Israeli "הזמנת שירותי תיווך" layout:
//   Step 1: landing — agent header + property context + big CTA.
//   Step 2: formal order — agent + client + property details, the
//           agent's own brokerage terms (pulled from their profile),
//           signature canvas.
//
// Gated by an unguessable 24h token. No login.

function formatPrice(n) {
  if (n == null) return '';
  try { return new Intl.NumberFormat('he-IL').format(n); }
  catch { return String(n); }
}

// Very conservative allow-list for rendering the agent-supplied
// brokerageTermsHtml. No <script>, no event handlers, no <iframe>.
// Bold + italic + paragraphs + line breaks + lists + headings are
// enough for a broker form.
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
        // Strip every attribute — keeps inline handlers, javascript: URLs,
        // and style-based exfil impossible.
        for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name);
        walk(child);
      }
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

export default function ProspectSign() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [step, setStep] = useState('intro'); // 'intro' | 'form'
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
  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = pt(e); };
  const move = (e) => {
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
  const end = () => { drawing.current = false; last.current = null; };
  const clear = () => {
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

  const Shell = ({ children }) => (
    <div className="psn-page" dir="rtl">
      <header className="psn-brand-bar">
        <div className="psn-brand-mark" aria-hidden="true">◆</div>
        <div className="psn-brand-text">
          <strong>Estia</strong>
          <span>הזמנת שירותי תיווך</span>
        </div>
      </header>
      <main className="psn-main">{children}</main>
      <footer className="psn-foot">מאובטח · החתימה נשמרת מוצפנת אצל המתווך/ת</footer>
    </div>
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

  // ── Agent header block (used on both steps) ────────────────────
  const AgentHeader = () => (
    <div className="psn-agent-head">
      <div className="psn-agent-name">
        {agent?.displayName || 'המתווך/ת'}
        {agent?.agency && <span className="psn-agent-agency"> · {agent.agency}</span>}
      </div>
      {agent?.businessAddress && <div className="psn-agent-line">{agent.businessAddress}</div>}
      {agent?.phone && <div className="psn-agent-line" dir="ltr">{agent.phone}</div>}
      {(agent?.license || agent?.personalId) && (
        <div className="psn-agent-line psn-agent-meta">
          {agent.license  && <span>מ.ר. {agent.license}</span>}
          {agent.license && agent.personalId && <span aria-hidden="true"> · </span>}
          {agent.personalId && <span>ת.ז. {agent.personalId}</span>}
        </div>
      )}
    </div>
  );

  // ── Step 1: intro landing ──────────────────────────────────────
  if (step === 'intro') {
    return (
      <Shell>
        <div className="psn-card psn-intro">
          <AgentHeader />
          <div className="psn-rule" />
          <div className="psn-intro-icon"><FileSignature size={24} /></div>
          <h1>הזמנת שירותי תיווך</h1>
          <p className="psn-law-cite">
            נדרשת עפ"י חוק המתווכים במקרקעין, התשנ"ו-1996
          </p>

          {property && (
            <div className="psn-prop">
              <Home size={16} aria-hidden="true" />
              <div>
                <div className="psn-prop-title">
                  {property.type ? `${property.type} ` : ''}ב{property.street}, {property.city}
                </div>
                {property.neighborhood && <div className="psn-prop-sub">{property.neighborhood}</div>}
                {property.marketingPrice != null && (
                  <div className="psn-prop-price">₪ {formatPrice(property.marketingPrice)}</div>
                )}
              </div>
            </div>
          )}

          <p className="psn-intro-copy">
            שלום {prospect.name}, הטופס כולל פרטי זיהוי, התחייבויות עפ"י חוק המתווכים
            וחתימה דיגיטלית. המילוי אורך כדקה.
          </p>

          <button
            type="button"
            className="btn btn-primary psn-cta psn-cta-hero"
            onClick={() => setStep('form')}
          >
            <Pen size={18} />
            <span>לחץ לחתימה</span>
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

  // ── Step 2: formal order form ─────────────────────────────────
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Shell>
      <div className="psn-card psn-form">
        <div className="psn-form-head">
          <button
            type="button"
            className="btn btn-ghost psn-back"
            onClick={() => { setErr(null); setStep('intro'); }}
            aria-label="חזור"
          >
            <ArrowRight size={16} /> חזור
          </button>
          <h2>הזמנת שירותי תיווך</h2>
        </div>

        <AgentHeader />
        <div className="psn-rule" />

        {/* ── Client details ────────────────────────────────── */}
        <h3 className="psn-section-h">פרטי הלקוח/ה</h3>

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

        {/* ── Property list ─────────────────────────────────── */}
        {property && (
          <>
            <h3 className="psn-section-h">הנכס</h3>
            <div className="psn-prop-table" role="table">
              <div className="psn-prop-row psn-prop-row-head" role="row">
                <span role="columnheader">סוג</span>
                <span role="columnheader">כתובת</span>
                <span role="columnheader">מחיר מבוקש</span>
              </div>
              <div className="psn-prop-row" role="row">
                <span role="cell">{property.type || '—'}</span>
                <span role="cell">{property.street}, {property.city}</span>
                <span role="cell">
                  {property.marketingPrice != null
                    ? `₪ ${formatPrice(property.marketingPrice)}`
                    : '—'}
                </span>
              </div>
            </div>
          </>
        )}

        {/* ── Brokerage terms (agent-supplied or fallback) ─── */}
        <h3 className="psn-section-h">תנאי הזמנת שירותי תיווך</h3>
        {agentTermsHtml ? (
          <div
            className="psn-terms psn-terms-html"
            dangerouslySetInnerHTML={{ __html: agentTermsHtml }}
          />
        ) : (
          <div className="psn-terms">
            <p>
              הלקוח/ה מזמין/ה בזאת מהמתווך שירותי תיווך בקשר לנכס המפורט לעיל,
              בהתאם להוראות חוק המתווכים במקרקעין, התשנ"ו-1996.
            </p>
            <p>
              הלקוח/ה מתחייב/ת להודיע למתווך באופן מיידי על כל משא ומתן או חתימה
              על הסכם מחייב ביחס לנכס, ועל תשלום דמי תיווך כמוסכם בינו לבין
              המתווך מיד עם ביצוע העסקה.
            </p>
            <p className="psn-terms-note">
              * זהו נוסח כללי. ניתן להחליפו בנוסח ברוקרז' מלא שלך בהגדרות חשבון המתווך.
            </p>
          </div>
        )}

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

        {/* ── Signature ─────────────────────────────────────── */}
        <div className="psn-sign-head">
          <label className="psn-label">חתימה *</label>
          <button type="button" className="psn-clear" onClick={clear}>
            <Trash2 size={12} /> נקה
          </button>
        </div>
        <div className="psn-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="psn-canvas"
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
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
