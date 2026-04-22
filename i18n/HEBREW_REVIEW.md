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
| Main navigation (`Layout.jsx` + `MobileTabBar.jsx` + `MobileMoreSheet.jsx`) | 76 | 72 | 4 | 0 |
| Dashboard | 30 | 25 | 5 | 0 |
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

### Main navigation (`frontend/src/components/Layout.jsx` + `MobileTabBar.jsx` + `MobileMoreSheet.jsx`)

#### `Layout.jsx`

| Location | Key / ID | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|---|
| L50–57 | menu items | `לוח בקרה` · `נכסים` · `בעלי נכסים` · `לקוחות` · `עסקאות` · `העברות` · `תבניות הודעה` · `מחשבון מוכר` | (no change) | approved | Noun form, matches glossary, 1–2 words each. |
| L58 | menu item | `ייבוא מ-Yad2` | (no change) | approved | Hyphen-before-Latin is a legitimate Hebrew tech convention. |
| L62–63 | quick action buttons | `נכס חדש` · `ליד חדש` | (no change) | approved | Noun-phrase labels. |
| L67, L394 | section header | `כלי ניהול` | (no change) | approved | |
| L70–73 | mgmt items | `דוחות` · `פעילות` · `תזכורות` · `ניהול תגיות` | (no change) | approved | |
| L80–84 | page back-title hints | `נכס חדש` · `פרטי נכס` · `ליד חדש` · `בעל נכס` · `הפרופיל שלי` | (no change) | approved | Noun titles. |
| L89–96 | breadcrumb titles | `לוח בקרה` · `נכסים` · `בעלי נכסים` · `לקוחות` · `עסקאות` · `העברות` · `תבניות הודעה` · `הפרופיל` | (no change) | approved | `הפרופיל` (short breadcrumb) vs `הפרופיל שלי` (back-target) intentional per context. |
| L149–156 | fallbacks | `נכס` · `ליד` · `בעל נכס` | (no change) | approved | |
| L263 | aria-label | `חזרה` | (no change) | approved | aria-label can stay noun form (describes what the button navigates to). |
| L290 | aria-label | `חיפוש` | (no change) | approved | |
| L309 | aria-label | `צ׳אט עם המפתחים` | (no change) | approved | |
| L318 | aria-label | `חשבון` | (no change) | approved | |
| L341 | tagline | `ניהול נכסים ולידים` | (no change) | approved | |
| L355–356 | tooltip / aria | `הרחב סרגל` · `כווץ סרגל` | (no change) | approved | Imperative OK for action buttons. |
| L363 | nav section | `ניווט ראשי` | (no change) | approved | |
| L412, 419 | menu + data-label | `משרד` | (no change) | approved | Short, clear. |
| L431 | nav section | `המועדפים` | (no change) | approved | |
| L451 | nav section | `פעולות מהירות` | (no change) | approved | |
| L468 | tooltip | `העתק קישור שיתוף לקטלוג האישי` | (no change) | approved | |
| L471 | button | `שיתוף הקטלוג שלי` / `הקישור הועתק` | (no change) | approved | First-person possessive intentional for a personal-share action. |
| L481 | tooltip | `מרכז שיחות אדמין` | (no change) | approved | `אדמין` loanword accepted in product. |
| L492 | tooltip | `משתמשים — לוח אדמין` | (no change) | approved | |
| L506 | tooltip | `מעבר למצב כהה` / `מעבר למצב בהיר` | (no change) | approved | Noun form reads cleanly on a state-toggle tooltip. |
| L509 | button | `מצב כהה` / `מצב בהיר` | (no change) | approved | State label. |
| L513, 520 | avatar fallback | `סוכן` | (no change) | approved | See Open Question §3 (gender-default). |
| L522 | subtitle fallback | `ערוך את הפרופיל שלך` | `הוסף פרטי משרד` | applied | Previous form was imperative-masc-sing + redundant (`את הפרופיל שלך`). New form is a noun phrase that explicitly tells the user what's missing (their agency) — more useful and gender-neutral. |
| L533 | tooltip | `צור קשר עם התמיכה` | `פנייה לתמיכה` | applied | Shorter, gender-neutral, idiomatic Hebrew tooltip register (noun form). |
| L537 | link | `עזרה` | (no change) | approved | |
| L541 | button | `יציאה` | (no change) | approved | Noun form standard for logout buttons in Israeli tech (matches `כניסה`/`הרשמה` pattern). |

#### `MobileTabBar.jsx`

| Location | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|
| L30–35 | `נכסים` · `לקוחות` · `בעלים` · `מחשבון` | (no change) | approved | Tab labels ≤2 words. |
| L57 | `ניווט ראשי` | (no change) | approved | |
| L75 | `תפריט הוספה / קיצורים` | (no change) | approved | `/` acceptable in compact aria-label. |
| L79 | `עוד` | (no change) | approved | |
| L100 | `מה לעשות?` | (no change) | approved | Warm, conversational sheet heading. |
| L105–106 | `נכס חדש` / `קליטת נכס לשיווק` | (no change) | approved | |
| L114–115 | `ליד חדש` / `הוספת לקוח פוטנציאלי` | (no change) | approved | |
| L123–124 | `עסקאות` / `כל העסקאות הפתוחות והסגורות` | (no change) | approved | |
| L132 | `דשבורד` | `לוח בקרה` | applied | Loanword `דשבורד` conflicted with the rest of the product (sidebar + breadcrumb use `לוח בקרה`). Normalized per glossary. |
| L133 | `מבט-על על היום והשבוע` | (no change) | approved | Idiomatic. |
| L140 | `ביטול` | (no change) | approved | |

#### `MobileMoreSheet.jsx`

| Location | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|
| L105 | `סוכן` | (no change) | approved | Avatar placeholder fallback. See Open Question §3. |
| L106 | `עריכת פרופיל` | (no change) | approved | Noun form. |
| L117–143 | mgmt rows (reports/activity/reminders/tags/office) strong+small | (no change) | approved | Consistent with sidebar; `המשרד שלי` possessive matches desktop. |
| L150–151 | `שיתוף הקטלוג שלי` / `העתק לשיתוף בוואטסאפ` / `הקישור הועתק` | (no change) | approved | |
| L162–172 | admin rows | (no change) | approved | |
| L182–208 | quick-access rows (search / new lead / property / owners / transfers / templates) | (no change) | approved | |
| L217–218 | `מחשבון מוכר` / `חישוב נטו לבעלים אחרי עמלות ומע״מ` | `חישוב נטו למוכר אחרי עמלות ומע״מ` | applied | `לבעלים` (owners, plural) was ambiguous — calculator computes net for the **seller**. Glossary term `מוכר` is the precise industry word. |
| L225 | `ייבוא נכסים מ-Yad2` | (no change) | approved | Unambiguous — kept the `נכסים` qualifier that desktop nav omits because mobile context needs it. |
| L226 | `סריקת הסוכנות + תמונות בלחיצה` | `סריקת מודעות הסוכנות + תמונות בלחיצה` | applied | `סריקת הסוכנות` was literally "scanning the agency" which reads as odd — the feature scans the agency's Yad2 **listings**. Added `מודעות` for precision. |
| L238–239 | `מצב כהה` / `מצב בהיר` / `מעבר בין ערכות הצבעים` | (no change) | approved | |
| L247 | `הפרופיל שלי` / `פרטים, תמונה, ביוגרפיה` | (no change) | approved | |
| L255 | `יציאה` | (no change) | approved | |
| L259 | `Estia · גרסה לאייפון` | (no change) | approved | Platform hint; fine. |

### Dashboard (`frontend/src/pages/Dashboard.jsx`)

| Location | Current Hebrew | Proposed Hebrew | Status | Notes |
|---|---|---|---|---|
| L38 | `PERIOD_LABEL` (`השבוע`/`החודש`/`הרבעון`) | (no change) | approved | Delta-badge period labels. |
| L40–42 | period options (`שבוע`/`חודש`/`רבעון`) | (no change) | approved | Segmented-control options. |
| L159 | stat label | `נכסי מגורים פעילים` | (no change) | approved | |
| L169 | stat label | `נכסים מסחריים פעילים` | (no change) | approved | |
| L179 | stat label | `לידים חמים` | (no change) | approved | Industry term. |
| L189 | stat label | `עסקאות פעילות` | (no change) | approved | |
| L199–201 | stat label + sub | `עמלות` / `סה״כ עמלות שנגבו` | (no change) | approved | Abbreviation `סה״כ` is correct gershayim form. |
| L211 | stat label | `בעלי נכסים` | (no change) | approved | |
| L241 | control label | `שנה תקופה` | (no change) | approved | Imperative OK on a segmented-control trigger. |
| L246 | aria-label | `בחר תקופה להשוואה` | (no change) | approved | |
| L287–288 | tile | `תבניות הודעה` / `התאם את ההודעות שיישלחו מהנכסים` | description → `התאמת ההודעות שיישלחו מהנכסים` | applied | Description text switched from masc-sing imperative (`התאם`) to noun form; tile strong label stays. Gender-neutral, matches body-copy pattern. |
| L297 | empty-state heading | `ברוך הבא ל-Estia` | `ברוכים הבאים ל-Estia` | applied | `ברוך הבא` is masc-sing; `ברוכים הבאים` is plural-neutral — the canonical gender-inclusive Hebrew greeting. |
| L298 | empty-state body | `עוד אין לך נתונים. התחל בקליטת הנכס הראשון שלך או הוסף ליד חדש.` | `עדיין אין נתונים. אפשר להתחיל בקליטת נכס ראשון או להוסיף ליד חדש.` | applied | Three fixes: (1) word order `עוד אין` → `עדיין אין` (modern Hebrew preference); (2) dropped `לך` + `שלך` possessives to gender-neutralize; (3) switched imperatives `התחל`/`הוסף` to the `אפשר ל...` pattern per style guide. |
| L313 | section heading | `התקדמות שיווק` | (no change) | approved | |
| L363 | inline empty state | `אין עדיין נכסים. הוסף ראשון` | `עדיין אין נכסים. הוסף ראשון` | applied | Word-order fix; `אין עדיין` flipped to `עדיין אין` (cleaner, matches the empty-state heading and all other occurrences). Imperative `הוסף` on the link stays (acceptable for inline-link CTAs). |
| L371, 407 | section + empty | `לידים חמים` / `אין לידים חמים כרגע. הוסף ליד` | (no change) | approved | Clean. |
| L422 | default prop | `השבוע` | (no change) | approved | |
| L536 | tile title (interp) | `{N} לידים חמים ממתינים` | (no change) | approved | |
| L537 | tile sub | `עוד לא נוצר קשר היום` | (no change) | approved | Warm, passive, neutral. |
| L546–547 | tile | `{N} לידים ללא קשר 10+ ימים` / `שווה לחזור אליהם` | (no change) | approved | Conversational; great Hebrew. |
| L556–557 | tile | `{N} נכסים ללא שיווק` / `התחל עם פעולה אחת` | (no change) | approved | Imperative on a tile-sub CTA acceptable. |
| L567, 586 | aria-label | `סדר היום` | (no change) | approved | |
| L570, 589 | heading | `היום` | (no change) | approved | |
| L576 | all-clear title | `הכל מסודר להיום` | (no change) | approved | Warm, affirming. |
| L577 | all-clear sub | `אין לידים חמים ממתינים · אין נכסים ללא שיווק` | `אין לידים חמים ממתינים · כל הנכסים בשיווק` | applied | Dropped the double-negation (`אין... · אין...`) for a positive framing on the second clause. Semantically identical (both imply zero unmarketed properties). Reads much warmer. |
| L619 | fallback | `סוכן` | (no change) | approved | See Open Question §3. |
| L629–630, 633 | share-template | `שלום, זה {name}.` / `ריכזתי עבורך את כל הנכסים שלי במקום אחד:` / `הקטלוג שלי` | (no change) | approved | First-person share template written by the agent — first-person `שלי` is correct voice. |
| L648 | greeting | `שלום, {firstName}` | (no change) | approved | |
| L649 | subtitle | `סיכום פעילות יומי` | (no change) | approved | |
| L656 | tooltip | `תצוגה מקדימה ושיתוף` | (no change) | approved | |

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
| 3 | `Layout.jsx:L513`, `L520`, `MobileMoreSheet.jsx:L105`, `Dashboard.jsx:L619` | Avatar/name fallback when `displayName` is absent defaults to `סוכן` (masc. singular). The product otherwise is careful about gender-neutral phrasing. Should the fallback be gender-neutral? | (A) Keep `סוכן` — Israeli tech default, the fallback is rare (only fires pre-profile-complete), readability matters more than inclusivity for one-word placeholder. (B) Use `המשתמש/ת` — explicit neutrality but awkward. (C) Use `חשבון` or `הפרופיל` — shifts the reference from person to concept and sidesteps gender entirely. My recommendation: **(A)** for avatars where it's a rare pre-onboarding placeholder; **(C)** anywhere a full sentence wraps it. | Nav + Dashboard review |

---

## Untranslated English strings

Flagged, not silently translated. Confirm each is intentional (brand terms, technical labels) before localizing.

| Location | Current English | Context | Action |
|---|---|---|---|
| _pending discovery_ | | | |
