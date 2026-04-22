import { copy } from '../copy.he';

export default function FAQ() {
  const t = copy.faq;
  return (
    <section id="faq" className="lp-section" style={{ background: 'var(--bg-secondary)' }}>
      <div className="lp-container">
        <div className="lp-section-head">
          <div className="lp-eyebrow">{t.section_eyebrow}</div>
          <h2 className="lp-h2">{t.section_title}</h2>
        </div>
        <div className="lp-faq-list">
          {t.items.map((item) => (
            <details key={item.q} className="lp-faq-item">
              <summary>{item.q}</summary>
              <div className="lp-faq-body">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
