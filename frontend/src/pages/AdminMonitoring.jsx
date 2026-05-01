// /admin/monitoring — admin-only system health page.
//
// Reads /api/admin/monitoring (gated by requireAdmin on the backend) and
// renders 4 metric tiles + the firing-alerts list + links to the
// self-hosted Grafana/Prometheus on EC2 (accessed via SSH tunnel; see
// infra/monitoring/README.md).
//
// Auto-refreshes every 30s while the tab is visible.
import { useEffect, useState } from 'react';
import { useToast } from '../lib/toast.jsx';
import api from '../lib/api';

function tileColor(value, warn, crit) {
  if (value == null || isNaN(value)) return 'var(--ink-50)';
  if (value >= crit) return '#c0392b';
  if (value >= warn) return '#d4a017';
  return '#2f7d4f';
}

function Tile({ label, value, unit, warn, crit, hint }) {
  const color = tileColor(value, warn, crit);
  return (
    <div style={{
      background: 'var(--surface, #fff)',
      border: '1px solid var(--ink-10)',
      borderRadius: 12,
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      minHeight: 110,
    }}>
      <div style={{ fontSize: 13, color: 'var(--ink-70)' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color, lineHeight: 1.1 }}>
        {value == null ? '—' : `${value}${unit ? ` ${unit}` : ''}`}
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--ink-50)' }}>{hint}</div>}
    </div>
  );
}

export default function AdminMonitoring() {
  const toast = useToast();
  const [snap, setSnap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const fetchOnce = async () => {
      try {
        const data = await api.adminMonitoring();
        if (cancelled) return;
        setSnap(data);
        setErr(null);
      } catch (e) {
        if (cancelled) return;
        setErr(e?.message || 'failed to load');
        toast?.error?.('שגיאה בטעינת נתוני ניטור');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOnce();
    timer = setInterval(fetchOnce, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') fetchOnce(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [toast]);

  const conn = snap?.db?.connections;
  const max = snap?.db?.maxConnections || 79;
  const pct = conn?.total != null ? Math.round((conn.total / max) * 100) : null;
  const longest = snap?.db?.longestRunningTxSeconds;
  const deadlocks = snap?.db?.deadlocksSinceBoot;
  const firing = snap?.alerts?.firing ?? [];

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }} dir="rtl">
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>ניטור מערכת · Monitoring</h1>
      <div style={{ fontSize: 13, color: 'var(--ink-70)', marginBottom: 20 }}>
        מתעדכן אוטומטית כל 30 שניות.
        {snap?.capturedAt && (
          <span style={{ marginInlineStart: 12 }}>
            עודכן: {new Date(snap.capturedAt).toLocaleTimeString('he-IL')}
          </span>
        )}
      </div>

      {err && (
        <div style={{ background: '#fde7e7', border: '1px solid #c0392b', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          שגיאה: {err}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Tile
          label="חיבורי Postgres פעילים"
          value={conn?.total}
          unit={`/ ${max}`}
          warn={Math.round(max * 0.6)}
          crit={Math.round(max * 0.85)}
          hint={conn ? `פעילים: ${conn.active} · לא פעילים: ${conn.idle}${conn.idle_in_transaction ? ` · idle-in-tx: ${conn.idle_in_transaction}` : ''}` : null}
        />
        <Tile
          label="ניצולת בריכת חיבורים"
          value={pct}
          unit="%"
          warn={60}
          crit={85}
        />
        <Tile
          label="טרנזקציה רצה הכי ארוך"
          value={longest != null ? longest.toFixed(2) : null}
          unit="שניות"
          warn={1}
          crit={5}
          hint="מעל 10 שניות = idle-in-transaction תקוע"
        />
        <Tile
          label="Deadlocks (מאז ה-boot)"
          value={deadlocks}
          warn={1}
          crit={10}
        />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>התראות פעילות</h2>
      {!snap?.alerts?.prometheus_reachable ? (
        <div style={{ fontSize: 13, color: 'var(--ink-70)', marginBottom: 16 }}>
          Prometheus לא נגיש מהbackend (השתנה PROMETHEUS_URL?). חיבור ישיר לDB עדיין עובד — הטיילים למעלה.
        </div>
      ) : firing.length === 0 ? (
        <div style={{ fontSize: 13, color: '#2f7d4f', background: '#e8f5e9', border: '1px solid #c8e6c9', padding: 10, borderRadius: 8, marginBottom: 16 }}>
          ✓ אין התראות פעילות
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--ink-10)' }}>
              <th style={{ textAlign: 'right', padding: 8 }}>חומרה</th>
              <th style={{ textAlign: 'right', padding: 8 }}>שם</th>
              <th style={{ textAlign: 'right', padding: 8 }}>סיכום</th>
              <th style={{ textAlign: 'right', padding: 8 }}>פעיל מאז</th>
            </tr>
          </thead>
          <tbody>
            {firing.map((a, i) => (
              <tr key={`${a.name}-${i}`} style={{ borderBottom: '1px solid var(--ink-05)' }}>
                <td style={{ padding: 8 }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: a.severity === 'critical' ? '#fde7e7' : '#fff7e0',
                    color: a.severity === 'critical' ? '#c0392b' : '#a86200',
                  }}>{a.severity}</span>
                </td>
                <td style={{ padding: 8, fontFamily: 'monospace' }}>{a.name}</td>
                <td style={{ padding: 8 }}>{a.summary}</td>
                <td style={{ padding: 8, fontSize: 11, color: 'var(--ink-50)' }}>
                  {a.activeAt ? new Date(a.activeAt).toLocaleString('he-IL') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>קישורים מלאים</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-70)', lineHeight: 1.7 }}>
        Grafana ו-Prometheus רצים על ה-EC2 ומחוברים רק ל-loopback. גישה דרך SSH tunnel:
        <pre style={{
          background: 'var(--ink-05, #f5f3ee)', padding: 10, borderRadius: 6, fontSize: 12,
          fontFamily: 'monospace', marginTop: 8, marginBottom: 12, direction: 'ltr', textAlign: 'left',
        }}>
{`ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 \\
    -i ~/.ssh/tripzio.pem ec2-user@ec2-13-49-145-46.eu-north-1.compute.amazonaws.com`}
        </pre>
        ואז:
        <ul style={{ marginInlineStart: 16 }}>
          <li><a href="http://localhost:3000" target="_blank" rel="noreferrer">http://localhost:3000</a> — Grafana (dashboard "Estia — Overview")</li>
          <li><a href="http://localhost:9090/alerts" target="_blank" rel="noreferrer">http://localhost:9090/alerts</a> — Prometheus alerts</li>
        </ul>
      </div>

      {loading && <div style={{ fontSize: 13, color: 'var(--ink-50)', marginTop: 24 }}>טוען…</div>}
    </div>
  );
}
