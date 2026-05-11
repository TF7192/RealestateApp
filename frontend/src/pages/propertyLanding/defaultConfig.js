// Default landing-page config for a property where the agent hasn't
// opened the editor yet. Mirrors `defaultLandingConfig()` in
// backend/src/lib/landingConfig.ts — keep in sync.
//
// When `Property.landingPageConfig` is null, the renderer asks for
// this shape and produces the pre-editor layout byte-identically.
// When the editor opens for the first time, it starts from this
// shape too, so an agent's first save isn't a giant diff from
// nothing.

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Last-ditch fallback for environments without crypto.randomUUID
  // (shouldn't happen in modern Chrome / Safari, but PWAs in
  // private-mode Safari have surprised us before).
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mk(type, props) {
  return { id: uuid(), visible: true, type, props };
}

/**
 * @param {{ assetClass?: 'RESIDENTIAL' | 'COMMERCIAL' }} opts
 */
export function defaultLandingConfig(opts = {}) {
  const template = opts.assetClass === 'COMMERCIAL' ? 'COMMERCIAL' : 'RESIDENTIAL';
  return {
    version: 1,
    template,
    sections: [
      mk('HERO',       { eyebrow: '', title: '', subtitle: '', photoId: null, variant: 'IMAGE' }),
      mk('GALLERY',    { heading: '' }),
      mk('INQUIRY',    { heading: '', subHeading: '', ctaLabel: '' }),
      mk('AGENT_CARD', {}),
    ],
  };
}

// The eleven block types the renderer + editor know about. Exported
// so the editor's "add section" menu has a single source of truth.
export const BLOCK_TYPES = [
  'HERO',
  'GALLERY',
  'DESCRIPTION',
  'AMENITIES',
  'NEIGHBORHOOD',
  'VIDEO',
  'VIRTUAL_TOUR',
  'FLOOR_PLAN',
  'SPECS',
  'AGENT_CARD',
  'INQUIRY',
];

export const REQUIRED_BLOCK_TYPES = new Set(['HERO', 'AGENT_CARD', 'INQUIRY']);

// Default `props` shape for each block type. Used when the editor
// adds a new section so the rendered preview never sees undefined.
export const DEFAULT_PROPS = {
  HERO:         { eyebrow: '', title: '', subtitle: '', photoId: null, variant: 'IMAGE' },
  GALLERY:      { heading: '' },
  DESCRIPTION:  { heading: '', body: '' },
  AMENITIES:    { heading: '', items: [] },
  NEIGHBORHOOD: { heading: '', body: '', showMap: false },
  VIDEO:        { heading: '', url: '' },
  VIRTUAL_TOUR: { heading: '', url: '', ctaLabel: '' },
  FLOOR_PLAN:   { heading: '', photoId: null },
  SPECS:        { heading: '', showPrice: false, showRooms: true, showSqm: true, showFloor: false },
  AGENT_CARD:   {},
  INQUIRY:      { heading: '', subHeading: '', ctaLabel: '' },
};

export function newSection(type) {
  return {
    id: uuid(),
    visible: true,
    type,
    props: { ...(DEFAULT_PROPS[type] || {}) },
  };
}
