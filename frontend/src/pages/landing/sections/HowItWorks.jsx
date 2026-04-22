import { copy } from '../copy.he';

export default function HowItWorks() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <div className="lp-section-head">
          <h2 className="lp-h2">{copy.how.section_title}</h2>
          <p className="lp-sub">{copy.how.section_sub}</p>
        </div>
        <ol className="lp-steps" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {copy.how.steps.map((s) => (
            <li key={s.n} className="lp-step lp-fade-in">
              <div className="lp-step-n" aria-hidden="true">{s.n}</div>
              <h3 className="lp-step-title">{s.title}</h3>
              <p className="lp-step-body">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
