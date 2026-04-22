import { copy } from '../copy.he';

export default function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer-grid">
        <div className="lp-footer-brand">
          <a className="lp-logo" href="/">
            <span className="lp-logo-mark" aria-hidden="true">◆</span>
            <span>{copy.nav.logo}</span>
          </a>
          <p className="lp-footer-tagline">{copy.footer.tagline}</p>
        </div>
        {copy.footer.columns.map((col) => (
          <div key={col.title} className="lp-footer-col">
            <p className="lp-footer-col-title">{col.title}</p>
            <ul>
              {col.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="lp-container lp-footer-bottom">
        <span>{copy.footer.copyright}</span>
        <span>נבנה בישראל · שרתים באירופה</span>
      </div>
    </footer>
  );
}
