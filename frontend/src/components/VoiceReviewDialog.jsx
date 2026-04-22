import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, Edit3, Loader2 } from 'lucide-react';
import Portal from './Portal';
import useFocusTrap from '../hooks/useFocusTrap';
import { PhoneField, Segmented } from './SmartFields';
import { useToast } from '../lib/toast';
import api from '../lib/api';
import './VoiceReviewDialog.css';

// H3 — post-recording review dialog.
//
// Agent sees the transcript, the LLM's extracted fields, and confirms
// or tweaks before we persist. When the backend already created the
// entity (`mode === 'created'`), Save just dismisses and navigates;
// when it returned a draft, Save posts the current values via the
// regular createLead / createProperty endpoints.
//
// Props:
//   kind           'LEAD' | 'PROPERTY'
//   onKindChange   (next) => void — flips the top Segmented tab
//   loading        boolean — upload in flight; show skeletons
//   result         { transcript, extracted, created?, mode, traceId } | null
//   onClose        () => void — cancel / dismiss
//   onCreated      (entity) => void — runs with the saved entity row

// Field schemas — matches the backend extractor output. Keeping them
// small on purpose: the point is confirm-and-save, not a full form.
const LEAD_FIELDS = [
  { key: 'name',  label: 'שם הלקוח',    type: 'text' },
  { key: 'phone', label: 'טלפון',        type: 'phone' },
  { key: 'email', label: 'אימייל',       type: 'text' },
  { key: 'city',  label: 'עיר',           type: 'text' },
  { key: 'roomsMin',  label: 'חדרים מ',  type: 'number' },
  { key: 'roomsMax',  label: 'חדרים עד', type: 'number' },
  { key: 'priceMin',  label: 'מחיר מ',    type: 'number' },
  { key: 'priceMax',  label: 'מחיר עד',   type: 'number' },
  { key: 'notes', label: 'הערות',         type: 'textarea' },
];

const PROPERTY_FIELDS = [
  { key: 'ownerName', label: 'שם בעל הנכס', type: 'text' },
  { key: 'ownerPhone', label: 'טלפון בעל הנכס', type: 'phone' },
  { key: 'city',  label: 'עיר', type: 'text' },
  { key: 'street', label: 'רחוב', type: 'text' },
  { key: 'marketingPrice', label: 'מחיר שיווק', type: 'number' },
  { key: 'sqm',   label: 'מ״ר', type: 'number' },
  { key: 'rooms', label: 'חדרים', type: 'number' },
  { key: 'floor', label: 'קומה', type: 'number' },
  { key: 'notes', label: 'הערות', type: 'textarea' },
];

export default function VoiceReviewDialog({
  kind = 'LEAD',
  onKindChange,
  loading = false,
  result = null,
  onClose,
  onCreated,
}) {
  const panelRef = useRef(null);
  const toast = useToast();
  useFocusTrap(panelRef, { onEscape: onClose });

  const [editTranscript, setEditTranscript] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [fields, setFields] = useState({});
  const [saving, setSaving] = useState(false);

  // Re-seed whenever a new result arrives. We keep a shallow copy so
  // the dialog owns the edits; nothing mutates the upstream `result`.
  useEffect(() => {
    setTranscript(result?.transcript || '');
    setFields({ ...(result?.extracted || {}) });
  }, [result]);

  const schema = useMemo(() => (kind === 'PROPERTY' ? PROPERTY_FIELDS : LEAD_FIELDS), [kind]);
  const isCreated = result?.mode === 'created' && result?.created;

  const update = useCallback((key, value) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onSave = useCallback(async () => {
    if (saving) return;
    if (isCreated) {
      onCreated?.(result.created);
      return;
    }
    setSaving(true);
    try {
      if (kind === 'LEAD') {
        // The LEAD create surface accepts `name` as the required field.
        if (!fields.name && !fields.phone) {
          toast.error('נדרש שם או טלפון כדי לשמור ליד');
          setSaving(false);
          return;
        }
        const body = {
          name: fields.name || fields.phone || 'ליד חדש',
          phone: fields.phone || null,
          email: fields.email || null,
          city: fields.city || null,
          roomsMin: fields.roomsMin ? Number(fields.roomsMin) : null,
          roomsMax: fields.roomsMax ? Number(fields.roomsMax) : null,
          priceMin: fields.priceMin ? Number(fields.priceMin) : null,
          priceMax: fields.priceMax ? Number(fields.priceMax) : null,
          notes: fields.notes || transcript || null,
          source: fields.source || 'קול',
        };
        const res = await api.createLead(body);
        const entity = res?.lead || res;
        toast.success('הליד נשמר');
        onCreated?.(entity);
      } else {
        // PROPERTY — backend requires city + marketingPrice for full
        // records; we pass whatever we have and surface the server's
        // validation message on failure.
        const body = {
          city: fields.city || null,
          street: fields.street || null,
          marketingPrice: fields.marketingPrice ? Number(fields.marketingPrice) : null,
          sqm: fields.sqm ? Number(fields.sqm) : null,
          rooms: fields.rooms ? Number(fields.rooms) : null,
          floor: fields.floor != null && fields.floor !== '' ? Number(fields.floor) : null,
          owner: fields.ownerName || null,
          ownerPhone: fields.ownerPhone || null,
          notes: fields.notes || transcript || null,
        };
        const res = await api.createProperty(body);
        const entity = res?.property || res;
        toast.success('הנכס נשמר');
        onCreated?.(entity);
      }
    } catch (e) {
      toast.error(e?.message || 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }, [saving, isCreated, kind, fields, transcript, result, onCreated, toast]);

  return (
    <Portal>
      <div className="vr-backdrop" onClick={onClose} role="presentation">
        <div
          ref={panelRef}
          className="vr-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vr-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="vr-header">
            <h3 id="vr-title">בדיקה וסגירה</h3>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              aria-label="סגור"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          <div className="vr-kind-row">
            <span className="vr-kind-label">סוג הרשומה</span>
            <Segmented
              value={kind}
              onChange={(v) => onKindChange?.(v)}
              options={[
                { value: 'LEAD',     label: 'ליד' },
                { value: 'PROPERTY', label: 'נכס' },
              ]}
              ariaLabel="סוג הרשומה"
            />
          </div>

          <div className="vr-body">
            {loading ? (
              <>
                <div className="vr-block" aria-label="טוען תמלול" aria-busy="true">
                  <div className="vr-block-title">מתמלל…</div>
                  <div className="vr-skeleton" />
                  <div className="vr-skeleton" />
                  <div className="vr-skeleton short" />
                </div>
                <div className="vr-block" aria-label="טוען שדות" aria-busy="true">
                  <div className="vr-block-title">מחלץ שדות…</div>
                  <div className="vr-skeleton" />
                  <div className="vr-skeleton short" />
                </div>
              </>
            ) : (
              <>
                <div className="vr-block">
                  <div className="vr-block-title">
                    <span>תמלול</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditTranscript((v) => !v)}
                    >
                      <Edit3 size={14} aria-hidden="true" />
                      {editTranscript ? 'סיים עריכה' : 'ערוך תמלול'}
                    </button>
                  </div>
                  {editTranscript ? (
                    <textarea
                      className="vr-transcript-edit"
                      value={transcript}
                      dir="auto"
                      aria-label="תמלול"
                      onChange={(e) => setTranscript(e.target.value)}
                    />
                  ) : (
                    <div className="vr-transcript" dir="auto">
                      {transcript || (
                        <em style={{ opacity: 0.6 }}>לא הצלחנו לחלץ שדות — ערוך ידנית והזן בטופס החדש</em>
                      )}
                    </div>
                  )}
                </div>

                <div className="vr-block">
                  <div className="vr-block-title">
                    <span>שדות שחולצו</span>
                    {result?.mode === 'created' && <span aria-label="נוצר">נשמר</span>}
                  </div>
                  <div className="vr-fields">
                    {schema.map((f) => (
                      <div key={f.key} className="vr-field">
                        <label htmlFor={`vr-${f.key}`}>{f.label}</label>
                        {f.type === 'phone' ? (
                          <PhoneField
                            value={fields[f.key] || ''}
                            onChange={(v) => update(f.key, v)}
                          />
                        ) : f.type === 'textarea' ? (
                          <textarea
                            id={`vr-${f.key}`}
                            rows={2}
                            dir="auto"
                            value={fields[f.key] ?? ''}
                            onChange={(e) => update(f.key, e.target.value)}
                          />
                        ) : (
                          <input
                            id={`vr-${f.key}`}
                            type="text"
                            inputMode={f.type === 'number' ? 'numeric' : 'text'}
                            dir="auto"
                            value={fields[f.key] ?? ''}
                            onChange={(e) => update(f.key, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="vr-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              בטל
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSave}
              disabled={saving || loading}
            >
              {saving ? <Loader2 size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
              {saving ? 'שומר…' : 'שמור'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
