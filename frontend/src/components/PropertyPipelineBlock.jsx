import { useEffect, useState } from 'react';
import { SelectField, NumberField } from './SmartFields';
import api from '../lib/api';
import {
  PROPERTY_STAGE_LABELS,
  SERIOUSNESS_LABELS,
  ASSIGNEE_ROLE_LABELS,
  labelsToOptions,
  labelFor,
} from '../lib/mlsLabels';
import './PropertyPipelineBlock.css';

// J9 pipeline block — the six broker-side pipeline fields rolled into a
// single reusable form section:
//
//   stage · agentCommissionPct · primaryAgentId · exclusivityExpire
//   sellerSeriousness · brokerNotes
//
// Used in two contexts:
//   1) NewProperty (form=true) — a read/edit block inside the wizard.
//      Parent owns the form state; we just render controls and bubble
//      changes via onChange(key, value).
//   2) PropertyDetail (form=false, inline editor) — the block PATCHes
//      the property directly via api.updateProperty when the user hits
//      "שמור". Used inside the "צנרת תיווך" dashboard card.
//
// The "primary agent" picker reuses the same /transfers/agents/search
// endpoint the transfer dialog uses — email lookup only, no free-form
// search, because cross-office assignments go through the assignees
// panel.

const STAGE_OPTIONS = labelsToOptions(PROPERTY_STAGE_LABELS);
const SERIOUSNESS_OPTIONS = labelsToOptions(SERIOUSNESS_LABELS);

export default function PropertyPipelineBlock({
  // Parent-driven form mode (NewProperty). When `form` is provided we
  // read from it and never call the API; parent supplies onChange.
  form,
  onChange,
  // Inline edit mode (PropertyDetail). Requires `property` to hydrate
  // initial values and calls api.updateProperty on save.
  property,
  onSaved,
  toast,
}) {
  const controlled = !!form;
  const [local, setLocal] = useState(() => ({
    stage: property?.stage || 'WATCHING',
    agentCommissionPct: property?.agentCommissionPct ?? null,
    primaryAgentId: property?.primaryAgentId || null,
    exclusivityExpire: property?.exclusivityExpire
      ? String(property.exclusivityExpire).slice(0, 10)
      : '',
    sellerSeriousness: property?.sellerSeriousness || 'NONE',
    brokerNotes: property?.brokerNotes || '',
  }));
  const [primaryAgent, setPrimaryAgent] = useState(property?.primaryAgent || null);
  const [agentLookupEmail, setAgentLookupEmail] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Hydrate local state whenever the parent property changes (post-save
  // reload). Only runs in inline mode.
  useEffect(() => {
    if (controlled || !property) return;
    setLocal({
      stage: property.stage || 'WATCHING',
      agentCommissionPct: property.agentCommissionPct ?? null,
      primaryAgentId: property.primaryAgentId || null,
      exclusivityExpire: property.exclusivityExpire
        ? String(property.exclusivityExpire).slice(0, 10)
        : '',
      sellerSeriousness: property.sellerSeriousness || 'NONE',
      brokerNotes: property.brokerNotes || '',
    });
    setPrimaryAgent(property.primaryAgent || null);
  }, [controlled, property]);

  // Read current values from either the parent form or the local state
  // so the render path is identical in both modes.
  const v = controlled ? form : local;
  const set = (key, value) => {
    if (controlled) onChange?.(key, value);
    else setLocal((p) => ({ ...p, [key]: value }));
  };

  const lookupAgent = async () => {
    const email = agentLookupEmail.trim();
    if (!email) {
      toast?.error?.('הזן אימייל של הסוכן');
      return;
    }
    setLookupBusy(true);
    try {
      const res = await api.searchAgentByEmail(email);
      if (!res?.agent) {
        toast?.error?.(res?.self ? 'זה אתה — לא ניתן לשייך את עצמך כסוכן ראשי' : 'לא נמצא סוכן עם האימייל הזה');
        return;
      }
      setPrimaryAgent(res.agent);
      set('primaryAgentId', res.agent.id);
      setAgentLookupEmail('');
      toast?.success?.(`${res.agent.displayName} סומן כסוכן ראשי`);
    } catch (e) {
      toast?.error?.(e?.message || 'חיפוש הסוכן נכשל');
    } finally {
      setLookupBusy(false);
    }
  };

  const clearPrimaryAgent = () => {
    setPrimaryAgent(null);
    set('primaryAgentId', null);
  };

  const save = async () => {
    if (controlled) return; // controlled mode has no internal save
    if (!property?.id) return;
    setError(null);
    setSaving(true);
    try {
      const body = {
        stage: v.stage,
        agentCommissionPct: v.agentCommissionPct == null || v.agentCommissionPct === ''
          ? null
          : Number(v.agentCommissionPct),
        primaryAgentId: v.primaryAgentId || null,
        exclusivityExpire: v.exclusivityExpire
          ? new Date(v.exclusivityExpire).toISOString()
          : null,
        sellerSeriousness: v.sellerSeriousness || 'NONE',
        brokerNotes: v.brokerNotes || '',
      };
      await api.updateProperty(property.id, body);
      toast?.success?.('צנרת התיווך עודכנה');
      onSaved?.(body);
    } catch (e) {
      setError(e?.message || 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ppb-root" aria-label="צנרת תיווך">
      <div className="ppb-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="ppb-stage">שלב</label>
          <SelectField
            id="ppb-stage"
            value={v.stage}
            onChange={(val) => set('stage', val)}
            options={STAGE_OPTIONS}
            aria-label="שלב הנכס"
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="ppb-commission">עמלת סוכן (%)</label>
          <NumberField
            id="ppb-commission"
            value={v.agentCommissionPct}
            onChange={(val) => set('agentCommissionPct', val)}
            unit="%"
            min={0}
            max={100}
            placeholder="2"
            aria-label="עמלת סוכן באחוזים"
          />
        </div>
        {/* P-12 — "תאריך סיום בלעדיות" lived in two places: here, AND in
            the "בלעדיות והערות" section of NewProperty where it pairs
            with the start-date and the relative "+3m / +6m / +12m" chips.
            Having both let agents disagree with themselves. The
            בלעדיות-והערות section is canonical (start + end + chips +
            days-left hint); the pipeline block keeps the field in state
            so existing data round-trips on save but no longer renders
            the input. */}
        <div className="form-group">
          <label className="form-label" htmlFor="ppb-seriousness">רצינות מוכר</label>
          <SelectField
            id="ppb-seriousness"
            value={v.sellerSeriousness}
            onChange={(val) => set('sellerSeriousness', val)}
            options={SERIOUSNESS_OPTIONS}
            aria-label="רצינות מוכר"
          />
        </div>
      </div>

      <div className="form-group ppb-primary">
        <label className="form-label">סוכן ראשי</label>
        {primaryAgent ? (
          <div className="ppb-primary-chip">
            <strong>{primaryAgent.displayName || primaryAgent.email}</strong>
            {primaryAgent.email && <span className="ppb-primary-meta">{primaryAgent.email}</span>}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={clearPrimaryAgent}
            >
              נקה
            </button>
          </div>
        ) : (
          <div className="ppb-primary-lookup">
            <input
              type="email"
              className="form-input"
              placeholder="email@agent.com"
              dir="ltr"
              value={agentLookupEmail}
              onChange={(e) => setAgentLookupEmail(e.target.value)}
              aria-label="אימייל של הסוכן הראשי"
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={lookupAgent}
              disabled={lookupBusy || !agentLookupEmail.trim()}
            >
              {lookupBusy ? 'מחפש…' : 'חפש'}
            </button>
          </div>
        )}
        {v.primaryAgentId && !primaryAgent && (
          <small className="ppb-primary-hint">
            {labelFor(ASSIGNEE_ROLE_LABELS, 'CO_AGENT')} — מזהה: {v.primaryAgentId}
          </small>
        )}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="ppb-notes">הערות מתווך</label>
        <textarea
          id="ppb-notes"
          className="form-textarea"
          rows={3}
          maxLength={4000}
          dir="auto"
          placeholder="הערות פנימיות — לא חשופות ללקוח"
          value={v.brokerNotes}
          onChange={(e) => set('brokerNotes', e.target.value)}
          aria-label="הערות מתווך"
        />
        <small className="ppb-notes-count">{(v.brokerNotes || '').length}/4000</small>
      </div>

      {!controlled && (
        <div className="ppb-actions">
          {error && <span className="ppb-error" role="alert">{error}</span>}
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? 'שומר…' : 'שמור'}
          </button>
        </div>
      )}
    </section>
  );
}
