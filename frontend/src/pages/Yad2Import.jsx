import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, ArrowRight, AlertCircle, Check, Loader2, Building2, Store, Home as HomeIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';
import { formatFloor } from '../lib/formatFloor';
import './Yad2Import.css';

// Yad2 agency-wide importer. Paste an agency URL like:
//   https://www.yad2.co.il/realestate/agency/7098700/forsale
// The backend walks /forsale, /rent, /commercial × all pages, parses
// __NEXT_DATA__ for each, returns a flat list grouped per section. This
// screen lets the agent pick which to import — the import call then
// downloads each cover image to /uploads/properties/.../yad2-cover.jpg
// and creates a Property row.

const SECTION_LABEL = { forsale: 'מכירה', rent: 'השכרה', commercial: 'מסחרי' };
const SECTION_ICON  = { forsale: HomeIcon, rent: Building2, commercial: Store };

export default function Yad2Import() {
  const navigate = useNavigate();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [step, setStep] = useState('paste'); // paste | review | done
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [extracted, setExtracted] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [agency, setAgency] = useState(null);
  const [sections, setSections] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [result, setResult] = useState(null);

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

  const fetchPreview = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await api.yad2AgencyPreview(url.trim());
      setExtracted(res.listings || []);
      setAgency(res.agency || null);
      setSections(res.sections || []);
      setTruncated(!!res.truncated);
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
      const res = await api.yad2AgencyImport(toImport);
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
          <label className="y2-label" htmlFor="y2-url">קישור לדף הסוכנות שלך ב-Yad2</label>
          <input
            id="y2-url"
            className="y2-input"
            inputMode="url"
            enterKeyHint="go"
            placeholder="https://www.yad2.co.il/realestate/agency/7098700/forsale"
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
            {busy ? 'סורק וסופר תמונות — עד דקה וחצי…' : 'סרוק את כל הנכסים'}
          </button>
          <p className="y2-hint">
            כל אחת משלושת הקטגוריות (מכירה / השכרה / מסחרי) נסרקת בנפרד, כולל כל העמודים בכל קטגוריה.
            ניתן להעתיק קישור לכל אחת מהן — אנחנו נזהה את הסוכנות אוטומטית.
          </p>
        </section>
      )}

      {step === 'review' && (
        <section className="y2-card">
          <header className="y2-review-head">
            <div>
              <strong>{extracted.length} נכסים נמצאו</strong>
              {agency?.name && <span className="y2-agency">· {agency.name}</span>}
              <span> · {picked.size} נבחרו לייבוא</span>
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
                              {/* Detail-phase enrichment count — when the
                                  detail-page fetch landed extra photos,
                                  show "+N תמונות" so the agent knows the
                                  import will pull more than the cover. */}
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
              disabled={picked.size === 0 || busy}
              onClick={importPicked}
            >
              {busy ? <Loader2 size={14} className="y2-spin" /> : <Check size={14} />}
              {busy ? 'מייבא ומוריד תמונות…' : `ייבא ${picked.size} נכסים`}
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
              ייבא סוכנות נוספת
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
