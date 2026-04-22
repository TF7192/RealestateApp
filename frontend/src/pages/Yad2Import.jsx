import { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, ArrowRight, AlertCircle, Check, Loader2, Building2, Store, Home as HomeIcon, ExternalLink, Clock, Lock, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';
import { formatFloor } from '../lib/formatFloor';
import { getScanState, subscribeScan, startScan, clearScan, setScanQuota, startImport } from '../lib/yad2ScanStore';
import './Yad2Import.css';

// Yad2 agency-wide importer. Paste an agency URL like:
//   https://www.yad2.co.il/realestate/agency/7098700/forsale
// The backend walks /forsale, /rent, /commercial × all pages, parses
// __NEXT_DATA__ for each, returns a flat list grouped per section. This
// screen lets the agent pick which to import — the import call then
// downloads each cover image to /uploads/properties/.../yad2-cover.jpg
// and creates a Property row.
//
// Scan lifecycle lives in yad2ScanStore (module-level) so:
//   - the agent can navigate away mid-scan and get notified on completion
//   - returning to this page still shows the last scan's results until
//     they explicitly start a new one

const SECTION_LABEL = { forsale: 'מכירה', rent: 'השכרה', commercial: 'מסחרי' };
const SECTION_ICON  = { forsale: HomeIcon, rent: Building2, commercial: Store };

export default function Yad2Import() {
  const navigate = useNavigate();
  const toast = useToast();
  const [scan, setScan] = useState(getScanState());
  useEffect(() => subscribeScan(setScan), []);

  const [url, setUrl] = useState(scan.url || '');
  const [step, setStep] = useState(scan.result ? 'review' : 'paste');
  const [busyImport, setBusyImport] = useState(false);
  const [importErr, setImportErr] = useState(null);
  const [result, setResult] = useState(null); // import outcome (done step)
  const [picked, setPicked] = useState(new Set());
  const initPickedRef = useRef(false);

  // Derived: pull the scan result into the shape the review UI expects.
  const extracted       = scan.result?.listings ?? [];
  const agency          = scan.result?.agency ?? null;
  const sections        = scan.result?.sections ?? [];
  const truncated       = !!scan.result?.truncated;
  const alreadyImported = scan.result?.alreadyImported ?? {};
  const quota           = scan.quota ?? null;

  // Initialize `picked` once per distinct scan result so the agent's
  // manual de-selects are preserved if they leave & come back mid-review.
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

  // Fetch the quota fresh on mount so the chip is accurate even when
  // the store has a stale quota from an older scan.
  useEffect(() => {
    api.yad2Quota().then(setScanQuota).catch(() => {});
  }, []);

  // Y-4 — once the import succeeds, reset the scan store + URL input so
  // the agent can't immediately re-import the same agency by clicking
  // "סרוק" again. The "done" step renders a fresh "ייבא סוכנות נוספת"
  // CTA that brings them back to paste; this hook makes sure the
  // underlying state they'd return to is actually clean.
  useEffect(() => {
    if (step !== 'done') return;
    clearScan();
    initPickedRef.current = false;
    setPicked(new Set());
    setUrl('');
  }, [step]);

  // Group listings by section so the review screen reads as
  // "מכירה (12), השכרה (5), מסחרי (2)" — clearer than a flat list.
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
    if (!url.trim()) return;
    if (quota && quota.remaining === 0) return;
    initPickedRef.current = false;
    // F-24 — do NOT reset step to 'paste' here. The component already
    // renders the paste step; explicitly setting it caused a brief flash
    // of URL-cleared state on some renders. The URL input stays visible
    // below the running-scan banner so the agent sees what's in flight.
    startScan(url.trim()).catch(() => { /* handled via store */ });
    toast.info?.('הסריקה החלה — תוכל/י להמשיך לעבוד. תקבל/י התראה בסיום.');
  };

  const resetAndRescan = () => {
    clearScan();
    initPickedRef.current = false;
    setPicked(new Set());
    setStep('paste');
    setResult(null);
    setImportErr(null);
    // Y-4 — clear the URL input too. Without this the agent returns to
    // the paste step with the previous URL still populated and a fresh
    // "סרוק" click would re-import the same agency. Force them to
    // paste a new link deliberately.
    setUrl('');
  };

  const importPicked = async () => {
    setImportErr(null);
    setBusyImport(true);
    try {
      const toImport = extracted.filter((l) => picked.has(l.sourceId));
      // Async job flow — backend returns { jobId } immediately and
      // startImport polls for completion. Dodges the Cloudflare 100s
      // cap for large image-rehost batches.
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
        <p className="y2-sub">
          הדבק את הקישור לדף הסוכנות שלך ב-Yad2 — נסרוק אוטומטית את כל הנכסים שלך
          (מכירה, השכרה ומסחרי) על פני כל העמודים, ונוריד את התמונות ל-Estia.
        </p>
      </header>

      {err && (
        <div className="y2-err">
          <AlertCircle size={14} /> {err}
        </div>
      )}

      {step === 'paste' && (
        <section className="y2-card">
          <QuotaChip quota={quota} />

          {/* Cached-result card — when the agent returns mid-session we
              keep the last scan visible so they can jump back into review
              without re-scanning. */}
          {scan.status === 'done' && scan.result && (
            <div className="y2-cached">
              <div className="y2-cached-body">
                <strong>סריקה אחרונה שמורה</strong>
                <span>
                  {scan.result.listings?.length ?? 0} נכסים · {agency?.name || 'סוכנות'} ·{' '}
                  לפני {relativeMinutes(scan.finishedAt)}
                </span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setStep('review')}>
                המשך לבחירה
              </button>
            </div>
          )}

          <label className="y2-label" htmlFor="y2-url">קישור לדף הסוכנות שלך ב-Yad2</label>
          <input
            id="y2-url"
            type="url"
            className="y2-input"
            inputMode="url"
            enterKeyHint="go"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            autoComplete="off"
            placeholder="https://www.yad2.co.il/realestate/agency/7098700/forsale"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url.trim() && !isRunning && !(quota && quota.remaining === 0)) beginScan();
            }}
          />
          <button
            className="btn btn-primary"
            disabled={!url.trim() || isRunning || (quota && quota.remaining === 0)}
            onClick={beginScan}
          >
            {isRunning ? <Loader2 size={14} className="y2-spin" /> : <Download size={14} />}
            {isRunning
              ? 'סורק ברקע — ניתן להמשיך לעבוד'
              : (quota && quota.remaining === 0
                  ? 'הגעת למכסה השעתית'
                  : 'סרוק את כל הנכסים')}
          </button>
          <p className="y2-hint">
            כל אחת משלושת הקטגוריות (מכירה / השכרה / מסחרי) נסרקת בנפרד, כולל כל העמודים בכל קטגוריה.
            הסריקה רצה ברקע — אפשר לעזוב את העמוד; תתקבל התראה כשהיא תסתיים.
          </p>
        </section>
      )}

      {step === 'review' && scan.result && (
        <section className="y2-card">
          <header className="y2-review-head">
            <div>
              <strong>{extracted.length} נכסים נמצאו</strong>
              {agency?.name && <span className="y2-agency">· {agency.name}</span>}
            </div>
            <div className="y2-review-meta">
              <span className="y2-review-meta-new">
                {picked.size} <small>חדשים לייבוא</small>
              </span>
              {Object.keys(alreadyImported).length > 0 && (
                <span className="y2-review-meta-imported">
                  {Object.keys(alreadyImported).length} <small>כבר במערכת</small>
                </span>
              )}
            </div>
            {truncated && (
              <div className="y2-trunc">הוצגו עד 100 נכסים — הסוכנות עשויה להכיל עוד.</div>
            )}
          </header>

          {sections.length > 0 && (
            <ul className="y2-section-summary">
              {sections.map((s) => {
                const Icon = SECTION_ICON[s.section] || HomeIcon;
                return (
                  <li key={s.section}>
                    <Icon size={12} />
                    <strong>{SECTION_LABEL[s.section]}</strong>
                    <span>{s.totalListings} מתוך {s.totalPages || '?'} עמודים</span>
                    {s.error && <em>· {s.error}</em>}
                  </li>
                );
              })}
            </ul>
          )}

          {Object.entries(grouped).map(([section, list]) => {
            if (!list || list.length === 0) return null;
            const Icon = SECTION_ICON[section] || HomeIcon;
            const allOn = list.every((l) => picked.has(l.sourceId));
            return (
              <div key={section} className="y2-group">
                <header className="y2-group-head">
                  <button
                    type="button"
                    className="y2-group-toggle"
                    onClick={() => togglePickSection(section)}
                    title={allOn ? 'בטל את הבחירה בקטגוריה' : 'בחר את כל הקטגוריה'}
                  >
                    <input type="checkbox" checked={allOn} readOnly />
                    <Icon size={14} />
                    <strong>{SECTION_LABEL[section]}</strong>
                    <span>({list.length})</span>
                  </button>
                </header>
                <ul className="y2-list">
                  {list.map((l) => {
                    const chosen = picked.has(l.sourceId);
                    const importedPropertyId = alreadyImported[l.sourceId];
                    const isImported = !!importedPropertyId;
                    if (isImported) {
                      return (
                        <li key={l.sourceId} className="y2-item y2-item-imported">
                          <Link to={`/properties/${importedPropertyId}`} className="y2-item-imported-row">
                            {l.coverImage && (
                              <div className="y2-thumb-wrap">
                                <img className="y2-thumb" src={l.coverImage} alt="" loading="lazy" decoding="async" />
                              </div>
                            )}
                            <div className="y2-item-meta">
                              <strong>
                                {l.title || `${l.street || ''}${l.city ? `, ${l.city}` : ''}`.trim() || 'נכס מ-Yad2'}
                              </strong>
                              <span>
                                {[
                                  l.type,
                                  l.rooms ? `${l.rooms} חד׳` : null,
                                  l.sqm ? `${l.sqm} מ״ר` : null,
                                  l.price ? `₪${Number(l.price).toLocaleString('he-IL')}` : null,
                                ].filter(Boolean).join(' · ')}
                              </span>
                              <span className="y2-imported-pill">
                                <Check size={11} /> כבר במערכת — פתח כרטיס
                                <ExternalLink size={11} />
                              </span>
                            </div>
                          </Link>
                        </li>
                      );
                    }
                    return (
                      <li key={l.sourceId} className={`y2-item ${chosen ? 'on' : ''}`}>
                        <label>
                          <input
                            type="checkbox"
                            checked={chosen}
                            onChange={() => togglePick(l.sourceId)}
                          />
                          {l.coverImage && (
                            <div className="y2-thumb-wrap">
                              <img className="y2-thumb" src={l.coverImage} alt="" loading="lazy" decoding="async" />
                              {(l.images?.length || 0) > 1 && (
                                <span className="y2-thumb-count">{l.images.length} תמונות</span>
                              )}
                            </div>
                          )}
                          <div className="y2-item-meta">
                            <strong>
                              {l.title || `${l.street || ''}${l.city ? `, ${l.city}` : ''}`.trim() || 'נכס מ-Yad2'}
                            </strong>
                            <span>
                              {[
                                l.type,
                                l.rooms ? `${l.rooms} חד׳` : null,
                                l.sqm ? `${l.sqm} מ״ר` : null,
                                l.floor != null ? `קומה ${formatFloor(l.floor)}` : null,
                                l.price ? `₪${Number(l.price).toLocaleString('he-IL')}` : null,
                              ].filter(Boolean).join(' · ')}
                            </span>
                            {l.tags?.length > 0 && (
                              <small className="y2-tags">{l.tags.slice(0, 4).join(' · ')}</small>
                            )}
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          <div className="y2-review-actions">
            <button
              className="btn btn-primary"
              disabled={picked.size === 0 || busyImport}
              onClick={importPicked}
            >
              {busyImport ? <Loader2 size={14} className="y2-spin" /> : <Check size={14} />}
              {busyImport ? 'מייבא ומוריד תמונות…' : `ייבא ${picked.size} נכסים`}
            </button>
            <button className="btn btn-secondary" onClick={resetAndRescan}>
              <RefreshCw size={13} />
              סריקה חדשה
            </button>
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
            <button className="btn btn-secondary" onClick={resetAndRescan}>
              ייבא סוכנות נוספת
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function relativeMinutes(ts) {
  if (!ts) return 'רגע';
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (mins === 0) return 'פחות מדקה';
  if (mins === 1) return 'דקה';
  return `${mins} דק׳`;
}

// Quota chip — sits above the URL input. Two visual states:
//   - has slots: gold pill, "X/3 ייבואים נותרו השעה הקרובה"
//   - exhausted: muted card, live countdown to the moment the oldest
//     attempt expires out of the window
function QuotaChip({ quota }) {
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

  return (
    <div className={`y2-quota ${exhausted ? 'y2-quota-stop' : ''}`}>
      {exhausted ? (
        <>
          <Lock size={14} />
          <div>
            <strong>הגעת למכסה השעתית</strong>
            <span>הסלוט הבא יתפנה בעוד {minutesLeft} דק׳</span>
          </div>
        </>
      ) : (
        <>
          <Clock size={14} />
          <div>
            <strong>
              {quota.remaining} / {quota.limit} ייבואים נותרו
            </strong>
            <span>המכסה מתאפסת על בסיס שעה גולשת — שלוש סריקות לכל שעה.</span>
          </div>
        </>
      )}
    </div>
  );
}
