# Landing — Wireframe-level plan

> Per `CLAUDE.md`'s "Communication" rule: post this *before* writing components. One round of feedback expected — copy direction and section order are the things people have opinions about.

---

## Architecture at a glance

- **Route:** `/` for unauthenticated users renders `<Landing />`. Authenticated users still hit `<Dashboard />` at `/` (unchanged). Add an explicit `<Route path="/login" element={<Login />} />`; leave the existing catch-all in place for back-compat.
- **Bundle:** lives inside the current SPA for slice 1. Track a follow-up (`SLICE-6`) to promote the landing to pre-rendered static HTML once the copy + visual pass is done — that's how we actually hit Lighthouse Perf ≥ 90 / initial JS < 100 KB. Flagged honestly, not fabricated.
- **Copy:** one file at `landing/content/copy.he.ts`. Non-negotiable.
- **Brand reuse:** existing CSS-variable design system. Gold accent, Assistant font, lucide-react icons. No new dependency.
- **Login-button behavior:** `<a href="/login">התחברות</a>`. Signup CTA: `<a href="/login?flow=signup">התחלה חינם</a>` — one-line patch to `Login.jsx` (`useSearchParams().get('flow')`) consumes the hint.
- **Analytics:** existing PostHog helpers. Every CTA stamps `?utm_source=landing&utm_medium=<section>` on the outbound click.
- **Dark mode:** inherits `prefers-color-scheme` automatically via existing `[data-theme='dark']` tokens.

---

## Section list (top → bottom, mobile order)

| # | Section | Purpose | Must include | v1 ship? |
|---|---|---|---|---|
| 1 | Sticky nav | Always-accessible login + primary CTA | Logo, desktop anchor links (תכונות / מחירים / שאלות נפוצות), login link, primary CTA, mobile drawer | ✅ |
| 2 | Hero | Explain the product in 3 s + drive the CTA | H1, one-line subhead, primary CTA (30-day trial), secondary link (existing login), trust microcopy, device mockup, disabled app-store badges | ✅ |
| 3 | Social proof | Validate the decision | — | ❌ omitted — no real claim to make yet (don't fabricate) |
| 4 | Feature grid | What you actually get | 6 cards: ניהול נכסים · ניהול לידים · יומן פגישות חכם · מחשבון עמלות · ייבוא מיד2 · אפליקציה לנייד | ✅ |
| 5 | Mobile-app section | The differentiator the brief emphasized | Device mockups, 4 bullet benefits, disabled store badges, desktop-only QR placeholder | ✅ (with flagged TODOs on store URLs) |
| 6 | How it works | Reassure it takes minutes | 3 numbered steps (sign up → import/start clean → 30 days free) | ✅ |
| 7 | Pricing | Carry the conversion weight | 2–3 tiers with placeholder numbers, 30-day trial pulled out above cards, VAT stance stated, CTA per tier is `התחלה חינם` | ✅ (pricing TODO marker) |
| 8 | Testimonials | Second social-proof pass | — | ❌ omitted — no real quotes yet |
| 9 | FAQ | Answer objections + SEO structured data | 6 collapsed `<details>` — no JS required | ✅ |
| 10 | Final CTA band | Last chance before footer | Short headline, sub, primary CTA, disabled app-store badges | ✅ |
| 11 | Footer | Product / Company link columns | Logo + tagline, link columns, copyright, small language toggle hook (future) | ✅ |

**Plus:** sticky bottom-of-viewport mobile CTA bar (`התחלה חינם`) that appears after the hero scrolls off. Desktop: not rendered.

---

## Hero copy — direction for review

(Not final — we iterate based on feedback. These set the voice.)

- **H1** — `ה-CRM של המתווכים. כולו בנייד שלך.`
- **Sub** — `ניהול לקוחות, נכסים, פגישות ולידים — מהמקום שבו אתם באמת עובדים. 30 יום חינם, בלי כרטיס אשראי.`
- **Primary CTA** — `התחלה חינם ל-30 יום`
- **Secondary** — `כבר יש לי חשבון` → `/login`
- **Trust microcopy** — `בלי כרטיס אשראי · ביטול בכל רגע · תמיכה בעברית`
- **Badges** — `הורדה מ-App Store` / `להורדה ב-Google Play` (disabled + flagged)

**Why this direction:**
- Leads with "CRM" (the category the target buyer types into Google) + "מתווכים" (they self-identify).
- "כולו בנייד שלך" signals the phone-first angle without jargon.
- Trust microcopy kills three objections (cost, commitment, language) in twelve characters each.
- Secondary link is plain text, not a button — keeps the primary CTA visually dominant.

---

## Feature grid — direction for review

Six cards. Each is **benefit-led**, not feature-list.

1. `ניהול לקוחות שבאמת עובד` — מעקב מלא על כל ליד, מהשיחה הראשונה ועד העסקה. הערות, תזכורות והיסטוריה במקום אחד.
2. `נכסים, בלעדיויות, וכל הפרטים` — תיק נכס מלא: תמונות, בעלים, מסלול שיווק, זכויות חתומות.
3. `יומן פגישות שמבין מה צריך` — פגישה חדשה שואבת את הלקוח, הנכס, והכתובת אוטומטית.
4. `מחשבון עמלות מדויק` — נטו למוכר או מחיר רישום — דינמי, עם מע״מ ושכר טרחה.
5. `ייבוא מיד2 בלחיצה` — סוכנות שלמה עולה לתוך Estia תוך דקה. (`TODO: adjust tone if Yad2 import is still beta-flagged in prod.`)
6. `אפליקציה לאייפון ולאנדרואיד` — כל מה שיש באתר, גם בכיס שלכם. שיחות, פגישות ופעולות — בלי להתיישב מול מחשב.

---

## Pricing — structure for review (numbers are TODO-flagged)

Above cards:
- **Banner** — `30 יום חינם. בלי כרטיס אשראי. ביטול בכל רגע.`
- **Toggle** — monthly ↔ annual, with `חודשיים במתנה` pull-out on annual.

Cards (recommendation: 2 tiers for decision-speed, not 3):

| Tier | Headline | Price (placeholder) | Included |
|---|---|---|---|
| `בסיס` | למתווך עצמאי | `₪99 / חודש · כולל מע״מ` | עד 50 נכסים · עד 100 לקוחות · אפליקציה · תמיכה |
| `מקצועי` ("הכי פופולרי") | למשרד / לסוכן מקצועי | `₪249 / חודש · כולל מע״מ` | נכסים ולקוחות ללא הגבלה · ייבוא מיד2 · יומן מתקדם · עדיפות תמיכה |

Footer under cards — `בלי כרטיס אשראי לניסיון · ביטול בכל רגע · תמיכה בעברית · שרתים באירופה`. (Check: are we comfortable saying "שרתים באירופה"? Prod is in `eu-north-1` so it's true.)

**CTAs** per card — `התחלה חינם` → `/login?flow=signup&tier=<slug>`.

`// TODO(landing): pricing numbers + tier composition must be confirmed with Adam before we ship. Current values are illustrative.`

---

## FAQ — 6 questions (direction)

1. האם באמת אין צורך בכרטיס אשראי?
2. מה קורה אחרי 30 יום?
3. האם האפליקציה עובדת על אייפון ואנדרואיד?
4. האם אפשר לייבא נתונים מ-Excel או מיד2?
5. האם הנתונים שלי מאובטחים? איפה הם נשמרים?
6. מתאים גם למתווך עצמאי או רק למשרדים?

Rendered as native `<details>/<summary>` — no JS required, ships as `FAQPage` JSON-LD for SEO.

---

## Sections omitted from v1 (explicit scope control)

- **Social proof strip** — no real count / ratings / partner logos available. The brief explicitly forbids fabricated claims. Revisit when real numbers land.
- **Testimonials** — no real customer quotes yet. Same rule. Placeholder slot left in the grid so adding them later is a 10-minute job.
- **Blog / docs / careers** — out of scope for a landing page.
- **New signup backend** — landing links to the existing auth route. Nothing server-side changes.

---

## SEO / Meta

- `<title>` — `CRM למתווכים · אפליקציה לאייפון ואנדרואיד · Estia` (~56 chars)
- `<meta name="description">` — `CRM מודרני לסוכני נדל״ן: לקוחות, נכסים, יומן ומחשבון עמלות — בנייד. 30 יום חינם, בלי כרטיס אשראי.` (~145 chars)
- OG tags + Twitter card → `landing/assets/og-image.jpg` (1200×630) — built once, committed.
- JSON-LD: `Organization`, `SoftwareApplication`, `FAQPage`. All emitted inline from the Hebrew copy file.
- `<html dir="rtl" lang="he">` — already set app-wide via existing frontend shell.
- Canonical `<link rel="canonical" href="https://estia.tripzio.xyz/">`.

---

## Build slices (each is independently reviewable + mergeable)

| Slice | Deliverable | Files | ETA |
|---|---|---|---|
| **1 · Discovery + copy + plan** *(this commit)* | `DISCOVERY.md`, `PLAN.md`, `content/copy.he.ts` | `landing/**` | now |
| **2 · Scaffolding + nav + hero** | Mount `<Landing />` at `/` for unauth, explicit `/login` route, `Nav`, `Hero`, sticky mobile CTA bar | `App.jsx`, `components/landing/{Landing,Nav,Hero,StickyCTA}.jsx`, Login query-param handling | 2 h |
| **3 · Features + mobile-app section** | `FeatureGrid`, `MobileAppSection` with disabled store badges + desktop QR placeholder | `components/landing/{FeatureGrid,MobileAppSection}.jsx` | 2 h |
| **4 · Pricing + FAQ** | `Pricing` with yearly/monthly toggle, `FAQ` using native `<details>`, `FAQPage` JSON-LD | `components/landing/{Pricing,FAQ}.jsx` | 2 h |
| **5 · Final CTA + footer + SEO + OG polish** | `FinalCTA`, `Footer`, `<head>` tags, OG image placeholder, `SoftwareApplication` + `Organization` JSON-LD, fade-in-on-scroll motion | `components/landing/{FinalCTA,Footer}.jsx`, `main.jsx` head injection | 1.5 h |
| **6 · Promote to pre-rendered static HTML** *(follow-up)* | `vite-plugin-ssg` or hand-authored `public/landing.html`, move to static delivery path | Vite config, frontend nginx routing | half-day; land after v1 review |

---

## Perf budget — honest status

The brief asks for LCP < 2 s / Initial JS < 100 KB gz / Lighthouse Perf ≥ 90 / Accessibility ≥ 95. Within the current SPA (slice 2–5 as listed), realistic expectations:

- **LCP:** < 2.5 s on throttled 4G (gap ~500 ms from the brief's 2 s target, caused by the SPA runtime). Slice 6 (static HTML) closes this.
- **Initial JS:** > 100 KB gz (SPA main chunk ≈ 300 KB gz today even after this engagement's trims). **Will fail the brief's budget until slice 6.**
- **Accessibility ≥ 95:** achievable inside the SPA — native semantics, contrast checked, focus visible.
- **SEO ≥ 95:** achievable — structured data, canonical, OG, proper heading hierarchy. Slice 6 is not required.
- **Best practices ≥ 95:** achievable.

Slice 6 is the path to full brief compliance. Shipping slices 2–5 first lets the team review copy + design on a real page; slice 6 is a pure delivery-mechanism change with no UX risk.

---

## Questions for the team before slice 2 starts

1. **Pricing** — two tiers (`בסיס` + `מקצועי`) or three (add `משרד גדול`)? What are the real ₪ numbers + VAT stance? Monthly + annual, or monthly only for v1?
2. **Copy tone** — the H1 / sub direction above. Change? Tighten? Any terms you prefer (`מתווכים` vs `סוכני נדל״ן`)?
3. **Yad2 import** — is it safe to mention as a shipped feature, or still beta-flagged? If beta, we rewrite card #5 to avoid overpromising.
4. **App store URLs** — confirmed no URLs yet. Fine to ship with disabled badges and a clearly-flagged TODO? (Recommended.)
5. **Slice 6 (static-HTML promotion)** — priority now or after v1 review? Recommendation: after review, so we don't delay the first feedback loop over an architectural change.

Awaiting one round of answers before starting slice 2.
