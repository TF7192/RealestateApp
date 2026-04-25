# Mobile Polish Tasks — Full Per-Page Breakdown

This is the complete task list after the per-page sweep across all 44
routes plus the shared component layer. Every finding from the six
auditing agents is recorded below — nothing is held back. Each item
carries severity (P0/P1/P2) and confidence (High = verified against
source, Medium = likely true but needs device verification,
Needs-device = visual/behavioral, not statically verifiable).

Cross-references:
- Permission and `target="_blank"` items overlap with security audit
  `SEC-009` — both lists are kept in sync.
- Mass tap-target sweep is consolidated under `TT-1` at the bottom
  with every site listed.

---

## §0 — Native iOS / Capacitor (global)

| ID | Severity | Status | Task | Confidence | Files |
|---|---|---|---|---|---|
| **IOS-1** | P0 | done | Add `NSMicrophoneUsageDescription` to Info.plist | High | `frontend/ios/App/App/Info.plist` |
| **IOS-2** | P0 | done | `armv7` → `arm64`; remove Landscape from `UISupportedInterfaceOrientations` | High | `frontend/ios/App/App/Info.plist` |
| **IOS-3** | P0 | open | Add `PrivacyInfo.xcprivacy` declaring User Defaults (CA92.1) for PostHog + Capacitor Preferences, file-timestamp (C617.1) for Capacitor Filesystem, `NSPrivacyTracking: false` | High | create `frontend/ios/App/App/PrivacyInfo.xcprivacy` |
| **IOS-4** | P0 | open | Document Capacitor native plugin surface in App Review notes (Camera, Geolocation, Haptics, Filesystem, Preferences, StatusBar, Keyboard, SplashScreen, Apple Sign-In, Browser, Share) — pre-empts Guideline 4.7 | High | App Store Connect Resolution Center |
| **IOS-5** | P1 | open | Remove `NSLocationAlwaysAndWhenInUseUsageDescription` — app only requests `WhenInUse`. Reduces App Review questions | High | `frontend/ios/App/App/Info.plist` |
| **IOS-6** | P1 | open | Verify `SignInWithApplePlugin.swift` compiles on Capacitor 8.3 (custom native code, no auto-update) | Medium | `frontend/ios/App/App/SignInWithApplePlugin.swift` |
| **IOS-7** | P2 | open | Set `WKAppBoundDomains` in Info.plist + flip `limitsNavigationsToAppBoundDomains: true` (test Google OAuth carefully) | Medium | `frontend/ios/App/App/Info.plist`, `frontend/capacitor.config.json` |
| **IOS-8** | P2 | open | Tighten `capacitor.config.json:server.allowNavigation` — narrow `*.googleusercontent.com` if endpoint is known | Medium | `frontend/capacitor.config.json` |
| **IOS-9** | P2 | open | Verify all required AppIcon slots present per Xcode 15 contract | Needs-device | `frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset` |
| **IOS-10** | P2 | open | Verify SplashScreen `launchShowDuration: 800` reads right on hardware | Needs-device | `frontend/capacitor.config.json` |

---

## §1 — Global CSS / Cross-Cutting

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **GLOB-1** | P1 | Define one `--safe-bottom: max(12px, env(safe-area-inset-bottom))` token; consolidate every per-page `calc(... + env(safe-area-inset-bottom))` to use it (consistency) | Medium | `frontend/src/index.css` |
| **GLOB-2** | P1 | Audit `inset-inline-start/end` vs physical `left/right`. The agent flagged `Layout.jsx:1015` (NotificationsPopover) but the comment marks it intentional. Check the rest of the codebase for unintentional physical positioning in RTL contexts | Medium | grep `left:\|right:` in `frontend/src/` |
| **GLOB-3** | P1 | Adopt `eslint-plugin-jsx-a11y/recommended` in `frontend/eslint.config.js` and fix surfaced issues | High | `frontend/eslint.config.js` |
| **GLOB-4** | P1 | Adopt `react/jsx-no-target-blank` ESLint rule | High | `frontend/eslint.config.js` |
| **GLOB-5** | P2 | Replace `100vh` with `100dvh` everywhere. Found at `PropertyLandingPage.css:23` at minimum; sweep the rest | High | grep `100vh` in `frontend/src/` |
| **GLOB-6** | P2 | Define `--vh-usable` referenced by `AddressField.css:163-165` via JS using `visualViewport.height` so dropdowns clamp above the keyboard | Medium | new util + `frontend/src/components/AddressField.css` |
| **GLOB-7** | P2 | Add visible touch feedback (`:active { transform: scale }` or opacity) on all custom buttons that disable `-webkit-tap-highlight-color` | Medium | scattered |
| **GLOB-8** | P2 | Verify focus-visible ring contrast on WKWebView; the `--gold` outline can read low-contrast on cream backgrounds | Needs-device | `frontend/src/index.css:932-937` |

---

## §2 — Layout Shell + Mobile Tab Bar + FAB

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **SHELL-1** | P0 | Topbar bell + chat icon-only buttons are `width: 38, height: 38` (under 44 HIG) | High | `frontend/src/components/Layout.jsx:911` |
| **SHELL-2** | P1 | MobileTabBar tab item is `flex: 1` over 5 tabs (≈75px each on 375px) — adequate width, vertical comfort needs device verification with icon+label stacking | Needs-device | `frontend/src/components/MobileTabBar.jsx:76-86` |
| **SHELL-3** | P1 | Verify on Pro Max + iPhone SE that the tab-bar `padding-bottom: 4px + env(safe-area-inset-bottom)` doesn't clip content behind it on scroll | Needs-device | `frontend/src/components/MobileTabBar.jsx:65` |
| **SHELL-4** | P1 | QuickCreateFab anchored at `inset-block-end: calc(72px + env(safe-area-inset-bottom))` — z-index 900 vs MobileTabBar 40. Confirm no overlay flicker on rapid taps | Needs-device | `frontend/src/components/QuickCreateFab.css:14-25` |
| **SHELL-5** | P1 | QuickCreateFab popup menu anchored `inset-block-end: calc(72px + 64px)`. On phones with very large `safe-area-inset-bottom` or short viewports the menu can clip the topbar — guard with viewport-height-aware fallback | Medium | `frontend/src/components/QuickCreateFab.css:80` |
| **SHELL-6** | P1 | Layout `paddingBottom: narrow ? 72 : 0` is on the flex container, not on the inner `<main>` — verify nested-scroll lists don't scroll content behind the tab bar | Needs-device | `frontend/src/components/Layout.jsx:284` |
| **SHELL-7** | P2 | RouteProgressBar `position: fixed; top: 0; z-index: 999` may visually conflict with topbar `z-index: 20` on Capacitor WKWebView | Needs-device | `frontend/src/components/RouteProgressBar.jsx:83-88` |
| **SHELL-8** | P2 | OfflineBanner `top: calc(52px + env(safe-area-inset-top))` — verify no clip under Dynamic Island on Pro models | Needs-device | `frontend/src/components/OfflineBanner.css:3` |

---

## §3 — Public / Unauth Pages (do NOT render inside `<Layout>`)

These pages own their own safe-area handling because they have no
mobile-header shell to inherit from.

### `/login`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **LOGIN-1** | P1 | Password reveal Eye/EyeOff buttons have `padding: 4` (~32×32) — increase to `padding: 8` for ~40px | Medium | `frontend/src/pages/Login.jsx:245, 333` |
| **LOGIN-2** | P1 | Mobile form `padding: '22px 22px 22px'` — add `padding-bottom: calc(22px + env(safe-area-inset-bottom))` so the keyboard doesn't crowd the submit | Medium | `frontend/src/pages/Login.jsx:306` |
| **LOGIN-3** | P1 | "Remember me" checkbox label has no enlarged tap area; the click target is the checkbox itself (~16px) | Medium | `frontend/src/pages/Login.jsx:340` |
| **LOGIN-4** | P2 | MField focus state uses `border: 1.5px` — use `2px` for clearer ring on iOS | Low | `frontend/src/pages/Login.jsx:413-416` |

### `/forgot-password`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **FORGOT-1** | P1 | Page renders OUTSIDE `<Layout>` — add `padding-top: calc(24px + env(safe-area-inset-top))` to outer hero container so it clears the Dynamic Island | High | `frontend/src/pages/ForgotPassword.jsx:54` |
| **FORGOT-2** | P2 | Error message has no `margin-top` between input and message | Low | `frontend/src/pages/ForgotPassword.jsx:103-106` |

### `/reset-password`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **RESET-1** | P1 | Same safe-area-top issue as `/forgot-password` | High | `frontend/src/pages/ResetPassword.jsx:59` |
| **RESET-2** | P1 | PasswordField eye toggle has `padding: 4` — increase to `padding: 8` | Medium | `frontend/src/pages/ResetPassword.jsx:164-172` |
| **RESET-3** | P2 | Two `PasswordField`s share the same `show/onToggleShow` binding — toggling one visually toggles both | Low | `frontend/src/pages/ResetPassword.jsx:84-94` |

### `/contact`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **CONTACT-1** | P1 | Same safe-area-top issue | High | `frontend/src/pages/Contact.jsx` outer container |
| **CONTACT-2** | P1 | `<textarea rows={7} minHeight: 140>` plus form padding can push submit below the iOS keyboard. Reduce `min-height: 100px` and rely on textarea scroll | Medium | `frontend/src/pages/Contact.jsx:166` |
| **CONTACT-3** | P2 | Back-link inline SVG `display: 'inline'` should be `inline-flex` for vertical alignment | Low | `frontend/src/pages/Contact.jsx:222` |
| **CONTACT-4** | P2 | Error alert box has no margin separating it from the next element | Low | `frontend/src/pages/Contact.jsx:182-185` |

### `/terms`, `/privacy`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **LEGAL-1** | P1 | LegalPage.css mobile breakpoint at 768px only; no explicit safe-area handling on the legal page nav. Confirm OK on Dynamic Island | Medium | `frontend/src/pages/landing/LegalPage.css:49-52` |
| **LEGAL-2** | P2 | Long legal docs would benefit from `position: sticky; top: 0` on the back-to-top link | Low | `frontend/src/pages/landing/LegalPage.css` |
| **LEGAL-3** | P2 | h1 `font-size: 32px` can crowd the nav at 375px — wrap in `clamp(24px, 5vw, 32px)` | Low | LegalPage h1 |

### `/agents/:slug` (AgentPortal)

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **AGENTP-1** | P1 | `.ap-hero` mobile media query missing safe-area-top; add `padding-top: calc(48px + env(safe-area-inset-top))` | Medium | `frontend/src/pages/AgentPortal.css:476-486` |
| **AGENTP-2** | P1 | Search input has `inputMode="search"` but missing `enterKeyHint="search"` | High | `frontend/src/pages/AgentPortal.jsx:209-211` |
| **AGENTP-3** | P1 | Contact-chip buttons (`padding: 10px 16px`, ~40px) have no `:focus-visible` rule — add gold outline | Medium | `frontend/src/pages/AgentPortal.jsx:153-172` |
| **AGENTP-4** | P2 | `.ap-tabs` overflow scroll lacks scrollbar-hide rules — add `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` | Low | `frontend/src/pages/AgentPortal.css:484` |
| **AGENTP-5** | P2 | Add `-webkit-appearance: none` on `.ap-search input` to suppress iOS default chrome | Low | `frontend/src/pages/AgentPortal.jsx:209` |

### `/agents/:slug/:propSlug`, `/p/:id` (CustomerPropertyView)

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **CPV-1** | P0 | `.cpv-nav` arrows are `top: 50%; translateY(-50%)` — on short hero heights (small iPhones) the arrows can overlap content | Needs-device | `frontend/src/pages/CustomerPropertyView.css:252-270` |
| **CPV-2** | P1 | Sticky header `padding-top: env(safe-area-inset-top)` lacks fallback for older browsers; add `padding-block-start` | Medium | `frontend/src/pages/CustomerPropertyView.css:83` |
| **CPV-3** | P1 | Mobile bottom action bar — verify `padding-bottom: env(safe-area-inset-bottom)` is on the BAR (page already has it on `.cpv-page`) | Needs-device | `frontend/src/pages/CustomerPropertyView.css:705` |
| **CPV-4** | P1 | `.cpv-counter` is `top: 16px` — can clip Dynamic Island. Use `top: calc(16px + env(safe-area-inset-top))` | High | `frontend/src/pages/CustomerPropertyView.css:272-285` |
| **CPV-5** | P2 | Headline cells `minmax(min(80px, 100%), 1fr)` on 375px can wrap awkwardly with longer Hebrew labels | Needs-device | `frontend/src/pages/CustomerPropertyView.css:340-370` |
| **CPV-6** | P2 | Oddly specific `@media (max-width: 375px)` rule — confirm intentional or consolidate into 640px | Low | `frontend/src/pages/CustomerPropertyView.css:783` |

### `/l/:slug/:propSlug` (PropertyLandingPage)

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **PLP-1** | P0 | Hero arrows `inset-inline-start: 48px` — at 375px width, `48px` margin pushes arrows off-screen. Use `max(12px, env(safe-area-inset-left))` | High | `frontend/src/pages/PropertyLandingPage.css:125-126, 145` |
| **PLP-2** | P1 | Form card `padding: 40px 44px` is tight at 375px (251px content area). Reduce to `padding: 28px 22px` on mobile | Medium | `frontend/src/pages/PropertyLandingPage.css:187-194` |
| **PLP-3** | P1 | Form title `font-size: 28px` crowds the form on 375px. Wrap in `clamp(20px, 5vw, 28px)` | Medium | `frontend/src/pages/PropertyLandingPage.css:196-201` |
| **PLP-4** | P2 | Eyebrow badge `padding: 6px 14px` is small for a touch surface | Low | `frontend/src/pages/PropertyLandingPage.css:75-87` |
| **PLP-5** | P2 | `min-height: 100vh` should be `100dvh` | High | `frontend/src/pages/PropertyLandingPage.css:23` |
| **PLP-6** | P2 | Verify scroll-snap (`scroll-snap-type: x mandatory`) gallery feels right on iOS Safari | Needs-device | `frontend/src/pages/PropertyLandingPage.css:156` |

### `/public/p/:token` (ProspectSign)

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **PROS-1** | P0 | Signature canvas — verify `touch-action: none` is set so iOS pinch-zoom doesn't fight finger-draw. Crucial for the actual signing UX | Needs-device | `frontend/src/pages/ProspectSign.jsx:9`, `.css:9-21` |
| **PROS-2** | P1 | CTA button `:focus-visible` uses `filter: brightness(1.05)` — not enough for keyboard focus. Add `outline: 2px solid var(--gold); outline-offset: 2px` | Medium | `frontend/src/pages/ProspectSign.css:177-196` |
| **PROS-3** | P2 | Forces light-only theme regardless of `prefers-color-scheme` | Low | `frontend/src/pages/ProspectSign.css` |
| **PROS-4** | P2 | Capacitor portrait-lock — confirm signature persistence isn't disrupted by any orientation events | Needs-device | `frontend/src/pages/ProspectSign.jsx` |

---

## §4 — Authenticated app shell (under `<Layout>`)

### `/dashboard`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **DASH-1** | P1 | `.filter-dot` uses `margin-right: 4px` — replace with `margin-inline-end: 4px` for RTL safety | High | `frontend/src/pages/Dashboard.css:152` |
| **DASH-2** | P1 | KPI carousel `scroll-snap-type: x mandatory` — add `scroll-padding: 8px` so cards don't clip at the viewport edge | Medium | `frontend/src/pages/Dashboard.css:268-272` |
| **DASH-3** | P1 | KPI card mobile font-size `12px` reads small; bump to `13px` (still under the 16px input rule's scope) | Low | `frontend/src/pages/Dashboard.css:283` |
| **DASH-4** | P2 | Greeting card h1 ("בוקר טוב Adam") — add `word-break: break-word` to prevent overflow on iPhone SE | Low | `frontend/src/pages/Dashboard.jsx:227` |

### `/properties`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **PROP-1** | P1 | `.property-wa-btn` has no `min-height` → ~28px. Bump to ≥44px | Medium | `frontend/src/pages/Properties.css:427` |
| **PROP-2** | P1 | `.pc-rail-btn` `font-size: 9.5px` is too small for label readability — bump to `11px` | Medium | `frontend/src/pages/Properties.css:98-99, 784` |
| **PROP-3** | P1 | `.property-overflow-btn`, `.property-quick-actions`, `.property-share-btn` cluster at top-left as 32–34px circles. Risk of mis-tap; consider one ⋯ menu | Medium | `frontend/src/pages/Properties.css:602-606` |
| **PROP-4** | P2 | Compact-card price `font-size: 15px` reads small. Bump to `16px` or scale on narrow widths | Low | `frontend/src/pages/Properties.css:706` |
| **PROP-5** | P2 | City autocomplete datalist could overflow at 640px breakpoint — add `max-width: 100%` | Low | `frontend/src/pages/Properties.css:1051` |

### `/properties/new`, `/properties/:id/edit` (NewProperty)

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **NEWP-1** | P0 | Email input uses bare `type="email"`; spread `inputPropsForEmail()` for consistency with the rest of the form | High | `frontend/src/pages/NewProperty.jsx:1313` |
| **NEWP-2** | P0 | Date inputs `<input type="date" className="form-input">` lack explicit `min-height: 44px`; iOS native picker sometimes renders the trigger ≤40px | Medium | `frontend/src/pages/NewProperty.jsx:1832, 1840` |
| **NEWP-3** | P0 | Date inputs missing `<label htmlFor>` — adds for screen readers and form-progression on iOS | High | `frontend/src/pages/NewProperty.jsx:1831, 1840` |
| **NEWP-4** | P1 | Restore/discard draft buttons use `.btn-secondary.btn-sm` (≈32px). Bump to 44px on touch widths | High | `frontend/src/pages/NewProperty.jsx:1055-1056` |
| **NEWP-5** | P1 | Audit ALL `<input type="text">` for missing `enterKeyHint` — only ~5 out of ~15 inputs set it. Sweep + add | Medium | `frontend/src/pages/NewProperty.jsx` |
| **NEWP-6** | P1 | Image upload file input has no visible `<label>` — add one for the touch target | Medium | `frontend/src/pages/NewProperty.jsx:1892` |
| **NEWP-7** | P2 | Wizard step labels can be long ("בחירה של מספר חדרים…") — make `.np-steps` overflow-x scrollable with snap | Low | `frontend/src/pages/NewProperty.css:6-27` |

### `/properties/:id` (PropertyDetail)

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **PD-1** | P1 | Top toolbar buttons `primaryBtn / secondaryBtn` styled inline can wrap at 375px; current `flex-wrap: wrap` is OK but verify visual balance | Needs-device | `frontend/src/pages/PropertyDetail.jsx:107-143`, `.css:51-54` |
| **PD-2** | P2 | PropertyHero `aspect-ratio: 16/4` desktop default; verify mobile fallback exists | Needs-device | `frontend/src/components/PropertyHero.css` |

### `/owners`, `/owners/:id`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **OWN-1** | P1 | Search input lacks `aria-label="חפש בעלי נכסים"` | Medium | `frontend/src/pages/Owners.jsx` |
| **OWN-2** | P2 | Optionally auto-focus search on mount for faster mobile discovery | Low | `frontend/src/pages/Owners.jsx` |

### `/customers`, `/customers/new`, `/customers/:id`, `/customers/:id/history`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **CUST-1** | P1 | `target="_blank"` without `rel="noopener noreferrer"` — overlap with `SEC-009` | High | `frontend/src/pages/Customers.jsx:405` |
| **CUST-2** | P1 | `margin-right: 6px` should be `margin-inline-end` (RTL bug) | High | `frontend/src/pages/Customers.css:286` |
| **CUST-3** | P1 | LeadFiltersSheet — verify it's a full-width bottom sheet on mobile with `useFocusTrap` and safe-area-bottom; verify no clip when keyboard opens | Needs-device | `frontend/src/components/LeadFiltersSheet.jsx` |
| **CUST-4** | P2 | Customers Actions cell (phone + WhatsApp icons) — could be 56px-tall pills for parity with Properties compact card | Low | `frontend/src/pages/Customers.jsx` |

### `/profile`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **PROF-1** | P0 | Avatar upload `<input accept="image/*">` — verify iOS WKWebView opens Photos picker. Document fallback if not | Needs-device | `frontend/src/pages/Profile.jsx:199` |
| **PROF-2** | P0 | Agency URL paste field missing `inputMode="url"` — spread `inputPropsForUrl()` | High | `frontend/src/pages/Profile.jsx:344-353` |
| **PROF-3** | P1 | Camera/photo picker icon button (~32px icon) — wrap in 44×44 touch surface | Medium | `frontend/src/pages/Profile.jsx:177-195` |
| **PROF-4** | P1 | Calendar Connect button — add OAuth bounce logging for WKWebView debug | Medium | `frontend/src/pages/Profile.jsx:659-662` |
| **PROF-5** | P1 | Delete-account dialog backdrop missing safe-area on notched iPhones | Medium | `frontend/src/pages/Profile.jsx:532-537` |
| **PROF-6** | P2 | Long Hebrew names in agency field can overflow at 375px | Needs-device | `frontend/src/pages/Profile.jsx` |
| **PROF-7** | P2 | Textarea auto-grow lacks max-width constraint | Low | `frontend/src/pages/Profile.jsx` |

### `/agent-card`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **AC-1** | P0 | Three external links missing `rel="noopener noreferrer"` (overlap with `SEC-009`) | High | `frontend/src/pages/AgentCard.jsx:276-278, 338-340, 365-367` |
| **AC-2** | P1 | Share button → `shareSheet()` — verify Capacitor Share API on device and add fallback (copy-to-clipboard) | Needs-device | `frontend/src/pages/AgentCard.jsx:147-158` |
| **AC-3** | P1 | VCardQr 180px hardcoded — wrap in `min(180px, 60vw)` | Medium | `frontend/src/pages/AgentCard.jsx:307` |
| **AC-4** | P1 | vCard download — `URL.createObjectURL()` may be blocked in WKWebView. Test data-URL fallback at line 122-144 | Needs-device | `frontend/src/pages/AgentCard.jsx:122-144` |
| **AC-5** | P2 | Stats chips wrap to 2×2 on mobile — verify readability | Needs-device | `frontend/src/pages/AgentCard.jsx` |

### `/transfers`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **TRAN-1** | P0 | Transfer card grid breakpoint at 720px is too high. Add explicit `@media (max-width: 600px) { grid-template-columns: 1fr }` | Medium | `frontend/src/pages/Transfers.jsx:271`, `.css:263-266` |
| **TRAN-2** | P0 | Status badge uses `bg: rgba(180,83,9,0.12)` + `fg: #b45309` — low contrast. Darken fg or darken bg | Medium | `frontend/src/pages/Transfers.jsx:42`, `statusAccent` |
| **TRAN-3** | P1 | Action buttons `padding: '7px 12px'` (`primaryBtn() / ghostBtn()`) under 44px. Add `minHeight: '44px'` | High | `frontend/src/pages/Transfers.jsx:414-425, 473-494` |
| **TRAN-4** | P1 | Message paragraph missing `dir="auto"` — RTL/mixed content can wrap wrong | Medium | `frontend/src/pages/Transfers.jsx:389-395` |
| **TRAN-5** | P2 | Transferred property image fixed at 56px; OK on single-column mobile but verify multi-line cards | Low | `frontend/src/pages/Transfers.jsx:290-293` |

### `/templates`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **TPL-1** | P0 | ChipEditor body — verify it wraps `<textarea>` or `[contenteditable]` with `dir="auto"` so Hebrew paste renders RTL | Needs-device | `frontend/src/components/ChipEditor.jsx` |
| **TPL-2** | P0 | Phone-mockup preview `max-width: 300px` — verify on iPhone 12 mini (375px) it doesn't force horizontal scroll | Needs-device | `frontend/src/pages/Templates.css:689` |
| **TPL-3** | P1 | Verify `.tpl-kind` is a `<button>` (not just a div with onClick) for keyboard accessibility | Medium | `frontend/src/pages/Templates.jsx:105` |
| **TPL-4** | P1 | Variable picker `grid-template-columns: 1fr 1fr` even at 375px — flatten to 1 column on mobile | High | `frontend/src/pages/Templates.css:480` |
| **TPL-5** | P1 | `.tpl-savebar` sticky `bottom: calc(64px + env(safe-area-inset-bottom))` — verify the `64px` matches actual MobileTabBar height (it's 72px in the config) | High | `frontend/src/pages/Templates.css:995` |
| **TPL-6** | P1 | Full-screen editor `.tpl-fs-body .chip-editor` — add `max-width: 100%; word-wrap: break-word` | Medium | `frontend/src/pages/Templates.css:1380` |
| **TPL-7** | P2 | Preset cards `repeat(3, 1fr)` at 375px → ~111px each, cramped | Low | `frontend/src/pages/Templates.css:284` |
| **TPL-8** | P2 | `.tpl-linkbtn` `padding: 6px 10px` ≈ small. Bump on mobile | Low | `frontend/src/pages/Templates.jsx:426` |

### `/admin`, `/admin/chats`, `/admin/users`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **ADM-1** | P0 | `.ac-linkbtn` `padding: 6px 10px` ≈ 28px | High | `frontend/src/pages/AdminChats.css:256-268` |
| **ADM-2** | P0 | AdminUsers — admin tables need a card-stack mobile fallback or sticky-first-column. Verify on iPhone | Needs-device | `frontend/src/pages/AdminUsers.jsx` + `.css` |
| **ADM-3** | P1 | AdminChats grid at iPad widths (768–820px) gets `320px 1fr` which crushes the thread column | Medium | `frontend/src/pages/AdminChats.css:19-26` |
| **ADM-4** | P1 | AdminUsers row actions — verify icon buttons are 44×44 | Needs-device | `frontend/src/pages/AdminUsers.jsx` |

### `/calculator` (SellerCalculator)

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **CALC-1** | P1 | Sticky summary `top: calc(52px + env(safe-area-inset-top) + 8px)` — verify `52px` matches actual mobile header height | High | `frontend/src/pages/SellerCalculator.css:68` |
| **CALC-2** | P1 | Verify `MobileSellerCalculator` (the actual mobile component) handles 16px input font — desktop CSS may not apply | Needs-device | imports at `frontend/src/pages/SellerCalculator.jsx:18` |
| **CALC-3** | P2 | Amount input `font-size: 22px` — verify `font-variant-numeric: tabular-nums` (line 365) renders consistently with ₪ glyph in RTL | Needs-device | `frontend/src/pages/SellerCalculator.css:362-365` |
| **CALC-4** | P2 | Breakdown list `font-size: 13.5px` is tight on 320px-class devices | Low | `frontend/src/pages/SellerCalculator.css:357` |

### `/integrations/yad2`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **YAD-1** | P0 | Verify a progress indicator is visible during long scans (not just toasts) | Needs-device | `frontend/src/pages/Yad2Import.jsx` |
| **YAD-2** | P0 | Listing review UI — confirm it renders cards/list, NOT a wide table at 375px | Needs-device | `frontend/src/pages/Yad2Import.jsx:100-106` |
| **YAD-3** | P0 | Quota chip — make persistent (not just on toast) | Medium | `frontend/src/pages/Yad2Import.jsx:132-140` |
| **YAD-4** | P1 | URL paste input — confirm `inputMode="url"` / `inputPropsForUrl()` is spread | Medium | `frontend/src/pages/Yad2Import.jsx:51` |
| **YAD-5** | P1 | 2000+ DOM nodes on render — add virtualization (`react-window`) or limit to 50/section with "load more" | Medium | `frontend/src/pages/Yad2Import.jsx` |
| **YAD-6** | P2 | Section headers should be `position: sticky; top: 0` so users keep context while scrolling | Low | `frontend/src/pages/Yad2Import.jsx` |
| **YAD-7** | P2 | Disabled-button styling on Import button — set `opacity: 0.6; cursor: not-allowed` | Low | `frontend/src/pages/Yad2Import.jsx` |

### `/import`, `/import/:type`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **IMP-1** | P0 | Verify `<input type="file" accept=".xlsx,.csv">` opens the iOS Files app picker via Capacitor WKWebView | Needs-device | `frontend/src/pages/Import.jsx` |
| **IMP-2** | P0 | Excel preview table — wrap in `overflow-x: auto; -webkit-overflow-scrolling: touch` if it isn't already | Needs-device | `frontend/src/pages/Import.jsx` |
| **IMP-3** | P1 | ImportPicker grid mobile breakpoint at 680px is too high — drop to 500px so 375–500px gets single column | Medium | `frontend/src/pages/ImportPicker.css:46-52` |
| **IMP-4** | P1 | ImportPicker card description `<p>` — add `word-break: break-word; hyphens: auto` | Low | `frontend/src/pages/ImportPicker.css:79-84` |
| **IMP-5** | P2 | Verify file-upload error UI is visible on 375px (not hidden in collapsed panel) | Needs-device | `frontend/src/pages/Import.jsx` |

### `/voice-demo`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **VD-1** | P1 | After IOS-1 mic permission landed, verify the page handles `NotAllowedError` gracefully with a Hebrew help card | Needs-device | `frontend/src/pages/VoiceDemo.jsx`, `frontend/src/hooks/useMediaRecorder.js` |
| **VD-2** | P1 | PremiumLockedTeaser `padding: 32px` is large on 375px — wrap in `max(16px, env(safe-area-inset-*))` | Medium | `frontend/src/pages/VoiceDemo.jsx:67` |
| **VD-3** | P2 | Mailto upgrade link — verify subject line opens correctly in iOS Mail | Needs-device | `frontend/src/pages/VoiceDemo.jsx` |
| **VD-4** | P2 | Mic icon `26px` in teaser — consider `20-24px` | Low | `frontend/src/pages/VoiceDemo.jsx` |

### `/reports`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **REP-1** | P0 | CSV export buttons `padding: '9px 14px'` ≈ 30–33px. Bump to `'11px 16px'` or `min-height: 44px` | High | `frontend/src/pages/Reports.jsx:400-428` |
| **REP-2** | P0 | DateRangePicker — verify input uses 16px+ font and `inputMode="date"` so iOS native picker fires without zoom | Needs-device | `frontend/src/components/DateRangePicker.jsx` |
| **REP-3** | P1 | KPI tile mobile 2-column on 375px ≈ 175px each — verify title+count+icon don't crowd | Needs-device | `frontend/src/pages/Reports.jsx:258-261` |
| **REP-4** | P1 | Disabled CSV buttons need `aria-label` (currently only `title`, not screen-reader exposed) | Medium | `frontend/src/pages/Reports.jsx:406-427` |
| **REP-5** | P2 | Mobile padding `18px 14px 28px` is reasonable but verify hero title doesn't clip | Needs-device | `frontend/src/pages/Reports.jsx:189-191` |

### `/activity` (ActivityLog)

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **ACT-1** | P1 | Sidebar filter buttons `width: 100%` on mobile (≤960px) → single full-width column. Verify intentional | Medium | `frontend/src/pages/ActivityLog.jsx:519-543, 607-610` |
| **ACT-2** | P1 | Refresh button missing `aria-busy={loading}` | High | `frontend/src/pages/ActivityLog.jsx:275-283` |

### `/reminders`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **REM-1** | P0 | Composer toggle button missing `:focus-visible` outline — add gold ring | High | `frontend/src/pages/Reminders.jsx:241-249` |
| **REM-2** | P0 | "הושלם" button `padding: '9px 14px'` ≈ 32px AND delete uses `iconOnlyBtn(34px)`. Both under 44px | High | `frontend/src/pages/Reminders.jsx:536-565` |
| **REM-3** | P0 | `type="datetime-local"` input — explicitly add `inputMode` for completeness | Medium | `frontend/src/pages/Reminders.jsx:281-287` |
| **REM-4** | P1 | Status tab pills (3 with counts) — measure on 375px; may overflow | Needs-device | `frontend/src/pages/Reminders.jsx:338-369` |
| **REM-5** | P2 | Composer textarea `resize: vertical` — consider `resize: none + fixed minHeight` on mobile | Low | `frontend/src/pages/Reminders.jsx:298` |

### `/public-matches`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **PUB-1** | P0 | Copy-to-clipboard `navigator.clipboard.writeText` — add fallback modal with focused readonly input for older WKWebView | Medium | `frontend/src/pages/PublicMatches.jsx:918-928` |
| **PUB-2** | P0 | "See" toggle button `padding: '8px 10px'` ≈ 32–35px — bump to `'10px 12px'` | High | `frontend/src/pages/PublicMatches.jsx:395-414` |
| **PUB-3** | P0 | Duplicate modal — `placeItems: 'center'` plus `inset: 0` doesn't respect safe-area. Add safe-area padding via Portal wrapper | Medium | `frontend/src/pages/PublicMatches.jsx:495-566` |
| **PUB-4** | P1 | Pool card image `height: 156` lacks aspect-ratio — use `aspect-ratio: 2 / 1.2` | Medium | `frontend/src/pages/PublicMatches.jsx:286-291` |
| **PUB-5** | P1 | Cloned-state button (cream2 + muted text) reads as disabled. Use a different visual (green check) and add `aria-label="כבר שוכפל"` | Medium | `frontend/src/pages/PublicMatches.jsx:415-436` |
| **PUB-6** | P1 | Search input missing `aria-label="חיפוש עיר / סוכן / משרד"` | High | `frontend/src/pages/PublicMatches.jsx:161-173` |

### `/notifications`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **NTF-1** | P0 | "סמן הכל כנקרא" button `padding: '10px 16px'` ≈ 24px → bump to `min-height: 44px` | High | `frontend/src/pages/Notifications.jsx:155` |
| **NTF-2** | P1 | Unread 8px gold dot is small; consider larger badge or left-aligned indicator | Medium | `frontend/src/pages/Notifications.jsx:252-261` |
| **NTF-3** | P1 | `toLocaleString('he-IL')` time string can wrap awkwardly RTL | Needs-device | `frontend/src/pages/Notifications.jsx:49-57` |
| **NTF-4** | P1 | Verify keyboard nav (`onKeyDown` + `tabIndex`) works with Bluetooth keyboards | Needs-device | `frontend/src/pages/Notifications.jsx:195-203` |
| **NTF-5** | P2 | 36px icon box at 375px row may push title to 2 lines | Needs-device | `frontend/src/pages/Notifications.jsx` |

### `/documents`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **DOC-1** | P0 | Download `target="_blank"` link missing `rel="noopener noreferrer"` (`SEC-009`) | High | `frontend/src/pages/Documents.jsx:366` |
| **DOC-2** | P0 | File input — verify Capacitor WKWebView allows file picking with the listed accept types | Needs-device | `frontend/src/pages/Documents.jsx:218-224` |
| **DOC-3** | P1 | Drop-zone `onClick` triggers file picker, but tags-input inside it can intercept events. Add `stopPropagation` | Medium | `frontend/src/pages/Documents.jsx:205-216` |
| **DOC-4** | P1 | Document file-name has `text-overflow: ellipsis` but no `title` attribute for hover/aria | Medium | `frontend/src/pages/Documents.jsx:330-334` |

### `/marketing`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **MKT-1** | P0 | `goldBtnStyle(false)` returns `padding: '6px 12px'` → ~26px height. Bump to ~9px/14px ≥ 40px | High | `frontend/src/pages/Marketing.jsx:1099-1101, 1140, 1203-1217` |
| **MKT-2** | P0 | Tab nav horizontal scroller — confirm tabs don't wrap at 375px and add scroll-indicator dots | Needs-device | `frontend/src/pages/Marketing.jsx:123-134` |
| **MKT-3** | P1 | InquiryCard / AgreementCard action buttons inherit MKT-1 fix | Medium | `frontend/src/pages/Marketing.jsx:835-845, 1119-1145` |
| **MKT-4** | P2 | Sparkline SVG — add `role="img"` explicitly | Low | `frontend/src/pages/Marketing.jsx:632, 449-494` |
| **MKT-5** | P2 | KPI tile `padding: isMobile ? 12 : 16` — verify density on device | Needs-device | `frontend/src/pages/Marketing.jsx:364-395` |

### `/calendar`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **CAL-1** | P0 | Day cell `gridAutoRows: '108px'` fixed — add `minmax(80px, 108px)` for short viewports | Medium | `frontend/src/pages/Calendar.jsx:240` |
| **CAL-2** | P0 | Side panel sticky `top: 18px` — fold safe-area-top in | Medium | `frontend/src/pages/Calendar.jsx:318-326` |
| **CAL-3** | P1 | "פגישה חדשה" button `padding: '9px 16px'` ≈ 28px → bump to 44px | High | `frontend/src/pages/Calendar.jsx:170` |
| **CAL-4** | P1 | "היום", prev, next buttons `padding: '8px 12px'` and `'4px 6px'` — both <44px | High | `frontend/src/pages/Calendar.jsx:178, 188, 197` |
| **CAL-5** | P1 | Month label can overflow on 375px | Needs-device | `frontend/src/pages/Calendar.jsx:195` |
| **CAL-6** | P1 | Meeting chips inside day cells `font-size: 10px` — bump or increase cell size | Medium | `frontend/src/pages/Calendar.jsx:294` |

### `/meetings/:id`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **MEET-1** | P0 | "צור brief" button `padding: '7px 14px'` ≈ 30px — bump to 44px | High | `frontend/src/pages/MeetingDetail.jsx:194-207` |
| **MEET-2** | P1 | Verify `MeetingSummarizerCard` respects safe-area | Needs-device | `frontend/src/components/MeetingSummarizerCard.jsx` |

### `/ai`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **AI-1** | P0 | Chat input shell — verify `padding-bottom: env(safe-area-inset-bottom)` so send button is reachable when iOS keyboard opens | Needs-device | `frontend/src/pages/Ai.jsx` chat input shell |
| **AI-2** | P0 | Send button reachability with keyboard open — sticky-bottom + safe-area | Needs-device | `frontend/src/pages/Ai.jsx` |
| **AI-3** | P1 | Suggested-prompt pills (`SUGGESTED_PROMPTS`) — confirm rendered with `min-height: 44px` | Medium | `frontend/src/pages/Ai.jsx:31-38` |
| **AI-4** | P1 | Auto-scroll on message arrival — verify ref's container has `overflow-y: auto` | Medium | `frontend/src/pages/Ai.jsx:79-83` |
| **AI-5** | P2 | localStorage chat persistence — no iCloud sync (lost on uninstall) | Low | `frontend/src/pages/Ai.jsx` |
| **AI-6** | P2 | Message bubble `max-width: 85vw` to prevent overflow at narrow widths | Medium | `frontend/src/pages/Ai.jsx` |

### `/settings`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **SET-1** | P1 | Grid `minmax(280px, 1fr)` at 375px forces single column — drop minmax min to 160px so 2-up where possible | Medium | `frontend/src/pages/Settings.css:34` |
| **SET-2** | P2 | "תפקיד" title can overflow on narrow phones | Needs-device | `frontend/src/pages/Settings.jsx` |

### `/settings/tags` (TagSettings)

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **TAG-1** | P0 | Color input `width: 46; height: 42` — bump to 44×44 | High | `frontend/src/pages/TagSettings.jsx:215` |
| **TAG-2** | P0 | Edit/delete icon buttons `padding: 8px` ≈ 30px hit area — wrap in 44×44 | High | `frontend/src/pages/TagSettings.jsx:356, 365` |
| **TAG-3** | P1 | Form layout `flex-wrap` with `flex: '1 1 220px'` — at 375px with color+select pushes "Scope" to second row. Tighten to `flex: 1 1 150px` | Medium | `frontend/src/pages/TagSettings.jsx:198` |
| **TAG-4** | P1 | Color/select inputs may not show focus rings on iPhone | Needs-device | `frontend/src/pages/TagSettings.jsx` |
| **TAG-5** | P2 | Shimmer animation `200% bg-position` may stutter on older devices | Low | `frontend/src/pages/TagSettings.jsx` |

### `/settings/neighborhoods`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **NBH-1** | P0 | Form `display: flex; gap: 12` no `min-width` → wraps to 3+ rows on 375px | High | `frontend/src/pages/NeighborhoodAdmin.jsx:279-317` |
| **NBH-2** | P0 | Edit-row save/cancel `padding: 8px` ≈ 30px → 44px | High | `frontend/src/pages/NeighborhoodAdmin.jsx:365-380` |
| **NBH-3** | P1 | NeighborhoodPicker — fallback `<select multiple>` is unusable on mobile; verify it provides chip/checkbox UX | Needs-device | `frontend/src/pages/NeighborhoodAdmin.jsx:185-199` |
| **NBH-4** | P1 | Chip list `font-size: 12px` — bump to 13–14 | Medium | `frontend/src/pages/NeighborhoodAdmin.css:144` |
| **NBH-5** | P1 | OWNER-only gate centered button may be below fold | Medium | `frontend/src/pages/NeighborhoodAdmin.jsx:239` |
| **NBH-6** | P2 | Verify all browsers in scope handle logical CSS `inline-size` / `block-size` | Low | `frontend/src/pages/NeighborhoodAdmin.css` |

### `/help`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **HLP-1** | P0 | Category pills `padding: '8px 14px'` ≈ 30px — bump to 44px | High | `frontend/src/pages/Help.jsx:143-157` |
| **HLP-2** | P0 | Search input has no clear (×) button — add for one-tap clear | Medium | `frontend/src/pages/Help.jsx:120-132` |
| **HLP-3** | P0 | Three contact-channel cards `minmax(220px, 1fr)` — verify single-column on 375px | Needs-device | `frontend/src/pages/Help.jsx:252` |
| **HLP-4** | P1 | mailto link — verify special-character encoding in subject works in iOS Mail | Needs-device | `frontend/src/pages/Help.jsx:276` |
| **HLP-5** | P1 | WhatsApp link — server-side validate `SUPPORT_PHONE_RAW` | Medium | `frontend/src/pages/Help.jsx:257` |
| **HLP-6** | P1 | Accordion toggle row — add `min-width: 0` on flex child for ellipsis | Medium | `frontend/src/pages/Help.jsx:190-221` |
| **HLP-7** | P2 | Hero card `padding: 32px` — responsive padding on mobile | Low | `frontend/src/pages/Help.jsx` |

### `/inbox`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **INB-1** | P1 | Feature-list items `padding: 12px` may feel tight on tap | Medium | `frontend/src/pages/Inbox.jsx` |
| **INB-2** | P1 | Verify `WhatsAppIcon` component renders correctly | Medium | `frontend/src/pages/Inbox.jsx` |
| **INB-3** | P2 | Grid `minmax(220px, 1fr)` at 375px-56px = 319px → wraps OK | Low | `frontend/src/pages/Inbox.jsx` |

### `/search` (SearchResults)

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **SR-1** | P0 | Search input was missing `inputMode="search" / enterKeyHint="search" / autoComplete="off" / autoCorrect="off" / autoCapitalize="off" / spellCheck=false` | High | `frontend/src/pages/SearchResults.jsx:177` — **shipped this sweep** |
| **SR-2** | P0 | Grid `minmax(0,1fr) 220px` collapses at 900px — too high. Drop to ~600px or shrink sidebar to 160px | Medium | `frontend/src/pages/SearchResults.jsx:238` |
| **SR-3** | P0 | Mobile filter pills missing `:focus-visible` outline | High | `frontend/src/pages/SearchResults.jsx:204-227` |
| **SR-4** | P1 | "Back to dashboard" link inside hidden mobile sidebar — verify no layout shift | Medium | `frontend/src/pages/SearchResults.jsx:303-310` |
| **SR-5** | P1 | Desktop sidebar sticky `top: 14px` — fold safe-area-top in | Medium | `frontend/src/pages/SearchResults.jsx:265-266` |
| **SR-6** | P2 | Add page-level `max-width` to prevent sprawl on iPad+ | Low | `frontend/src/pages/SearchResults.jsx:153` |

### `/map`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **MAP-1** | P0 | Verify `leaflet/dist/leaflet.css` is bundled by Vite (not loaded as external CSS) so WKWebView renders pan/zoom controls | Needs-device | `frontend/src/pages/Map.jsx:19-21` |
| **MAP-2** | P0 | Map height `calc(100vh - 61px)` — switch to `calc(100dvh - 61px - env(safe-area-inset-top))` | High | `frontend/src/pages/Map.jsx:141-143` |
| **MAP-3** | P0 | divIcon `iconSize: [0,0]` makes the inner price chip the only tap target (~50×20). Add padding/wrap to enlarge | Medium | `frontend/src/pages/Map.jsx:46-79` |
| **MAP-4** | P1 | Filter bar wraps at 375px to 2–3 lines — verify acceptable | Needs-device | `frontend/src/pages/Map.jsx:172-211` |
| **MAP-5** | P1 | City search missing `aria-label="חיפוש עיר"` | High | `frontend/src/pages/Map.jsx:199-211` |
| **MAP-6** | P1 | Leaflet attribution may overlap controls or safe-area on iPhone | Needs-device | `frontend/src/pages/Map.jsx:233-235` |

### `/office`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **OFC-1** | P0 | `.office-field input` `padding: 8px 10px` ≈ 32px — `padding: 10px 12px` or `min-height: 44px` | High | `frontend/src/pages/Office.css:73-81` |
| **OFC-2** | P0 | Member-row remove icon button — verify 44×44 | Needs-device | `frontend/src/pages/Office.jsx` member row |
| **OFC-3** | P1 | Invite-mode toggle — confirm proper button group with `aria-pressed` | Medium | `frontend/src/pages/Office.jsx:67` |
| **OFC-4** | P1 | Close-office `ConfirmDialog` — verify safe-area + 44px buttons | Needs-device | `frontend/src/components/ConfirmDialog.jsx` |

### `/team`, `/team/:id`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **TEAM-1** | P0 | Scoreboard table — verify card-stack mobile fallback ≤820px | Needs-device | `frontend/src/pages/Team.jsx:49-56` |
| **TEAM-2** | P1 | Sortable column-header buttons may be under 44px when used as `<button>` | Needs-device | `frontend/src/pages/Team.jsx:75-88` |
| **TEAM-3** | P1 | Quarter picker — at 6 quarters × button width can overflow at 375px | Medium | `frontend/src/pages/Team.jsx:123-162` |

### `/contracts`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **CONT-1** | P1 | Long contract titles — verify `text-overflow: ellipsis` with realistic strings (>50 chars) | Needs-device | `frontend/src/pages/Contracts.jsx:121-125, 137` |
| **CONT-2** | P2 | Contract count >999 has no formatter guard | Low | `frontend/src/pages/Contracts.jsx` |

### `/contracts/:id`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **CD-1** | P0 | PDF iframe `height: 560` hardcoded — on iPhone the form below is invisible. Use `maxHeight: 'min(70vh, 560px)'` or stack form ABOVE iframe on mobile | High | `frontend/src/pages/ContractDetail.jsx:243` |
| **CD-2** | P0 | Type-to-sign input `font-size: 18` — verify it doesn't trigger zoom; if it does, bump container or revert to 16 + larger padding | Needs-device | `frontend/src/pages/ContractDetail.jsx:282` |
| **CD-3** | P0 | Signature hash `<code>` — add `direction: 'ltr'; max-width: 100%; word-break: break-all` to prevent overflow | High | `frontend/src/pages/ContractDetail.jsx:319-329` |
| **CD-4** | P1 | Share + Download buttons may wrap to two lines at 375px — flex-1 each so they share the row | Medium | `frontend/src/pages/ContractDetail.jsx:154-156` |
| **CD-5** | P1 | Row component (label+value+border-bottom) feels cramped at 375px — collapsible "more" toggle | Low | `frontend/src/pages/ContractDetail.jsx:362-376` |
| **CD-6** | P2 | `secondaryBtn()` `padding: '7px 12px'` ≈ 30px → 44px on mobile | High | `frontend/src/pages/ContractDetail.jsx:408` |

### `/deals`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **DEAL-1** | P0 | Kanban grid `minmax(240px, 1fr)` collapses only at 720px; 375–500px range can render two crushed columns. Add `@media (max-width: 600px) { grid-template-columns: 1fr }` | Medium | `frontend/src/pages/Deals.jsx:274`, `.css:273-302` |
| **DEAL-2** | P0 | DealEditModal inputs `.form-input` — verify CSS source enforces `min-height: 44px` | Medium | imports at `frontend/src/pages/Deals.jsx:23` |
| **DEAL-3** | P0 | Kanban card buttons `padding: '6px 10px'` ≈ 20px — `min-height: 44px` | High | `frontend/src/pages/Deals.jsx:361-366` |
| **DEAL-4** | P1 | KpiChip with long Hebrew (e.g., "סה״כ עמלות") may overflow at 375px — add `max-width: 160px; ellipsis` | Medium | `frontend/src/pages/Deals.jsx:229` |
| **DEAL-5** | P1 | PriceInput `dir="ltr"` good but no monospace — `font-family: ui-monospace` + `font-variant-numeric: tabular-nums` | Medium | `frontend/src/pages/Deals.jsx:604` |
| **DEAL-6** | P2 | DealEditModal — verify backdrop `max-width/max-height: 90vw/90vh` | Needs-device | imports `AgreementDialog.css` |

### `/deals/:id`

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **DD-1** | P1 | PartyBlock contact row tight at 375px — stack phone/email vertically below 500px | Medium | `frontend/src/pages/DealDetail.jsx:292-307` |
| **DD-2** | P1 | Price strip `minmax(130px, 1fr)` at 375px gives 2–3 cramped columns. Reduce to `110px` or single-column | Medium | `frontend/src/pages/DealDetail.jsx:200` |
| **DD-3** | P2 | Section cards `minmax(320px, 1fr)` safe but verify edge padding | Needs-device | `frontend/src/pages/DealDetail.jsx` |

### `/notifications` ... covered above (NTF-*)

### `/admin/users` ... covered above (ADM-*)

### `*` (NotFound 404)

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **NF-1** | P2 | 404 code `font-size: 52px` on 320px is cramped — wrap in `clamp(40px, 10vw, 52px)` | Medium | `frontend/src/pages/NotFound.css:22` |

---

## §5 — Shared Components / Composites

### Forms (SmartFields, AddressField)

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **SF-1** | P0 | NumberField mobile `font-size: 17px` only inside @media; base `15px` may trip iOS zoom-on-focus. Set base to `16px` | Medium | `frontend/src/components/SmartFields.css:92` |
| **SF-2** | P0 | AddressField suggestions dropdown uses undefined `--vh-usable`. Define via JS using `visualViewport.height` so dropdown clamps above the iOS keyboard | High | `frontend/src/components/AddressField.css:163-165` |
| **SF-3** | P0 | AddressField clear-button `width: 22; height: 22` — wrap in 44×44 invisible padding | High | `frontend/src/components/AddressField.css:38-48` |
| **SF-4** | P1 | NumberField caret restoration uses `requestAnimationFrame`; if jitter persists on iPad split-view, use `useLayoutEffect` or `beforeinput` | Needs-device | `frontend/src/components/SmartFields.jsx:97` |
| **SF-5** | P1 | AddressField list `max-height: 280px` — at 375px with keyboard open very little space remains. Replace with `max-height: min(280px, 40dvh)` | Medium | `frontend/src/components/AddressField.css:71-87` |
| **SF-6** | P1 | Verify Hebrew keyboard IME doesn't break NumberField unit `direction: ltr` shift | Needs-device | `frontend/src/components/SmartFields.jsx:113` |
| **SF-7** | P2 | AddressField loading spinner `inset-inline-end: 38px` assumes clear button — verify alignment when no pick made yet | Needs-device | `frontend/src/components/AddressField.css:55-66` |

### Modals & Dialogs

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **MOD-1** | P0 | ConfirmDialog backdrop `inset: 0` covers entire viewport including notch — verify on Dynamic Island | Needs-device | `frontend/src/components/ConfirmDialog.css:1-11` |
| **MOD-2** | P0 | CommandPalette modal missing `padding-bottom: calc(12px + env(safe-area-inset-bottom))` | High | `frontend/src/components/CommandPalette.css:7-9` |
| **MOD-3** | P0 | useFocusTrap doesn't handle iOS keyboard-dismiss (swipe-down doesn't fire keyboard event). Test focus restoration after keyboard close | Needs-device | `frontend/src/hooks/useFocusTrap.js:54-77` |
| **MOD-4** | P1 | ConfirmDialog close (×) button — verify ≥44×44 in header | Needs-device | `frontend/src/components/ConfirmDialog.css:49` |
| **MOD-5** | P1 | CommandPalette search input auto-focus + keyboard animation may be jarring | Needs-device | `frontend/src/components/CommandPalette.jsx:94`, `.css:51-60` |
| **MOD-6** | P1 | CommandPalette results scroll behind keyboard — verify "stuck" feel | Needs-device | `frontend/src/components/CommandPalette.css:74-78` |
| **MOD-7** | P2 | useFocusTrap `focus({ preventScroll: true })` — first focusable could be off-screen for users; OK if first is search | Low | `frontend/src/hooks/useFocusTrap.js:43-50` |
| **MOD-8** | P2 | ConfirmDialog title — add `overflow: hidden; text-overflow: ellipsis` for long Hebrew titles | Low | `frontend/src/components/ConfirmDialog.jsx:45` |
| **MOD-9** | P1 | Verify `LeadFiltersSheet` and `CustomerFiltersPanel` are full-width bottom sheets on mobile with focus trap + safe-area-bottom | Needs-device | `frontend/src/components/LeadFiltersSheet.jsx`, `CustomerFiltersPanel.jsx` |

### Voice / Media

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **VC-1** | P0 | useMediaRecorder pre-checks getUserMedia but the failure path message ("יש לאשר את ההרשאה בדפדפן") is misleading on Capacitor — improve copy to mention iOS Settings → Estia → Microphone | Medium | `frontend/src/hooks/useMediaRecorder.js:79-90, 101` |
| **VC-2** | P0 | VoiceCaptureFab bottom-right at 56×56 — verify spacing vs QuickCreateFab on small screens | Needs-device | `frontend/src/components/VoiceCaptureFab.{jsx,css}` |
| **VC-3** | P0 | useMediaRecorder 3-min cap auto-stop is silent — surface a Hebrew toast "ההקלטה הגיעה למקסימום של 3 דקות" | High | `frontend/src/hooks/useMediaRecorder.js:161-163` |
| **VC-4** | P1 | VoiceCaptureFab MM:SS timer — verify it fits inside 56×56 button on 375px without clipping | Needs-device | `frontend/src/components/VoiceCaptureFab.jsx:127` |
| **VC-5** | P1 | Handle iOS system interruption (call/alert) — currently `onerror` catches but UX is abrupt | Medium | `frontend/src/hooks/useMediaRecorder.js:132` |
| **VC-6** | P1 | After premium-gate close, FAB silently resets — add brief "הקלטה שמורה — שדרג ל-Premium" toast | Medium | `frontend/src/components/VoiceCaptureFab.jsx:70-74` |
| **VC-7** | P2 | MediaRecorder MIME-type fallback may produce `audio/wav` on older iOS — verify backend accepts | Needs-device | `frontend/src/hooks/useMediaRecorder.js:114-124` |

### Data / Chat

| ID | Severity | Task | Confidence | Files |
|---|---|---|---|---|
| **DT-1** | P0 | DataTable has no mobile fallback (no card stack, no sticky header) — relies on horizontal-overflow scroll. Audit usage; if any reach iPhone, add card variant | Medium | `frontend/src/components/DataTable.{jsx,css}` |
| **DT-2** | P0 | ChatWidget panel `bottom: calc(78px + env(safe-area-inset-bottom))` — verify landscape orientation and floating-keyboard behavior | Needs-device | `frontend/src/components/ChatWidget.css:83-88` |
| **DT-3** | P1 | DataTable `<thead>` not sticky on mobile — add `position: sticky; top: 0; z-index: 10` | Medium | `frontend/src/components/DataTable.css` |
| **DT-4** | P1 | ChatWidget message bubble has no `max-width` — long messages span full panel. Add `max-width: 85%` | Medium | `frontend/src/components/ChatWidget.css:74-98` |
| **DT-5** | P2 | DataTable cell padding `12px 14px` cramped at 375px — responsive `10px 8px` mobile | Low | `frontend/src/components/DataTable.css:64-65` |

---

## §6 — Tap-target appendix (TT-1 master sweep)

A single bulk pass to bring every sub-44px button up to HIG is the
biggest visible iPhone polish win. Below is the consolidated list
from the per-page sweep:

- `Login.jsx:245, 333` — password reveal `padding: 4`
- `Login.jsx (Remember me)` — checkbox label tap area
- `ResetPassword.jsx:164-172` — eye toggle `padding: 4`
- `Calendar.jsx:170, 178, 188, 197` — month-nav buttons (4–8px)
- `Reminders.jsx:536-565` — `iconOnlyBtn(34)` + "הושלם" 9/14
- `MeetingDetail.jsx:194-207` — "צור brief" 7/14
- `Marketing.jsx:1099-1101, 1140, 1203-1217` — `goldBtnStyle(false)` 6/12
- `Notifications.jsx:155` — "סמן הכל" 10/16
- `Reports.jsx:400-428` — CSV export buttons 9/14
- `TagSettings.jsx:215, 356, 365` — color 46×42; edit/delete `padding: 8`
- `NeighborhoodAdmin.jsx:365-380` — save/cancel `padding: 8`
- `Office.css:73-81` — `.office-field input` `padding: 8 10`
- `Help.jsx:143-157` — category pills `padding: 8 14`
- `AdminChats.css:256-268` — `.ac-linkbtn` `padding: 6 10`
- `Properties.css:427` — `.property-wa-btn` no `min-height`
- `PublicMatches.jsx:395-414` — see-toggle `padding: 8 10`
- `ContractDetail.jsx:408` — `secondaryBtn()` `padding: 7 12`
- `Deals.jsx:361-366` — Kanban card buttons 6/10
- `Transfers.jsx:414-425, 473-494` — `primaryBtn / ghostBtn` 7/12
- `Layout.jsx:911` — topbar bell/chat `width: 38, height: 38`
- `AddressField.css:38-48` — clear (×) `width: 22; height: 22`
- `AgentPortal.jsx:153-172` — contact chips no `:focus-visible`
- `Templates.jsx:426` — `.tpl-linkbtn` `padding: 6 10`

A bulk `min-height: 44px` global rule on `.btn-sm` at touch widths
already exists (`index.css:835-843`). The remaining offenders are
all inline-styled buttons or bespoke per-page button classes.
Recommend: a global `min-height: 44px; min-width: 44px;` on every
`<button>` at `(pointer: coarse)` widths AS LONG AS we double-check
nothing relies on a sub-44px button visually (e.g., compact toolbars).

---

## §7 — Blocked / Needs Human Decision

| Task | Reason | Suggested Decision |
|---|---|---|
| **BLOCKED-1** — iPhone Simulator build | Requires Xcode | User runs `cd frontend && npm run cap:ios` after pulling these changes |
| **BLOCKED-2** — Bundled web vs `server.url` remote | App Store 4.7 trade-off | Keep `server.url`; document hybrid bridge surface (IOS-4) |
| **BLOCKED-3** — ATT declaration | Cross-app tracking? | `NSPrivacyTracking: false`; answer "No" on App Store privacy form |
| **BLOCKED-4** — `Yad2Import` 2000-item virtualization (`react-window` dep) | Adds dep | Defer until perf profiling shows actual jank |
| **BLOCKED-5** — Universal `min-height: 44px` on every button at coarse pointer | Risk of visual regressions in compact toolbars | Stage as a focused PR with a regression sweep across screenshots |
| **BLOCKED-6** — DataTable mobile fallback | Big refactor (card-stack OR sticky-first-column) | Decide which strategy fits Estia's RTL Hebrew tables; design call |
| **BLOCKED-7** — `--vh-usable` runtime computation | Adds visualViewport listener globally | Lightweight; ship as a single hook + CSS var |
