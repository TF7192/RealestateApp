import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { legal } from './legal.he';
import { copy } from './copy.he';
import './Landing.css';
import './LegalPage.css';

export default function LegalPage({ which }) {
  const doc = which === 'privacy' ? legal.privacy : legal.terms;

  useEffect(() => {
    const prev = document.title;
    document.title = `${doc.title} · ${copy.nav.logo}`;
    window.scrollTo(0, 0);
    return () => { document.title = prev; };
  }, [doc.title]);

  return (
    <div className="lp-page" dir="rtl" lang="he">
      <nav className="lp-nav is-scrolled" aria-label="ראשי">
        <div className="lp-container lp-nav-inner">
          <a className="lp-logo" href="/">
            <span className="lp-logo-mark" aria-hidden="true">◆</span>
            <span>{copy.nav.logo}</span>
          </a>
          <div className="lp-nav-actions">
            <a className="lp-btn lp-btn-ghost" href="/"><ArrowLeft size={16} /> חזרה לדף הבית</a>
          </div>
        </div>
      </nav>

      <main className="legal-main">
        <div className="lp-container legal-container">
          <header className="legal-head">
            <span className="lp-eyebrow">{copy.nav.logo}</span>
            <h1 className="legal-h1">{doc.title}</h1>
            <p className="legal-meta">
              עודכן לאחרונה: <time>{legal.last_updated}</time>
            </p>
            <p className="legal-intro">{doc.intro}</p>
          </header>

          <article className="legal-article">
            {doc.sections.map((s) => (
              <section key={s.h} className="legal-section">
                <h2>{s.h}</h2>
                {s.p.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </section>
            ))}
          </article>

          <footer className="legal-foot">
            <p>
              יצירת קשר: <a href={`mailto:${legal.contact}`}>{legal.contact}</a>
            </p>
            <div className="legal-foot-links">
              <a href="/terms">תנאי שימוש</a>
              <span aria-hidden="true">·</span>
              <a href="/privacy">מדיניות פרטיות</a>
              <span aria-hidden="true">·</span>
              <a href="/">דף הבית</a>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
