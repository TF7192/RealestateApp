import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ArrowRight,
  Plus,
  Minus,
  Share2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { sellerCalc } from '../../lib/sellerCalc';
import haptics from '../../lib/haptics';
import './MobileSellerCalculator.css';

// iPhone-native seller calculator.
//
// Visual language: "appraiser's receipt" — dark charcoal background,
// a single enormous gold hero number for the output, and stacked
// native-feeling cards for the inputs. Designed edge-to-edge for
// iPhone portrait; breaks gracefully on iPad/desktop but is only
// rendered when the viewport is ≤820px (web keeps its own layout).
//
// The math lives in lib/sellerCalc.js — this file is purely
// presentation. The shape of the state object mirrors the web
// SellerCalculator so either can be edited without changing the
// calc contract.

const ils = new Intl.NumberFormat('he-IL', {
  style: 'currency', currency: 'ILS', maximumFractionDigits: 0,
});
const fmtILS = (n) => (Number.isFinite(n) ? ils.format(Math.round(n)) : ils.format(0));
const fmtShort = (n) => {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000)     return `${Math.round(v / 1_000)}K`;
  return null;
};

const parsePercent = (raw) => {
  if (raw === '' || raw == null) return null;
  const n = Number(String(raw).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
};

function useDebounced(value, ms = 120) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const INITIAL = {
  mode: 'forward',
  amount: null,
  commissionPctText: '2',
  commissionVatIncluded: false,
  lawyerMode: 'percent',
  lawyerPctText: '0.5',
  lawyerAmount: null,
  lawyerVatIncluded: false,
  additional: null,
};

export default function MobileSellerCalculator() {
  const [s, setS] = useState(INITIAL);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const update = useCallback((k, v) => setS((p) => ({ ...p, [k]: v })), []);
  const debounced = useDebounced(s, 120);

  const result = useMemo(() => sellerCalc({
    mode: debounced.mode,
    amount: debounced.amount,
    commissionRate: (parsePercent(debounced.commissionPctText) ?? 0) / 100,
    commissionVatIncluded: debounced.commissionVatIncluded,
    lawyerMode: debounced.lawyerMode,
    lawyerRate: (parsePercent(debounced.lawyerPctText) ?? 0) / 100,
    lawyerAmount: debounced.lawyerAmount || 0,
    lawyerVatIncluded: debounced.lawyerVatIncluded,
    additional: debounced.additional || 0,
  }), [debounced]);

  const isFwd = s.mode === 'forward';
  const heroLabel = isFwd ? 'יישאר לבעלים' : 'מחיר לרישום';
  const heroValue = isFwd ? result.net : result.listingPrice;
  const heroSub   = fmtShort(heroValue);

  const flipMode = (next) => {
    if (next === s.mode) return;
    haptics.select?.();
    update('mode', next);
  };

  const reset = () => {
    haptics.press?.();
    setS(INITIAL);
    setAdvancedOpen(false);
  };

  const share = () => {
    if (!result || result.error || !result.net) return;
    haptics.tap?.();
    const lines = [
      isFwd ? 'סיכום עמלות מהמכירה:' : 'מחיר רישום מומלץ:',
      '',
      isFwd
        ? `מחיר מכירה: ${fmtILS(result.listingPrice)}`
        : `מחיר רישום: ${fmtILS(result.listingPrice)}`,
      `עמלת תיווך: ${fmtILS(result.brokerage)}`,
      `שכ"ט עו"ד: ${fmtILS(result.lawyer)}`,
    ];
    if (result.additional > 0) lines.push(`עלויות נוספות: ${fmtILS(result.additional)}`);
    lines.push('—');
    lines.push(`יישאר לבעלים: ${fmtILS(result.net)}`);
    const url = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
    window.location.href = url;
  };

  return (
    <div className="msc" dir="rtl">
      {/* ── Header — iOS-style back chevron + title ───────────────── */}
      <header className="msc-head">
        <Link to="/" className="msc-back" aria-label="חזור">
          <ArrowRight size={20} />
        </Link>
        <h1 className="msc-title">מחשבון מוכר</h1>
        <button
          type="button"
          className="msc-reset"
          onClick={reset}
          aria-label="אפס"
        >
          <RotateCcw size={16} />
        </button>
      </header>

      {/* ── Mode switcher — two massive pills ────────────────────── */}
      <div className="msc-mode" role="tablist" aria-label="מצב חישוב">
        <button
          role="tab"
          aria-selected={isFwd}
          className={`msc-mode-pill ${isFwd ? 'sel' : ''}`}
          onClick={() => flipMode('forward')}
        >
          <span>מחיר → נטו</span>
        </button>
        <button
          role="tab"
          aria-selected={!isFwd}
          className={`msc-mode-pill ${!isFwd ? 'sel' : ''}`}
          onClick={() => flipMode('reverse')}
        >
          <span>נטו → מחיר רישום</span>
        </button>
      </div>

      {/* ── Hero card — the big gold number ──────────────────────── */}
      <section className="msc-hero" aria-live="polite">
        <span className="msc-hero-label">{heroLabel}</span>
        {result.error ? (
          <strong className="msc-hero-err">
            {result.error === 'fees_exceed_100_percent' && 'העמלות עולות על 100% — לא ניתן לחשב'}
            {result.error === 'fees_exceed_price' && 'העמלות גבוהות מהמחיר — בדוק קלט'}
          </strong>
        ) : (
          <>
            <AnimatedMoney value={heroValue} className="msc-hero-value" />
            {heroSub && <span className="msc-hero-sub">≈ {heroSub}</span>}
          </>
        )}
        {/* Quick breakdown — small text beneath the hero so there's no
            need to scroll to see the components. */}
        <ul className="msc-mini">
          <li>
            <span>עמלת תיווך</span>
            <b>{fmtILS(result.brokerage)}</b>
          </li>
          <li>
            <span>שכ"ט עו"ד</span>
            <b>{fmtILS(result.lawyer)}</b>
          </li>
          {result.additional > 0 && (
            <li>
              <span>עלויות נוספות</span>
              <b>{fmtILS(result.additional)}</b>
            </li>
          )}
        </ul>
      </section>

      {/* ── Sale / net amount — the single big input ─────────────── */}
      <MoneyCard
        label={isFwd ? 'מחיר מכירה' : 'סכום רצוי נטו'}
        hint={isFwd ? 'המחיר שמבקשים ללקוח' : 'כמה שהבעלים רוצה לקבל ביד'}
        value={s.amount}
        onChange={(v) => update('amount', v)}
        placeholder={isFwd ? '2,800,000' : '2,700,000'}
      />

      {/* ── Commission ──────────────────────────────────────────── */}
      <PercentCard
        label="עמלת תיווך"
        hint="ברירת מחדל: 2% + מע״מ"
        value={s.commissionPctText}
        onChange={(v) => update('commissionPctText', v)}
        vatIncluded={s.commissionVatIncluded}
        onVatIncludedChange={(b) => update('commissionVatIncluded', b)}
      />

      {/* ── Lawyer ──────────────────────────────────────────────── */}
      <LawyerCard
        mode={s.lawyerMode}
        onModeChange={(v) => update('lawyerMode', v)}
        pctText={s.lawyerPctText}
        onPctChange={(v) => update('lawyerPctText', v)}
        amount={s.lawyerAmount}
        onAmountChange={(v) => update('lawyerAmount', v)}
        vatIncluded={s.lawyerVatIncluded}
        onVatIncludedChange={(b) => update('lawyerVatIncluded', b)}
      />

      {/* ── Advanced — extra costs (collapsible) ────────────────── */}
      <button
        type="button"
        className="msc-expand"
        onClick={() => { haptics.tap?.(); setAdvancedOpen((v) => !v); }}
        aria-expanded={advancedOpen}
      >
        <span>עלויות נוספות</span>
        {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {advancedOpen && (
        <MoneyCard
          label="עלויות נוספות"
          hint="מס שבח, אגרות, יועץ, וכו׳"
          value={s.additional}
          onChange={(v) => update('additional', v)}
          placeholder="0"
          compact
        />
      )}

      {/* ── Sticky share CTA ─────────────────────────────────────── */}
      <div className="msc-dock">
        <button
          type="button"
          className="msc-share"
          onClick={share}
          disabled={!result || !!result.error || !result.net}
        >
          <Share2 size={16} />
          שלח לבעלים בוואטסאפ
        </button>
        <p className="msc-foot">
          <Info size={11} />
          מס שבח לא מחושב אוטומטית — הוסף ידנית ב״עלויות נוספות״ אם רלוונטי.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AnimatedMoney — RAF tween between previous and new value so the
// hero number glides instead of jumping. No spring physics, just
// ease-out cubic over ~220ms.
function AnimatedMoney({ value, className }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const from = shown;
    const to = value;
    if (from === to) return undefined;
    const start = performance.now();
    const dur = 220;
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <strong className={className}>{fmtILS(shown)}</strong>;
}

// ─────────────────────────────────────────────────────────────────
// MoneyCard — a full-width card with an input-formatted-as-currency.
// Uses IL locale thousand separators; caret position is preserved
// across formatting because we format only on blur and let the raw
// digits flow on input.
function MoneyCard({ label, hint, value, onChange, placeholder, compact = false }) {
  const displayed = value == null || value === ''
    ? ''
    : Number(value).toLocaleString('he-IL');
  const onInput = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '');
    onChange(raw ? parseInt(raw, 10) : null);
  };
  return (
    <section className={`msc-card ${compact ? 'msc-card-compact' : ''}`}>
      <div className="msc-card-labels">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </div>
      <div className="msc-money">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9,]*"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          dir="ltr"
          value={displayed}
          onChange={onInput}
          placeholder={placeholder}
          className="msc-money-input"
        />
        <span className="msc-money-unit">₪</span>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// PercentCard — a card with ±0.25% pill steppers around the value,
// plus a trailing VAT-included toggle.
function PercentCard({ label, hint, value, onChange, vatIncluded, onVatIncludedChange }) {
  const num = parsePercent(value) ?? 0;
  const step = (delta) => {
    haptics.select?.();
    const next = Math.max(0, +(num + delta).toFixed(3));
    onChange(String(next));
  };
  return (
    <section className="msc-card">
      <div className="msc-card-labels">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </div>
      <div className="msc-pct">
        <button type="button" className="msc-pct-step" onClick={() => step(-0.25)} aria-label="הפחת">
          <Minus size={14} />
        </button>
        <div className="msc-pct-value">
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.]*"
            enterKeyHint="done"
            dir="ltr"
            className="msc-pct-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
          />
          <span className="msc-pct-unit">%</span>
        </div>
        <button type="button" className="msc-pct-step" onClick={() => step(0.25)} aria-label="הוסף">
          <Plus size={14} />
        </button>
      </div>
      <label className="msc-vat">
        <input
          type="checkbox"
          checked={vatIncluded}
          onChange={(e) => { haptics.select?.(); onVatIncludedChange(e.target.checked); }}
        />
        <span>האחוז כולל מע״מ</span>
      </label>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// LawyerCard — like PercentCard but with a sub-switcher between
// "percent of price" and "fixed ₪ amount" modes.
function LawyerCard({
  mode, onModeChange, pctText, onPctChange, amount, onAmountChange,
  vatIncluded, onVatIncludedChange,
}) {
  const num = parsePercent(pctText) ?? 0;
  const step = (delta) => {
    haptics.select?.();
    const next = Math.max(0, +(num + delta).toFixed(3));
    onPctChange(String(next));
  };
  return (
    <section className="msc-card">
      <div className="msc-card-labels">
        <strong>שכר טרחת עו״ד</strong>
        <small>בד״כ 0.5% – 1% + מע״מ או סכום קבוע</small>
      </div>
      <div className="msc-sub-seg" role="radiogroup" aria-label="סוג שכר טרחה">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'percent'}
          className={`msc-sub-opt ${mode === 'percent' ? 'sel' : ''}`}
          onClick={() => { haptics.select?.(); onModeChange('percent'); }}
        >אחוז</button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'fixed'}
          className={`msc-sub-opt ${mode === 'fixed' ? 'sel' : ''}`}
          onClick={() => { haptics.select?.(); onModeChange('fixed'); }}
        >סכום קבוע</button>
      </div>

      {mode === 'percent' ? (
        <div className="msc-pct">
          <button type="button" className="msc-pct-step" onClick={() => step(-0.25)}><Minus size={14} /></button>
          <div className="msc-pct-value">
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9.]*"
              enterKeyHint="done"
              dir="ltr"
              className="msc-pct-input"
              value={pctText}
              onChange={(e) => onPctChange(e.target.value)}
              aria-label="אחוז שכר טרחה"
            />
            <span className="msc-pct-unit">%</span>
          </div>
          <button type="button" className="msc-pct-step" onClick={() => step(0.25)}><Plus size={14} /></button>
        </div>
      ) : (
        <div className="msc-money msc-money-inline">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9,]*"
            enterKeyHint="done"
            dir="ltr"
            className="msc-money-input"
            value={amount == null || amount === '' ? '' : Number(amount).toLocaleString('he-IL')}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d]/g, '');
              onAmountChange(raw ? parseInt(raw, 10) : null);
            }}
            placeholder="5,000"
            aria-label="שכר טרחה קבוע"
          />
          <span className="msc-money-unit">₪</span>
        </div>
      )}

      <label className="msc-vat">
        <input
          type="checkbox"
          checked={vatIncluded}
          onChange={(e) => { haptics.select?.(); onVatIncludedChange(e.target.checked); }}
        />
        <span>{mode === 'percent' ? 'האחוז כולל מע״מ' : 'הסכום כולל מע״מ'}</span>
      </label>
    </section>
  );
}
