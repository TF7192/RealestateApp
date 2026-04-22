// P-3 — "הסכמי תיווך" section on PropertyDetail.
//
// Lists every signed Prospect for the property. Each row shows:
//   - download/print link to the rendered PDF (GET /api/prospects/:id/agreement.pdf)
//   - the signedAt date in Hebrew locale
//   - a linked-Lead chip, or a `קשר לליד` picker when leadId is null
//
// The linking uses backend POST /api/prospects/:id/link-lead and
// /api/prospects/:id/unlink-lead (registered alongside the PDF route
// as part of this ship). Unsigned prospects are intentionally hidden
// — this card is about delivered agreements, not drafts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Printer, UserPlus, Link2, X as XIcon, Loader2, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { displayDate } from '../lib/display';
import './PropertyAgreementsSection.css';

export default function PropertyAgreementsSection({ propertyId, leads = [] }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Per-row picker open-state: { [prospectId]: true }
  const [picker, setPicker] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listProspects(propertyId);
      setItems(res?.items || []);
    } catch (e) {
      setError(e?.message || 'טעינת ההסכמים נכשלה');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  // Signed-only subset, newest first. Server already orders by createdAt
  // desc, so this filter preserves the recency ordering the agent expects.
  const signed = useMemo(
    () => items.filter((p) => p.signedAt),
    [items]
  );

  const leadById = useMemo(() => {
    const m = new Map();
    for (const l of leads) m.set(l.id, l);
    return m;
  }, [leads]);

  const link = async (prospectId, leadId) => {
    setBusyId(prospectId);
    try {
      await api.linkProspectLead(prospectId, leadId);
      toast?.success?.('ההסכם קושר לליד');
      setPicker((p) => ({ ...p, [prospectId]: false }));
      await load();
    } catch (e) {
      toast?.error?.(e?.message || 'קישור לליד נכשל');
    } finally {
      setBusyId(null);
    }
  };

  const unlink = async (prospectId) => {
    setBusyId(prospectId);
    try {
      await api.unlinkProspectLead(prospectId);
      toast?.info?.('הקישור לליד הוסר');
      await load();
    } catch (e) {
      toast?.error?.(e?.message || 'הסרת הקישור נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  const printPdf = (prospectId) => {
    const url = api.prospectAgreementUrl(prospectId);
    const w = window.open(url, '_blank');
    if (!w) toast?.error?.('החלון נחסם על ידי הדפדפן');
  };

  if (loading) {
    return (
      <section className="pd-agreements" aria-label="הסכמי תיווך" dir="rtl">
        <header className="pd-agr-head">
          <h3><FileText size={16} aria-hidden /> הסכמי תיווך</h3>
        </header>
        <div className="pd-agr-loading" role="status">
          <Loader2 size={14} className="spin" aria-hidden />
          <span>טוען…</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="pd-agreements" aria-label="הסכמי תיווך" dir="rtl">
        <header className="pd-agr-head">
          <h3><FileText size={16} aria-hidden /> הסכמי תיווך</h3>
        </header>
        <div className="pd-agr-error" role="alert">
          <AlertCircle size={14} aria-hidden />
          <span>{error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
            נסה שוב
          </button>
        </div>
      </section>
    );
  }

  if (signed.length === 0) return null; // stay out of the way when empty

  return (
    <section className="pd-agreements animate-in animate-in-delay-3" aria-label="הסכמי תיווך" dir="rtl">
      <header className="pd-agr-head">
        <h3>
          <FileText size={16} aria-hidden />
          הסכמי תיווך
          <span className="pd-agr-count">{signed.length}</span>
        </h3>
      </header>
      <ul className="pd-agr-list">
        {signed.map((p) => {
          const linked = p.leadId ? leadById.get(p.leadId) : null;
          const isOpen = !!picker[p.id];
          return (
            <li key={p.id} className="pd-agr-row">
              <div className="pd-agr-main">
                <strong className="pd-agr-name">{p.name}</strong>
                {p.phone && <span className="pd-agr-meta">{p.phone}</span>}
                <span className="pd-agr-meta pd-agr-date">
                  נחתם: {displayDate(p.signedAt)}
                </span>
              </div>
              <div className="pd-agr-lead">
                {linked ? (
                  <span className="pd-agr-linked">
                    <span className="pd-agr-linked-label">ליד:</span>
                    <a href={`/customers/${linked.id}`} className="pd-agr-linked-name">
                      {linked.name}
                    </a>
                    <button
                      type="button"
                      className="pd-agr-unlink"
                      onClick={() => unlink(p.id)}
                      disabled={busyId === p.id}
                      aria-label="הסר קישור לליד"
                      title="הסר קישור לליד"
                    >
                      <XIcon size={12} aria-hidden />
                    </button>
                  </span>
                ) : p.leadId ? (
                  <span className="pd-agr-meta">ליד #{p.leadId.slice(0, 6)}</span>
                ) : (
                  <div className="pd-agr-picker-wrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setPicker((s) => ({ ...s, [p.id]: !isOpen }))}
                      aria-expanded={isOpen}
                    >
                      <UserPlus size={13} aria-hidden />
                      <span>קשר לליד</span>
                    </button>
                    {isOpen && (
                      <ul className="pd-agr-picker" role="listbox" aria-label="בחר ליד לקישור">
                        {leads.length === 0 && (
                          <li className="pd-agr-picker-empty">אין לידים זמינים</li>
                        )}
                        {leads.map((l) => (
                          <li key={l.id}>
                            <button
                              type="button"
                              role="option"
                              className="pd-agr-picker-item"
                              onClick={() => link(p.id, l.id)}
                              disabled={busyId === p.id}
                            >
                              <span className="pd-agr-picker-name">{l.name}</span>
                              {l.phone && <span className="pd-agr-picker-meta">{l.phone}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <div className="pd-agr-actions">
                <a
                  href={api.prospectAgreementUrl(p.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  <Link2 size={13} aria-hidden />
                  <span>פתח PDF</span>
                </a>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => printPdf(p.id)}
                  title="הדפס את ההסכם"
                >
                  <Printer size={13} aria-hidden />
                  <span>הדפס</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
