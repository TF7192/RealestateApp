import { useEffect, useRef, useState } from 'react';
import { X, Send, Upload, FileCheck2, Download, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import './AgreementDialog.css';

/**
 * Agreement management modal — real flow.
 *
 * From an agent's perspective, a brokerage agreement has three possible states
 * per customer: not-sent, sent (waiting for signature), or signed (PDF on file).
 * This dialog lets the agent send a new agreement request, view the history
 * of requests for this customer, and upload the signed PDF once the customer
 * returns it.
 */
export default function AgreementDialog({ lead, onClose, onChange }) {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const fileInput = useRef(null);

  const load = async () => {
    try {
      const res = await api.listAgreements({ leadId: lead.id });
      setAgreements(res.items || []);
    } catch (e) {
      setError(e.message || 'שגיאה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [lead.id]);

  const handleSend = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.sendAgreement({
        leadId: lead.id,
        signerName: lead.name,
        signerPhone: lead.phone || null,
        signerEmail: lead.email || null,
        note: note || null,
      });
      setNote('');
      await load();
      onChange?.();
    } catch (e) {
      setError(e.message || 'שליחה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (agreementId, file) => {
    setBusy(true);
    setError(null);
    try {
      await api.uploadAgreement(agreementId, file);
      await load();
      onChange?.();
    } catch (e) {
      setError(e.message || 'העלאה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const latest = agreements[0];
  const hasOpen = latest && latest.status === 'SENT';

  return (
    <div className="agreement-backdrop" onClick={onClose}>
      <div className="agreement-modal" onClick={(e) => e.stopPropagation()}>
        <header className="agreement-header">
          <div>
            <h3>הסכם תיווך — {lead.name}</h3>
            <p>שליחת הסכם דיגיטלי, העלאת קובץ חתום ומעקב היסטוריה</p>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="agreement-body">
          {error && (
            <div className="agreement-error">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Send new request */}
          <section className="agreement-section">
            <div className="agreement-section-title">שליחה חדשה</div>
            <p className="agreement-section-hint">
              תישלח בקשה לחתימה דיגיטלית ל-{lead.name}
              {lead.phone && ` בטלפון ${lead.phone}`}
              {lead.email && `, אימייל ${lead.email}`}.
              לאחר החתימה יצורף הקובץ לכרטיס הלקוח.
            </p>
            <label className="agreement-label">הערה (אופציונלי)</label>
            <textarea
              className="agreement-textarea"
              rows={2}
              placeholder="לדוגמה: הסכם תיווך אי-בלעדי ל-6 חודשים"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={busy || hasOpen}
              title={hasOpen ? 'קיימת כבר בקשה פתוחה' : ''}
            >
              <Send size={16} />
              {hasOpen ? 'קיימת כבר בקשה פתוחה' : 'שלח בקשה לחתימה'}
            </button>
          </section>

          {/* History */}
          <section className="agreement-section">
            <div className="agreement-section-title">היסטוריה</div>
            {loading ? (
              <div className="agreement-loading">טוען…</div>
            ) : agreements.length === 0 ? (
              <div className="agreement-empty">עדיין לא נשלח אף הסכם</div>
            ) : (
              <ul className="agreement-list">
                {agreements.map((a) => (
                  <li key={a.id} className={`agreement-item status-${a.status.toLowerCase()}`}>
                    <div className="agreement-item-main">
                      <div className="agreement-item-status">
                        {a.status === 'SIGNED' ? (
                          <>
                            <FileCheck2 size={14} />
                            חתום
                          </>
                        ) : a.status === 'SENT' ? (
                          <>
                            <Send size={14} />
                            נשלח
                          </>
                        ) : (
                          a.status
                        )}
                      </div>
                      <div className="agreement-item-date">
                        נשלח {new Date(a.sentAt).toLocaleDateString('he-IL')}
                        {a.signedAt && ` · נחתם ${new Date(a.signedAt).toLocaleDateString('he-IL')}`}
                      </div>
                      {a.note && <div className="agreement-item-note">{a.note}</div>}
                    </div>
                    <div className="agreement-item-actions">
                      {a.status === 'SIGNED' && a.file && (
                        <a
                          className="btn btn-ghost btn-sm"
                          href={a.file.path.startsWith('/') ? a.file.path : `/uploads/${a.file.path}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={13} />
                          הורד PDF
                        </a>
                      )}
                      {a.status === 'SENT' && (
                        <>
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            ref={fileInput}
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUpload(a.id, file);
                            }}
                          />
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => fileInput.current?.click()}
                            disabled={busy}
                          >
                            <Upload size={13} />
                            העלה חתום
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
