// Agent-to-agent transfer view — rendered for the /t/:id route the
// TransferPropertyDialog WhatsApp template links to. Intentionally
// stripped of any reference to the originating agent (no contact
// card, no profile pic, no other-properties carousel) so the
// receiving agent gets a clean media + spec sheet they can re-share
// from their own WhatsApp without the source agent's branding
// leaking into the chain.
//
// Adds a "הורד נכס לשיתוף" button that:
//   1. Fetches every image + video and triggers a sequential browser
//      download (one tap, one save per file — JSZip would be ideal
//      but adds a heavy dep we don't otherwise carry).
//   2. Copies the same property brief that was on the WhatsApp
//      template into the clipboard so the receiving agent can paste
//      it alongside the media.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Copy, ImageIcon, Video, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { formatFloor } from '../lib/formatFloor';

const DT = {
  bg: '#f7f3ec', card: '#ffffff', ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774',
  border: 'rgba(30,26,20,0.08)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

function priceLabel(v) {
  if (!v) return '—';
  if (v < 10000) return `₪${v.toLocaleString('he-IL')} / חודש`;
  return `₪${v.toLocaleString('he-IL')}`;
}

function buildBrief(p) {
  if (!p) return '';
  const assetLabel = p.assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים';
  const catLabel = p.category === 'SALE' ? 'למכירה' : 'להשכרה';
  const lines = [];
  lines.push(`*${p.type || 'נכס'} ${catLabel}* — ${[p.street, p.city].filter(Boolean).join(', ')}`);
  lines.push('');
  lines.push(`💰 מחיר: ${priceLabel(p.marketingPrice)}`);
  if (p.sqm)   lines.push(`📐 שטח: ${p.sqm} מ״ר`);
  if (p.rooms != null) lines.push(`🛏️ חדרים: ${p.rooms}`);
  if (p.floor != null) lines.push(`🏢 קומה: ${formatFloor(p.floor, p.totalFloors)}`);
  if (p.balconySize > 0) lines.push(`🌤️ מרפסת: ${p.balconySize} מ״ר`);
  lines.push(`🏷️ סיווג: ${assetLabel}`);
  const features = [];
  if (p.parking)  features.push('חניה');
  if (p.storage)  features.push('מחסן');
  if (p.ac)       features.push('מזגנים');
  if (p.elevator) features.push('מעלית');
  if (p.assetClass === 'RESIDENTIAL' && p.safeRoom) features.push('ממ״ד');
  if (features.length) lines.push(`✅ ${features.join(' · ')}`);
  if (p.renovated)     lines.push(`🛠️ מצב: ${p.renovated}`);
  if (p.vacancyDate)   lines.push(`📅 כניסה: ${p.vacancyDate}`);
  if (p.airDirections) lines.push(`🧭 כיוונים: ${p.airDirections}`);
  if (p.notes) {
    lines.push('');
    lines.push(`📝 ${p.notes}`);
  }
  return lines.join('\n');
}

// Sequentially fetches each URL as a blob and triggers a save dialog
// via a hidden anchor. Browsers throttle parallel downloads from a
// single origin and Safari often drops them silently if you fire
// many at once, so the await chain plus a tiny gap keeps it stable.
async function downloadAll(urls, baseName) {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const r = await fetch(url, { credentials: 'omit' });
      if (!r.ok) continue;
      const blob = await r.blob();
      const ext = (url.split('.').pop() || 'jpg').split('?')[0].slice(0, 5);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${baseName}-${i + 1}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Free memory on the next tick so Safari doesn't hold the blob
      // in the DOM after we re-enter the loop.
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      // Small breath so Safari doesn't drop subsequent triggers.
      await new Promise((res) => setTimeout(res, 250));
    } catch { /* skip — keep downloading the rest */ }
  }
}

export default function AgentTransferView() {
  const { id } = useParams();
  const toast = useToast();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.transferProperty(id).then((r) => {
      if (cancelled) return;
      setProperty(r?.property || null);
    }).catch(() => {
      if (!cancelled) setProperty(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const brief = useMemo(() => buildBrief(property), [property]);
  const images = property?.images || [];
  const videos = property?.videos || [];

  // Document title without agent name — keeps the receiving agent's
  // tab clean too.
  useEffect(() => {
    if (property) {
      document.title = `${property.street || 'נכס'}, ${property.city || ''} — שיתוף בין סוכנים`;
    }
  }, [property]);

  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const urls = [...images, ...videos.map((v) => v.url)].filter(Boolean);
      const base = (property?.street || 'property').replace(/\s+/g, '-');
      await downloadAll(urls, base);
      try {
        await navigator.clipboard.writeText(brief);
        toast?.success?.('הקבצים הורדו וההודעה הועתקה');
      } catch {
        toast?.success?.('הקבצים הורדו (העתקת טקסט נכשלה)');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      toast?.success?.('הודעת השיתוף הועתקה');
    } catch {
      toast?.error?.('העתקה נכשלה');
    }
  };

  if (loading) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 40, textAlign: 'center', color: DT.muted }}>
        טוען נכס…
      </div>
    );
  }
  if (!property) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 40, textAlign: 'center', color: DT.muted }}>
        הנכס לא נמצא או הוסר.
      </div>
    );
  }

  return (
    <div dir="rtl" style={{
      ...FONT, minHeight: '100vh', background: DT.bg, color: DT.ink,
      padding: '20px 14px 60px', maxWidth: 880, margin: '0 auto',
    }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
          {property.type || 'נכס'} {property.category === 'SALE' ? 'למכירה' : 'להשכרה'}
        </h1>
        <p style={{ fontSize: 14, color: DT.muted, margin: '4px 0 0' }}>
          {[property.street, property.neighborhood, property.city].filter(Boolean).join(' · ')}
        </p>
      </header>

      {/* Hero image + thumb strip. No agent overlay, no contact button. */}
      {images.length > 0 && (
        <div style={{
          background: DT.card, border: `1px solid ${DT.border}`,
          borderRadius: 14, overflow: 'hidden', marginBottom: 14,
        }}>
          <img
            src={images[activeIdx]}
            alt=""
            style={{ width: '100%', display: 'block', maxHeight: 480, objectFit: 'cover' }}
          />
          {images.length > 1 && (
            <div style={{
              display: 'flex', gap: 6, padding: 10, overflowX: 'auto',
              borderTop: `1px solid ${DT.border}`,
            }}>
              {images.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  style={{
                    border: i === activeIdx ? `2px solid ${DT.gold}` : `1px solid ${DT.border}`,
                    padding: 0, borderRadius: 8, overflow: 'hidden',
                    background: 'transparent', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <img src={src} alt="" style={{ width: 72, height: 56, objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {videos.map((v) => (
            <video
              key={v.id}
              src={v.url}
              controls
              style={{
                width: '100%', borderRadius: 14, background: '#000',
                border: `1px solid ${DT.border}`,
              }}
            />
          ))}
        </div>
      )}

      {/* Spec sheet */}
      <section style={{
        background: DT.card, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 16, marginBottom: 14,
      }}>
        <Row label="מחיר" value={priceLabel(property.marketingPrice)} strong />
        {property.sqm   != null && <Row label="שטח (מ״ר)" value={String(property.sqm)} />}
        {property.rooms != null && <Row label="חדרים" value={String(property.rooms)} />}
        {property.floor != null && <Row label="קומה" value={formatFloor(property.floor, property.totalFloors)} />}
        {property.balconySize > 0 && <Row label="מרפסת" value={`${property.balconySize} מ״ר`} />}
        {property.parking  && <Row label="חניה"   value="יש" />}
        {property.storage  && <Row label="מחסן"   value="יש" />}
        {property.ac       && <Row label="מזגנים" value="יש" />}
        {property.elevator && <Row label="מעלית"  value="יש" />}
        {property.assetClass === 'RESIDENTIAL' && property.safeRoom && <Row label="ממ״ד" value="יש" />}
        {property.renovated   && <Row label="מצב הנכס" value={property.renovated} />}
        {property.vacancyDate && <Row label="תאריך כניסה" value={property.vacancyDate} />}
        {property.airDirections && <Row label="כיוונים" value={property.airDirections} />}
        {property.notes && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${DT.border}`, lineHeight: 1.7 }}>
            {property.notes}
          </div>
        )}
      </section>

      {/* Sticky-feel action row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy || (images.length === 0 && videos.length === 0)}
          style={{
            ...FONT,
            background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
            border: 'none', color: DT.ink,
            padding: '12px 18px', borderRadius: 12,
            cursor: busy ? 'wait' : 'pointer',
            fontSize: 14, fontWeight: 800,
            display: 'inline-flex', gap: 8, alignItems: 'center',
            boxShadow: '0 6px 14px rgba(180,139,76,0.3)',
            opacity: (images.length === 0 && videos.length === 0) ? 0.5 : 1,
          }}
        >
          {busy
            ? <Loader2 size={16} className="y2-spin" />
            : <Download size={16} />}
          הורד נכס לשיתוף
          <span style={{ fontSize: 12, color: 'rgba(30,26,20,0.7)', fontWeight: 700 }}>
            ({images.length} <ImageIcon size={11} style={{ verticalAlign: 'middle' }} />
            {videos.length > 0 && <> · {videos.length} <Video size={11} style={{ verticalAlign: 'middle' }} /></>})
          </span>
        </button>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            ...FONT, background: DT.card, border: `1px solid ${DT.border}`,
            padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
            fontSize: 13, fontWeight: 700, color: DT.ink,
            display: 'inline-flex', gap: 6, alignItems: 'center',
          }}
        >
          <Copy size={14} /> העתק טקסט שיתוף
        </button>
      </div>

      {/* Brief preview so the receiving agent can scan it before copying */}
      <pre style={{
        ...FONT, marginTop: 14, padding: 14,
        background: DT.card, border: `1px solid ${DT.border}`,
        borderRadius: 12, fontSize: 13, lineHeight: 1.7,
        whiteSpace: 'pre-wrap', overflow: 'auto', color: DT.ink,
      }}>{brief}</pre>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '8px 0', borderBottom: `1px dashed ${DT.border}`,
      fontSize: 14,
    }}>
      <span style={{ color: DT.muted, fontWeight: 600 }}>{label}</span>
      <span style={{ color: DT.ink, fontWeight: strong ? 800 : 600 }}>{value}</span>
    </div>
  );
}
