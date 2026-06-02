// Sprint 6 / ScreenContract — contract detail page.
//
// Agent view of a single contract: PDF preview on the left, status +
// share/sign-link panel on the right. The in-browser typed-name sign
// surface was removed 2026-06-02 — agents no longer sign contracts
// inside Estia. The customer signs on the public kiosk at
// `/contracts/sign/:publicSignToken`; the agent's only sign-side
// action here is "שלח לחתימה" which opens ShareDialog over the
// customer-facing sign URL.

import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, FileText, AlertCircle, ShieldCheck, Download, Clock, Share2,
  Send,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import ShareDialog from '../components/ShareDialog';

// Cream & Gold design tokens — same palette the OwnerDetail port uses.
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const TYPE_LABEL = {
  EXCLUSIVITY:     'הסכם בלעדיות',
  BROKERAGE:       'הזמנת שירותי תיווך',
  BUYER_BROKERAGE: 'הזמנת שירותי תיווך לקניה',
  OFFER:           'הצעת רכישה',
};

function formatIlDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export default function ContractDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [contract, setContract] = useState(null);
  const [publicSignUrl, setPublicSignUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Sprint 7 — universal Share dialog for both the PDF preview and the
  // public sign link. We track which "kind" of share is open to pick
  // the right payload.
  const [shareOpen, setShareOpen] = useState(null); // null | 'pdf' | 'sign'

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getContract(id);
      const c = res?.contract || res;
      if (!c) throw new Error('החוזה לא נמצא');
      setContract(c);
      // Backend returns `publicSignUrl` as a path; we deep-link to the
      // SPA route. Fall back to constructing from publicSignToken if
      // the backend didn't surface a URL (e.g. legacy contracts).
      const fullSignUrl = c.publicSignToken
        ? `${window.location.origin}/contracts/sign/${c.publicSignToken}`
        : null;
      setPublicSignUrl(fullSignUrl);
    } catch (e) {
      setError(e?.message || 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.muted, fontSize: 14 }}>
        טוען…
      </div>
    );
  }
  if (error || !contract) {
    return (
      <div dir="rtl" style={{
        ...FONT, padding: 28,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
        color: DT.ink,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(185,28,28,0.08)', color: DT.danger,
          padding: '10px 14px', borderRadius: 10, fontSize: 13,
        }}>
          <AlertCircle size={16} /> {error || 'החוזה לא נמצא'}
        </div>
        <button type="button" onClick={() => navigate('/contracts')} style={ghostBtn()}>
          <ArrowRight size={14} /> חזור לרשימת החוזים
        </button>
      </div>
    );
  }

  const isSigned = !!contract.signedAt;
  const pdfUrl = api.contractPdfUrl(contract.id);

  const copyShareLink = async () => {
    if (!publicSignUrl) return;
    try {
      await navigator.clipboard.writeText(publicSignUrl);
      toast?.success?.('הקישור הועתק');
    } catch {
      toast?.error?.('העתקה נכשלה');
    }
  };

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Top toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 18,
      }}>
        <Link to="/contracts" style={{
          ...FONT,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: DT.muted, textDecoration: 'none', fontSize: 13, fontWeight: 700,
        }}>
          <ArrowRight size={16} />
          חוזים
        </Link>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...secondaryBtn(), flex: '1 1 140px', justifyContent: 'center' }}
          >
            <Download size={14} /> הורד PDF
          </a>
          <button
            type="button"
            onClick={() => setShareOpen('pdf')}
            style={{ ...secondaryBtn(), flex: '1 1 140px', justifyContent: 'center' }}
          >
            <Share2 size={14} /> שתף PDF
          </button>
        </div>
      </div>

      {/* Header card */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          color: DT.ink, display: 'grid', placeItems: 'center',
          flexShrink: 0,
        }}>
          <FileText size={26} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
            {contract.title || TYPE_LABEL[contract.type] || 'חוזה'}
          </h1>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            fontSize: 13, color: DT.muted, marginTop: 6, flexWrap: 'wrap',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: DT.goldSoft, color: DT.goldDark,
              padding: '3px 10px', borderRadius: 99, fontWeight: 700, fontSize: 11,
            }}>
              {TYPE_LABEL[contract.type] || contract.type}
            </span>
            <span>· חותם: {contract.signerName}</span>
            <span>· נוצר {formatIlDateTime(contract.createdAt)}</span>
          </div>
        </div>
        {isSigned ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(21,128,61,0.08)', color: DT.success,
            padding: '7px 14px', borderRadius: 99, fontSize: 12, fontWeight: 800,
          }}>
            <ShieldCheck size={14} /> נחתם
          </div>
        ) : (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: DT.cream3, color: DT.ink2,
            padding: '7px 14px', borderRadius: 99, fontSize: 12, fontWeight: 800,
          }}>
            <Clock size={14} /> טרם נחתם
          </div>
        )}
      </div>

      {/* Main grid: preview + sign-link panel (or signed badge) */}
      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      }}>
        {/* PDF preview */}
        <section style={{ ...sectionCard(), minHeight: 580, padding: 0, overflow: 'hidden' }}
          aria-label="תצוגה מקדימה של החוזה">
          <div style={{
            padding: '12px 16px', borderBottom: `1px solid ${DT.border}`,
            fontSize: 13, fontWeight: 800, color: DT.ink,
            background: DT.cream4,
          }}>
            תצוגה מקדימה
          </div>
          <iframe
            title="חוזה — תצוגה מקדימה"
            src={pdfUrl}
            style={{
              width: '100%', height: 'min(70vh, 560px)', border: 'none',
              background: DT.cream,
            }}
          />
        </section>

        {/* Sign-link panel (unsigned) or signed-state badge (signed) */}
        <section style={sectionCard()} aria-label={isSigned ? 'חתימה ותיעוד' : 'שליחה לחתימה'}>
          <h3 style={sectionTitle()}>
            <ShieldCheck size={16} /> {isSigned ? 'פרטי החתימה' : 'שליחה לחתימה'}
          </h3>

          {!isSigned && (
            <>
              <p style={{
                margin: '0 0 14px', color: DT.muted, fontSize: 13, lineHeight: 1.55,
              }}>
                החוזה ממתין לחתימת הלקוח. שלח/י לו/ה את הקישור הייחודי
                לחתימה דיגיטלית. הלקוח/ה יוכל/תוכל לעיין בתוכן ההסכם
                ולחתום מהמכשיר שלו/ה ללא צורך בהתחברות.
              </p>
              {publicSignUrl && (
                <div style={{
                  background: DT.cream4,
                  border: `1px solid ${DT.border}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  marginBottom: 14,
                  fontSize: 11,
                  color: DT.ink2,
                  direction: 'ltr',
                  wordBreak: 'break-all',
                  fontFamily: 'ui-monospace, Menlo, monospace',
                }}>
                  {publicSignUrl}
                </div>
              )}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <button
                  type="button"
                  onClick={() => setShareOpen('sign')}
                  disabled={!publicSignUrl}
                  style={{
                    ...primaryBtn(),
                    opacity: publicSignUrl ? 1 : 0.5,
                    cursor: publicSignUrl ? 'pointer' : 'not-allowed',
                    justifyContent: 'center',
                  }}
                >
                  <Send size={15} />
                  שלח לחתימה
                </button>
                <button
                  type="button"
                  onClick={copyShareLink}
                  disabled={!publicSignUrl}
                  style={{
                    ...secondaryBtn(),
                    opacity: publicSignUrl ? 1 : 0.5,
                    cursor: publicSignUrl ? 'pointer' : 'not-allowed',
                    justifyContent: 'center',
                  }}
                >
                  העתק קישור
                </button>
              </div>
            </>
          )}

          {isSigned && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              fontSize: 13, color: DT.ink, lineHeight: 1.6,
            }}>
              <Row label="נחתם על ידי" value={contract.signatureName || contract.signerName} />
              <Row label="זמן חתימה"   value={formatIlDateTime(contract.signedAt)} />
              {contract.signatureImage ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: DT.muted,
                    textTransform: 'uppercase', letterSpacing: 0.3,
                  }}>
                    חתימה
                  </span>
                  <img
                    src={contract.signatureImage}
                    alt="חתימת הלקוח"
                    style={{
                      maxWidth: 220, maxHeight: 80,
                      background: DT.white,
                      border: `1px solid ${DT.border}`,
                      borderRadius: 8, padding: 6,
                    }}
                  />
                </div>
              ) : null}
              {contract.signatureHash ? (
                <Row
                  label="מזהה חתימה (SHA-256)"
                  value={
                    <code style={{
                      fontFamily: 'ui-monospace, Menlo, monospace',
                      fontSize: 11,
                      wordBreak: 'break-all',
                      direction: 'ltr', display: 'inline-block',
                      maxWidth: '100%',
                      background: DT.cream3,
                      padding: '3px 8px', borderRadius: 6,
                      color: DT.ink2,
                    }}>
                      {contract.signatureHash}
                    </code>
                  }
                />
              ) : null}
              {contract.signedIp ? (
                <Row label="IP בעת חתימה" value={
                  <span style={{ direction: 'ltr', display: 'inline-block' }}>
                    {contract.signedIp}
                  </span>
                } />
              ) : null}
              <div style={{
                marginTop: 6,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(21,128,61,0.08)', color: DT.success,
                padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                alignSelf: 'flex-start',
              }}>
                <ShieldCheck size={13} /> החוזה נעול — לא ניתן לשנות לאחר חתימה
              </div>
            </div>
          )}
        </section>
      </div>

      {shareOpen === 'pdf' && (
        <ShareDialog
          kind="contract"
          entity={{
            contract,
            url: pdfUrl,
            recipient: contract.signerName,
          }}
          onClose={() => setShareOpen(null)}
        />
      )}
      {shareOpen === 'sign' && publicSignUrl && (
        <ShareDialog
          kind="contract"
          entity={{
            contract,
            url: publicSignUrl,
            recipient: contract.signerName,
          }}
          onClose={() => setShareOpen(null)}
        />
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      padding: '8px 0', borderBottom: `1px dashed ${DT.border}`,
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: DT.muted,
        textTransform: 'uppercase', letterSpacing: 0.3,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: DT.ink }}>{value || '—'}</span>
    </div>
  );
}

function sectionCard() {
  return {
    background: DT.white, border: `1px solid ${DT.border}`,
    borderRadius: 14, padding: 20,
  };
}
function sectionTitle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 14, fontWeight: 800, margin: '0 0 14px', color: DT.ink,
    letterSpacing: -0.2,
  };
}
function primaryBtn() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '12px 20px', borderRadius: 10, cursor: 'pointer',
    fontSize: 14, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
    minHeight: 44,
  };
}
function secondaryBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700, minHeight: 40,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
function ghostBtn() {
  return {
    ...FONT, background: 'transparent', border: `1px solid ${DT.border}`,
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
