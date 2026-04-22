import { ArrowLeft } from 'lucide-react';
import { copy } from '../copy.he';
import DeviceMockup from './DeviceMockup';
import StoreBadges from './StoreBadges';

export default function Hero() {
  return (
    <header className="lp-hero">
      <div className="lp-container lp-hero-grid">
        <div>
          <span className="lp-hero-eyebrow">{copy.hero.eyebrow}</span>
          <h1 className="lp-h1">
            {copy.hero.h1_line_1}
            <span className="lp-h1-accent">{copy.hero.h1_line_2}</span>
          </h1>
          <p className="lp-hero-sub">{copy.hero.sub}</p>
          <div className="lp-hero-cta-row">
            <a
              className="lp-btn lp-btn-primary"
              href="/login?flow=signup&utm_source=landing&utm_medium=hero_cta"
            >
              {copy.hero.primary_cta}
              <ArrowLeft size={18} aria-hidden="true" />
            </a>
            <a
              className="lp-btn lp-btn-secondary"
              href="/login?utm_source=landing&utm_medium=hero_secondary"
            >
              {copy.hero.secondary_cta}
            </a>
          </div>
          <div className="lp-hero-trust" aria-label="נקודות אמון">
            {copy.hero.trust.map((t) => (
              <span key={t} className="lp-hero-trust-item">{t}</span>
            ))}
          </div>
          <StoreBadges note={copy.hero.store_disabled_note} />
        </div>

        <div className="lp-hero-visual">
          <DeviceMockup ariaLabel={copy.hero.screenshot_alt} />
        </div>
      </div>
    </header>
  );
}
