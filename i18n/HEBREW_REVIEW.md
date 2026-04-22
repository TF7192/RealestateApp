# Estia — Hebrew String Review Log

String-by-string inventory + proposed revisions. Filled in incrementally as the review sweeps each surface. See `STYLE_GUIDE.md` for the rules, `GLOSSARY.md` for canonical terminology.

---

## How to read this log

Each row:

- **Location** — file path + line (or translation key).
- **Key / ID** — the translation key if one exists; `(hardcoded)` otherwise.
- **Current Hebrew** — what ships today.
- **Proposed Hebrew** — what I'm changing it to (or "(no change)" if approved as-is).
- **Status** — one of:
  - `approved` — reviewed, no change needed.
  - `proposed` — new wording suggested, not yet applied.
  - `applied` — change committed.
  - `needs PM review` — terminology / product-decision question, flagged.
  - `needs legal review` — legal / policy copy, flagged.
- **Notes** — short reason for the change or the question raised.

Coverage is auditable: **every** Hebrew string gets a row, even unchanged ones.

---

## Summary

| Surface | Strings reviewed | Approved | Changed | Flagged |
|---|---|---|---|---|
| Main navigation (`Layout.jsx`) | — | — | — | — |
| Dashboard | — | — | — | — |
| Login / signup | 29 | 21 | 3 | 5 |
| Customers list + detail + new | — | — | — | — |
| Properties list + detail + new | — | — | — | — |
| Owners | — | — | — | — |
| Deals | — | — | — | — |
| Reports | — | — | — | — |
| Activity log | — | — | — | — |
| Reminders | — | — | — | — |
| Office | — | — | — | — |
| Settings + Tags admin | — | — | — | — |
| Neighborhoods admin | — | — | — | — |
| Prospect sign (public) | — | — | — | — |
| Landing (public) | — | — | — | — |
| AgentPortal (public) | — | — | — | — |
| CustomerPropertyView (public) | — | — | — | — |
| Voice-to-lead UX | — | — | — | — |
| Backend error messages | — | — | — | — |
| Backend seed / fixtures | — | — | — | — |
| Email templates | — | — | — | — |
| SMS / push templates | — | — | — | — |
| Legal / policy (`privacy.html` etc.) | — | — | — | — |
| Meta / OG tags | — | — | — | — |
| **Total** | **—** | **—** | **—** | **—** |

---

## Priority 1 — High-visibility surfaces

### Main navigation (`frontend/src/components/Layout.jsx`)

| Location | Key / ID | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|---|
| _pending discovery_ | | | | | |

### Dashboard (`frontend/src/pages/Dashboard.jsx`)

| Location | Key / ID | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|---|
| _pending discovery_ | | | | | |

### Login / signup (`frontend/src/pages/Login.jsx`)

| Location | Key / ID | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|---|
| L12 | `agentFeatures[0]` (hardcoded) | `ניהול נכסים ובלעדיויות` | (no change) | approved | Marketing bullet. Industry-accurate. |
| L13 | `agentFeatures[1]` | `מעקב לידים, קונים ועסקאות` | (no change) | approved | |
| L14 | `agentFeatures[2]` | `שיווק ושיתוף נכסים` | (no change) | approved | |
| L15 | `agentFeatures[3]` | `דפי נכס ללקוחות` | (no change) | approved | |
| L77 | validation | `הסיסמה חייבת להיות באורך 8 תווים לפחות` | `הסיסמה צריכה להיות באורך 8 תווים לפחות` | applied | `חייבת` is government-ese / stiff; `צריכה` reads warmer without losing precision. |
| L89 | error fallback | `הרשמה נכשלה` / `התחברות נכשלה` | (no change) | approved | Cause-only; paired with server message when present. Could add "אפשר לנסות שוב" — flagged low-priority. |
| L118 | tagline `h2` | `מערכת ניהול נדל״ן` | (no change) | approved | Accurate industry register. |
| L135 | badge | `ממשק סוכנים` | (no change) | approved | |
| L143 | form title (signup) | `הרשמה כסוכן` | (no change) | approved | Noun form for a title — matches style guide. |
| L143 | form title (login) | `כניסה למערכת` | (no change) | approved | Noun form for a title. |
| L147 | subtitle (signup) | `צרו חשבון חדש — כך תתחילו` | — | needs PM review | Masc-plural imperative (`צרו`/`תתחילו`). Conflicts with the style guide's gender-neutral rule but consistent with landing/marketing voice in `landing/content/copy.he.ts`. Product call: marketing-plural across both surfaces, or noun form to align with app body copy? |
| L148 | subtitle (login) | `נהלו את הנכסים, הלידים והעסקאות שלכם` | — | needs PM review | Same plural-imperative issue. Candidate alternative if neutralized: `ניהול הנכסים, הלידים והעסקאות`. |
| L161 | auth button | `כניסה עם Google` | (no change) | approved — see flag | Noun form on a button deviates from product-wide imperative rule. Flagging once as part of Login-auth-buttons question. |
| L165 | divider | `או` | (no change) | approved | |
| L173 | auth button | `כניסה עם אימייל וסיסמה` | — | needs PM review | See flag above: Login auth-method buttons are consistently noun form. Israeli banking/gov UX convention uses nouns (`כניסה`, `הרשמה`) for auth CTAs. Product-wide style guide says imperative. Decision needed: keep noun for auth (option A) or normalize to imperative across (option B, would be `היכנס עם אימייל וסיסמה`). |
| L181 | auth button | `יצירת חשבון חדש` | — | needs PM review | Same decision. Option-B form: `צור חשבון חדש`. |
| L196 | back button | `חזרה` | `חזור` | applied | Button labels are imperative per style guide; `חזור` is the canonical button form (glossary). |
| L202 | field label | `שם מלא` | (no change) | approved | |
| L210 | placeholder | `יוסי כהן` | (no change) | approved | Demo name — noun/phrase placeholder, correct. |
| L217 | field label | `טלפון (אופציונלי)` | (no change) | approved | |
| L225 | placeholder | `050-1234567` | (no change) | approved | |
| L234 | field label | `אימייל` | (no change) | approved | Accepted loanword per glossary. |
| L245 | placeholder | `you@example.com` | (no change) | approved | English placeholder is correct (email address convention). |
| L254 | field label | `סיסמה` | (no change) | approved | |
| L256 | hint | `(8 תווים לפחות)` | (no change) | approved | Short constraint, well-scoped. |
| L263 | placeholder | `••••••••` | (no change) | approved | Non-localized. |
| L280 | submit state | `שולח…` | `רק רגע…` | applied | `שולח` (sending) is an English calque — the action is login/signup, not a message send. `רק רגע…` is idiomatic and voice-neutral across both flows. |
| L282 | submit label (signup) | `יצירת חשבון` | — | needs PM review | Noun form, same flag as L173/L181. Option-B: `צור חשבון`. |
| L283 | submit label (login) | `כניסה` | — | needs PM review | Same flag. Option-B: `היכנס`. |
| L289 | prompt | `אין חשבון?` | (no change) | approved | |
| L291 | link | `להרשמה` | (no change) | approved | Idiomatic Hebrew navigation link form (prefix ל- + noun). |
| L296 | prompt | `כבר יש חשבון?` | (no change) | approved | |
| L298 | link | `לכניסה` | (no change) | approved | Same idiom. |
| L307 | footer | `© 2025 Estia · מערכת לסוכני נדל״ן` | (no change) | approved | Date will need a 2026 bump before year-end — flagged low-priority. |

---

## Priority 2 — Transactional surfaces

### Customer create (`frontend/src/pages/NewLead.jsx`)

| Location | Key / ID | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|---|
| _pending discovery_ | | | | | |

### Property create (`frontend/src/pages/NewProperty.jsx`)

| Location | Key / ID | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|---|
| _pending discovery_ | | | | | |

### Customer detail (`frontend/src/pages/CustomerDetail.jsx`)

| Location | Key / ID | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|---|
| _pending discovery_ | | | | | |

### Property detail (`frontend/src/pages/PropertyDetail.jsx`)

| Location | Key / ID | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|---|
| _pending discovery_ | | | | | |

### Backend error messages (`backend/src/**/*.ts`)

| Location | Key / ID | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|---|
| _pending discovery_ | | | | | |

---

## Priority 3 — Admin / settings surfaces

### Settings index + Tag admin + Neighborhood admin + Office

| Location | Key / ID | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|---|
| _pending discovery_ | | | | | |

---

## Priority 4 — Email / SMS / push templates

| Location | Key / ID | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|---|
| _pending discovery_ | | | | | |

---

## Priority 5 — Legal / policy copy

Flagged, not rewritten. Requires legal review before touch.

| Location | Key / ID | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|---|
| _pending discovery_ | | | | | needs legal review |

---

## Open questions for Product

Flagged items where intent isn't clear or the decision is product-level, not copy-level.

| # | Location | Question | Options | Flagged in |
|---|---|---|---|---|
| 1 | `Login.jsx:L147`, `L148` | Landing subtitles use masc-plural imperative (`צרו חשבון…`, `נהלו את הנכסים…`). Style guide prefers gender-neutral; marketing voice in `landing/copy.he.ts` uses plural-you consistently. Keep plural-you as the marketing register or normalize the Login subtitle toward noun form? | (A) Keep plural-you; Login is the landing/public surface and should match `copy.he.ts`. (B) Switch to noun form (`יצירת חשבון חדש — כך מתחילים` / `ניהול הנכסים, הלידים והעסקאות`) to match app body copy. | Login review |
| 2 | `Login.jsx:L161`, `L173`, `L181`, `L282`, `L283` | Login auth-method + submit buttons use noun form (`כניסה עם Google`, `יצירת חשבון חדש`, `כניסה`). Style guide says buttons = imperative, but Israeli banking/gov UX convention uses noun form for auth CTAs specifically. Keep noun for auth, or normalize to imperative across the product? | (A) Keep noun on Login auth buttons; it's the Hebrew auth convention (`כניסה` / `הרשמה` are what Israelis expect on login screens). (B) Normalize to imperative (`היכנס עם Google`, `צור חשבון חדש`, `היכנס`) to match Save/Delete/Add elsewhere. My recommendation: **(A)**, with a carve-out in the style guide documenting "auth CTAs on Login/Signup are noun form by convention". | Login review |

---

## Untranslated English strings

Flagged, not silently translated. Confirm each is intentional (brand terms, technical labels) before localizing.

| Location | Current English | Context | Action |
|---|---|---|---|
| _pending discovery_ | | | |
