import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2,
  Building2, UserPlus, X as XIcon, Check, Sparkles,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { parseSheetFile } from '../lib/excelImport';
import {
  detectColumns, headerSignature,
  FIELD_LABELS, LEAD_FIELDS, PROPERTY_FIELDS,
} from '../lib/importDetect';
import './Import.css';

// Excel / CSV import wizard.
//
// Route: /import/leads and /import/properties. The page is a 4-step
// wizard in one screen (steps collapse/expand as the agent advances):
//   1. Upload — drag-drop or click to browse an .xlsx/.csv.
//   2. Mapping — auto-detected column→field pairs, user overrides.
//   3. Preview — every parsed row with validation badge + checkbox.
//   4. Progress — async job polling with final summary.
//
// Client-side parsing (SheetJS) so the uploaded file never crosses the
// wire — only the mapped row payload does.

const FRIENDLY_TYPE = { LEAD: 'לידים', PROPERTY: 'נכסים' };
const LIST_ROUTE    = { LEAD: '/customers', PROPERTY: '/properties' };

export default function Import() {
  const { type } = useParams(); // 'leads' | 'properties'
  const entityType = type === 'leads' ? 'LEAD' : 'PROPERTY';
  const allFields = entityType === 'LEAD' ? LEAD_FIELDS : PROPERTY_FIELDS;
  const toast = useToast();
  const navigate = useNavigate();

  // Wizard state.
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({}); // { header: field | null }
  const [sig, setSig] = useState('');
  // Per-row select state keyed by row index. Initialize true for every row.
  const [picked, setPicked] = useState(new Set());
  const [skipDupes, setSkipDupes] = useState(true);
  const [defaultCity, setDefaultCity] = useState('');
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [err, setErr] = useState(null);

  // ── Step 1: upload ────────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const handleFile = async (f) => {
    if (!f) return;
    setErr(null);
    try {
      const { headers: hs, rows: rs } = await parseSheetFile(f);
      if (hs.length === 0) throw new Error('לא נמצאה שורת כותרת');
      if (rs.length === 0) throw new Error('לא נמצאו שורות נתונים');
      if (rs.length > 2000) throw new Error(`יש ${rs.length} שורות — מקסימום 2000 לייבוא בודד`);
      setFile(f);
      setHeaders(hs);
      setRows(rs);
      const suggested = detectColumns(hs, entityType);
      const signature = headerSignature(hs);
      setSig(signature);
      // If the agent uploaded this exact header shape before, prefer
      // their saved mapping over the auto-detected fresh suggestion.
      try {
        const savedRes = await api.listImportMappings(entityType, signature);
        const saved = savedRes?.items?.[0]?.mapping;
        setMapping(saved || suggested);
      } catch {
        setMapping(suggested);
      }
      setPicked(new Set(rs.map((_, i) => i)));
      setStep(2);
    } catch (e) {
      setErr(e?.message || 'שגיאה בקריאת הקובץ');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  // ── Step 2: mapping ───────────────────────────────────────────────
  const requiredOK = useMemo(() => {
    const inverted = new Set(Object.values(mapping).filter(Boolean));
    if (entityType === 'LEAD') {
      const hasName = inverted.has('name') || inverted.has('firstName') || inverted.has('lastName');
      return hasName && inverted.has('phone');
    }
    // PROPERTY
    const hasStreet = inverted.has('street');
    const hasCity   = inverted.has('city') || !!defaultCity.trim();
    return hasStreet && hasCity;
  }, [mapping, entityType, defaultCity]);

  const missingReasons = useMemo(() => {
    const inverted = new Set(Object.values(mapping).filter(Boolean));
    const reasons = [];
    if (entityType === 'LEAD') {
      const hasName = inverted.has('name') || inverted.has('firstName') || inverted.has('lastName');
      if (!hasName) reasons.push('חובה: עמודת שם (מלא או פרטי+משפחה)');
      if (!inverted.has('phone')) reasons.push('חובה: עמודת טלפון');
    } else {
      if (!inverted.has('street')) reasons.push('חובה: עמודת רחוב או כתובת');
      if (!inverted.has('city') && !defaultCity.trim()) reasons.push('חובה: עמודת עיר או קביעת עיר ברירת מחדל');
    }
    return reasons;
  }, [mapping, entityType, defaultCity]);

  // ── Step 3: preview rows ──────────────────────────────────────────
  const previewRows = useMemo(() => {
    return rows.map((row, i) => {
      const get = (field) => {
        for (const [h, f] of Object.entries(mapping)) if (f === field) return row[h];
        return undefined;
      };
      if (entityType === 'LEAD') {
        const name = get('name') || [get('firstName'), get('lastName')].filter(Boolean).join(' ');
        const phone = get('phone');
        const errRow =
          !String(name || '').trim() ? 'שם חסר' :
          !String(phone || '').trim() ? 'טלפון חסר' : null;
        return { i, valid: !errRow, err: errRow, summary: {
          שם: name || '—',
          טלפון: phone || '—',
          עיר: get('city') || defaultCity || '—',
          טווח: get('priceMax') || get('priceMin') || '—',
        } };
      } else {
        const street = get('street');
        const city = get('city') || defaultCity;
        const errRow =
          !String(street || '').trim() ? 'רחוב חסר' :
          !String(city || '').trim() ? 'עיר חסרה — הוסף עיר ברירת מחדל' : null;
        return { i, valid: !errRow, err: errRow, summary: {
          כתובת: [street, city].filter(Boolean).join(', ') || '—',
          חדרים: get('rooms') || '—',
          'מ״ר':  get('sqm') || '—',
          מחיר:  get('marketingPrice') || '—',
        } };
      }
    });
  }, [rows, mapping, entityType, defaultCity]);

  const validPickedCount = useMemo(() => {
    return previewRows.filter((r) => r.valid && picked.has(r.i)).length;
  }, [previewRows, picked]);

  // ── Step 4: submit ────────────────────────────────────────────────
  const start = async () => {
    if (!requiredOK) { toast.error(missingReasons[0] || 'חסרים שדות חובה'); return; }
    const selectedRows = rows
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => {
        const pv = previewRows[i];
        return pv?.valid && picked.has(i);
      })
      .map(({ r }) => r);
    if (selectedRows.length === 0) { toast.error('לא נבחרו שורות תקינות'); return; }
    setErr(null);
    try {
      // Save the mapping for next time this header shape is uploaded.
      try {
        await api.saveImportMapping(entityType, sig, mapping);
      } catch { /* non-fatal */ }
      const routeType = entityType === 'LEAD' ? 'leads' : 'properties';
      const res = await api.startImport(routeType, {
        mapping,
        rows: selectedRows,
        options: {
          skipDuplicates: skipDupes,
          defaultCity: defaultCity.trim() || undefined,
        },
      });
      setJobId(res.jobId);
      setStep(4);
    } catch (e) {
      setErr(e?.message || 'שליחת הייבוא נכשלה');
    }
  };

  // Poll job status while step 4 is active.
  useEffect(() => {
    if (step !== 4 || !jobId) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const snap = await api.getImportJob(jobId);
        if (cancelled) return;
        setJobStatus(snap);
        if (snap.status !== 'running') return;
      } catch (e) {
        if (cancelled) return;
        setErr(e?.message || 'שגיאה בעדכון הסטטוס');
        return;
      }
      setTimeout(tick, 1500);
    };
    tick();
    return () => { cancelled = true; };
  }, [step, jobId]);

  const done = jobStatus && jobStatus.status === 'done';
  useEffect(() => {
    if (!done) return;
    toast.success(`יובאו ${jobStatus.created} · דולגו ${jobStatus.skipped} · נכשלו ${jobStatus.failed}`);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="imp-page" dir="rtl">
      <header className="imp-head">
        <Link to={LIST_ROUTE[entityType]} className="imp-back" aria-label="חזור">
          <ArrowRight size={18} />
          חזור ל{FRIENDLY_TYPE[entityType]}
        </Link>
        <div className="imp-title">
          <h1>ייבוא {FRIENDLY_TYPE[entityType]} מ-Excel</h1>
          <span className="imp-beta">Beta</span>
        </div>
        <p className="imp-sub">
          העלה קובץ .xlsx או .csv — נזהה אוטומטית את העמודות, תוכל לאשר או לשנות,
          ולאחר מכן לייבא את השורות למערכת. אנחנו זוכרים את הבחירה שלך כך
          שפעם הבאה תעלה קובץ עם אותן עמודות — יופעל אוטומטית.
        </p>
      </header>

      {err && (
        <div className="imp-err">
          <AlertCircle size={14} /> {err}
        </div>
      )}

      {/* ── STEP 1 ────────────────────────────────────────────────── */}
      <section className={`imp-step ${step >= 1 ? 'imp-step-on' : ''}`}>
        <header className="imp-step-head">
          <span className="imp-step-num">1</span>
          <h2>העלאת קובץ</h2>
        </header>
        {step === 1 ? (
          <div
            className="imp-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <FileSpreadsheet size={36} aria-hidden />
            <strong>גרור לכאן קובץ .xlsx / .csv, או לחץ כדי לבחור</strong>
            <span>עד 2,000 שורות לייבוא בודד</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div className="imp-step-summary">
            <span><CheckCircle2 size={14} /> {file?.name}</span>
            <span>{rows.length} שורות</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setStep(1); setFile(null); setHeaders([]); setRows([]); setMapping({}); setPicked(new Set()); setJobId(null); setJobStatus(null); }}
            >
              החלף קובץ
            </button>
          </div>
        )}
      </section>

      {/* ── STEP 2 ────────────────────────────────────────────────── */}
      {step >= 2 && (
        <section className={`imp-step ${step === 2 ? 'imp-step-on' : ''}`}>
          <header className="imp-step-head">
            <span className="imp-step-num">2</span>
            <h2>התאמת עמודות</h2>
            <span className="imp-auto-hint"><Sparkles size={12} /> זיהוי אוטומטי — שנה לפי הצורך</span>
          </header>
          {step === 2 ? (
            <>
              <div className="imp-map-table">
                <div className="imp-map-row imp-map-head">
                  <span>עמודה בקובץ</span>
                  <span>מיפוי ל-Estia</span>
                  <span>דוגמה מהשורה הראשונה</span>
                </div>
                {headers.map((h) => {
                  const firstVal = rows[0]?.[h];
                  const mapped = mapping[h] ?? null;
                  const auto = !!mapped;
                  return (
                    <div className="imp-map-row" key={h}>
                      <span className="imp-map-header">{h || <em>(ללא כותרת)</em>}</span>
                      <select
                        className="imp-map-select"
                        value={mapped || ''}
                        onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value || null }))}
                      >
                        <option value="">דלג על עמודה זו</option>
                        {allFields.map((f) => (
                          <option key={f} value={f}>{FIELD_LABELS[f] || f}</option>
                        ))}
                      </select>
                      <span className="imp-map-sample">
                        {auto && <Sparkles size={12} className="imp-map-auto" aria-label="זוהה אוטומטית" />}
                        {firstVal == null || firstVal === '' ? <em>—</em> : String(firstVal)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {entityType === 'PROPERTY' && (
                <div className="imp-field">
                  <label htmlFor="imp-default-city">עיר ברירת מחדל (אם אין בקובץ)</label>
                  <input
                    id="imp-default-city"
                    className="form-input"
                    type="text"
                    placeholder="למשל: רמלה"
                    value={defaultCity}
                    onChange={(e) => setDefaultCity(e.target.value)}
                  />
                </div>
              )}

              <label className="imp-toggle">
                <input
                  type="checkbox"
                  checked={skipDupes}
                  onChange={(e) => setSkipDupes(e.target.checked)}
                />
                דלג על כפילויות (לפי {entityType === 'LEAD' ? 'טלפון' : 'רחוב + עיר'})
              </label>

              {missingReasons.length > 0 && (
                <ul className="imp-missing">
                  {missingReasons.map((r) => <li key={r}><AlertCircle size={12} /> {r}</li>)}
                </ul>
              )}

              <div className="imp-step-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!requiredOK}
                  onClick={() => setStep(3)}
                >
                  המשך לתצוגה מקדימה
                </button>
              </div>
            </>
          ) : (
            <div className="imp-step-summary">
              <span><CheckCircle2 size={14} /> מיפוי מוכן</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(2)}>
                שנה מיפוי
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── STEP 3 ────────────────────────────────────────────────── */}
      {step >= 3 && (
        <section className={`imp-step ${step === 3 ? 'imp-step-on' : ''}`}>
          <header className="imp-step-head">
            <span className="imp-step-num">3</span>
            <h2>תצוגה מקדימה</h2>
            <span className="imp-preview-count">
              {validPickedCount} מתוך {rows.length} נבחרו
            </span>
          </header>
          {step === 3 ? (
            <>
              <div className="imp-preview-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPicked(new Set(previewRows.filter((r) => r.valid).map((r) => r.i)))}
                >
                  <Check size={12} /> בחר הכול
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPicked(new Set())}
                >
                  <XIcon size={12} /> נקה בחירה
                </button>
              </div>

              <div className="imp-preview-table">
                {previewRows.map((r) => (
                  <label
                    key={r.i}
                    className={`imp-preview-row ${r.valid ? '' : 'imp-preview-row-invalid'} ${picked.has(r.i) ? 'imp-preview-row-sel' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={picked.has(r.i)}
                      disabled={!r.valid}
                      onChange={(e) => setPicked((p) => {
                        const n = new Set(p);
                        if (e.target.checked) n.add(r.i); else n.delete(r.i);
                        return n;
                      })}
                    />
                    <div className="imp-preview-cells">
                      {Object.entries(r.summary).map(([k, v]) => (
                        <div key={k} className="imp-preview-cell">
                          <small>{k}</small>
                          <strong>{v == null || v === '' ? '—' : String(v)}</strong>
                        </div>
                      ))}
                    </div>
                    <span className="imp-preview-badge">
                      {r.valid
                        ? <><CheckCircle2 size={13} /> תקין</>
                        : <><AlertCircle size={13} /> {r.err}</>}
                    </span>
                  </label>
                ))}
              </div>

              <div className="imp-step-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setStep(2)}
                >
                  חזור למיפוי
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={start}
                  disabled={validPickedCount === 0}
                >
                  ייבא {validPickedCount} שורות
                </button>
              </div>
            </>
          ) : null}
        </section>
      )}

      {/* ── STEP 4 ────────────────────────────────────────────────── */}
      {step === 4 && (
        <section className="imp-step imp-step-on imp-progress">
          <header className="imp-step-head">
            <span className="imp-step-num">4</span>
            <h2>{done ? 'הייבוא הסתיים' : 'מייבא ברקע…'}</h2>
          </header>
          {!done && jobStatus && (
            <div className="imp-progress-bar-wrap">
              <div className="imp-progress-bar">
                <div
                  className="imp-progress-fill"
                  style={{ width: `${Math.round((jobStatus.processed / Math.max(1, jobStatus.total)) * 100)}%` }}
                />
              </div>
              <p>
                {jobStatus.processed} / {jobStatus.total} שורות · נוצרו {jobStatus.created} · דולגו {jobStatus.skipped} · נכשלו {jobStatus.failed}
              </p>
            </div>
          )}
          {!done && !jobStatus && (
            <p className="imp-progress-waiting">
              <Loader2 size={14} className="imp-spin" /> ממתין לנתונים…
            </p>
          )}
          {done && (
            <div className="imp-done">
              <div className="imp-done-stat">
                <strong>{jobStatus.created}</strong>
                <span>נוצרו</span>
              </div>
              <div className="imp-done-stat">
                <strong>{jobStatus.skipped}</strong>
                <span>דולגו (כפילויות)</span>
              </div>
              <div className="imp-done-stat imp-done-stat-err">
                <strong>{jobStatus.failed}</strong>
                <span>נכשלו</span>
              </div>
              {jobStatus.errors?.length > 0 && (
                <details className="imp-done-errors">
                  <summary>פירוט שגיאות</summary>
                  <ul>
                    {jobStatus.errors.slice(0, 50).map((e) => (
                      <li key={e.rowIndex}>שורה {e.rowIndex + 2}: {e.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="imp-step-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate(`${LIST_ROUTE[entityType]}?importBatch=${jobStatus.batchId}`)}
                >
                  {entityType === 'LEAD' ? 'צפה בלידים החדשים' : 'צפה בנכסים החדשים'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setStep(1); setFile(null); setHeaders([]); setRows([]);
                    setMapping({}); setPicked(new Set()); setJobId(null); setJobStatus(null);
                  }}
                >
                  ייבוא נוסף
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
