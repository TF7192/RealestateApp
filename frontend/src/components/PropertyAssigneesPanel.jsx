import { useCallback, useEffect, useState, useId } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import api from '../lib/api';
import { SelectField } from './SmartFields';
import EmptyState from './EmptyState';
import { ASSIGNEE_ROLE_LABELS, labelsToOptions, labelFor } from '../lib/mlsLabels';
import './PropertyAssigneesPanel.css';

// J10 — multi-agent property assignment.
//
// Renders the list of CO_AGENT / OBSERVER users attached to a property
// (the primaryAgent lives in the pipeline block) plus an inline
// add-by-email + role-picker form. Backend rejects cross-office 403;
// we surface that server message directly via the toast. The remove
// button uses a plain button with an aria-label (no confirm dialog —
// adding back is a single form fill).

const ROLE_OPTIONS = labelsToOptions(ASSIGNEE_ROLE_LABELS);

export default function PropertyAssigneesPanel({ propertyId, toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('CO_AGENT');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const emailId = useId();
  const roleId = useId();

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const res = await api.listPropertyAssignees(propertyId);
      setItems(res?.items || []);
    } catch (e) {
      toast?.error?.(e?.message || 'טעינת שותפי הנכס נכשלה');
    } finally {
      setLoading(false);
    }
  }, [propertyId, toast]);

  useEffect(() => { load(); }, [load]);

  const submitAdd = async (e) => {
    e?.preventDefault?.();
    const email = addEmail.trim();
    if (!email) return;
    setAdding(true);
    try {
      // J10 backend accepts `userId`; resolve email → id first so the
      // agent doesn't have to look it up. Reuses /transfers/agents/search.
      const lookup = await api.searchAgentByEmail(email);
      if (!lookup?.agent) {
        toast?.error?.(lookup?.self ? 'זה אתה — לא ניתן לשייך את עצמך' : 'לא נמצא סוכן עם האימייל הזה');
        return;
      }
      await api.addPropertyAssignee(propertyId, {
        userId: lookup.agent.id,
        role: addRole,
      });
      toast?.success?.(`${lookup.agent.displayName || email} שויך ל${labelFor(ASSIGNEE_ROLE_LABELS, addRole)}`);
      setAddEmail('');
      setAddRole('CO_AGENT');
      await load();
    } catch (e2) {
      toast?.error?.(e2?.message || 'הוספת שותף נכשלה');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (userId) => {
    setRemovingId(userId);
    try {
      await api.removePropertyAssignee(propertyId, userId);
      toast?.info?.('השותף הוסר');
      await load();
    } catch (e) {
      toast?.error?.(e?.message || 'הסרת השותף נכשלה');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section className="pap-root" aria-label="שותפים לנכס">
      <form className="pap-add" onSubmit={submitAdd}>
        <div className="pap-add-row">
          <div className="form-group pap-add-email">
            <label className="form-label" htmlFor={emailId}>אימייל שותף</label>
            <input
              id={emailId}
              type="email"
              className="form-input"
              placeholder="partner@estia.app"
              dir="ltr"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
            />
          </div>
          <div className="form-group pap-add-role">
            <label className="form-label" htmlFor={roleId}>תפקיד</label>
            <SelectField
              id={roleId}
              value={addRole}
              onChange={setAddRole}
              options={ROLE_OPTIONS}
              aria-label="תפקיד השותף"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={adding || !addEmail.trim()}
          >
            <UserPlus size={14} aria-hidden="true" />
            {adding ? 'מוסיף…' : 'הוסף שותף'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="pap-hint">טוען…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="אין שותפים משויכים"
          description="הוסף שותף לפי אימייל כדי לחלוק את הנכס עם סוכן נוסף במשרד"
          variant="first"
        />
      ) : (
        <ul className="pap-list">
          {items.map((a) => {
            const uid = a.user?.id || a.userId;
            const name = a.user?.displayName || a.user?.email || uid;
            const role = labelFor(ASSIGNEE_ROLE_LABELS, a.role);
            return (
              <li key={uid} className="pap-item">
                <div className="pap-item-main">
                  <strong className="pap-item-name">{name}</strong>
                  {a.user?.email && (
                    <span className="pap-item-email" dir="ltr">{a.user.email}</span>
                  )}
                </div>
                <span className="pap-item-role">{role}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm pap-item-remove"
                  onClick={() => remove(uid)}
                  disabled={removingId === uid}
                  aria-label={`הסר את ${name}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  {removingId === uid ? 'מסיר…' : 'הסר'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
