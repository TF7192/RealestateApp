// Yad2Import — sprint-8.x port of the claude.ai/design "Estia Refined
// Pages" bundle (2026-04-24). Backend unchanged: same /agency/preview
// + /agency/import + /quota + /jobs/:id surface driving the three
// steps (paste → review → done). Re-laid-out with inline DT styles to
// match the Cream & Gold palette used across Dashboard / Team /
// Properties — no external CSS, no new dependencies.
//
// Scan lifecycle still lives in yad2ScanStore so the agent can navigate
// away mid-scan and get notified on completion; returning mid-review
// still shows the last scan's results until they explicitly start a
// new one.

import { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Download, ArrowRight, AlertCircle, Check, Loader2,
  Building2, Store, Home as HomeIcon, ExternalLink, Clock, Lock,
  RefreshCw, Sparkles, Link2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';
import { formatFloor } from '../lib/formatFloor';
import {
  getScanState, subscribeScan, startScan, clearScan, setScanQuota, startImport,
} from '../lib/yad2ScanStore';
import { useViewportMobile } from '../hooks/mobile';

// ─── DT tokens (lifted from the bundle's shell.jsx) ──────────
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

const SECTION_LABEL = { forsale: 'מכירה', rent: 'השכרה', commercial: 'מסחרי' };
const SECTION_ICON  = { forsale: HomeIcon, rent: Building2, commercial: Store };

export default function Yad2Import() {
  const navigate = useNavigate();
  const toast = useToast();
  const isMobile = useViewportMobile(820);
  const [scan, setScan] = useState(getScanState());
  useEffect(() => subscribeScan(setScan), []);

  const [url, setUrl] = useState(scan.url || '');
  const [step, setStep] = useState(scan.result ? 'review' : 'paste');
  const [busyImport, setBusyImport] = useState(false);
  const [importErr, setImportErr] = useState(null);
  const [result, setResult] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const initPickedRef = useRef(false);

  // Derived shape for the review UI.
  const extracted       = scan.result?.listings ?? [];
  const agency          = scan.result?.agency ?? null;
  const sections        = scan.result?.sections ?? [];
  const truncated       = !!scan.result?.truncated;
  const alreadyImported = scan.result?.alreadyImported ?? {};
  const quota           = scan.quota ?? null;

  // Initialize `picked` once per distinct scan result so manual
  // de-selects are preserved on leave & return mid-review.
  useEffect(() => {
    if (!scan.result) return;
    if (initPickedRef.current) return;
    initPickedRef.current = true;
    setPicked(new Set(
      extracted
        .filter((l) => !alreadyImported[l.sourceId])
        .map((l) => l.sourceId),
    ));
    setStep('review');
  }, [scan.result]);

  // Fresh quota on mount so the chip is accurate even when the store
  // has a stale quota from an older scan.
  useEffect(() => {
    api.yad2Quota().then(setScanQuota).catch(() => {});
  }, []);

  // Y-4 — once the import succeeds, reset the scan store + URL input so
  // the agent can't immediately re-import the same agency by clicking
  // "סרוק" again.
  useEffect(() => {
    if (step !== 'done') return;
    clearScan();
    initPickedRef.current = false;
    setPicked(new Set());
    setUrl('');
  }, [step]);

  // Group by section so the review screen reads as
  // "מכירה (12), השכרה (5), מסחרי (2)".
  const grouped = useMemo(() => {
    const out = { forsale: [], rent: [], commercial: [] };
    for (const l of extracted) {
      (out[l.section] || (out[l.section] = [])).push(l);
    }
    return out;
  }, [extracted]);

  const togglePick = (id) => {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const togglePickSection = (section) => {
    const inSection = grouped[section] || [];
    const allOn = inSection.every((l) => picked.has(l.sourceId));
    setPicked((s) => {
      const next = new Set(s);
      inSection.forEach((l) => allOn ? next.delete(l.sourceId) : next.add(l.sourceId));
      return next;
    });
  };

  const beginScan = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error?.('נא להדביק כתובת של סוכנות מ-Yad2');
      return;
    }
    if (quota && quota.remaining === 0) {
      // Quota chip already shows the countdown but the user just
      // clicked the (briefly enabled) primary CTA — surface the reason
      // explicitly so the click doesn't appear silently swallowed.
      const minutesLeft = quota?.resetAt
        ? Math.max(0, Math.ceil((new Date(quota.resetAt).getTime() - Date.now()) / 60_000))
        : 0;
      toast.error?.(`הגעת למכסה השעתית (${quota.limit}). מתחדשת בעוד ${minutesLeft} דק׳.`);
      return;
    }
    initPickedRef.current = false;
    // F-24 — do NOT reset step to 'paste' here; the component already
    // renders the paste step and re-setting causes a flash.
    startScan(trimmed).catch(() => { /* handled via store */ });
    toast.info?.('הסריקה החלה — תוכל/י להמשיך לעבוד. תקבל/י התראה בסיום.');
  };

  const resetAndRescan = () => {
    clearScan();
    initPickedRef.current = false;
    setPicked(new Set());
    setStep('paste');
    setResult(null);
    setImportErr(null);
    setUrl('');
  };

  const importPicked = async () => {
    setImportErr(null);
    setBusyImport(true);
    try {
      const toImport = extracted.filter((l) => picked.has(l.sourceId));
      const res = await startImport(toImport);
      setResult(res);
      setStep('done');
      toast.success(`יובאו ${res.created.length} נכסים`);
    } catch (e) {
      setImportErr(e.message || 'הייבוא נכשל');
    } finally {
      setBusyImport(false);
    }
  };

  const isRunning = scan.status === 'running';
  const err = importErr || (scan.status === 'error' ? scan.error : null);

  const pad = isMobile ? '18px 14px 28px' : 28;

  return (
    <div dir="rtl" style={{ ...FONT, padding: pad, color: DT.ink, minHeight: '100%' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {/* ── Header ── */}
        <div style={{ marginBottom: isMobile ? 14 : 20 }}>
          <Link
            to="/properties"
            aria-label="חזרה לנכסים"
            style={{
              ...FONT, display: 'inline-flex', alignItems: 'center', gap: 6,
              color: DT.muted, textDecoration: 'none', fontSize: 12, fontWeight: 600,
              marginBottom: 8,
            }}
          >
            <ArrowRight size={14} />
            חזור לנכסים
          </Link>

          <div style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap',
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                flexWrap: 'wrap',
              }}>
                <h1 style={{
                  fontSize: isMobile ? 22 : 28,
                  fontWeight: 800,
                  letterSpacing: isMobile ? -0.5 : -0.7,
                  margin: 0,
                }}>
                  ייבוא נכסים מ-Yad2
                </h1>
                <span style={{
                  background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
                  color: DT.ink,
                  padding: '3px 10px',
                  borderRadius: 99,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  boxShadow: '0 2px 6px rgba(180,139,76,0.25)',
                }}>
                  <Sparkles size={11} aria-hidden="true" /> BETA
                </span>
              </div>
              <div style={{
                fontSize: isMobile ? 12.5 : 13.5,
                color: DT.muted,
                marginTop: 6,
                lineHeight: 1.6,
                maxWidth: 640,
              }}>
                הדבק קישור לדף הסוכנות שלך ב-Yad2 — נסרוק אוטומטית את כל הנכסים
                (מכירה · השכרה · מסחרי), ונוריד את התמונות ל-Estia.
              </div>
            </div>
          </div>
        </div>

        {err && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(185,28,28,0.08)',
            border: `1px solid rgba(185,28,28,0.22)`,
            color: DT.danger, fontSize: 13, fontWeight: 600,
            marginBottom: 14,
          }}>
            <AlertCircle size={14} /> {err}
          </div>
        )}

        {step === 'paste' && (
          <PasteStep
            isMobile={isMobile}
            quota={quota}
            scan={scan}
            agency={agency}
            url={url}
            setUrl={setUrl}
            isRunning={isRunning}
            beginScan={beginScan}
            onContinue={() => setStep('review')}
          />
        )}

        {step === 'review' && scan.result && (
          <ReviewStep
            isMobile={isMobile}
            extracted={extracted}
            agency={agency}
            sections={sections}
            truncated={truncated}
            alreadyImported={alreadyImported}
            grouped={grouped}
            picked={picked}
            togglePick={togglePick}
            togglePickSection={togglePickSection}
            busyImport={busyImport}
            importPicked={importPicked}
            resetAndRescan={resetAndRescan}
          />
        )}

        {step === 'done' && result && (
          <DoneStep
            isMobile={isMobile}
            result={result}
            onGoProperties={() => navigate('/properties')}
            onResetAndRescan={resetAndRescan}
          />
        )}
      </div>
    </div>
  );
}

// ─── Paste step ──────────────────────────────────────────────
function PasteStep({
  isMobile, quota, scan, agency, url, setUrl, isRunning, beginScan, onContinue,
}) {
  const canScan = url.trim() && !isRunning && !(quota && quota.remaining === 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <QuotaChip quota={quota} isMobile={isMobile} />

      {/* Cached-result card — mid-session return */}
      {scan.status === 'done' && scan.result && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px',
          borderRadius: 12,
          border: `1px dashed ${DT.gold}`,
          background: DT.goldSoft,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: DT.white, display: 'grid', placeItems: 'center',
            color: DT.gold, flexShrink: 0,
          }}>
            <RefreshCw size={15} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: DT.ink }}>
              סריקה אחרונה שמורה
            </div>
            <div style={{ fontSize: 12, color: DT.muted, marginTop: 2 }}>
              {scan.result.listings?.length ?? 0} נכסים · {agency?.name || 'סוכנות'} ·{' '}
              לפני {relativeMinutes(scan.finishedAt)}
            </div>
          </div>
          <button
            type="button"
            onClick={onContinue}
            style={primaryBtn({ small: true })}
          >
            המשך לבחירה
          </button>
        </div>
      )}

      {/* Main paste card */}
      <section style={{
        background: DT.white,
        border: `1px solid ${DT.border}`,
        borderRadius: 14,
        padding: isMobile ? 16 : 22,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: DT.goldDark, fontWeight: 800, letterSpacing: 1,
        }}>
          <Link2 size={11} aria-hidden="true" />
          שלב 1 · קישור לסוכנות
        </div>

        <label
          htmlFor="y2-url"
          style={{ fontSize: 13, fontWeight: 700, color: DT.ink2, margin: 0 }}
        >
          הדביקו את כתובת דף הסוכנות שלכם ב-Yad2
        </label>

        <input
          id="y2-url"
          type="url"
          inputMode="url"
          enterKeyHint="go"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoComplete="off"
          placeholder="https://www.yad2.co.il/realestate/agency/7098700/forsale"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canScan) beginScan(); }}
          style={{
            ...FONT,
            width: '100%',
            padding: '14px 16px',
            border: `1px solid ${DT.borderStrong}`,
            borderRadius: 12,
            background: DT.cream4,
            fontSize: 16, // iOS zoom guard
            color: DT.ink,
            outline: 'none',
            direction: 'ltr',
            textAlign: 'start',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = DT.gold;
            e.target.style.background = DT.white;
            e.target.style.boxShadow = `0 0 0 3px ${DT.goldSoft}`;
          }}
          onBlur={(e) => {
            e.target.style.borderColor = DT.borderStrong;
            e.target.style.background = DT.cream4;
            e.target.style.boxShadow = 'none';
          }}
        />

        <button
          type="button"
          disabled={!canScan}
          onClick={beginScan}
          style={{
            ...primaryBtn(),
            minHeight: isMobile ? 52 : 46,
            fontSize: isMobile ? 15 : 14,
            justifyContent: 'center',
            opacity: canScan ? 1 : 0.55,
            cursor: canScan ? 'pointer' : 'not-allowed',
          }}
        >
          {isRunning
            ? <Loader2 size={15} style={spin} />
            : <Download size={15} />}
          {isRunning
            ? 'סורק ברקע — ניתן להמשיך לעבוד'
            : (quota && quota.remaining === 0
                ? 'הגעת למכסה השעתית'
                : 'סרוק את כל הנכסים')}
        </button>

        <div style={{
          fontSize: 12, color: DT.muted, lineHeight: 1.6,
          margin: 0, paddingTop: 2,
        }}>
          כל קטגוריה (מכירה / השכרה / מסחרי) נסרקת בנפרד, כולל כל העמודים.
          הסריקה רצה ברקע — אפשר לעזוב את העמוד; תתקבל התראה כשהיא תסתיים.
        </div>

        {/* Yad2 scans can run 60-180 s while Playwright walks each
            category page. The backend doesn't stream progress yet, so
            this is a client-side time-based estimate: a smooth
            asymptotic fill that approaches (but never reaches) 95%
            and a rotating Hebrew caption of the expected stages. It
            snaps to 100% when the poller resolves. The agent sees
            motion + knows roughly where things are. */}
        {isRunning && scan.startedAt && (
          <Yad2ScanProgress
            startedAt={scan.startedAt}
            url={scan.url}
            progress={scan.progress}
          />
        )}

        {/* If a scan has been "running" for over 2 minutes, the job
            almost certainly died (server restart or a stalled Playwright
            page). Surface an explicit reset so the agent isn't stuck on
            a perma-spinner. */}
        {isRunning && scan.startedAt && (Date.now() - scan.startedAt) > 120_000 && (
          <button
            type="button"
            onClick={() => { try { clearScan(); } catch { /* ignore */ } }}
            style={{
              ...FONT,
              alignSelf: 'flex-start',
              background: 'transparent',
              border: `1px solid ${DT.border}`,
              color: DT.ink,
              padding: '6px 12px', borderRadius: 8,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              marginTop: 4,
            }}
          >
            בטל סריקה שנתקעה
          </button>
        )}
      </section>
    </div>
  );
}

// ─── Review step ─────────────────────────────────────────────
function ReviewStep({
  isMobile, extracted, agency, sections, truncated, alreadyImported,
  grouped, picked, togglePick, togglePickSection,
  busyImport, importPicked, resetAndRescan,
}) {
  const importedCount = Object.keys(alreadyImported).length;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 14,
      paddingBottom: isMobile ? 96 : 0,
    }}>
      {/* Review header card */}
      <section style={{
        background: DT.white,
        border: `1px solid ${DT.border}`,
        borderRadius: 14,
        padding: isMobile ? 16 : 20,
      }}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 12,
          alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: isMobile ? 18 : 22, fontWeight: 800,
              letterSpacing: -0.5, color: DT.ink,
            }}>
              {extracted.length} נכסים נמצאו
              {agency?.name && (
                <span style={{
                  color: DT.muted, fontWeight: 600, fontSize: isMobile ? 13 : 15,
                  marginInlineStart: 8,
                }}>· {agency.name}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 4,
              padding: '5px 12px', borderRadius: 99,
              background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
              color: DT.ink,
              fontSize: 14, fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              boxShadow: '0 2px 6px rgba(180,139,76,0.25)',
            }}>
              {picked.size}
              <span style={{ fontSize: 11, fontWeight: 600 }}>חדשים לייבוא</span>
            </span>
            {importedCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'baseline', gap: 4,
                padding: '5px 12px', borderRadius: 99,
                background: DT.cream2, color: DT.ink2,
                border: `1px solid ${DT.border}`,
                fontSize: 14, fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {importedCount}
                <span style={{ fontSize: 11, fontWeight: 600 }}>כבר במערכת</span>
              </span>
            )}
          </div>
        </div>

        {truncated && (
          <div style={{
            marginTop: 10,
            fontSize: 12, color: DT.goldDark,
            background: DT.goldSoft,
            padding: '6px 10px', borderRadius: 8,
          }}>
            הוצגו עד 100 נכסים — הסוכנות עשויה להכיל עוד.
          </div>
        )}

        {sections.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12,
          }}>
            {sections.map((s) => {
              const Icon = SECTION_ICON[s.section] || HomeIcon;
              return (
                <span
                  key={s.section}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 99,
                    background: DT.cream4,
                    border: `1px solid ${DT.border}`,
                    fontSize: 12, color: DT.muted, fontWeight: 600,
                  }}
                >
                  <Icon size={12} style={{ color: DT.gold }} aria-hidden="true" />
                  <strong style={{ color: DT.ink, fontWeight: 700 }}>
                    {SECTION_LABEL[s.section]}
                  </strong>
                  <span>{s.totalListings} / {s.totalPages || '?'} עמ׳</span>
                  {s.error && (
                    <em style={{ color: DT.danger, fontStyle: 'normal' }}>
                      · {s.error}
                    </em>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </section>

      {/* Listing groups */}
      {Object.entries(grouped).map(([section, list]) => {
        if (!list || list.length === 0) return null;
        const Icon = SECTION_ICON[section] || HomeIcon;
        const allOn = list.every((l) => picked.has(l.sourceId));
        return (
          <section
            key={section}
            style={{
              background: DT.white,
              border: `1px solid ${DT.border}`,
              borderRadius: 14,
              padding: isMobile ? 14 : 18,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              paddingBottom: 10, borderBottom: `1px dashed ${DT.border}`,
            }}>
              <button
                type="button"
                onClick={() => togglePickSection(section)}
                title={allOn ? 'בטל את הבחירה בקטגוריה' : 'בחר את כל הקטגוריה'}
                style={{
                  ...FONT,
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: 'transparent', border: 'none', padding: 0,
                  cursor: 'pointer', color: DT.ink,
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: allOn ? DT.gold : DT.white,
                  border: `1.5px solid ${allOn ? DT.gold : DT.borderStrong}`,
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}>
                  {allOn && <Check size={13} color={DT.white} strokeWidth={3} />}
                </span>
                <span style={{
                  color: DT.gold, display: 'inline-flex', alignItems: 'center',
                }}>
                  <Icon size={16} aria-hidden="true" />
                </span>
                <strong style={{ fontSize: 15, fontWeight: 800 }}>
                  {SECTION_LABEL[section]}
                </strong>
                <span style={{ color: DT.muted, fontSize: 12.5, fontWeight: 600 }}>
                  ({list.length})
                </span>
              </button>
            </div>

            <ul style={{
              listStyle: 'none', margin: 0, padding: 0,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {list.map((l) => {
                const chosen = picked.has(l.sourceId);
                const importedPropertyId = alreadyImported[l.sourceId];
                const isImported = !!importedPropertyId;
                if (isImported) {
                  return (
                    <ListingRowImported
                      key={l.sourceId}
                      listing={l}
                      propertyId={importedPropertyId}
                      isMobile={isMobile}
                    />
                  );
                }
                return (
                  <ListingRow
                    key={l.sourceId}
                    listing={l}
                    chosen={chosen}
                    onToggle={() => togglePick(l.sourceId)}
                    isMobile={isMobile}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* Action bar — sticky on mobile, inline on desktop */}
      <ReviewActions
        isMobile={isMobile}
        picked={picked}
        busyImport={busyImport}
        importPicked={importPicked}
        resetAndRescan={resetAndRescan}
      />
    </div>
  );
}

function ListingRow({ listing: l, chosen, onToggle, isMobile }) {
  const thumb = isMobile ? 80 : 72;
  const title =
    l.title ||
    `${l.street || ''}${l.city ? `, ${l.city}` : ''}`.trim() ||
    'נכס מ-Yad2';
  const meta = [
    l.type,
    l.rooms ? `${l.rooms} חד׳` : null,
    l.sqm ? `${l.sqm} מ״ר` : null,
    l.floor != null ? `קומה ${formatFloor(l.floor)}` : null,
    l.price ? `₪${Number(l.price).toLocaleString('he-IL')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <li style={{
      border: `1px solid ${chosen ? DT.gold : DT.border}`,
      borderRadius: 12,
      background: chosen ? DT.goldSoft : DT.cream4,
      transition: 'border-color 0.15s ease, background 0.15s ease',
    }}>
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: isMobile ? 12 : 12,
        cursor: 'pointer',
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 6,
          background: chosen ? DT.gold : DT.white,
          border: `1.5px solid ${chosen ? DT.gold : DT.borderStrong}`,
          display: 'grid', placeItems: 'center', flexShrink: 0,
          marginTop: 4,
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}>
          {chosen && <Check size={13} color={DT.white} strokeWidth={3} />}
          <input
            type="checkbox"
            checked={chosen}
            onChange={onToggle}
            style={{
              position: 'absolute', opacity: 0,
              width: 0, height: 0, pointerEvents: 'none',
            }}
          />
        </span>

        {l.coverImage && (
          <div style={{
            position: 'relative',
            width: thumb, height: thumb,
            flexShrink: 0,
            borderRadius: 10,
            overflow: 'hidden',
            background: DT.cream3,
          }}>
            <img
              src={l.coverImage}
              alt=""
              loading="lazy"
              decoding="async"
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover', display: 'block',
              }}
            />
            {(l.images?.length || 0) > 1 && (
              <span style={{
                position: 'absolute', bottom: 4, insetInlineEnd: 4,
                padding: '2px 7px',
                background: 'rgba(30,26,20,0.75)',
                color: DT.white,
                fontSize: 10, fontWeight: 700,
                borderRadius: 99,
                pointerEvents: 'none',
              }}>{l.images.length} תמונות</span>
            )}
          </div>
        )}

        <div style={{
          display: 'flex', flexDirection: 'column', gap: 3,
          minWidth: 0, flex: 1,
        }}>
          <strong style={{
            fontSize: isMobile ? 14.5 : 14, color: DT.ink, fontWeight: 700,
            lineHeight: 1.3,
          }}>{title}</strong>
          <span style={{
            fontSize: 12.5, color: DT.ink2, lineHeight: 1.5,
          }}>{meta || '—'}</span>
          {l.tags?.length > 0 && (
            <span style={{
              fontSize: 11, color: DT.gold, marginTop: 2, fontWeight: 600,
            }}>{l.tags.slice(0, 4).join(' · ')}</span>
          )}
        </div>
      </label>
    </li>
  );
}

function ListingRowImported({ listing: l, propertyId, isMobile }) {
  const thumb = isMobile ? 80 : 72;
  const title =
    l.title ||
    `${l.street || ''}${l.city ? `, ${l.city}` : ''}`.trim() ||
    'נכס מ-Yad2';
  const meta = [
    l.type,
    l.rooms ? `${l.rooms} חד׳` : null,
    l.sqm ? `${l.sqm} מ״ר` : null,
    l.price ? `₪${Number(l.price).toLocaleString('he-IL')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <li style={{
      border: `1px dashed ${DT.gold}`,
      borderRadius: 12,
      background: DT.goldSoft,
      opacity: 0.92,
    }}>
      <Link
        to={`/properties/${propertyId}`}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: 12, textDecoration: 'none', color: 'inherit',
        }}
      >
        {l.coverImage && (
          <div style={{
            width: thumb, height: thumb, flexShrink: 0,
            borderRadius: 10, overflow: 'hidden',
            background: DT.cream3, filter: 'saturate(0.7)',
          }}>
            <img
              src={l.coverImage}
              alt=""
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          minWidth: 0, flex: 1,
        }}>
          <strong style={{
            fontSize: isMobile ? 14.5 : 14, color: DT.ink, fontWeight: 700,
            lineHeight: 1.3,
          }}>{title}</strong>
          <span style={{
            fontSize: 12.5, color: DT.ink2, lineHeight: 1.5,
          }}>{meta || '—'}</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            width: 'max-content',
            padding: '3px 10px',
            marginTop: 4,
            borderRadius: 99,
            background: DT.gold,
            color: DT.white,
            fontSize: 11,
            fontWeight: 700,
          }}>
            <Check size={11} /> כבר במערכת — פתח כרטיס
            <ExternalLink size={11} />
          </span>
        </div>
      </Link>
    </li>
  );
}

function ReviewActions({ isMobile, picked, busyImport, importPicked, resetAndRescan }) {
  const canImport = picked.size > 0 && !busyImport;
  const content = (
    <>
      <button
        type="button"
        disabled={!canImport}
        onClick={importPicked}
        style={{
          ...primaryBtn(),
          minHeight: isMobile ? 50 : 44,
          fontSize: isMobile ? 15 : 14,
          flex: isMobile ? 1 : 'unset',
          justifyContent: 'center',
          opacity: canImport ? 1 : 0.55,
          cursor: canImport ? 'pointer' : 'not-allowed',
        }}
      >
        {busyImport
          ? <Loader2 size={15} style={spin} />
          : <Check size={15} />}
        {busyImport ? 'מייבא ומוריד תמונות…' : `ייבא ${picked.size} נכסים`}
      </button>
      <button
        type="button"
        onClick={resetAndRescan}
        style={{
          ...ghostBtn(),
          minHeight: isMobile ? 50 : 44,
          paddingInline: 18,
        }}
      >
        <RefreshCw size={13} />
        סריקה חדשה
      </button>
    </>
  );

  if (isMobile) {
    return (
      <div style={{
        position: 'fixed', insetInline: 0, bottom: 0, zIndex: 100,
        padding: `12px 16px calc(12px + env(safe-area-inset-bottom) + 64px)`,
        background: `linear-gradient(180deg, transparent 0%, ${DT.cream} 28%)`,
        display: 'flex', gap: 10, pointerEvents: 'none',
      }}>
        <div style={{
          display: 'flex', gap: 10, width: '100%', pointerEvents: 'auto',
        }}>{content}</div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'inline-flex', gap: 10, marginTop: 4,
    }}>{content}</div>
  );
}

// ─── Done step ───────────────────────────────────────────────
function DoneStep({ isMobile, result, onGoProperties, onResetAndRescan }) {
  return (
    <section style={{
      background: DT.white,
      border: `1px solid ${DT.border}`,
      borderRadius: 14,
      padding: isMobile ? '28px 18px' : '40px 28px',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', textAlign: 'center',
      gap: 14,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 99,
        background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
        color: DT.white, display: 'grid', placeItems: 'center',
        boxShadow: '0 8px 20px rgba(180,139,76,0.35)',
      }}>
        <Check size={30} strokeWidth={3} />
      </div>

      <h2 style={{
        fontSize: isMobile ? 20 : 24, fontWeight: 800,
        letterSpacing: -0.5, margin: 0, color: DT.ink,
      }}>
        הייבוא הסתיים
      </h2>

      <ul style={{
        listStyle: 'none', padding: 0, margin: 0,
        display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center',
        fontSize: 13.5, color: DT.muted,
      }}>
        <li>
          נוספו:{' '}
          <strong style={{ color: DT.success, fontWeight: 800 }}>
            {result.created.length}
          </strong>
        </li>
        {result.skipped.length > 0 && (
          <li>
            דולגו (כבר מיובאים):{' '}
            <strong style={{ color: DT.ink, fontWeight: 800 }}>
              {result.skipped.length}
            </strong>
          </li>
        )}
        {result.failed.length > 0 && (
          <li>
            נכשלו:{' '}
            <strong style={{ color: DT.danger, fontWeight: 800 }}>
              {result.failed.length}
            </strong>
          </li>
        )}
      </ul>

      <div style={{
        display: 'inline-flex', gap: 10, marginTop: 6, flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        <button type="button" onClick={onGoProperties} style={primaryBtn()}>
          הצג את הנכסים
        </button>
        <button type="button" onClick={onResetAndRescan} style={ghostBtn()}>
          ייבא סוכנות נוספת
        </button>
      </div>
    </section>
  );
}

// ─── Quota chip ──────────────────────────────────────────────
function QuotaChip({ quota, isMobile }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!quota || quota.remaining > 0) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [quota?.remaining, quota?.resetAt]);

  if (!quota) return null;
  const exhausted = quota.remaining === 0;
  const minutesLeft = quota.resetAt
    ? Math.max(0, Math.ceil((new Date(quota.resetAt).getTime() - Date.now()) / 60_000))
    : 0;

  const bg     = exhausted ? 'rgba(185,28,28,0.08)' : DT.goldSoft;
  const border = exhausted ? 'rgba(185,28,28,0.22)' : 'rgba(180,139,76,0.28)';
  const iconColor = exhausted ? DT.danger : DT.gold;
  const strongColor = exhausted ? DT.danger : DT.ink;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: isMobile ? '10px 12px' : '12px 14px',
      borderRadius: 12,
      background: bg,
      border: `1px solid ${border}`,
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 8,
        background: DT.white, color: iconColor,
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        {exhausted ? <Lock size={14} /> : <Clock size={14} />}
      </span>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0,
      }}>
        {exhausted ? (
          <>
            <strong style={{ fontSize: 13.5, color: strongColor, fontWeight: 800 }}>
              הגעת למכסה השעתית
            </strong>
            <span style={{ fontSize: 12, color: DT.muted }}>
              הסלוט הבא יתפנה בעוד {minutesLeft} דק׳
            </span>
          </>
        ) : (
          <>
            <strong style={{
              fontSize: 13.5, color: strongColor, fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {quota.remaining} / {quota.limit} ייבואים נותרו
            </strong>
            <span style={{ fontSize: 12, color: DT.muted, lineHeight: 1.5 }}>
              המכסה מתאפסת על בסיס שעה גולשת — שלוש סריקות לכל שעה.
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Shared atoms ────────────────────────────────────────────
function primaryBtn({ small = false } = {}) {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: small ? '8px 14px' : '10px 16px',
    borderRadius: 10, cursor: 'pointer',
    fontSize: small ? 12.5 : 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
    textDecoration: 'none', whiteSpace: 'nowrap',
  };
}

function ghostBtn() {
  return {
    ...FONT,
    background: DT.white,
    border: `1px solid ${DT.border}`,
    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    color: DT.ink, textDecoration: 'none', whiteSpace: 'nowrap',
  };
}

const spin = {
  animation: 'y2Spin 0.8s linear infinite',
};

// Inject the keyframes once — inline styles can't express @keyframes.
if (typeof document !== 'undefined' && !document.getElementById('y2-spin-kf')) {
  const s = document.createElement('style');
  s.id = 'y2-spin-kf';
  s.textContent = '@keyframes y2Spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
}

function relativeMinutes(ts) {
  if (!ts) return 'רגע';
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (mins === 0) return 'פחות מדקה';
  if (mins === 1) return 'דקה';
  return `${mins} דק׳`;
}

// Time-based progress surface for a live Yad2 scan. Backend doesn't
// stream progress yet, so we fake it from the elapsed-time clock:
//   0-5s    → 10 %  "מתחבר ל-Yad2"
//   5-20s   → 30 %  "סורק מכירה"
//   20-45s  → 55 %  "סורק השכרה"
//   45-75s  → 75 %  "סורק מסחרי"
//   75-120s → 90 %  "מאחד תוצאות"
//   120s+   → 95 %  "כמעט סיימתי…"
// The bar caps at 95 % — when the store flips to status='done' this
// component unmounts and the 100 % is implicit. Elapsed timer + URL
// hint next to the stage label so the agent sees concrete motion.
function Yad2ScanProgress({ startedAt, url, progress }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, (now - (startedAt || now)) / 1000);
  // Prefer the server-reported progress (streamed via /jobs/:id) —
  // it reflects the real stage the scraper is on. Fall back to the
  // time-based estimate if the backend hasn't pushed yet.
  if (progress && typeof progress.pct === 'number') {
    return <ScanBar label={progress.stage || 'מעבד…'} pct={progress.pct} elapsed={elapsed} url={url} />;
  }
  const stages = [
    { s: 0,   pct: 10, label: 'מתחבר ל-Yad2' },
    { s: 5,   pct: 30, label: 'סורק נכסים למכירה' },
    { s: 20,  pct: 55, label: 'סורק נכסים להשכרה' },
    { s: 45,  pct: 75, label: 'סורק נכסים מסחריים' },
    { s: 75,  pct: 90, label: 'מאחד תוצאות' },
    { s: 120, pct: 95, label: 'כמעט סיימתי…' },
  ];
  let stage = stages[0];
  for (const s of stages) if (elapsed >= s.s) stage = s;
  const idx = stages.indexOf(stage);
  const next = stages[idx + 1];
  const span = next ? (next.s - stage.s) : 1;
  const within = next ? Math.min(1, Math.max(0, (elapsed - stage.s) / span)) : 0;
  const pctRaw = stage.pct + within * (next ? next.pct - stage.pct : 0);
  const pct = Math.min(95, Math.round(pctRaw * 10) / 10);
  return <ScanBar label={stage.label} pct={pct} elapsed={elapsed} url={url} />;
}

function ScanBar({ label, pct, elapsed, url }) {
  const seconds = Math.floor(elapsed);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <div style={{
      marginTop: 6,
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 10, padding: '10px 12px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, marginBottom: 6,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: DT.ink }}>{label}</span>
        <span style={{
          fontSize: 11, color: DT.muted, fontVariantNumeric: 'tabular-nums',
        }}>{mm}:{ss} · {Math.round(pct)}%</span>
      </div>
      <div style={{
        background: DT.cream3, height: 6, borderRadius: 99, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: `linear-gradient(90deg, ${DT.goldLight}, ${DT.gold})`,
          transition: 'width 600ms linear',
        }} />
      </div>
      {url && (
        <div style={{
          fontSize: 10, color: DT.muted, marginTop: 6,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          direction: 'ltr',
        }}>{url}</div>
      )}
    </div>
  );
}
