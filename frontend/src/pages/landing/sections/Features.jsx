import {
  Sparkles,
  Users,
  Building2,
  CalendarDays,
  Calculator,
  Smartphone,
  Check,
  Star,
} from 'lucide-react';
import { copy } from '../copy.he';

const ICONS = {
  ai:         Sparkles,
  leads:      Users,
  properties: Building2,
  calendar:   CalendarDays,
  calculator: Calculator,
  mobile:     Smartphone,
};

export default function Features() {
  return (
    <section id="features" className="lp-section">
      <div className="lp-container">
        <div className="lp-section-head">
          <div className="lp-eyebrow">{copy.features.section_eyebrow}</div>
          <h2 className="lp-h2">{copy.features.section_title}</h2>
          <p className="lp-sub">{copy.features.section_sub}</p>
        </div>

        <div className="lp-feature-grid">
          {copy.features.cards.map((card) => {
            const Icon = ICONS[card.key] || Check;
            const featured = card.key === 'ai'; // Premium AI card gets the gold ribbon.
            return (
              <article
                key={card.key}
                className={`lp-feature-card lp-fade-in${featured ? ' lp-feature-card-featured' : ''}`}
              >
                {featured && (
                  <span className="lp-feature-ribbon" aria-label="כלול רק במסלול Premium">
                    <Star size={12} aria-hidden="true" />
                    PREMIUM
                  </span>
                )}
                <span className="lp-feature-icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <h3 className="lp-feature-title">{card.title}</h3>
                <p className="lp-feature-body">{card.body}</p>
              </article>
            );
          })}
        </div>

        <div className="lp-more-features">
          <p className="lp-more-features-title">{copy.features.more_features_title}</p>
          <ul className="lp-more-features-list">
            {copy.features.more_features.map((txt) => (
              <li key={txt}>
                <Check size={16} aria-hidden="true" style={{ flex: 'none', color: 'var(--gold-readable)', marginTop: 3 }} />
                <span>{txt}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
