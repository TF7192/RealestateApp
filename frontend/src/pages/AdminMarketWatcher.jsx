// Admin observability for the Market Discovery watcher.
//
// Phase 4: list of MarketWatcherRun rows with status, counts, error
// messages. Manual "run now" + Slack alerting deferred — those need
// cross-container RPC + webhook config and aren't blocking the
// shipped feature.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import { relLabel } from '../lib/relativeDate';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', white: '#fff',
  ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldDark: '#7a5c2c',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', successSoft: 'rgba(21,128,61,0.08)',
  danger: '#b91c1c',  dangerSoft: 'rgba(185,28,28,0.08)',
  warning: '#b45309', warningSoft: 'rgba(180,83,9,0.08)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

function statusColor(s) {
  if (s === 'success') return { fg: DT.success, bg: DT.successSoft };
  if (s === 'failed')  return { fg: DT.danger,  bg: DT.dangerSoft };
  if (s === 'running') return { fg: DT.warning, bg: DT.warningSoft };
  return { fg: DT.muted, bg: DT.cream2 };
}

function fmtDuration(start, end) {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 1000)} s`;
}

export default function AdminMarketWatcher() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    return api.listMarketWatcherRuns().then(
      (res) => { setRuns(res?.runs || []); setLoading(false); setRefreshing(false); setError(null); },
      (err) => { setError(err?.message || 'טעינה נכשלה'); setLoading(false); setRefreshing(false); },
    );
  };

  useEffect(() => { load(); }, []);

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      <div style={{
        marginBottom: 14, display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>
            Market Watcher · ריצות
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 4 }}>
            50 הריצות האחרונות של סורק המודעות החדשות.
            {' '}<Link to="/market-discovery" style={{ color: DT.gold, fontWeight: 700 }}>צפה במודעות</Link>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          aria-busy={refreshing}
          style={{
            ...FONT, cursor: refreshing ? 'not-allowed' : 'pointer',
            background: DT.white, color: DT.ink, border: `1px solid ${DT.border}`,
            padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            display: 'inline-flex', gap: 6, alignItems: 'center',
            minHeight: 44, opacity: refreshing ? 0.7 : 1,
          }}
        >
          <RefreshCw size={14} /> רענן
        </button>
      </div>

      {error && (
        <div role="alert" style={{ background: DT.dangerSoft, color: DT.danger, padding: 12, borderRadius: 10, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {loading && <div style={{ color: DT.muted }}>טוען…</div>}

      {!loading && runs.length === 0 && (
        <div style={{ color: DT.muted, padding: '40px 20px', textAlign: 'center' }}>
          הסורק עדיין לא רץ. הריצה הראשונה מתחילה תוך כ-30 שניות מהפעלת הקונטיינר.
        </div>
      )}

      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`, borderRadius: 14,
        overflow: 'hidden',
      }}>
        {runs.map((r, i) => {
          const sc = statusColor(r.status);
          return (
            <div
              key={r.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(160px, 1fr) auto',
                gap: 12, padding: 14,
                borderTop: i === 0 ? 'none' : `1px solid ${DT.border}`,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    background: sc.bg, color: sc.fg,
                    fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                    padding: '2px 8px', borderRadius: 99,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {r.status === 'success' && <CheckCircle2 size={11} />}
                    {r.status === 'failed' && <AlertTriangle size={11} />}
                    {r.status === 'running' && <Clock size={11} />}
                    {r.status}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{r.source}</span>
                  <span style={{ fontSize: 12, color: DT.muted }}>
                    התחיל {relLabel(r.startedAt)}
                  </span>
                  <span style={{ fontSize: 12, color: DT.muted }}>
                    · {fmtDuration(r.startedAt, r.finishedAt)}
                  </span>
                </div>
                {r.errorMessage && (
                  <div style={{
                    background: DT.dangerSoft, color: DT.danger,
                    padding: 8, borderRadius: 8, marginTop: 6,
                    fontSize: 12, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {r.errorMessage}
                  </div>
                )}
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 2,
                fontSize: 12, color: DT.muted, textAlign: 'end', minWidth: 160,
              }}>
                <div>{`${r.listingsSeen} ראיתי · ${r.listingsCreated} חדשות · ${r.listingsUpdated} עודכנו`}</div>
                <div>{`${r.matchesCreated} התאמות · ${r.notificationsCreated} התראות`}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
