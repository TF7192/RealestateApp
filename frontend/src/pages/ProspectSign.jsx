import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Pen, AlertCircle, Trash2 } from 'lucide-react';
import './ProspectSign.css';

// 1.5 — Public sign page. Accessed via the short-lived publicToken link
// an agent shares after creating a "digital" prospect record. Prospect
// opens the URL on their own phone, fills missing details + signs, and
// the signature ships to /api/prospects/public/:token.

export default function ProspectSign() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ email: '', notes: '' });
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
      } catch {
        setErr('תקלת רשת');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
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
  }, [state]);

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

  const submit = async () => {
    setErr(null);
    if (!hasStroke.current) { setErr('נא לחתום במסגרת'); return; }
    setBusy(true);
    try {
      const resp = await fetch(`/api/prospects/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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

  if (loading) return <div className="psn-loading">טוען…</div>;
  if (err && !state) {
    return (
      <div className="psn-page" dir="rtl">
        <div className="psn-card psn-err">
          <AlertCircle size={28} />
          <h2>הקישור לא תקף</h2>
          <p>{err}</p>
        </div>
      </div>
    );
  }
  if (sent) {
    return (
      <div className="psn-page" dir="rtl">
        <div className="psn-card psn-done">
          <Check size={32} />
          <h2>תודה!</h2>
          <p>החתימה התקבלה. ניצור עמך קשר בהקדם.</p>
        </div>
      </div>
    );
  }

  const { prospect, property } = state;

  return (
    <div className="psn-page" dir="rtl">
      <div className="psn-card">
        <header>
          <h1>טופס התעניינות</h1>
          {property && (
            <p>{property.type} ב{property.street}, {property.city}</p>
          )}
        </header>

        <div className="psn-summary">
          <div><strong>שם:</strong> {prospect.name}</div>
          {prospect.phone && <div><strong>טלפון:</strong> <span dir="ltr">{prospect.phone}</span></div>}
        </div>

        <label className="psn-label">אימייל (אופציונלי)</label>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          dir="ltr"
          className="psn-input"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="name@example.com"
        />

        <label className="psn-label">הערות</label>
        <textarea
          className="psn-textarea"
          rows={3}
          dir="auto"
          autoCapitalize="sentences"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="אם יש פרטים שנרצה לדעת…"
        />

        <div className="psn-sign-head">
          <label className="psn-label">חתימה *</label>
          <button type="button" className="psn-clear" onClick={clear}>
            <Trash2 size={11} /> נקה
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

        {err && <div className="psn-err-inline"><AlertCircle size={12} /> {err}</div>}

        <button className="psn-cta" onClick={submit} disabled={busy}>
          <Check size={16} /> {busy ? 'שומר…' : 'אשר ושלח'}
        </button>
      </div>
    </div>
  );
}
