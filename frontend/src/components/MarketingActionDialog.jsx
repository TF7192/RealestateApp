import { useEffect, useRef, useState } from 'react';
import {
  X, Check, ExternalLink, Upload, Link2, FileText, AlertCircle, Trash2,
} from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import './MarketingActionDialog.css';

// Configuration per action key: kind determines the collection flow.
// - 'upload'  → let agent upload images/PDF
// - 'link'    → paste listing / external URL
// - 'notes'   → freeform notes + done toggle
const ACTION_CONFIG = {
  tabuExtract: { label: 'הפקת נסח טאבו', kind: 'upload', accept: 'application/pdf', hint: 'העלאת קובץ הנסח מטאבו' },
  photography: { label: 'צילום הנכס', kind: 'upload', accept: 'image/*', hint: 'העלאת תמונות מקצועיות של הנכס' },
  buildingPhoto: { label: 'צילום הבניין', kind: 'upload', accept: 'image/*', hint: 'תמונה חיצונית של הבניין' },
  dronePhoto: { label: 'צילום מקצועי רחפן', kind: 'upload', accept: 'image/*', hint: 'צילום אווירי באיכות גבוהה' },
  virtualTour: { label: 'סיור וירטואלי', kind: 'link', hint: 'קישור לסיור 3D / Matterport' },
  sign: { label: 'תליית שלט', kind: 'upload', accept: 'image/*', hint: 'תמונה של השלט במקום' },
  iList: { label: 'i-list', kind: 'link', hint: 'קישור לפרסום ב-i-list' },
  yad2: { label: 'פרסום ביד 2', kind: 'link', hint: 'כתובת המודעה ביד 2' },
  facebook: { label: 'פרסום בפייסבוק', kind: 'link', hint: 'קישור לפוסט / מודעה' },
  marketplace: { label: 'מרקטפלייס', kind: 'link', hint: 'קישור למודעה במרקטפלייס' },
  onMap: { label: 'on map', kind: 'link', hint: 'קישור לרישום במפה' },
  madlan: { label: 'מדלן', kind: 'link', hint: 'כתובת המודעה ב-madlan' },
  whatsappGroup: { label: 'קבוצת וואטסאפ', kind: 'notes', hint: 'שם הקבוצה ותאריך הפרסום' },
  officeWhatsapp: { label: 'וואטסאפ משרדי', kind: 'notes', hint: 'פרטי הפרסום המשרדי' },
  brokerCoop: { label: 'שיתופי פעולה מתווכים', kind: 'notes', hint: 'שם המתווך/משרד ששותף' },
  externalCoop: { label: 'שיתופי פעולה מתווכים', kind: 'notes', hint: 'שם המתווך/משרד ששותף' },
  video: { label: 'סרטון', kind: 'link', hint: 'קישור לסרטון (YouTube / Drive)' },
  neighborLetters: { label: 'מכתבי שכנים', kind: 'notes', hint: 'כמה מכתבים, תאריך הפצה' },
  coupons: { label: 'גזירונים', kind: 'notes', hint: 'איפה פורסם' },
  flyers: { label: 'עלונים', kind: 'notes', hint: 'כמות ומיקום' },
  newspaper: { label: 'עיתונות מקומית', kind: 'link', hint: 'קישור למודעה באונליין, או שם העיתון המקומי' },
  agentTour: { label: 'סיור סוכנים', kind: 'notes', hint: 'תאריך ומספר סוכנים' },
  openHouse: { label: 'בית פתוח', kind: 'notes', hint: 'תאריך וסיכום' },
};

export default function MarketingActionDialog({
  propertyId,
  actionKey,
  initial = {},
  onClose,
  onSaved,
}) {
  const config = ACTION_CONFIG[actionKey] || { label: actionKey, kind: 'notes', hint: '' };
  const [notes, setNotes] = useState(initial.notes || '');
  const [link, setLink] = useState(initial.link || '');
  const [done, setDone] = useState(!!initial.done);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    setNotes(initial.notes || '');
    setLink(initial.link || '');
    setDone(!!initial.done);
  }, [actionKey, initial.notes, initial.link, initial.done]);

  const save = async (overrides = {}) => {
    setBusy(true);
    setError(null);
    try {
      await api.toggleMarketingAction(propertyId, {
        actionKey,
        done: overrides.done ?? done,
        notes: (overrides.notes ?? notes) || null,
        link: (overrides.link ?? link) || null,
      });
      onSaved?.();
    } catch (e) {
      setError(e.message || 'שמירה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const handleMarkDone = async () => {
    setDone(true);
    await save({ done: true });
  };

  const handleUnmark = async () => {
    setDone(false);
    await save({ done: false });
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      // For photo actions, attach to the property gallery directly.
      await api.uploadPropertyImage(propertyId, file);
      // Then mark the action done + add a note reference
      const updatedNotes = notes || `הועלה ${file.name}`;
      setNotes(updatedNotes);
      await save({ done: true, notes: updatedNotes });
    } catch (e) {
      setError(e.message || 'העלאה נכשלה');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveLink = async () => {
    if (!link.trim()) {
      setError('יש להזין קישור תקף');
      return;
    }
    await save({ done: true, link: link.trim() });
  };

  const handleSaveNotes = async () => {
    await save({ done: true, notes });
  };

  return (
    <Portal>
      <div className="agreement-backdrop" onClick={onClose}>
        <div className="agreement-modal ma-modal" onClick={(e) => e.stopPropagation()}>
          <header className="agreement-header">
            <div>
              <h3>{config.label}</h3>
              <p>{config.hint}</p>
            </div>
            <button className="btn-ghost" onClick={onClose} aria-label="סגור">
              <X size={18} />
            </button>
          </header>

          <div className="agreement-body">
            {error && (
              <div className="agreement-error">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {done && (
              <div className="ma-done-banner">
                <Check size={16} />
                הפעולה סומנה כהושלמה
              </div>
            )}

            {/* Upload flow */}
            {config.kind === 'upload' && (
              <div className="ma-section">
                <h4>העלאת קובץ</h4>
                <div
                  className={`ma-dropzone ${uploading ? 'is-busy' : ''}`}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={28} />
                  <p>{uploading ? 'מעלה...' : 'לחץ לבחירת קובץ'}</p>
                  <span>{config.accept?.includes('image') ? 'תמונות JPG / PNG' : 'PDF או תמונה'}</span>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept={config.accept}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                />

                <label className="ma-field-label">הערות (אופציונלי)</label>
                <textarea
                  className="ma-textarea"
                  rows={2}
                  dir="auto"
                  autoCapitalize="sentences"
                  enterKeyHint="enter"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="הערות על הקובץ שהועלה"
                />
              </div>
            )}

            {/* Link flow */}
            {config.kind === 'link' && (
              <div className="ma-section">
                <h4>קישור לפרסום</h4>
                <div className="ma-link-row">
                  <div className="ma-input-with-icon">
                    <Link2 size={14} />
                    <input
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      enterKeyHint="go"
                      dir="ltr"
                      className="ma-input"
                      placeholder="https://..."
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                    />
                  </div>
                  {link && /^https?:\/\//.test(link) && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                    >
                      <ExternalLink size={14} />
                      פתח
                    </a>
                  )}
                </div>

                <label className="ma-field-label">הערות (אופציונלי)</label>
                <textarea
                  className="ma-textarea"
                  rows={2}
                  dir="auto"
                  autoCapitalize="sentences"
                  enterKeyHint="enter"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="למשל: תאריך פרסום, אסטרטגיית מחיר..."
                />

                <button className="btn btn-primary ma-save-btn" onClick={handleSaveLink} disabled={busy}>
                  <Check size={14} />
                  שמור ובטא כהושלם
                </button>
              </div>
            )}

            {/* Notes flow */}
            {config.kind === 'notes' && (
              <div className="ma-section">
                <h4>פרטים</h4>
                <label className="ma-field-label">הערות</label>
                <textarea
                  className="ma-textarea"
                  rows={4}
                  dir="auto"
                  autoCapitalize="sentences"
                  enterKeyHint="enter"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={config.hint}
                />
                {/* 1.7 — every marketing action now carries an optional
                    URL (not just link-kind ones). Saved via the same
                    `link` column; blank = null. */}
                <label className="ma-field-label">קישור מקור (אופציונלי)</label>
                <div className="ma-input-with-icon">
                  <Link2 size={14} />
                  <input
                    type="url"
                    inputMode="url"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    dir="ltr"
                    className="ma-input"
                    placeholder="https://…"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                  />
                </div>
                <button className="btn btn-primary ma-save-btn" onClick={handleSaveNotes} disabled={busy}>
                  <Check size={14} />
                  שמור וסמן כהושלם
                </button>
              </div>
            )}

            {/* Current notes preview when already has content */}
            {(initial.notes || initial.link) && !['upload', 'link', 'notes'].includes(config.kind) && (
              <div className="ma-section">
                <h4>פרטים שמורים</h4>
                {initial.link && (
                  <div className="ma-saved-row">
                    <Link2 size={14} />
                    <a href={initial.link} target="_blank" rel="noreferrer">
                      {initial.link}
                    </a>
                  </div>
                )}
                {initial.notes && (
                  <div className="ma-saved-row">
                    <FileText size={14} />
                    {initial.notes}
                  </div>
                )}
              </div>
            )}

            {/* Bottom: clear/undo action */}
            {done && (
              <div className="ma-clear-row">
                <button className="btn btn-ghost" onClick={handleUnmark} disabled={busy}>
                  <Trash2 size={14} />
                  בטל סימון
                </button>
              </div>
            )}
            {!done && config.kind === 'upload' && (
              <div className="ma-clear-row">
                <button className="btn btn-secondary" onClick={handleMarkDone} disabled={busy}>
                  סמן כהושלם ללא קובץ
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
