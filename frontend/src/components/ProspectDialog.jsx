import { useEffect, useRef, useState } from 'react';
import { X, Check, Pen, Link2, QrCode, Trash2, Send, AlertCircle, UserPlus } from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import haptics from '../lib/haptics';
import './ProspectDialog.css';

// 1.5 — Prospect intake form.
//
// Two flows, one dialog:
//   1. "בסוקר" (in-person) — agent + prospect in the same room. Fill
//      name/phone/email, prospect draws their signature on the canvas,
//      "שמור והדפס" creates the record with signedAt stamped.
//   2. "באוויר" (digital) — agent shares a short-lived link; prospect
//      opens it on their own phone, fills + signs, record updates.
//
// Per-asset: the dialog is always mounted in a property context, so
// the property is already known. The server uses that to link the
// record to the property.

export default function ProspectDialog({ property, onClose, onCreated }) {
  const [mode, setMode] = useState('inperson'); // 'inperson' | 'digital'
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    source: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [digital, setDigital] = useState(null); // { signUrl, prospect }
  const [success, setSuccess] = useState(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const lastPointRef = useRef(null);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // ── Signature canvas — mouse + touch + pen ────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e1a14';
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const pointFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  const startStroke = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
  };
  const moveStroke = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const p = pointFromEvent(e);
    const last = lastPointRef.current;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
    hasStrokeRef.current = true;
  };
  const endStroke = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokeRef.current = false;
  };

  const getSignatureDataUrl = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokeRef.current) return null;
    return canvas.toDataURL('image/png');
  };

  // ── Submit handlers ───────────────────────────────────────────
  const submitInPerson = async () => {
    setErr(null);
    if (!form.name.trim()) { setErr('שם המתעניין חובה'); return; }
    const sig = getSignatureDataUrl();
    if (!sig) { setErr('נא לחתום במסגרת'); return; }
    setBusy(true);
    try {
      const { prospect } = await api.createProspect(property.id, {
        ...form,
        email: form.email || undefined,
        signatureDataUrl: sig,
      });
      haptics?.press?.();
      onCreated?.(prospect);
      setSuccess({ kind: 'inperson', prospect });
    } catch (e) {
      setErr(e?.message || 'שמירה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const submitDigital = async () => {
    setErr(null);
    if (!form.name.trim()) { setErr('שם המתעניין חובה'); return; }
    setBusy(true);
    try {
      const r = await api.createProspectDigital(property.id, {
        name: form.name,
        phone: form.phone || undefined,
      });
      setDigital(r);
      onCreated?.(r.prospect);
    } catch (e) {
      setErr(e?.message || 'יצירת קישור נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!digital?.signUrl) return;
    try { await navigator.clipboard.writeText(digital.signUrl); haptics?.tap?.(); }
    catch { /* ignore */ }
  };

  const shareViaWA = () => {
    if (!digital?.signUrl) return;
    const text = `שלום ${form.name}, נשמח שתמלא/י פרטים קצרים על ההתעניינות ב${property.street}, ${property.city}:\n${digital.signUrl}`;
    const url = form.phone
      ? `https://wa.me/${(form.phone || '').replace(/[^\d]/g, '').replace(/^0/, '972')}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, 'estia-whatsapp', 'noreferrer');
  };

  // ── Render ────────────────────────────────────────────────────
  if (success) {
    return (
      <Portal>
        <div className="pdg-backdrop" onClick={onClose}>
          <div className="pdg-panel pdg-done" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="pdg-done-icon"><Check size={36} /></div>
            <h3>נרשם בהצלחה</h3>
            <p>{success.prospect.name} נוסף לרשימת המתעניינים בנכס.</p>
            <button className="btn btn-primary" onClick={onClose}>סגור</button>
          </div>
        </div>
      </Portal>
    );
  }

  return (
    <Portal>
      <div className="pdg-backdrop" onClick={onClose} role="dialog" aria-modal="true">
        <div className="pdg-panel" onClick={(e) => e.stopPropagation()} dir="rtl">
          <header className="pdg-head">
            <div className="pdg-head-text">
              <strong>הוסף מתעניין</strong>
              <span>{property.street}, {property.city}</span>
            </div>
            <button className="pdg-close" onClick={onClose} aria-label="סגור"><X size={18} /></button>
          </header>

          {/* Mode switcher — big pills, iq1-style */}
          <div className="pdg-mode" role="tablist">
            <button
              role="tab"
              aria-selected={mode === 'inperson'}
              className={`pdg-mode-pill ${mode === 'inperson' ? 'sel' : ''}`}
              onClick={() => { setMode('inperson'); setDigital(null); setErr(null); }}
            >
              <Pen size={14} />
              <span>חתימה במקום</span>
            </button>
            <button
              role="tab"
              aria-selected={mode === 'digital'}
              className={`pdg-mode-pill ${mode === 'digital' ? 'sel' : ''}`}
              onClick={() => { setMode('digital'); setDigital(null); setErr(null); }}
            >
              <Link2 size={14} />
              <span>שליחת קישור</span>
            </button>
          </div>

          <div className="pdg-body">
            {digital ? (
              <DigitalLinkPanel digital={digital} onCopy={copyLink} onShareWA={shareViaWA} />
            ) : (
              <>
                <div className="pdg-field">
                  <label>שם מלא *</label>
                  <input
                    className="pdg-input"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    autoComplete="name"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    placeholder="ישראל ישראלי"
                  />
                </div>
                <div className="pdg-row">
                  <div className="pdg-field">
                    <label>טלפון</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      enterKeyHint="next"
                      dir="ltr"
                      className="pdg-input"
                      value={form.phone}
                      onChange={(e) => update('phone', e.target.value)}
                      placeholder="050-1234567"
                    />
                  </div>
                  <div className="pdg-field">
                    <label>אימייל</label>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="next"
                      dir="ltr"
                      className="pdg-input"
                      value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                      placeholder="name@example.com"
                    />
                  </div>
                </div>

                {mode === 'inperson' && (
                  <>
                    <div className="pdg-field">
                      <label>מקור הפנייה</label>
                      <input
                        className="pdg-input"
                        value={form.source}
                        onChange={(e) => update('source', e.target.value)}
                        placeholder="פייסבוק, יד 2, הפניה מחבר…"
                        autoCapitalize="sentences"
                      />
                    </div>
                    <div className="pdg-field">
                      <label>הערות</label>
                      <textarea
                        className="pdg-textarea"
                        rows={2}
                        dir="auto"
                        autoCapitalize="sentences"
                        enterKeyHint="enter"
                        value={form.notes}
                        onChange={(e) => update('notes', e.target.value)}
                        placeholder="עדיפויות, מסגרת תקציב, לוחות זמנים…"
                      />
                    </div>
                    <div className="pdg-field">
                      <div className="pdg-sign-label">
                        <label>חתימת המתעניין *</label>
                        <button type="button" className="pdg-sign-clear" onClick={clearCanvas}>
                          <Trash2 size={12} /> נקה
                        </button>
                      </div>
                      <div className="pdg-canvas-wrap">
                        <canvas
                          ref={canvasRef}
                          className="pdg-canvas"
                          onMouseDown={startStroke}
                          onMouseMove={moveStroke}
                          onMouseUp={endStroke}
                          onMouseLeave={endStroke}
                          onTouchStart={startStroke}
                          onTouchMove={moveStroke}
                          onTouchEnd={endStroke}
                        />
                        <div className="pdg-canvas-hint">חתום/י כאן</div>
                      </div>
                    </div>
                  </>
                )}

                {mode === 'digital' && (
                  <p className="pdg-digital-hint">
                    <QrCode size={12} />
                    ניצור קישור קצר-מועד (24 שעות) שתוכל/י לשלוח למתעניין בוואטסאפ —
                    הוא ישלים את הפרטים ויחתום מהטלפון שלו.
                  </p>
                )}
              </>
            )}

            {err && (
              <div className="pdg-err">
                <AlertCircle size={12} /> {err}
              </div>
            )}
          </div>

          {!digital && (
            <footer className="pdg-foot">
              <button className="btn btn-secondary" onClick={onClose}>ביטול</button>
              {mode === 'inperson' ? (
                <button className="btn btn-primary" onClick={submitInPerson} disabled={busy}>
                  <Check size={14} /> {busy ? 'שומר…' : 'שמור והוסף'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={submitDigital} disabled={busy}>
                  <Send size={14} /> {busy ? 'יוצר…' : 'צור קישור'}
                </button>
              )}
            </footer>
          )}

          {digital && (
            <footer className="pdg-foot">
              <button className="btn btn-secondary" onClick={onClose}>סיימתי</button>
              <button className="btn btn-primary" onClick={shareViaWA}>
                <Send size={14} /> שלח ב-WhatsApp
              </button>
            </footer>
          )}
        </div>
      </div>
    </Portal>
  );
}

function DigitalLinkPanel({ digital, onCopy, onShareWA }) {
  // Very small QR implementation — Google Charts (legacy, public) or
  // an inline <img> that fetches from api.qrserver.com. Using qrserver
  // avoids adding a dep; it's been up for 10+ years.
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(digital.signUrl)}`;
  return (
    <div className="pdg-digital">
      <div className="pdg-digital-qr">
        <img src={qrSrc} alt="QR to sign URL" width={200} height={200} />
      </div>
      <div className="pdg-digital-body">
        <strong>הקישור מוכן</strong>
        <span>הקוד/קישור יקפוץ למתעניין לטופס חתימה. תקף ל-24 שעות.</span>
        <code className="pdg-link">{digital.signUrl}</code>
        <div className="pdg-digital-actions">
          <button className="btn btn-secondary btn-sm" onClick={onCopy}>
            <Link2 size={13} /> העתק קישור
          </button>
          <button className="btn btn-primary btn-sm" onClick={onShareWA}>
            <Send size={13} /> שלח בוואטסאפ
          </button>
        </div>
      </div>
    </div>
  );
}
