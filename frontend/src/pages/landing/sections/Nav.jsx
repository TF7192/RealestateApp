import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { copy } from '../copy.he';

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  return (
    <>
      <nav className={`lp-nav ${scrolled ? 'is-scrolled' : ''}`} aria-label="ראשי">
        <div className="lp-container lp-nav-inner">
          <a className="lp-logo" href="/" aria-label={copy.nav.logo}>
            <span className="lp-logo-mark" aria-hidden="true">◆</span>
            <span>{copy.nav.logo}</span>
          </a>

          <div className="lp-nav-links" role="list">
            {copy.nav.links.map((l) => (
              <a key={l.id} href={`#${l.id}`}>{l.label}</a>
            ))}
          </div>

          <div className="lp-nav-actions">
            <a className="lp-btn lp-btn-ghost" href="/login">{copy.nav.login_cta}</a>
            <a
              className="lp-btn lp-btn-primary"
              href="/login?flow=signup&utm_source=landing&utm_medium=nav_cta"
            >
              {copy.nav.primary_cta}
            </a>
            <button
              type="button"
              className="lp-nav-menu-btn"
              aria-label={copy.nav.mobile_menu_open}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </nav>

      {drawerOpen && (
        <div className="lp-nav-drawer" role="dialog" aria-modal="true" aria-label="תפריט">
          <div className="lp-nav-drawer-top">
            <a className="lp-logo" href="/" onClick={() => setDrawerOpen(false)}>
              <span className="lp-logo-mark" aria-hidden="true">◆</span>
              <span>{copy.nav.logo}</span>
            </a>
            <button
              type="button"
              className="lp-nav-menu-btn"
              aria-label={copy.nav.mobile_menu_close}
              onClick={() => setDrawerOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="lp-nav-drawer-links">
            {copy.nav.links.map((l) => (
              <a key={l.id} href={`#${l.id}`} onClick={() => setDrawerOpen(false)}>
                {l.label}
              </a>
            ))}
          </div>
          <div className="lp-nav-drawer-actions">
            <a className="lp-btn lp-btn-secondary" href="/login" onClick={() => setDrawerOpen(false)}>
              {copy.nav.login_cta}
            </a>
            <a
              className="lp-btn lp-btn-primary"
              href="/login?flow=signup&utm_source=landing&utm_medium=mobile_drawer"
              onClick={() => setDrawerOpen(false)}
            >
              {copy.nav.primary_cta}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
