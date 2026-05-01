// /admin/grafana — full Grafana dashboard embedded inside the Estia
// admin shell. Admin-only (route gated in App.jsx). The iframe loads
// /admin/grafana/d/estia-overview/estia-overview which nginx forwards
// to /api/admin/grafana/... → backend admin proxy → Grafana container.
//
// Grafana itself runs anonymous-Admin behind the Estia auth gate, so
// the user lands on the dashboard with no Grafana login screen.
import { useEffect, useRef, useState } from 'react';

export default function AdminGrafana() {
  const iframeRef = useRef(null);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Default to the Estia overview dashboard. The user can navigate
  // anywhere within Grafana — the iframe stays in the same origin so
  // we don't lose them. kiosk=tv hides Grafana's own top nav for a
  // cleaner embed.
  const src = '/admin/grafana/d/estia-overview/estia-overview?kiosk=tv&refresh=30s';

  useEffect(() => {
    // If the iframe never loads in 10s, surface a clear error rather
    // than a blank screen. Most often this means the monitoring stack
    // is down on EC2.
    const t = setTimeout(() => {
      if (!loaded) setError('Grafana לא הגיב תוך 10 שניות. בדוק שהמוניטורינג פועל ב-EC2.');
    }, 10_000);
    return () => clearTimeout(t);
  }, [loaded]);

  return (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 120px)', minHeight: 600,
    }}>
      <div style={{
        padding: '8px 16px', display: 'flex', gap: 12, alignItems: 'center',
        borderBottom: '1px solid var(--ink-10)',
      }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Grafana — Estia Overview</h1>
        <div style={{ flex: 1 }} />
        <a
          href="/admin/grafana/d/estia-overview/estia-overview"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: 'var(--ink-70)' }}
        >
          פתח בלשונית חדשה ↗
        </a>
        <a
          href="/admin/monitoring"
          style={{ fontSize: 12, color: 'var(--ink-70)' }}
        >
          תקציר בעמוד פנימי
        </a>
      </div>

      {error && (
        <div style={{
          background: '#fde7e7', border: '1px solid #c0392b', padding: 12,
          borderRadius: 8, margin: 12, fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={src}
        title="Grafana"
        onLoad={() => setLoaded(true)}
        style={{ flex: 1, border: 0, width: '100%', display: 'block', background: '#0b0b0d' }}
      />
    </div>
  );
}
