import { useState, useMemo } from 'react';
import {
  Handshake, Clock, ClipboardCheck, Check, TrendingUp, MapPin, Building2,
  Scale, DollarSign, Calendar,
} from 'lucide-react';
import { deals, formatPrice } from '../../data/mockData';
import { haptics } from '../../native';

const STAGES = [
  { key: 'משא ומתן', label: 'משא ומתן', icon: Handshake, color: 'var(--gold)' },
  { key: 'ממתין לאישור משכנתא', label: 'אישור משכנתא', icon: Clock, color: 'var(--warning)' },
  { key: 'חתימה', label: 'חתימה', icon: ClipboardCheck, color: 'var(--info)' },
  { key: 'נחתם', label: 'נסגרו', icon: Check, color: 'var(--success)' },
];

export default function MobileDeals() {
  const [expanded, setExpanded] = useState(() => new Set(['משא ומתן', 'ממתין לאישור משכנתא']));

  const byStage = useMemo(() => {
    const map = new Map();
    STAGES.forEach((s) => map.set(s.key, []));
    deals.forEach((d) => {
      if (map.has(d.status)) map.get(d.status).push(d);
    });
    return map;
  }, []);

  const totals = useMemo(() => {
    const closed = deals.filter((d) => d.status === 'נחתם');
    return {
      open: deals.filter((d) => d.status !== 'נחתם').length,
      closed: closed.length,
      totalCommission: closed.reduce((s, d) => s + (d.commission || 0), 0),
      pipelineValue: deals.filter((d) => d.status !== 'נחתם').reduce((s, d) => s + (d.offer || d.marketingPrice || 0), 0),
    };
  }, []);

  const toggle = (key) => {
    haptics.tap();
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="m-page">
      <div className="m-deal-summary">
        <div>
          <div className="m-deal-summary-label">ערך צנרת</div>
          <div className="m-deal-summary-value">{formatPrice(totals.pipelineValue)}</div>
          <div className="m-deal-summary-sub">{totals.open} עסקאות פתוחות</div>
        </div>
        <div className="m-deal-summary-divider" />
        <div>
          <div className="m-deal-summary-label">עמלות נצברו</div>
          <div className="m-deal-summary-value" style={{ color: 'var(--success)' }}>
            ₪{(totals.totalCommission / 1000).toFixed(1)}K
          </div>
          <div className="m-deal-summary-sub">{totals.closed} נחתמו</div>
        </div>
      </div>

      <div className="m-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 22 }}>
        {STAGES.map((stage) => {
          const items = byStage.get(stage.key) || [];
          const isOpen = expanded.has(stage.key);
          const Icon = stage.icon;
          const total = items.reduce((s, d) => s + (d.offer || d.marketingPrice || 0), 0);
          return (
            <div key={stage.key} className="m-stage">
              <button className="m-stage-head" onClick={() => toggle(stage.key)}>
                <div className="m-stage-title">
                  <div className="m-stage-icon" style={{ color: stage.color, background: `color-mix(in srgb, ${stage.color} 14%, transparent)` }}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-primary)' }}>
                      {stage.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {items.length} · {formatPrice(total)}
                    </div>
                  </div>
                </div>
                <div className={`m-stage-chevron ${isOpen ? 'open' : ''}`}>▾</div>
              </button>
              {isOpen && (
                <div className="m-stage-items">
                  {items.map((d) => (
                    <div key={d.id} className="m-deal-row">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                          <Building2 size={13} color="var(--gold)" />
                          {d.propertyStreet}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MapPin size={10} />{d.city}
                          <span style={{ opacity: 0.5 }}>·</span>
                          <Calendar size={10} />{d.updateDate}
                        </div>
                        {d.lawyer && d.lawyer !== '—' && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Scale size={10} />{d.lawyer}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: d.closedPrice ? 'var(--success)' : 'var(--gold-light)' }}>
                          {formatPrice(d.closedPrice || d.offer || d.marketingPrice)}
                        </div>
                        {d.commission && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                            <DollarSign size={10} />
                            {formatPrice(d.commission)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                      אין עסקאות בשלב זה
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .m-deal-summary {
          display: flex; align-items: center; gap: 18px;
          padding: 18px; border-radius: var(--m-radius-md);
          background: linear-gradient(135deg, rgba(201,169,110,0.12), rgba(201,169,110,0.04));
          border: 1px solid var(--m-ring);
        }
        .m-deal-summary-label {
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
          color: var(--text-muted); font-weight: 600;
        }
        .m-deal-summary-value {
          font-family: var(--font-display); font-size: 26px;
          color: var(--gold-light); letter-spacing: -0.5px; margin-top: 3px;
          line-height: 1;
        }
        .m-deal-summary-sub {
          font-size: 11px; color: var(--text-muted); margin-top: 4px;
        }
        .m-deal-summary-divider {
          width: 1px; align-self: stretch; background: var(--m-hairline);
        }
        .m-stage {
          background: var(--bg-card); border: 1px solid var(--m-hairline);
          border-radius: var(--m-radius-md); overflow: hidden;
        }
        .m-stage-head {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; padding: 14px 16px; background: transparent;
          border: none; color: var(--text-primary); cursor: pointer;
          font-family: var(--font-body);
        }
        .m-stage-title {
          display: flex; align-items: center; gap: 12px;
        }
        .m-stage-icon {
          width: 36px; height: 36px; border-radius: var(--m-radius-sm);
          display: grid; place-items: center;
        }
        .m-stage-chevron {
          transition: transform 0.2s;
          color: var(--text-muted);
        }
        .m-stage-chevron.open { transform: rotate(-180deg); }
        .m-stage-items {
          padding: 0 12px 12px;
          display: flex; flex-direction: column; gap: 4px;
          animation: fadeIn 0.3s var(--m-ease-out);
        }
        .m-deal-row {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 12px; border-top: 1px solid var(--m-hairline);
        }
      `}</style>
    </div>
  );
}
