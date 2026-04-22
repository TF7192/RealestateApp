import { Check } from 'lucide-react';
import { copy } from '../copy.he';
import DeviceMockup from './DeviceMockup';
import StoreBadges from './StoreBadges';

export default function MobileApp() {
  return (
    <section className="lp-section lp-mobile-section">
      <div className="lp-container lp-mobile-grid">
        <div className="lp-hero-visual">
          <DeviceMockup ariaLabel={copy.mobile.screenshot_alt} variant="property" />
        </div>
        <div>
          <div className="lp-eyebrow">{copy.mobile.section_eyebrow}</div>
          <h2 className="lp-h2">{copy.mobile.section_title}</h2>
          <p className="lp-sub">{copy.mobile.section_sub}</p>
          <ul className="lp-mobile-bullets">
            {copy.mobile.bullets.map((b) => (
              <li key={b} className="lp-mobile-bullet">
                <span className="lp-mobile-bullet-icon" aria-hidden="true">
                  <Check size={16} />
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <StoreBadges note={copy.hero.store_disabled_note} />
          <div className="lp-qr" aria-hidden="true">
            <div className="lp-qr-box" />
            <div className="lp-qr-text">
              <strong>{copy.mobile.qr_label_desktop}</strong>
              <br />
              (יופיע קוד QR אמיתי כשהאפליקציות בחנויות)
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
