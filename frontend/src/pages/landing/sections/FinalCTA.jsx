import { copy } from '../copy.he';
import StoreBadges from './StoreBadges';

export default function FinalCTA() {
  return (
    <section className="lp-final-cta">
      <h2>{copy.final_cta.h2}</h2>
      <p>{copy.final_cta.sub}</p>
      <a
        className="lp-btn lp-btn-primary"
        href="/login?flow=signup&utm_source=landing&utm_medium=final_cta"
      >
        {copy.final_cta.primary_cta}
      </a>
      <div className="lp-final-cta-sub-label">{copy.final_cta.secondary_label}</div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
        <StoreBadges note={null} />
      </div>
    </section>
  );
}
