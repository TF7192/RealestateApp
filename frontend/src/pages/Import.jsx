// Excel / CSV import wizard — Cream & Gold inline-DT port matching
// the claude.ai/design "Estia Refined Pages" bundle.
//
// Route: /import/leads and /import/properties. The page is a 4-step
// wizard:
//   1. העלאה        — drag-drop or click to browse an .xlsx/.csv.
//   2. מיפוי עמודות  — auto-detected column → field pairs, user overrides.
//   3. תצוגה מקדימה  — every parsed row with validation badge + checkbox.
//   4. ייבוא         — async job polling with final summary.
//
// Client-side parsing (SheetJS) so the uploaded file never crosses the
// wire — only the mapped row payload does. API contract preserved
// verbatim: api.startImport / api.getImportJob / api.listImportMappings
// / api.saveImportMapping.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2,
  X as XIcon, Check, Sparkles, FileUp, Wand2, Eye, Send, RefreshCw,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { parseSheetFile } from '../lib/excelImport';
import {
  detectColumns, headerSignature,
  FIELD_LABELS, LEAD_FIELDS, PROPERTY_FIELDS,
} from '../lib/importDetect';
import { useViewportMobile } from '../hooks/mobile';

// Cream & Gold design tokens — verbatim from the refined-pages spec.
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff', ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const FRIENDLY_TYPE = { LEAD: 'לידים', PROPERTY: 'נכסים' };
const LIST_ROUTE    = { LEAD: '/customers', PROPERTY: '/properties' };

const STEPS = [
  { n: 1, label: 'העלאה',         Icon: FileUp },
  { n: 2, label: 'מיפוי עמודות',  Icon: Wand2 },
  { n: 3, label: 'תצוגה מקדימה',  Icon: Eye },
  { n: 4, label: 'ייבוא',          Icon: Send },
];

export default function Import() {
  const { type } = useParams(); // 'leads' | 'properties'
  const entityType = type === 'leads' ? 'LEAD' : 'PROPERTY';
  const allFields = entityType === 'LEAD' ? LEAD_FIELDS : PROPERTY_FIELDS;
  const toast = useToast();
  const navigate = useNavigate();
  const isMobile = useViewportMobile(820);

  // Wizard state.
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({}); // { header: field | null }
  const [sig, setSig] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [skipDupes, setSkipDupes] = useState(true);
  const [defaultCity, setDefaultCity] = useState('');
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [err, setErr] = useState(null);
  const [dragOver, setDragOver] = useState(false);

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
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  const reset = () => {
    setStep(1); setFile(null); setHeaders([]); setRows([]);
    setMapping({}); setPicked(new Set()); setJobId(null); setJobStatus(null);
    setErr(null); setSig(''); setDefaultCity('');
  };

  // ── Step 2: mapping validation ───────────────────────────────────
  const requiredOK = useMemo(() => {
    const inverted = new Set(Object.values(mapping).filter(Boolean));
    if (entityType === 'LEAD') {
      const hasName = inverted.has('name') || inverted.has('firstName') || inverted.has('lastName');
      return hasName && inverted.has('phone');
    }
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

  // ── Step 3: per-row preview + validation ─────────────────────────
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
      }
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
    });
  }, [rows, mapping, entityType, defaultCity]);

  const validPickedCount = useMemo(
    () => previewRows.filter((r) => r.valid && picked.has(r.i)).length,
    [previewRows, picked]
  );
  const invalidCount = useMemo(
    () => previewRows.filter((r) => !r.valid).length,
    [previewRows]
  );

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

  // ── Layout ────────────────────────────────────────────────────────
  return (
    <div dir="rtl" style={{
      ...FONT,
      padding: isMobile ? '18px 14px 60px' : 28,
      color: DT.ink, minHeight: '100%',
      background: DT.cream,
    }}>
      <style>{`
        @keyframes estia-imp-spin { to { transform: rotate(360deg); } }
        @keyframes estia-imp-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .estia-imp-select:focus {
          outline: none;
          border-color: ${DT.gold};
          box-shadow: 0 0 0 3px rgba(180,139,76,0.18);
        }
        .estia-imp-input:focus {
          outline: none;
          border-color: ${DT.gold};
          box-shadow: 0 0 0 3px rgba(180,139,76,0.18);
        }
        .estia-imp-back:hover { color: ${DT.goldDark}; }
        .estia-imp-cta:hover:not(:disabled) {
          filter: brightness(1.04);
          box-shadow: 0 6px 14px rgba(180,139,76,0.36);
        }
        .estia-imp-ghost:hover { background: ${DT.cream3}; }
        .estia-imp-row:hover { background: ${DT.cream4}; }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{ marginBottom: isMobile ? 14 : 22 }}>
        <Link
          to="/import"
          className="estia-imp-back"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: DT.muted, fontSize: 12.5, textDecoration: 'none',
            marginBottom: 10, fontWeight: 600,
          }}
        >
          <ArrowRight size={14} aria-hidden="true" />
          <span>חזרה לדף הייבוא</span>
        </Link>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          color: DT.goldDark, fontSize: 11, fontWeight: 800,
          letterSpacing: 1, textTransform: 'uppercase',
        }}>
          <Upload size={12} aria-hidden="true" /> ESTIA · ייבוא
        </div>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 10,
          flexWrap: 'wrap', marginTop: 4,
        }}>
          <h1 style={{
            fontSize: isMobile ? 22 : 28, fontWeight: 800,
            letterSpacing: -0.7, margin: 0,
          }}>
            ייבוא {FRIENDLY_TYPE[entityType]} מ-Excel
          </h1>
          <span style={{
            fontSize: 10.5, fontWeight: 800, padding: '3px 9px',
            borderRadius: 99, background: DT.goldSoft, color: DT.goldDark,
            letterSpacing: 0.5, textTransform: 'uppercase',
          }}>בטא</span>
        </div>
        <p style={{
          margin: '6px 0 0', fontSize: isMobile ? 12.5 : 13.5,
          color: DT.muted, lineHeight: 1.55, maxWidth: 660,
        }}>
          העלה קובץ .xlsx או .csv — נזהה אוטומטית את העמודות, תוכל לאשר או לשנות,
          ולאחר מכן לייבא את השורות למערכת. אנחנו זוכרים את הבחירה שלך כך
          שפעם הבאה תעלה קובץ עם אותן עמודות — יופעל אוטומטית.
        </p>
      </header>

      {/* ── 4-step stepper ──────────────────────────────────────── */}
      <Stepper step={step} isMobile={isMobile} />

      {/* ── Error envelope ──────────────────────────────────────── */}
      {err && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          marginBottom: 14, padding: '10px 14px',
          background: 'rgba(185,28,28,0.06)', color: DT.danger,
          border: `1px solid rgba(185,28,28,0.22)`,
          borderRadius: 10, fontSize: 13, fontWeight: 600,
        }}>
          <AlertCircle size={14} aria-hidden="true" /> {err}
        </div>
      )}

      {/* ── STEP 1 ──────────────────────────────────────────────── */}
      <SectionCard
        n={1}
        Icon={FileUp}
        title="העלאת קובץ"
        active={step === 1}
        complete={step > 1}
        isMobile={isMobile}
      >
        {step === 1 ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            aria-label="העלה קובץ"
            style={{
              border: `2px dashed ${dragOver ? DT.gold : 'rgba(180,139,76,0.45)'}`,
              borderRadius: 16,
              padding: isMobile ? '32px 18px' : '44px 28px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 8,
              background: dragOver ? 'rgba(180,139,76,0.10)' : DT.cream4,
              cursor: 'pointer',
              transition: 'background 0.14s, border-color 0.14s',
              textAlign: 'center',
            }}
          >
            <FileSpreadsheet size={isMobile ? 32 : 38} aria-hidden="true" style={{ color: DT.gold, marginBottom: 4 }} />
            <strong style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: DT.ink }}>
              גרור לכאן קובץ .xlsx / .csv, או לחץ כדי לבחור
            </strong>
            <span style={{ fontSize: 12, color: DT.muted }}>
              עד 2,000 שורות לייבוא בודד
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            fontSize: 13, color: DT.muted,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              color: DT.success, fontWeight: 700,
            }}>
              <CheckCircle2 size={14} aria-hidden="true" /> {file?.name}
            </span>
            <span>·</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {rows.length} שורות
            </span>
            <button
              type="button"
              onClick={reset}
              className="estia-imp-ghost"
              style={ghostBtn(isMobile)}
            >
              <RefreshCw size={12} aria-hidden="true" /> החלף קובץ
            </button>
          </div>
        )}
      </SectionCard>

      {/* ── STEP 2 ──────────────────────────────────────────────── */}
      {step >= 2 && (
        <SectionCard
          n={2}
          Icon={Wand2}
          title="התאמת עמודות"
          active={step === 2}
          complete={step > 2}
          isMobile={isMobile}
          headerRight={
            step === 2 ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11.5, color: DT.goldDark, fontWeight: 700,
              }}>
                <Sparkles size={12} aria-hidden="true" /> זיהוי אוטומטי — שנה לפי הצורך
              </span>
            ) : null
          }
        >
          {step === 2 ? (
            <>
              <div style={{
                border: `1px solid ${DT.border}`, borderRadius: 12,
                overflow: 'hidden', background: DT.white,
              }}>
                {!isMobile && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1.2fr 1fr',
                    gap: 12, padding: '10px 14px',
                    background: DT.cream2, fontSize: 11,
                    fontWeight: 800, color: DT.muted,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    <span>עמודה בקובץ</span>
                    <span>מיפוי ל-Estia</span>
                    <span>דוגמה מהשורה הראשונה</span>
                  </div>
                )}
                {headers.map((h, idx) => {
                  const firstVal = rows[0]?.[h];
                  const mapped = mapping[h] ?? null;
                  const auto = !!mapped;
                  return (
                    <div
                      key={h || `__h${idx}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1.2fr 1fr',
                        gap: isMobile ? 6 : 12,
                        padding: isMobile ? '12px 14px' : '11px 14px',
                        alignItems: 'center', fontSize: 13,
                        borderTop: idx === 0 ? 'none' : `1px solid ${DT.border}`,
                      }}
                    >
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 2,
                      }}>
                        {isMobile && (
                          <span style={{
                            fontSize: 10, color: DT.muted, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: 0.5,
                          }}>עמודה בקובץ</span>
                        )}
                        <span style={{ fontWeight: 700, color: DT.ink }}>
                          {h || <em style={{ color: DT.muted, fontWeight: 400 }}>(ללא כותרת)</em>}
                        </span>
                      </div>
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 2,
                      }}>
                        {isMobile && (
                          <span style={{
                            fontSize: 10, color: DT.muted, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: 0.5,
                          }}>מיפוי ל-Estia</span>
                        )}
                        <select
                          className="estia-imp-select"
                          value={mapped || ''}
                          onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value || null }))}
                          style={{
                            ...FONT,
                            padding: '7px 10px',
                            border: `1px solid ${DT.border}`,
                            borderRadius: 8,
                            background: DT.cream4,
                            color: DT.ink, fontSize: 13,
                            width: '100%',
                          }}
                        >
                          <option value="">דלג על עמודה זו</option>
                          {allFields.map((f) => (
                            <option key={f} value={f}>{FIELD_LABELS[f] || f}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        color: DT.muted,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {isMobile && (
                          <span style={{
                            fontSize: 10, color: DT.muted, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: 0.5,
                            marginInlineEnd: 4,
                          }}>דוגמה</span>
                        )}
                        {auto && (
                          <Sparkles size={12} aria-label="זוהה אוטומטית" style={{ color: DT.gold, flexShrink: 0 }} />
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {firstVal == null || firstVal === '' ? <em>—</em> : String(firstVal)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {entityType === 'PROPERTY' && (
                <div style={{
                  marginTop: 14,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <label
                    htmlFor="estia-imp-default-city"
                    style={{
                      fontSize: 12, fontWeight: 700, color: DT.muted,
                      textTransform: 'uppercase', letterSpacing: 0.5,
                    }}
                  >
                    עיר ברירת מחדל (אם אין בקובץ)
                  </label>
                  <input
                    id="estia-imp-default-city"
                    type="text"
                    placeholder="למשל: רמלה"
                    value={defaultCity}
                    onChange={(e) => setDefaultCity(e.target.value)}
                    className="estia-imp-input"
                    style={{
                      ...FONT,
                      padding: '9px 12px',
                      border: `1px solid ${DT.border}`,
                      borderRadius: 10,
                      background: DT.white,
                      color: DT.ink, fontSize: 13,
                      width: isMobile ? '100%' : 280,
                      textAlign: 'right',
                    }}
                  />
                </div>
              )}

              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                marginTop: 14, fontSize: 13, color: DT.ink, cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={skipDupes}
                  onChange={(e) => setSkipDupes(e.target.checked)}
                  style={{ accentColor: DT.gold, width: 16, height: 16 }}
                />
                דלג על כפילויות (לפי {entityType === 'LEAD' ? 'טלפון' : 'רחוב + עיר'})
              </label>

              {missingReasons.length > 0 && (
                <ul style={{
                  listStyle: 'none', padding: '10px 14px', margin: '14px 0 0',
                  background: 'rgba(180,83,9,0.08)',
                  border: '1px solid rgba(180,83,9,0.22)',
                  borderRadius: 10, display: 'flex',
                  flexDirection: 'column', gap: 6,
                }}>
                  {missingReasons.map((r) => (
                    <li
                      key={r}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 12.5, color: '#a04e09', fontWeight: 600,
                      }}
                    >
                      <AlertCircle size={12} aria-hidden="true" /> {r}
                    </li>
                  ))}
                </ul>
              )}

              <div style={stepActions(isMobile)}>
                <button
                  type="button"
                  className="estia-imp-cta"
                  disabled={!requiredOK}
                  onClick={() => setStep(3)}
                  style={primaryBtn({ disabled: !requiredOK, isMobile })}
                >
                  המשך לתצוגה מקדימה
                </button>
              </div>
            </>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              fontSize: 13, color: DT.muted,
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color: DT.success, fontWeight: 700,
              }}>
                <CheckCircle2 size={14} aria-hidden="true" /> מיפוי מוכן
              </span>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="estia-imp-ghost"
                style={ghostBtn(isMobile)}
              >
                שנה מיפוי
              </button>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── STEP 3 ──────────────────────────────────────────────── */}
      {step >= 3 && (
        <SectionCard
          n={3}
          Icon={Eye}
          title="תצוגה מקדימה"
          active={step === 3}
          complete={step > 3}
          isMobile={isMobile}
          headerRight={
            step === 3 ? (
              <span style={{ fontSize: 12, color: DT.muted, fontWeight: 600 }}>
                {validPickedCount} מתוך {rows.length} נבחרו
                {invalidCount > 0 && (
                  <span style={{ color: DT.danger, marginInlineStart: 6 }}>
                    · {invalidCount} לא תקינות
                  </span>
                )}
              </span>
            ) : null
          }
        >
          {step === 3 && (
            <>
              <div style={{
                display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap',
              }}>
                <button
                  type="button"
                  className="estia-imp-ghost"
                  onClick={() => setPicked(new Set(previewRows.filter((r) => r.valid).map((r) => r.i)))}
                  style={ghostBtn(isMobile)}
                >
                  <Check size={12} aria-hidden="true" /> בחר הכול
                </button>
                <button
                  type="button"
                  className="estia-imp-ghost"
                  onClick={() => setPicked(new Set())}
                  style={ghostBtn(isMobile)}
                >
                  <XIcon size={12} aria-hidden="true" /> נקה בחירה
                </button>
              </div>

              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                maxHeight: isMobile ? 'none' : 540,
                overflowY: isMobile ? 'visible' : 'auto',
                paddingInlineEnd: isMobile ? 0 : 4,
              }}>
                {previewRows.map((r) => {
                  const sel = picked.has(r.i);
                  const invalid = !r.valid;
                  return (
                    <label
                      key={r.i}
                      className="estia-imp-row"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? 'auto 1fr' : 'auto 1fr auto',
                        gap: isMobile ? 10 : 14, alignItems: 'center',
                        padding: isMobile ? '12px' : '12px 14px',
                        border: `1px solid ${
                          invalid ? 'rgba(185,28,28,0.22)' :
                          sel ? DT.gold : DT.border
                        }`,
                        borderRadius: 12,
                        background: invalid ? 'rgba(185,28,28,0.04)' :
                                     sel ? 'rgba(180,139,76,0.06)' : DT.white,
                        cursor: invalid ? 'not-allowed' : 'pointer',
                        opacity: invalid ? 0.7 : 1,
                        transition: 'background 0.14s, border-color 0.14s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={sel}
                        disabled={invalid}
                        onChange={(e) => setPicked((p) => {
                          const n = new Set(p);
                          if (e.target.checked) n.add(r.i); else n.delete(r.i);
                          return n;
                        })}
                        style={{
                          accentColor: DT.gold, width: 16, height: 16,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile
                          ? 'repeat(2, minmax(0, 1fr))'
                          : 'repeat(4, minmax(0, 1fr))',
                        gap: isMobile ? 8 : 12, minWidth: 0,
                      }}>
                        {Object.entries(r.summary).map(([k, v]) => (
                          <div key={k} style={{
                            display: 'flex', flexDirection: 'column',
                            gap: 2, minWidth: 0,
                          }}>
                            <small style={{
                              fontSize: 10.5, color: DT.muted,
                              letterSpacing: 0.4, fontWeight: 700,
                              textTransform: 'uppercase',
                            }}>{k}</small>
                            <strong style={{
                              fontSize: 13, color: DT.ink, fontWeight: 700,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>{v == null || v === '' ? '—' : String(v)}</strong>
                          </div>
                        ))}
                      </div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11.5, fontWeight: 700,
                        color: invalid ? DT.danger : DT.success,
                        whiteSpace: 'nowrap',
                        gridColumn: isMobile ? '1 / -1' : 'auto',
                        justifySelf: isMobile ? 'flex-start' : 'auto',
                      }}>
                        {invalid
                          ? <><AlertCircle size={13} aria-hidden="true" /> {r.err}</>
                          : <><CheckCircle2 size={13} aria-hidden="true" /> תקין</>}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div style={stepActions(isMobile)}>
                <button
                  type="button"
                  className="estia-imp-ghost"
                  onClick={() => setStep(2)}
                  style={ghostBtn(isMobile)}
                >
                  חזור למיפוי
                </button>
                <button
                  type="button"
                  className="estia-imp-cta"
                  onClick={start}
                  disabled={validPickedCount === 0}
                  style={primaryBtn({ disabled: validPickedCount === 0, isMobile })}
                >
                  ייבא {validPickedCount} שורות
                </button>
              </div>
            </>
          )}
        </SectionCard>
      )}

      {/* ── STEP 4 ──────────────────────────────────────────────── */}
      {step === 4 && (
        <SectionCard
          n={4}
          Icon={Send}
          title={done ? 'הייבוא הסתיים' : 'מייבא ברקע…'}
          active
          isMobile={isMobile}
        >
          {!done && jobStatus && (
            <div>
              <div style={{
                height: 12, background: DT.cream2,
                borderRadius: 999, overflow: 'hidden',
                border: `1px solid ${DT.border}`,
              }}>
                <div style={{
                  height: '100%', width: `${Math.round((jobStatus.processed / Math.max(1, jobStatus.total)) * 100)}%`,
                  background: `linear-gradient(135deg, ${DT.goldLight} 0%, ${DT.gold} 100%)`,
                  transition: 'width 0.25s ease',
                  borderRadius: 999,
                }} />
              </div>
              <p style={{
                margin: '10px 0 0', fontSize: 13, color: DT.muted,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {jobStatus.processed} / {jobStatus.total} שורות · נוצרו {jobStatus.created} · דולגו {jobStatus.skipped} · נכשלו {jobStatus.failed}
              </p>
            </div>
          )}
          {!done && !jobStatus && (
            <p style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              color: DT.muted, fontSize: 13, margin: 0,
            }}>
              <Loader2 size={14} aria-hidden="true" style={{ animation: 'estia-imp-spin 1s linear infinite' }} />
              ממתין לנתונים…
            </p>
          )}
          {done && (
            <div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile
                  ? 'repeat(3, minmax(0, 1fr))'
                  : 'repeat(3, minmax(0, 1fr))',
                gap: isMobile ? 8 : 14,
              }}>
                <DoneStat value={jobStatus.created} label="נוצרו" tone="success" />
                <DoneStat value={jobStatus.skipped} label="דולגו (כפילויות)" tone="muted" />
                <DoneStat value={jobStatus.failed} label="נכשלו" tone={jobStatus.failed > 0 ? 'danger' : 'muted'} />
              </div>

              {jobStatus.errors?.length > 0 && (
                <details style={{
                  marginTop: 14, padding: '12px 14px',
                  background: DT.cream4, borderRadius: 10,
                  border: `1px solid ${DT.border}`, fontSize: 12.5,
                }}>
                  <summary style={{
                    cursor: 'pointer', color: DT.muted, fontWeight: 700,
                    listStyle: 'revert',
                  }}>
                    פירוט שגיאות ({Math.min(20, jobStatus.errors.length)})
                  </summary>
                  <ul style={{ listStyle: 'none', padding: '8px 0 0', margin: 0 }}>
                    {jobStatus.errors.slice(0, 20).map((e) => (
                      <li
                        key={e.rowIndex}
                        style={{
                          padding: '4px 0', color: DT.ink,
                          borderTop: `1px solid ${DT.border}`,
                        }}
                      >
                        שורה {e.rowIndex + 2}: {e.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div style={stepActions(isMobile)}>
                <button
                  type="button"
                  className="estia-imp-ghost"
                  onClick={reset}
                  style={ghostBtn(isMobile)}
                >
                  ייבוא נוסף
                </button>
                <button
                  type="button"
                  className="estia-imp-cta"
                  onClick={() => navigate(`${LIST_ROUTE[entityType]}?importBatch=${jobStatus.batchId}`)}
                  style={primaryBtn({ isMobile })}
                >
                  {entityType === 'LEAD' ? 'צפה בלידים החדשים' : 'צפה בנכסים החדשים'}
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function Stepper({ step, isMobile }) {
  return (
    <nav
      aria-label="שלבי הייבוא"
      style={{
        display: 'flex', alignItems: 'center',
        gap: isMobile ? 6 : 10,
        padding: isMobile ? '12px' : '14px 18px',
        marginBottom: isMobile ? 14 : 18,
        background: DT.white,
        border: `1px solid ${DT.border}`,
        borderRadius: 14,
        overflowX: isMobile ? 'auto' : 'visible',
      }}
    >
      {STEPS.map((s, idx) => {
        const isActive   = step === s.n;
        const isComplete = step > s.n;
        const Icon = s.Icon;
        return (
          <div
            key={s.n}
            style={{
              display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10,
              flexShrink: 0,
            }}
          >
            <div
              aria-current={isActive ? 'step' : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: isMobile ? '4px 8px' : '6px 12px',
                borderRadius: 99,
                background: isActive
                  ? `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`
                  : isComplete
                    ? DT.goldSoft
                    : 'transparent',
                color: isActive ? DT.ink
                  : isComplete ? DT.goldDark
                  : DT.muted,
                border: isActive
                  ? 'none'
                  : `1px solid ${isComplete ? 'transparent' : DT.border}`,
                fontWeight: 700,
                fontSize: isMobile ? 11.5 : 12.5,
                whiteSpace: 'nowrap',
                boxShadow: isActive
                  ? '0 4px 10px rgba(180,139,76,0.30)'
                  : 'none',
              }}
            >
              <span style={{
                width: isMobile ? 18 : 20, height: isMobile ? 18 : 20,
                borderRadius: '50%',
                background: isActive ? DT.ink
                  : isComplete ? DT.gold
                  : DT.cream2,
                color: isActive ? DT.cream
                  : isComplete ? DT.white
                  : DT.muted,
                display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11, fontWeight: 800,
              }}>
                {isComplete ? <Check size={11} aria-hidden="true" /> : s.n}
              </span>
              <Icon size={12} aria-hidden="true" />
              <span>{s.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                style={{
                  width: isMobile ? 10 : 22, height: 1,
                  background: step > s.n ? DT.gold : DT.border,
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

function SectionCard({ n, Icon, title, active, complete, isMobile, headerRight, children }) {
  return (
    <section
      style={{
        background: DT.white,
        border: `1px solid ${active ? DT.gold : DT.border}`,
        borderRadius: 16,
        padding: isMobile ? '16px 14px' : '20px 22px',
        marginBlockEnd: 14,
        boxShadow: active ? '0 6px 22px rgba(30,26,20,0.06)' : 'none',
        transition: 'border-color 0.14s, box-shadow 0.14s',
      }}
    >
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 14, flexWrap: 'wrap',
      }}>
        <span
          aria-hidden="true"
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: complete
              ? DT.gold
              : active
                ? `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`
                : DT.cream2,
            color: complete || active ? DT.white : DT.muted,
            display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13, fontWeight: 800,
            boxShadow: active ? '0 4px 10px rgba(180,139,76,0.30)' : 'none',
          }}
        >
          {complete ? <Check size={14} aria-hidden="true" /> : n}
        </span>
        <Icon size={16} aria-hidden="true" style={{ color: active ? DT.goldDark : DT.muted }} />
        <h2 style={{
          fontSize: isMobile ? 15 : 17, fontWeight: 800,
          letterSpacing: -0.3, margin: 0, color: DT.ink,
        }}>{title}</h2>
        {headerRight && (
          <span style={{ marginInlineStart: 'auto' }}>{headerRight}</span>
        )}
      </header>
      {children}
    </section>
  );
}

function DoneStat({ value, label, tone }) {
  const color = tone === 'success' ? DT.success
              : tone === 'danger' ? DT.danger
              : DT.ink;
  return (
    <div style={{
      textAlign: 'center', padding: '20px 12px',
      background: DT.cream4, borderRadius: 12,
      border: `1px solid ${DT.border}`,
    }}>
      <strong style={{
        display: 'block', fontSize: 30, fontWeight: 800,
        color, fontVariantNumeric: 'tabular-nums',
      }}>{value ?? 0}</strong>
      <span style={{ fontSize: 12, color: DT.muted, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

// ─── Inline button helpers ───────────────────────────────────────

function primaryBtn({ disabled = false, isMobile = false } = {}) {
  return {
    ...FONT,
    background: disabled
      ? DT.cream3
      : `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none',
    color: disabled ? DT.muted : DT.ink,
    padding: isMobile ? '10px 16px' : '10px 20px',
    borderRadius: 10,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13.5, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    justifyContent: 'center',
    boxShadow: disabled ? 'none' : '0 4px 10px rgba(180,139,76,0.3)',
    transition: 'filter 0.14s, box-shadow 0.14s',
  };
}

function ghostBtn(isMobile = false) {
  return {
    ...FONT,
    background: DT.cream2,
    border: `1px solid ${DT.border}`,
    color: DT.ink,
    padding: isMobile ? '7px 12px' : '7px 14px',
    borderRadius: 10, cursor: 'pointer',
    fontSize: 12.5, fontWeight: 700,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.14s',
  };
}

function stepActions(isMobile) {
  return {
    display: 'flex',
    gap: 10,
    marginTop: 18,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    flexDirection: isMobile ? 'column-reverse' : 'row',
  };
}
