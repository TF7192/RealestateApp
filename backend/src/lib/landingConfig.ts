// 2026-05-11 — landing-page config schema.
//
// Premium agents customize the per-property landing page at
// /l/:agentSlug/:propertySlug via /properties/:id/landing-editor.
// This module owns the on-disk JSON shape:
//
//   • `parseLandingConfig(...)` — validates a payload received from
//     the editor PATCH, returns the canonical (typed) shape or throws.
//   • `defaultLandingConfig(...)` — synthesizes the config that
//     reproduces the pre-editor hard-coded layout, so existing rows
//     with `landingPageConfig = null` render byte-identically.
//
// Design notes:
//   • Each section carries its own UUID so the editor can drag-reorder
//     without re-keying React lists, and a `visible` flag so an agent
//     can hide a section without losing the copy they wrote.
//   • Copy fields are plain text (newlines preserved, no markdown).
//     Caps are tight enough to keep total config under the 50 KB
//     guard rail and the rendered page within Lighthouse perf budgets.
//   • The block library is fixed (eleven types). Adding a new block
//     means bumping `LATEST_VERSION` and updating the renderer; the
//     editor refuses to save a config with an unknown type.
//   • Embeds: YouTube/Vimeo only. Server-side allowlist prevents the
//     editor from sneaking in arbitrary <iframe>-able URLs.
//   • Photo references point at PropertyImage.id. The PATCH handler
//     enforces that every referenced id belongs to the property being
//     edited (so an agent can't borrow another property's photos).

import { z } from 'zod';

export const LATEST_VERSION = 1;

const MAX_CONFIG_BYTES = 50 * 1024;

// Hebrew text caps — generous enough for marketing copy, tight enough
// to keep the page snappy and prevent runaway pastes from blowing up
// the JSON column.
const titleMax = 80;
const subtitleMax = 200;
const bodyMax = 1000;
const itemTextMax = 60;
const itemCountMax = 12;
const ctaMax = 32;
const urlMax = 400;

const Visibility = z.boolean().default(true);
const SectionId = z.string().uuid();
const PhotoId = z.string().min(1);

// ── Block prop schemas ────────────────────────────────────────────

const HeroProps = z.object({
  // Eyebrow / title / subtitle override the template defaults. Leave
  // empty string to fall back to the per-template copy in copy.he.js.
  eyebrow: z.string().max(titleMax).default(''),
  title: z.string().max(titleMax).default(''),
  subtitle: z.string().max(subtitleMax).default(''),
  // Which property photo to use for the hero. `null` = first photo.
  photoId: PhotoId.nullable().default(null),
  // Visual variant. IMAGE = current full-bleed photo + gradient.
  // SPLIT = photo on one side, text on the other (desktop only).
  variant: z.enum(['IMAGE', 'SPLIT']).default('IMAGE'),
});

const GalleryProps = z.object({
  heading: z.string().max(titleMax).default(''),
});

const DescriptionProps = z.object({
  heading: z.string().max(titleMax).default(''),
  body: z.string().max(bodyMax).default(''),
});

const AmenitiesProps = z.object({
  heading: z.string().max(titleMax).default(''),
  items: z.array(z.string().max(itemTextMax)).max(itemCountMax).default([]),
});

const NeighborhoodProps = z.object({
  heading: z.string().max(titleMax).default(''),
  body: z.string().max(bodyMax).default(''),
  showMap: z.boolean().default(false),
});

// Allowlist matches assertVideoUrlSafe — keep both in sync.
const VideoProps = z.object({
  heading: z.string().max(titleMax).default(''),
  url: z.string().max(urlMax).default(''),
});

const VirtualTourProps = z.object({
  heading: z.string().max(titleMax).default(''),
  url: z.string().max(urlMax).default(''),
  ctaLabel: z.string().max(ctaMax).default(''),
});

const FloorPlanProps = z.object({
  heading: z.string().max(titleMax).default(''),
  // PropertyImage.id of an uploaded floor-plan image. The editor lets
  // the agent upload through the existing `processPropertyImage` path
  // and then assigns the resulting id here.
  photoId: PhotoId.nullable().default(null),
});

const SpecsProps = z.object({
  heading: z.string().max(titleMax).default(''),
  showPrice: z.boolean().default(false),
  showRooms: z.boolean().default(true),
  showSqm: z.boolean().default(true),
  showFloor: z.boolean().default(false),
});

const AgentCardProps = z.object({
  // Today's hard-coded footer has no editable fields; future-proofing
  // by giving the block its own props bag.
});

const InquiryProps = z.object({
  heading: z.string().max(titleMax).default(''),
  subHeading: z.string().max(subtitleMax).default(''),
  ctaLabel: z.string().max(ctaMax).default(''),
});

// ── Section discriminated union ───────────────────────────────────

const SectionBase = z.object({
  id: SectionId,
  visible: Visibility,
});

const Section = z.discriminatedUnion('type', [
  SectionBase.extend({ type: z.literal('HERO'), props: HeroProps }),
  SectionBase.extend({ type: z.literal('GALLERY'), props: GalleryProps }),
  SectionBase.extend({ type: z.literal('DESCRIPTION'), props: DescriptionProps }),
  SectionBase.extend({ type: z.literal('AMENITIES'), props: AmenitiesProps }),
  SectionBase.extend({ type: z.literal('NEIGHBORHOOD'), props: NeighborhoodProps }),
  SectionBase.extend({ type: z.literal('VIDEO'), props: VideoProps }),
  SectionBase.extend({ type: z.literal('VIRTUAL_TOUR'), props: VirtualTourProps }),
  SectionBase.extend({ type: z.literal('FLOOR_PLAN'), props: FloorPlanProps }),
  SectionBase.extend({ type: z.literal('SPECS'), props: SpecsProps }),
  SectionBase.extend({ type: z.literal('AGENT_CARD'), props: AgentCardProps }),
  SectionBase.extend({ type: z.literal('INQUIRY'), props: InquiryProps }),
]);

export type SectionType =
  | 'HERO' | 'GALLERY' | 'DESCRIPTION' | 'AMENITIES' | 'NEIGHBORHOOD'
  | 'VIDEO' | 'VIRTUAL_TOUR' | 'FLOOR_PLAN' | 'SPECS' | 'AGENT_CARD'
  | 'INQUIRY';

export const REQUIRED_SECTIONS: ReadonlyArray<SectionType> = [
  'HERO', 'AGENT_CARD', 'INQUIRY',
];

export const Template = z.enum(['RESIDENTIAL', 'COMMERCIAL', 'LUXURY', 'INVESTMENT']);
export type TemplateKind = z.infer<typeof Template>;

export const LandingConfig = z.object({
  version: z.literal(LATEST_VERSION),
  template: Template.default('RESIDENTIAL'),
  sections: z.array(Section)
    .min(1)
    .max(20)
    // The renderer needs the three required blocks present somewhere
    // in the list, even if `visible:false`. The editor never lets the
    // agent delete them; this guard catches a hand-crafted payload
    // that tries to.
    .refine(
      (arr) => REQUIRED_SECTIONS.every((t) => arr.some((s) => s.type === t)),
      { message: 'landing config must include HERO, AGENT_CARD, and INQUIRY sections' },
    ),
});

export type LandingConfig = z.infer<typeof LandingConfig>;
export type LandingSection = z.infer<typeof Section>;

// ── Public API ────────────────────────────────────────────────────

export function parseLandingConfig(payload: unknown): LandingConfig {
  // Size guard before zod runs — pathological pastes would otherwise
  // spend CPU on validating something we know we'll reject.
  const serialized = JSON.stringify(payload ?? null);
  if (serialized.length > MAX_CONFIG_BYTES) {
    throw new Error(`landing config too large: ${serialized.length} bytes (max ${MAX_CONFIG_BYTES})`);
  }
  return LandingConfig.parse(payload);
}

/**
 * Synthesize the config that reproduces the pre-editor hard-coded
 * layout. Used at render time when `Property.landingPageConfig` is
 * null so existing rows render byte-identically, and at edit time as
 * the starting point when an agent opens the editor for the first
 * time on a property.
 */
export function defaultLandingConfig(opts: {
  assetClass: 'RESIDENTIAL' | 'COMMERCIAL';
}): LandingConfig {
  const template: TemplateKind = opts.assetClass === 'COMMERCIAL'
    ? 'COMMERCIAL'
    : 'RESIDENTIAL';
  return {
    version: LATEST_VERSION,
    template,
    sections: [
      mkSection('HERO',       { eyebrow: '', title: '', subtitle: '', photoId: null, variant: 'IMAGE' }),
      mkSection('GALLERY',    { heading: '' }),
      mkSection('INQUIRY',    { heading: '', subHeading: '', ctaLabel: '' }),
      mkSection('AGENT_CARD', {}),
    ],
  };
}

// Server-side video URL allowlist. Editor PATCH passes every VIDEO
// section's `url` through this before storing.
const ALLOWED_VIDEO_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'vimeo.com',
  'www.vimeo.com',
  'player.vimeo.com',
]);

export function assertVideoUrlSafe(raw: string): void {
  if (!raw) return; // empty URL = no video, allowed (renderer skips the block)
  let u: URL;
  try { u = new URL(raw); }
  catch { throw new Error('video url invalid'); }
  if (u.protocol !== 'https:') throw new Error('video url must be https');
  if (!ALLOWED_VIDEO_HOSTS.has(u.hostname.toLowerCase())) {
    throw new Error(`video host not allowed: ${u.hostname}`);
  }
}

export function assertTourUrlSafe(raw: string): void {
  if (!raw) return;
  let u: URL;
  try { u = new URL(raw); }
  catch { throw new Error('tour url invalid'); }
  if (u.protocol !== 'https:') throw new Error('tour url must be https');
  // Virtual tour vendors are many (Matterport, Kuula, EyeSpy360, etc.)
  // and the URL is rendered as a plain <a href> CTA — not an iframe —
  // so we only enforce https and length. SSRF surface is zero (we
  // don't fetch the URL server-side).
}

// Helper used by defaultLandingConfig() — keeps it readable.
function mkSection<T extends SectionType>(type: T, props: any): LandingSection {
  return {
    id: cryptoUuid(),
    visible: true,
    type,
    props,
  } as LandingSection;
}

function cryptoUuid(): string {
  // Node 19+ has globalThis.crypto.randomUUID; the dev / prod images
  // are Node 24 so this is always present. Defensive fall-back just
  // in case the module is imported under a runtime without it.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:crypto').randomUUID();
}
