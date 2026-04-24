// Sprint 6 / ScreenContract — contract detail + type-to-sign flow.
//
// Inline Cream & Gold palette. Split-panel: the iframe preview of the
// rendered PDF on the left, signer metadata + the type-to-sign input
// on the right. After signing, the UI flips into locked-state mode:
// signature hash + timestamp badge replace the input, further sign
// attempts are blocked client-side (the server 409 is the backstop).
//
// v1 ships type-to-sign only. A canvas hand-drawn signature is a
// deliberate follow-up: adds ~80 lines of touch-event code, sending a
// data-URL up, and PDF-embedding — none of which we need for the
// product to deliver value.

import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, FileText, Check, AlertCircle, ShieldCheck, Download, Clock, Share2,
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
  EXCLUSIVITY: 'הסכם בלעדיות',
  BROKERAGE:   'הסכם תיווך',
  OFFER:       'הצעת רכישה',
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Type-to-sign local state. Separate from the persisted signatureName
  // because we only commit it on the server round-trip.
  const [typedName, setTypedName] = useState('');
  const [signing, setSigning] = useState(false);
  // Busting the iframe cache after a successful sign so the preview
  // re-fetches the now-signed PDF. URL-param only; the actual PDF
  // endpoint is Cache-Control: no-store so this is belt-and-braces.
  const [pdfNonce, setPdfNonce] = useState(0);
  // Sprint 7 — universal Share dialog for the contract PDF link.
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getContract(id);
      const c = res?.contract || res;
      if (!c) throw new Error('החוזה לא נמצא');
      setContract(c);
    } catch (e) {
      setError(e?.message || 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const onSign = async () => {
    const name = typedName.trim();
    if (!name || name.length < 2) {
      toast?.error?.('יש להקליד את השם המלא כדי לחתום');
      return;
    }
    setSigning(true);
    try {
      const res = await api.signContract(id, name);
      const signed = res?.contract || res;
      setContract(signed);
      setPdfNonce((n) => n + 1);
      toast?.success?.('החוזה נחתם');
    } catch (e) {
      toast?.error?.(e?.message || 'החתימה נכשלה');
    } finally {
      setSigning(false);
    }
  };

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
  const pdfUrl = `${api.contractPdfUrl(contract.id)}${pdfNonce ? `?v=${pdfNonce}` : ''}`;

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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={secondaryBtn()}>
            <Download size={14} /> הורד PDF
          </a>
          {/* Sprint 7 — channel picker: WhatsApp / SMS / email / copy /
           *  OS share. Uses the PDF URL as the shared link. */}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            style={secondaryBtn()}
          >
            <Share2 size={14} /> שתף
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

      {/* Main grid: preview + sign panel */}
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
          {/* iframe renders the signed OR unsigned PDF depending on
              contract state; the server branches on signedAt. */}
          <iframe
            key={pdfNonce}
            title="חוזה — תצוגה מקדימה"
            src={pdfUrl}
            style={{
              width: '100%', height: 560, border: 'none',
              background: DT.cream,
            }}
          />
        </section>

        {/* Sign panel or locked badge */}
        <section style={sectionCard()} aria-label={isSigned ? 'חתימה ותיעוד' : 'חתימה דיגיטלית'}>
          <h3 style={sectionTitle()}>
            <ShieldCheck size={16} /> {isSigned ? 'פרטי החתימה' : 'חתימה דיגיטלית'}
          </h3>

          {!isSigned && (
            <>
              <p style={{
                margin: '0 0 14px', color: DT.muted, fontSize: 13, lineHeight: 1.55,
              }}>
                בדוק/י את תוכן החוזה בתצוגה המקדימה. לחתימה דיגיטלית הקלד/י
                את שמך המלא בדיוק כפי שהוא מופיע במסמך. לחיצה על "חתום"
                תנעל את החוזה ותחתום עליו באופן סופי.
              </p>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 700,
                color: DT.muted, textTransform: 'uppercase', letterSpacing: 0.3,
                marginBottom: 6,
              }}>
                הקלד/י שם מלא לחתימה
              </label>
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={contract.signerName}
                autoComplete="name"
                disabled={signing}
                style={{
                  ...FONT, width: '100%', boxSizing: 'border-box',
                  padding: '10px 14px', borderRadius: 10,
                  border: `1px solid ${DT.borderStrong}`,
                  fontSize: 18, fontWeight: 700, color: DT.ink,
                  background: DT.cream4, textAlign: 'center',
                }}
                aria-label="הקלד/י שם מלא לחתימה"
              />
              <div style={{
                marginTop: 14, display: 'flex',
                justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap',
              }}>
                <button
                  type="button"
                  onClick={onSign}
                  disabled={signing || !typedName.trim()}
                  style={{
                    ...primaryBtn(),
                    opacity: signing || !typedName.trim() ? 0.6 : 1,
                    cursor: signing || !typedName.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Check size={14} />
                  {signing ? 'חותם…' : 'חתום'}
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
              {contract.signatureHash ? (
                <Row
                  label="מזהה חתימה (SHA-256)"
                  value={
                    <code style={{
                      fontFamily: 'ui-monospace, Menlo, monospace',
                      fontSize: 11,
                      wordBreak: 'break-all',
                      direction: 'ltr', display: 'inline-block',
                      background: DT.cream3,
                      padding: '3px 8px', borderRadius: 6,
                      color: DT.ink2,
                    }}>
                      {contract.signatureHash}
                    </code>
                  }
                />
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

      {shareOpen && (
        <ShareDialog
          kind="contract"
          entity={{
            contract,
            url: pdfUrl,
            recipient: contract.signerName,
          }}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      paddingBottom: 8, borderBottom: `1px dashed ${DT.border}`,
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
    padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
    fontSize: 14, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
  };
}
function secondaryBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
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
