import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Calculator,
  Info,
  Plus,
  Minus,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Share2,
} from 'lucide-react';
import { sellerCalc } from '../lib/sellerCalc';
import { NumberField, Segmented } from '../components/SmartFields';
import { useViewportMobile } from '../hooks/mobile';
import MobileSellerCalculator from '../mobile/pages/MobileSellerCalculator';
import './SellerCalculator.css';

// Formatting helpers — IL locale, ₪ prefix, no fractional shekel.
const ils = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});
function formatILS(n) {
  if (!Number.isFinite(n)) return ils.format(0);
  return ils.format(Math.round(n));
}

// Parse a percent input that may or may not have a trailing % sign.
// "2", "2%", " 2.5 % " → 2.5
function parsePercent(raw) {
  if (raw === '' || raw == null) return null;
  const s = String(raw).replace('%', '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Parse a currency input — accepts "1,234,567" or "1234567". Kept
// available for callers that format user-typed strings.
// eslint-disable-next-line no-unused-vars
function parseCurrency(raw) {
  if (raw === '' || raw == null) return null;
  const s = String(raw).replace(/[^\d.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Debounce hook
function useDebounced(value, ms = 150) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const INITIAL = {
  mode: 'forward',
  // Currency fields are NUMBERS (rendered with comma-separators by
  // NumberField). Percent fields stay strings because they accept
  // decimal input and the optional "%" suffix.
  amount: null,
  commissionPctText: '2',
  commissionVatIncluded: false,
  lawyerMode: 'percent',
  lawyerPctText: '0.5',
  lawyerAmount: null,
  lawyerVatIncluded: false,
  additional: null,
  advancedOpen: false,
};

export default function SellerCalculator() {
  const isMobile = useViewportMobile(820);
  // The iPhone app gets a purpose-built visual — dark charcoal canvas,
  // gold hero number, stacked receipt-style cards. The web layout
  // stays unchanged so existing desktop muscle memory is preserved.
  if (isMobile) return <MobileSellerCalculator />;
  return <DesktopSellerCalculator />;
}

function DesktopSellerCalculator() {
  const [s, setS] = useState(INITIAL);
  const update = useCallback((k, v) => setS((p) => ({ ...p, [k]: v })), []);

  // Debounced inputs feed into the pure calc — keeps the live count-up
  // smooth while typing without thrashing on every keystroke.
  const debounced = useDebounced(s, 150);

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

  const isForward = s.mode === 'forward';
  const heroLabel = isForward ? 'נשאר ביד' : 'מחיר סגירה';
  const heroValue = isForward ? result.net : result.listingPrice;

  const reset = () => setS(INITIAL);

  return (
    <div className="sc-page" dir="rtl">
      <header className="sc-head">
        <div className="sc-head-title">
          <Calculator size={22} />
          <h1>מחשבון</h1>
        </div>
        <p className="sc-head-sub">חישוב נטו / מחיר סגירה אחרי עמלת תיווך, שכר טרחת עו״ד ועלויות נוספות.</p>
      </header>

      <div className="sc-mode">
        <Segmented
          value={s.mode}
          onChange={(v) => update('mode', v)}
          ariaLabel="מצב חישוב"
          options={[
            { value: 'forward', label: 'מחיר → נטו' },
            { value: 'reverse', label: 'נטו → מחיר סגירה' },
          ]}
        />
      </div>

      <div className="sc-grid">
        {/* Inputs */}
        <section className="sc-card sc-inputs">
          <div className="sc-row">
            <label className="sc-label" htmlFor="sc-amount">
              {isForward ? 'מחיר (₪)' : 'הסכום שאת/ה רוצה לקבל ביד (₪)'}
            </label>
            {/* NumberField formats the value with IL thousand separators
                live as you type — 280000 → 280,000 — and preserves caret
                position across format ticks. */}
            <NumberField
              id="sc-amount"
              value={s.amount}
              onChange={(v) => update('amount', v)}
              unit="₪"
              placeholder={isForward ? '2,800,000' : '2,700,000'}
              inputClassName="sc-input-amount"
              aria-label={isForward ? 'מחיר' : 'סכום נטו'}
              autoFocus
            />
          </div>

          <div className="sc-row">
            <label className="sc-label" htmlFor="sc-commission">
              עמלת תיווך
              <Tooltip>אחוז מהסכום שמקבל הסוכן/ת. ברירת המחדל בישראל: 1–2% + מע״מ.</Tooltip>
            </label>
            <PercentField
              id="sc-commission"
              value={s.commissionPctText}
              onChange={(v) => update('commissionPctText', v)}
            />
            <label className="sc-toggle">
              <input
                type="checkbox"
                checked={s.commissionVatIncluded}
                onChange={(e) => update('commissionVatIncluded', e.target.checked)}
              />
              <span>האחוז כולל מע״מ</span>
            </label>
          </div>

          <div className="sc-row">
            <label className="sc-label">שכר טרחת עו״ד</label>
            <Segmented
              value={s.lawyerMode}
              onChange={(v) => update('lawyerMode', v)}
              ariaLabel="סוג שכר טרחה"
              options={[
                { value: 'percent', label: 'אחוז' },
                { value: 'fixed', label: 'סכום קבוע' },
              ]}
            />
            {s.lawyerMode === 'percent' ? (
              <PercentField
                value={s.lawyerPctText}
                onChange={(v) => update('lawyerPctText', v)}
              />
            ) : (
              <NumberField
                value={s.lawyerAmount}
                onChange={(v) => update('lawyerAmount', v)}
                unit="₪"
                placeholder="5,000"
                aria-label="שכר טרחה (סכום קבוע)"
              />
            )}
            <label className="sc-toggle">
              <input
                type="checkbox"
                checked={s.lawyerVatIncluded}
                onChange={(e) => update('lawyerVatIncluded', e.target.checked)}
              />
              <span>הסכום כולל מע״מ</span>
            </label>
          </div>

          <button
            type="button"
            className="sc-advanced-toggle"
            onClick={() => update('advancedOpen', !s.advancedOpen)}
          >
            {s.advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            עלויות נוספות
          </button>

          {s.advancedOpen && (
            <div className="sc-advanced">
              <div className="sc-row">
                <label className="sc-label">
                  עלויות נוספות (₪)
                  <Tooltip>
                    מס שבח, אגרת טאבו, יועץ משכנתאות וכל הוצאה נוספת. את מס שבח לא מחשבים אוטומטית
                    כי הוא תלוי בפטורים — מלא/י כאן את האומדן שלך.
                  </Tooltip>
                </label>
                <NumberField
                  value={s.additional}
                  onChange={(v) => update('additional', v)}
                  unit="₪"
                  placeholder="0"
                  aria-label="עלויות נוספות"
                />
              </div>
            </div>
          )}

          <button type="button" className="sc-reset" onClick={reset} title="אפס את כל השדות">
            <RotateCcw size={14} /> אפס
          </button>
        </section>

        {/* Summary */}
        <section className="sc-card sc-summary">
          {result.error ? (
            <div className="sc-error">
              <AlertCircle size={16} />
              {result.error === 'fees_exceed_100_percent'
                ? 'העמלות עולות על 100% מהמחיר — לא ניתן לחשב מחיר סגירה.'
                : result.error === 'fees_exceed_price'
                  ? 'העמלות גבוהות יותר מהמחיר — בדוק את הקלט.'
                  : 'הקלט אינו תקין.'}
            </div>
          ) : (
            <>
              <div className="sc-hero">
                <span className="sc-hero-label">{heroLabel}</span>
                <strong className="sc-hero-value">
                  <AnimatedCount value={heroValue} />
                </strong>
              </div>

              <ul className="sc-breakdown">
                <Line
                  label={isForward ? 'מחיר' : 'מחיר סגירה מחושב'}
                  value={formatILS(isForward ? (s.amount || 0) : result.listingPrice)}
                  emphasis
                />
                <Line
                  label="עמלת תיווך (לפני מע״מ)"
                  value={formatILS(result.brokerageBase)}
                />
                {result.brokerageVat > 0 && (
                  <Line
                    label="מע״מ עמלת תיווך"
                    value={formatILS(result.brokerageVat)}
                    sub
                  />
                )}
                <Line
                  label={s.lawyerMode === 'percent' ? 'שכר טרחת עו״ד (לפני מע״מ)' : 'שכר טרחת עו״ד (סכום קבוע)'}
                  value={formatILS(result.lawyerBase)}
                />
                {result.lawyerVat > 0 && (
                  <Line
                    label="מע״מ שכר טרחת עו״ד"
                    value={formatILS(result.lawyerVat)}
                    sub
                  />
                )}
                {result.additional > 0 && (
                  <Line label="עלויות נוספות" value={formatILS(result.additional)} />
                )}
                <li className="sc-divider" />
                <Line
                  label="נשאר ביד"
                  value={formatILS(result.net)}
                  emphasis
                />
                <Line
                  label="סך לסוכן (כולל מע״מ)"
                  value={formatILS(result.totalToAgent)}
                  emphasis
                />
              </ul>

              {/* Share-to-seller — pre-builds a clean WhatsApp message
                  with the breakdown so the agent can send the seller
                  the exact numbers they just walked them through. The
                  most common follow-up step after a pricing chat. */}
              {result.net > 0 && (
                <div className="sc-share-row">
                  {/* F-25 — same-tab navigation on desktop too. Agents
                      typically have a pinned WhatsApp Web tab already; a
                      new window forces them to deal with two WA tabs. */}
                  <a
                    href={buildShareUrl({ result, mode: s.mode })}
                    target="_self"
                    rel="noopener noreferrer"
                    className="sc-share-cta"
                  >
                    <Share2 size={16} />
                    שתף לבעלים בוואטסאפ
                  </a>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────

function PercentField({ id, value, onChange }) {
  const num = parsePercent(value) ?? 0;
  const step = (delta) => {
    const next = Math.max(0, +(num + delta).toFixed(3));
    onChange(String(next));
  };
  return (
    <div className="sc-percent">
      <button type="button" className="sc-step" onClick={() => step(-0.25)} aria-label="הפחת 0.25%">
        <Minus size={12} />
      </button>
      <input
        id={id}
        className="sc-input sc-input-pct"
        inputMode="decimal"
        enterKeyHint="done"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
      />
      <span className="sc-percent-suffix">%</span>
      <button type="button" className="sc-step" onClick={() => step(0.25)} aria-label="הוסף 0.25%">
        <Plus size={12} />
      </button>
    </div>
  );
}

function Line({ label, value, sub, emphasis }) {
  return (
    <li className={`sc-line ${sub ? 'sc-line-sub' : ''} ${emphasis ? 'sc-line-emphasis' : ''}`}>
      <span className="sc-line-label">{label}</span>
      <span className="sc-line-value">{value}</span>
    </li>
  );
}

// Build a wa.me URL with a clean Hebrew breakdown the agent can send
// the seller. The text mirrors the on-screen breakdown so there are no
// "wait, what was that number?" moments. Plain text — wa.me URL-decodes
// the body so newlines + numbers come through cleanly.
function buildShareUrl({ result, mode }) {
  if (!result || result.error || !result.net) return '#';
  const isFwd = mode === 'forward';
  const lines = [
    isFwd ? 'סיכום עמלות מהמכירה:' : 'מחיר סגירה מומלץ:',
    '',
    isFwd
      ? `מחיר: ₪${Math.round(result.listingPrice).toLocaleString('he-IL')}`
      : `מחיר סגירה: ₪${Math.round(result.listingPrice).toLocaleString('he-IL')}`,
    `עמלת תיווך: ₪${Math.round(result.brokerage).toLocaleString('he-IL')}`,
    `שכ"ט עו"ד: ₪${Math.round(result.lawyer).toLocaleString('he-IL')}`,
  ];
  if (result.additional > 0) {
    lines.push(`עלויות נוספות: ₪${Math.round(result.additional).toLocaleString('he-IL')}`);
  }
  lines.push('—');
  lines.push(`נשאר ביד: ₪${Math.round(result.net).toLocaleString('he-IL')}`);
  const text = lines.join('\n');
  // wa.me works on web (opens web.whatsapp.com) and on the native app
  // when WhatsApp is installed. No phone — the user picks a contact
  // inside WhatsApp.
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function Tooltip({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="sc-tip">
      <button
        type="button"
        className="sc-tip-trigger"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-label="הסבר"
      >
        <Info size={12} />
      </button>
      {open && <span className="sc-tip-body">{children}</span>}
    </span>
  );
}

// Animated count-up — quick (~200ms) tween between the previous and
// current value. Uses requestAnimationFrame so it's free of layout
// thrash and respects prefers-reduced-motion via CSS at the page level.
function AnimatedCount({ value }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const from = shown;
    const to = value;
    const dur = 200;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setShown(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{formatILS(shown)}</>;
}
