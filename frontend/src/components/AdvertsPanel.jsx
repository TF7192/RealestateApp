import { useCallback, useEffect, useState, useId } from 'react';
import { Plus, Trash2, ExternalLink } from 'lucide-react';
import api from '../lib/api';
import { NumberField, SelectField } from './SmartFields';
import EmptyState from './EmptyState';
import { displayDate, displayPrice } from '../lib/display';
import {
  ADVERT_CHANNEL_LABELS,
  ADVERT_STATUS_LABELS,
  labelsToOptions,
  labelFor,
} from '../lib/mlsLabels';
import './AdvertsPanel.css';

// F1 — per-channel marketing adverts.
//
// Displays the per-property list of adverts (one row per channel/status
// combination), plus an expandable "new advert" form. Each row lets the
// agent transition status (draft → published → paused/expired) via a
// status <select> that PATCHes in place, and a remove button.
//
// Fields written to the server on create/update:
//   channel | status | title | body | publishedPrice |
//   externalUrl | externalId | publishedAt | expiresAt

const CHANNEL_OPTIONS = labelsToOptions(ADVERT_CHANNEL_LABELS);
const STATUS_OPTIONS = labelsToOptions(ADVERT_STATUS_LABELS);

const emptyDraft = () => ({
  channel: 'YAD2',
  status: 'DRAFT',
  title: '',
  body: '',
  publishedPrice: null,
  externalUrl: '',
  externalId: '',
});

export default function AdvertsPanel({ propertyId, toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const titleId = useId();

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const res = await api.listAdverts(propertyId);
      setItems(res?.items || []);
    } catch (e) {
      toast?.error?.(e?.message || 'טעינת המודעות נכשלה');
    } finally {
      setLoading(false);
    }
  }, [propertyId, toast]);

  useEffect(() => { load(); }, [load]);

  const submitCreate = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    try {
      const body = {
        channel: draft.channel,
        status: draft.status || 'DRAFT',
        title: draft.title || null,
        body: draft.body || null,
        publishedPrice: draft.publishedPrice == null || draft.publishedPrice === ''
          ? null
          : Number(draft.publishedPrice),
        externalUrl: draft.externalUrl || null,
        externalId: draft.externalId || null,
      };
      await api.createAdvert(propertyId, body);
      toast?.success?.(`המודעה ב${labelFor(ADVERT_CHANNEL_LABELS, draft.channel)} נוצרה`);
      setDraft(emptyDraft());
      setCreating(false);
      await load();
    } catch (e2) {
      toast?.error?.(e2?.message || 'יצירת המודעה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (advert, nextStatus) => {
    if (!advert?.id || nextStatus === advert.status) return;
    setBusyId(advert.id);
    try {
      const body = { status: nextStatus };
      // When moving to PUBLISHED, stamp publishedAt if not already set.
      if (nextStatus === 'PUBLISHED' && !advert.publishedAt) {
        body.publishedAt = new Date().toISOString();
      }
      await api.updateAdvert(advert.id, body);
      toast?.success?.(`סטטוס עודכן ל${labelFor(ADVERT_STATUS_LABELS, nextStatus)}`);
      await load();
    } catch (e) {
      toast?.error?.(e?.message || 'עדכון הסטטוס נכשל');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (advertId) => {
    setBusyId(advertId);
    try {
      await api.deleteAdvert(advertId);
      toast?.info?.('המודעה הוסרה');
      await load();
    } catch (e) {
      toast?.error?.(e?.message || 'הסרה נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  const d = (k, v) => setDraft((p) => ({ ...p, [k]: v }));

  return (
    <section className="adp-root" aria-labelledby={titleId}>
      <header className="adp-head">
        <h3 id={titleId} className="adp-title">מודעות פרסום</h3>
        {!creating && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCreating(true)}
          >
            <Plus size={14} aria-hidden="true" />
            מודעה חדשה
          </button>
        )}
      </header>

      {creating && (
        <form className="adp-form" onSubmit={submitCreate} aria-label="טופס מודעה חדשה">
          <div className="adp-form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="adp-channel">ערוץ</label>
              <SelectField
                id="adp-channel"
                value={draft.channel}
                onChange={(v) => d('channel', v)}
                options={CHANNEL_OPTIONS}
                aria-label="ערוץ המודעה"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="adp-status-new">סטטוס ראשוני</label>
              <SelectField
                id="adp-status-new"
                value={draft.status}
                onChange={(v) => d('status', v)}
                options={STATUS_OPTIONS}
                aria-label="סטטוס ראשוני"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="adp-price">מחיר מפורסם</label>
              <NumberField
                id="adp-price"
                value={draft.publishedPrice}
                onChange={(v) => d('publishedPrice', v)}
                unit="₪"
                placeholder="2,500,000"
                showShort
                aria-label="מחיר מפורסם"
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="adp-title">כותרת</label>
            <input
              id="adp-title"
              type="text"
              className="form-input"
              value={draft.title}
              onChange={(e) => d('title', e.target.value)}
              placeholder="4 חד׳ משופצת ברח׳ הרצל"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="adp-body">תיאור</label>
            <textarea
              id="adp-body"
              className="form-textarea"
              rows={3}
              dir="auto"
              value={draft.body}
              onChange={(e) => d('body', e.target.value)}
              placeholder="תיאור קצר למודעה…"
            />
          </div>
          <div className="adp-form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="adp-url">קישור חיצוני</label>
              <input
                id="adp-url"
                type="url"
                className="form-input"
                dir="ltr"
                value={draft.externalUrl}
                onChange={(e) => d('externalUrl', e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="adp-extid">מזהה חיצוני</label>
              <input
                id="adp-extid"
                type="text"
                className="form-input"
                dir="ltr"
                value={draft.externalId}
                onChange={(e) => d('externalId', e.target.value)}
                placeholder="YAD2-12345"
              />
            </div>
          </div>
          <div className="adp-form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'שומר…' : 'שמור מודעה'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setCreating(false); setDraft(emptyDraft()); }}
            >
              ביטול
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="adp-hint">טוען…</p>
      ) : items.length === 0 && !creating ? (
        <EmptyState
          title="אין עדיין מודעות"
          description="צור מודעה לכל ערוץ פרסום כדי לעקוב אחרי הסטטוסים במקום אחד"
          action={{ label: 'מודעה חדשה', onClick: () => setCreating(true) }}
          variant="first"
        />
      ) : items.length > 0 && (
        <ul className="adp-list">
          {items.map((a) => (
            <li key={a.id} className={`adp-item adp-item-${String(a.status).toLowerCase()}`}>
              <div className="adp-item-head">
                <span className="adp-item-channel">
                  {labelFor(ADVERT_CHANNEL_LABELS, a.channel)}
                </span>
                <SelectField
                  value={a.status}
                  onChange={(v) => changeStatus(a, v)}
                  options={STATUS_OPTIONS}
                  aria-label={`שנה סטטוס למודעה ב${labelFor(ADVERT_CHANNEL_LABELS, a.channel)}`}
                  disabled={busyId === a.id}
                />
                {a.externalUrl && (
                  <a
                    href={a.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="adp-item-link"
                    aria-label="פתח מודעה בערוץ החיצוני"
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm adp-item-remove"
                  onClick={() => remove(a.id)}
                  disabled={busyId === a.id}
                  aria-label={`הסר את המודעה ב${labelFor(ADVERT_CHANNEL_LABELS, a.channel)}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="adp-item-meta">
                {a.title && <strong className="adp-item-title">{a.title}</strong>}
                <span className="adp-item-price">{displayPrice(a.publishedPrice)}</span>
                {a.publishedAt && (
                  <span className="adp-item-when">פורסם: {displayDate(a.publishedAt)}</span>
                )}
                {a.expiresAt && (
                  <span className="adp-item-when">תוקף: {displayDate(a.expiresAt)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
