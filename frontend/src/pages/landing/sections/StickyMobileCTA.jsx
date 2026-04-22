import { useEffect, useState } from 'react';
import { copy } from '../copy.he';

export default function StickyMobileCTA() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div className={`lp-sticky-cta ${visible ? 'is-visible' : ''}`} aria-hidden={!visible}>
      <a
        className="lp-btn lp-btn-primary"
        href="/login?flow=signup&utm_source=landing&utm_medium=sticky_mobile"
      >
        {copy.hero.primary_cta}
      </a>
    </div>
  );
}
