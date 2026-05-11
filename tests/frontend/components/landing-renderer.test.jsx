// LandingRenderer — config-driven public landing page.
//
// Phase 6 of the landing-editor feature. Pins:
//   1. With `config={null}`, the renderer falls back to the default
//      config and renders the same hero/gallery/form layout the
//      original PropertyLandingPage shipped.
//   2. Block ordering follows `config.sections` (not a hard-coded
//      template).
//   3. Sections with `visible: false` don't render.
//   4. Custom HERO copy overrides the per-template default.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../setup/test-utils';
import LandingRenderer from '@estia/frontend/pages/propertyLanding/LandingRenderer.jsx';

// The renderer uses `api.submitPropertyInquiry` on form submit; not
// exercised in these render-only tests but mocked so the import
// doesn't try to reach the network on module-load.
vi.mock('@estia/frontend/lib/api.js', () => ({
  default: {
    submitPropertyInquiry: vi.fn(() => Promise.resolve()),
    trackPublicPropertyView: vi.fn(() => Promise.resolve()),
  },
}));

const property = {
  id: 'p1',
  slug: 'p1-slug',
  type: 'דירה',
  street: 'רוטשילד 1',
  city: 'תל אביב',
  assetClass: 'RESIDENTIAL',
  rooms: 4,
  sqm: 110,
  marketingPrice: 4_500_000,
  imageList: [
    { id: 'i1', url: '/u/1', urlCard: '/u/1c', urlThumb: '/u/1t', sortOrder: 0 },
    { id: 'i2', url: '/u/2', urlCard: '/u/2c', urlThumb: '/u/2t', sortOrder: 1 },
  ],
};

const agent = { id: 'a1', slug: 'agent', displayName: 'מתי הסוכן', avatarUrl: null };

describe('LandingRenderer', () => {
  it('falls back to the default config when given null', () => {
    render(<LandingRenderer config={null} property={property} agent={agent} inquiryDisabled lazyBelowFold={false} />);
    // Default config has hero + inquiry; the template's default
    // hero title should appear ("בית שמחכה להיכנס אליו").
    expect(screen.getByRole('heading', { level: 1, name: /בית שמחכה/ })).toBeInTheDocument();
    // Inquiry submit button uses the template label.
    expect(screen.getByRole('button', { name: /קבעו סיור/ })).toBeInTheDocument();
  });

  it('respects custom HERO copy from the config', () => {
    const config = {
      version: 1,
      template: 'RESIDENTIAL',
      sections: [
        { id: 's-hero',  type: 'HERO',       visible: true, props: { eyebrow: '', title: 'בית בוטיק על קו ראשון לים', subtitle: '', photoId: null, variant: 'IMAGE' } },
        { id: 's-form',  type: 'INQUIRY',    visible: true, props: { heading: '', subHeading: '', ctaLabel: '' } },
        { id: 's-agent', type: 'AGENT_CARD', visible: true, props: {} },
      ],
    };
    render(<LandingRenderer config={config} property={property} agent={agent} inquiryDisabled lazyBelowFold={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'בית בוטיק על קו ראשון לים' })).toBeInTheDocument();
  });

  it('renders DESCRIPTION + AMENITIES + SPECS blocks when present', () => {
    const config = {
      version: 1,
      template: 'RESIDENTIAL',
      sections: [
        { id: 's-hero',  type: 'HERO',         visible: true, props: { eyebrow: '', title: 'A', subtitle: '', photoId: null, variant: 'IMAGE' } },
        { id: 's-desc',  type: 'DESCRIPTION',  visible: true, props: { heading: 'על הנכס', body: 'פסקה ראשונה.\n\nפסקה שנייה.' } },
        { id: 's-am',    type: 'AMENITIES',    visible: true, props: { heading: 'מאפיינים', items: ['מרפסת', 'חניה', 'מעלית'] } },
        { id: 's-sp',    type: 'SPECS',        visible: true, props: { heading: 'נתונים', showPrice: false, showRooms: true, showSqm: true, showFloor: false } },
        { id: 's-form',  type: 'INQUIRY',      visible: true, props: { heading: '', subHeading: '', ctaLabel: '' } },
        { id: 's-agent', type: 'AGENT_CARD',   visible: true, props: {} },
      ],
    };
    render(<LandingRenderer config={config} property={property} agent={agent} inquiryDisabled lazyBelowFold={false} />);
    expect(screen.getByRole('heading', { name: 'על הנכס' })).toBeInTheDocument();
    expect(screen.getByText(/פסקה ראשונה/)).toBeInTheDocument();
    expect(screen.getByText('מרפסת')).toBeInTheDocument();
    expect(screen.getByText('חניה')).toBeInTheDocument();
    expect(screen.getByText(/4 חדרים/)).toBeInTheDocument();
    expect(screen.getByText(/110 מ״ר/)).toBeInTheDocument();
    // showPrice=false → price chip is NOT rendered.
    expect(screen.queryByText(/4,500,000/)).not.toBeInTheDocument();
  });

  it('skips invisible sections', () => {
    const config = {
      version: 1,
      template: 'RESIDENTIAL',
      sections: [
        { id: 's-hero',  type: 'HERO',         visible: true,  props: { eyebrow: '', title: 'HeroTitle', subtitle: '', photoId: null, variant: 'IMAGE' } },
        { id: 's-desc',  type: 'DESCRIPTION',  visible: false, props: { heading: 'שלא יוצג', body: 'גוף שלא יוצג' } },
        { id: 's-form',  type: 'INQUIRY',      visible: true,  props: { heading: '', subHeading: '', ctaLabel: '' } },
        { id: 's-agent', type: 'AGENT_CARD',   visible: true,  props: {} },
      ],
    };
    render(<LandingRenderer config={config} property={property} agent={agent} inquiryDisabled lazyBelowFold={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'HeroTitle' })).toBeInTheDocument();
    expect(screen.queryByText('שלא יוצג')).not.toBeInTheDocument();
  });

  it('lazyBelowFold defers below-fold blocks behind an IntersectionObserver placeholder', () => {
    const config = {
      version: 1,
      template: 'RESIDENTIAL',
      sections: [
        { id: 's-hero',  type: 'HERO',        visible: true, props: { eyebrow: '', title: 'HeroTitle', subtitle: '', photoId: null, variant: 'IMAGE' } },
        { id: 's-desc',  type: 'DESCRIPTION', visible: true, props: { heading: 'אמור להיות מוסתר עד גלילה', body: 'גוף הטקסט.' } },
        { id: 's-form',  type: 'INQUIRY',     visible: true, props: { heading: '', subHeading: '', ctaLabel: '' } },
        { id: 's-agent', type: 'AGENT_CARD',  visible: true, props: {} },
      ],
    };
    // happy-dom has no real IntersectionObserver — sections past
    // the hero stay behind the empty placeholder. That's the point:
    // confirms that without scrolling, the heading is NOT in the DOM.
    render(<LandingRenderer config={config} property={property} agent={agent} inquiryDisabled />);
    expect(screen.getByRole('heading', { level: 1, name: 'HeroTitle' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'אמור להיות מוסתר עד גלילה' })).not.toBeInTheDocument();
  });

  it('parses a YouTube watch URL into the embed iframe', () => {
    const config = {
      version: 1,
      template: 'RESIDENTIAL',
      sections: [
        { id: 's-hero',  type: 'HERO',       visible: true, props: { eyebrow: '', title: 'T', subtitle: '', photoId: null, variant: 'IMAGE' } },
        { id: 's-vid',   type: 'VIDEO',      visible: true, props: { heading: 'סיור', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } },
        { id: 's-form',  type: 'INQUIRY',    visible: true, props: { heading: '', subHeading: '', ctaLabel: '' } },
        { id: 's-agent', type: 'AGENT_CARD', visible: true, props: {} },
      ],
    };
    const { container } = render(<LandingRenderer config={config} property={property} agent={agent} inquiryDisabled lazyBelowFold={false} />);
    const iframe = container.querySelector('.lp-video-wrap iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute('src')).toMatch(/youtube\.com\/embed\/dQw4w9WgXcQ/);
  });
});
