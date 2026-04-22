import { useEffect } from 'react';
import Nav from './sections/Nav';
import Hero from './sections/Hero';
import Features from './sections/Features';
import MobileApp from './sections/MobileApp';
import HowItWorks from './sections/HowItWorks';
import Pricing from './sections/Pricing';
import FAQ from './sections/FAQ';
import FinalCTA from './sections/FinalCTA';
import Footer from './sections/Footer';
import StickyMobileCTA from './sections/StickyMobileCTA';
import { copy } from './copy.he';
import './Landing.css';

/**
 * Public landing page — shown at `/` for unauthenticated users. Authed
 * users continue to hit <Dashboard /> at `/` (handled in App.jsx).
 *
 * Mobile-first. RTL-native. Reuses the product's CSS-variable design
 * system — same gold, same Assistant font, same icons.
 */
export default function Landing() {
  useEffect(() => {
    // <head> injection: title + description + canonical + OG + JSON-LD.
    // Runs once; cleanup strips only tags we added so switching pages
    // doesn't leave stale tags behind.
    const added = [];

    const setTitle = (t) => { document.title = t; };
    const setMeta = (selector, attr, value, content) => {
      let el = document.head.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, value);
        document.head.appendChild(el);
        added.push(el);
      }
      el.setAttribute('content', content);
      return el;
    };
    const setLink = (rel, href) => {
      let el = document.head.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
        added.push(el);
      }
      el.setAttribute('href', href);
      return el;
    };

    const prevTitle = document.title;
    setTitle(copy.meta.title);
    setMeta('meta[name="description"]',    'name',     'description',    copy.meta.description);
    setMeta('meta[property="og:title"]',   'property', 'og:title',       copy.meta.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', copy.meta.description);
    setMeta('meta[property="og:type"]',    'property', 'og:type',        'website');
    setMeta('meta[property="og:url"]',     'property', 'og:url',         copy.meta.canonical);
    setMeta('meta[property="og:locale"]',  'property', 'og:locale',      'he_IL');
    setMeta('meta[name="twitter:card"]',   'name',     'twitter:card',   'summary_large_image');
    setMeta('meta[name="twitter:title"]',  'name',     'twitter:title',  copy.meta.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', copy.meta.description);
    setLink('canonical', copy.meta.canonical);

    // JSON-LD — Organization + SoftwareApplication + FAQPage.
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Estia',
        url: copy.meta.canonical,
        logo: copy.meta.canonical + 'favicon.svg',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Estia',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'iOS, Android, Web',
        offers: copy.pricing.tiers.map((tier) => ({
          '@type': 'Offer',
          name: tier.name,
          price: String(tier.monthly),
          priceCurrency: 'ILS',
          availability: 'https://schema.org/InStock',
          url: copy.meta.canonical + '#pricing',
        })),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: copy.faq.items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ]);
    document.head.appendChild(ld);
    added.push(ld);

    return () => {
      document.title = prevTitle;
      for (const el of added) {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    };
  }, []);

  // Fade-in-on-scroll — IntersectionObserver on .lp-fade-in elements.
  useEffect(() => {
    const nodes = document.querySelectorAll('.lp-fade-in');
    if (!nodes.length || typeof IntersectionObserver === 'undefined') {
      nodes.forEach((n) => n.classList.add('is-visible'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp-page" dir="rtl" lang="he">
      <Nav />
      <main>
        <Hero />
        <Features />
        <MobileApp />
        <HowItWorks />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <StickyMobileCTA />
    </div>
  );
}
