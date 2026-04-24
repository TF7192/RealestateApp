// AI spotlight — the "Estia AI" premium surface pulled out of the
// feature grid into its own section. Driven by the Cream & Gold
// redesign brief: the AI is the PREMIUM differentiator and should
// feel unmissable, not buried as one of six feature cards.
//
// The right-hand playground ticks through three states on a 3s loop:
//   0) idle   — "click to generate"
//   1) typing — characters stream in
//   2) done   — full sample sits in place
// Respects prefers-reduced-motion: skips to the "done" state.

import { useEffect, useState } from 'react';
import { Sparkles, ShieldCheck, Star } from 'lucide-react';
import { copy } from '../copy.he';

export default function AISpotlight() {
  return (
    <section id="ai" className="lp-section lp-ai-section">
      <div className="lp-container">
        <span className="lp-ai-ribbon" aria-hidden="true">
          <Star size={14} />
          {copy.ai.premium_chip}
        </span>

        <div className="lp-ai-grid">
          <div className="lp-ai-copy">
            <div className="lp-eyebrow lp-ai-eyebrow">
              <Sparkles size={14} aria-hidden="true" />
              {copy.ai.eyebrow}
            </div>
            <h2 className="lp-h2">{copy.ai.title}</h2>
            <p className="lp-sub">{copy.ai.sub}</p>

            <div className="lp-ai-premium-note" role="note">
              <ShieldCheck size={16} aria-hidden="true" />
              {copy.ai.premium_note}
            </div>

            <ul className="lp-ai-actions" aria-label="פעולות AI">
              {copy.ai.actions.map((a) => (
                <li key={a.label} className="lp-ai-action-row">
                  <span className="lp-ai-action-icon" aria-hidden="true">
                    <Sparkles size={16} />
                  </span>
                  <span className="lp-ai-action-label">{a.label}</span>
                  <span className="lp-ai-action-hint">{a.hint}</span>
                  <span className="lp-ai-action-pro">PRO</span>
                </li>
              ))}
            </ul>
          </div>

          <AIPlayground />
        </div>
      </div>
    </section>
  );
}

function AIPlayground() {
  const [step, setStep] = useState(0); // 0 idle · 1 typing · 2 done
  const [text, setText] = useState('');
  const full = copy.ai.playground_sample;

  useEffect(() => {
    const prefersReduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) { setStep(2); return undefined; }
    const t = setInterval(() => setStep((s) => (s + 1) % 3), 3200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (step !== 1) { setText(step === 2 ? full : ''); return undefined; }
    let i = 0;
    const t = setInterval(() => {
      i += 2;
      setText(full.slice(0, i));
      if (i >= full.length) clearInterval(t);
    }, 25);
    return () => clearInterval(t);
  }, [step, full]);

  const statusLabel = step === 0 ? '○ מחכה' : step === 1 ? '● מייצר' : '✓ מוכן';

  return (
    <div className="lp-ai-playground" aria-live="polite">
      <div className="lp-ai-playground-ribbon" aria-hidden="true">
        <Star size={12} /> PREMIUM
      </div>

      <div className="lp-ai-playground-head">
        <Sparkles size={14} aria-hidden="true" />
        <span>{copy.ai.playground_title}</span>
        <span className="lp-ai-playground-ver">{copy.ai.playground_badge}</span>
      </div>

      <div className="lp-ai-playground-card">
        <div className="lp-ai-playground-label">{copy.ai.playground_fields_label}</div>
        <div className="lp-ai-playground-fields">
          {copy.ai.playground_fields.map((f) => (
            <div key={f.k} className="lp-ai-playground-field">
              <div className="lp-ai-playground-field-key">{f.k}</div>
              <div className="lp-ai-playground-field-val">{f.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="lp-ai-playground-output">
        <div className="lp-ai-playground-output-head">
          <Sparkles size={12} aria-hidden="true" />
          <span>{copy.ai.playground_output_label}</span>
          <span className={`lp-ai-playground-status ${step === 1 ? 'is-running' : ''}`}>
            {statusLabel}
          </span>
        </div>
        <div className="lp-ai-playground-output-body">
          {step === 0 && <span className="lp-ai-playground-idle">{copy.ai.playground_idle}</span>}
          {step === 1 && (
            <>
              {text}
              <span className="lp-ai-playground-caret">▍</span>
            </>
          )}
          {step === 2 && full}
        </div>
      </div>

      <button type="button" className="lp-btn lp-btn-primary lp-ai-playground-cta">
        {copy.ai.playground_cta} <Sparkles size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
