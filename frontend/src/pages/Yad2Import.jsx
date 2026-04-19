import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, ArrowRight, AlertCircle, Check, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';
import './Yad2Import.css';

// Task 4 — Yad2 import POC, paste-URL flow.
// Beta-badged. Server-side fetch + parse, no credentials stored.

export default function Yad2Import() {
  const navigate = useNavigate();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [step, setStep] = useState('paste'); // paste | review | done
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [extracted, setExtracted] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [result, setResult] = useState(null);

  const togglePick = (id) => {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const fetchPreview = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await api.yad2Preview(url.trim());
      setExtracted(res.listings || []);
      setPicked(new Set((res.listings || []).map((l) => l.sourceId))); // all by default
      setStep('review');
    } catch (e) {
      setErr(e.message || 'הטעינה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const importPicked = async () => {
    setErr(null);
    setBusy(true);
    try {
      const toImport = extracted.filter((l) => picked.has(l.sourceId));
      const res = await api.yad2Import(toImport);
      setResult(res);
      setStep('done');
      toast.success(`יובאו ${res.created.length} נכסים`);
    } catch (e) {
      setErr(e.message || 'הייבוא נכשל');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="y2-page" dir="rtl">
      <header className="y2-head">
        <Link to="/properties" className="y2-back" aria-label="חזרה לנכסים">
          <ArrowRight size={18} />
          חזור לנכסים
        </Link>
        <div className="y2-title">
          <h1>ייבוא נכסים מ-Yad2</h1>
          <span className="y2-beta">Beta</span>
        </div>
        <p className="y2-sub">הדבק את הקישור לדף הנכסים שלך ב-Yad2 וייבא הכל בלחיצה.</p>
      </header>

      {err && (
        <div className="y2-err">
          <AlertCircle size={14} /> {err}
        </div>
      )}

      {step === 'paste' && (
        <section className="y2-card">
          <label className="y2-label" htmlFor="y2-url">כתובת דף הנכסים שלך</label>
          <input
            id="y2-url"
            className="y2-input"
            inputMode="url"
            enterKeyHint="go"
            placeholder="https://www.yad2.co.il/realestate/forsale?…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && url.trim()) fetchPreview(); }}
          />
          <button
            className="btn btn-primary"
            disabled={!url.trim() || busy}
            onClick={fetchPreview}
          >
            {busy ? <Loader2 size={14} className="y2-spin" /> : <Download size={14} />}
            {busy ? 'מאתר נכסים…' : 'איתור הנכסים'}
          </button>
          <p className="y2-hint">
            מחפש את הקישור? היכנס/י ל-Yad2 → הפרופיל שלך → העתק/י את כתובת הדף שמציגה את כל הנכסים שלך.
          </p>
        </section>
      )}

      {step === 'review' && (
        <section className="y2-card">
          <header className="y2-review-head">
            <strong>{extracted.length} נכסים נמצאו</strong>
            <span>{picked.size} נבחרו לייבוא</span>
          </header>
          <ul className="y2-list">
            {extracted.map((l) => {
              const chosen = picked.has(l.sourceId);
              return (
                <li key={l.sourceId} className={`y2-item ${chosen ? 'on' : ''}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={chosen}
                      onChange={() => togglePick(l.sourceId)}
                    />
                    <div className="y2-item-meta">
                      <strong>{l.title || `${l.street || ''} ${l.city || ''}`.trim() || 'נכס מ-Yad2'}</strong>
                      <span>
                        {[
                          l.street && l.city ? `${l.street}, ${l.city}` : (l.city || l.street || ''),
                          l.rooms ? `${l.rooms} חד׳` : null,
                          l.sqm ? `${l.sqm} מ״ר` : null,
                          l.floor != null ? `קומה ${l.floor === 0 ? 'קרקע' : l.floor}` : null,
                          l.price ? `₪${Number(l.price).toLocaleString('he-IL')}` : null,
                        ].filter(Boolean).join(' · ')}
                      </span>
                      {l.description && <small>{l.description}</small>}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="y2-review-actions">
            <button
              className="btn btn-primary"
              disabled={picked.size === 0 || busy}
              onClick={importPicked}
            >
              {busy ? <Loader2 size={14} className="y2-spin" /> : <Check size={14} />}
              {busy ? 'מייבא…' : `ייבא ${picked.size} נכסים`}
            </button>
            <button className="btn btn-secondary" onClick={() => setStep('paste')}>חזור</button>
          </div>
        </section>
      )}

      {step === 'done' && result && (
        <section className="y2-card y2-done">
          <Check size={28} />
          <h2>הייבוא הסתיים</h2>
          <ul className="y2-summary">
            <li>נוספו: <strong>{result.created.length}</strong></li>
            {result.skipped.length > 0 && (
              <li>דולגו (כבר מיובאים): <strong>{result.skipped.length}</strong></li>
            )}
            {result.failed.length > 0 && (
              <li className="y2-failed">נכשלו: <strong>{result.failed.length}</strong></li>
            )}
          </ul>
          <div className="y2-done-actions">
            <button className="btn btn-primary" onClick={() => navigate('/properties')}>הצג את הנכסים</button>
            <button className="btn btn-secondary" onClick={() => { setStep('paste'); setUrl(''); setResult(null); }}>
              ייבא דף נוסף
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
