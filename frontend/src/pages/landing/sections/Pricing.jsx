import { useState } from 'react';
import { Check } from 'lucide-react';
import { copy } from '../copy.he';

export default function Pricing() {
  const [cycle, setCycle] = useState('monthly');
  const t = copy.pricing;

  return (
    <section id="pricing" className="lp-section lp-pricing-section">
      <div className="lp-container">
        <div className="lp-pricing-head">
          <div className="lp-eyebrow">{t.section_eyebrow}</div>
          <span className="lp-pricing-trial-banner">{t.section_sub}</span>
          <h2 className="lp-h2">{t.section_title}</h2>

          <div className="lp-pricing-toggle" role="tablist" aria-label="מחזור חיוב">
            <button
              type="button"
              role="tab"
              aria-selected={cycle === 'monthly'}
              className={cycle === 'monthly' ? 'is-active' : ''}
              onClick={() => setCycle('monthly')}
            >
              {t.cycle_toggle.monthly}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={cycle === 'yearly'}
              className={cycle === 'yearly' ? 'is-active' : ''}
              onClick={() => setCycle('yearly')}
            >
              {t.cycle_toggle.yearly}
            </button>
          </div>
        </div>

        <div className="lp-pricing-grid">
          {t.tiers.map((tier) => {
            const price = cycle === 'yearly' ? Math.round(tier.yearly / 12) : tier.monthly;
            return (
              <div
                key={tier.key}
                className={`lp-tier ${tier.recommended ? 'is-recommended' : ''}`}
              >
                {tier.recommended && (
                  <span className="lp-tier-badge">{tier.recommended_badge}</span>
                )}
                <div>
                  <h3 className="lp-tier-name">{tier.name}</h3>
                  <p className="lp-tier-lead">{tier.lead}</p>
                </div>
                <div className="lp-tier-price">
                  <span className="lp-tier-price-c">{t.currency}</span>
                  <span className="lp-tier-price-n">{price}</span>
                  <span className="lp-tier-price-s">
                    / חודש · {t.vat_note}
                  </span>
                </div>
                {cycle === 'yearly' && (
                  <p className="lp-tier-lead" style={{ marginTop: -8 }}>
                    {t.yearly_hint}
                  </p>
                )}

                <ul className="lp-tier-bullets">
                  {tier.bullets.map((b) => (
                    <li key={b}>
                      <span className="lp-tier-bullet-check" aria-hidden="true">
                        <Check size={14} />
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                <a
                  className={`lp-btn ${tier.recommended ? 'lp-btn-primary' : 'lp-btn-secondary'}`}
                  href={`/login?flow=signup&utm_source=landing&utm_medium=pricing_${tier.key}`}
                >
                  {tier.cta}
                </a>
              </div>
            );
          })}
        </div>

        <p className="lp-pricing-vat">{t.vat_note}</p>
        <div className="lp-pricing-trust">
          {t.trust.map((s) => <span key={s}>{s}</span>)}
        </div>
      </div>
    </section>
  );
}
