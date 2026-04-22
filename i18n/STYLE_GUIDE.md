# Estia — Hebrew Style Guide

_One-page reference for anyone writing Hebrew copy in this product. Copy-fit for a 15-minute read. See `GLOSSARY.md` for the canonical term list and `HEBREW_REVIEW.md` for per-string review notes._

---

## 🎯 Voice

We write like a **competent colleague**, not a government form.

- Modern Israeli Hebrew (עברית ישראלית מודרנית). No biblical register, no academic constructs, no 1960s textbook phrasing.
- Professional but warm. Helpful, respectful, confident. Not slangy, not jokey. No emojis unless the brand already ships them.
- Clear and direct. Short sentences. Strong verbs. No throat-clearing.
- Industry-native where appropriate. "ליד" (not "הפניה"), "נכס" (not "רכוש"), "עמלת תיווך" (not "עמלה על תיווך"). Speak the way the practitioners speak.

If the existing copy has a voice — even an inconsistent one — **normalize toward its strongest version**. Don't impose a fresh voice on a product that already has one.

---

## 📚 Grammar — imperative vs. infinitive vs. noun

The single most common source of UI inconsistency.

| Surface | Form | Examples |
|---|---|---|
| Buttons | Imperative, masc. sing. | `שמור`, `בטל`, `שלח`, `הוסף`, `מחק`, `ייבא`, `המשך`, `חזור` |
| Page titles & section headings | Noun | `הגדרות`, `לקוחות`, `דוחות`, `יומן פגישות` |
| Menu items | Noun | `לקוחות`, `נכסים`, `לידים`, `יומן` |
| Form field labels | Noun, short | `שם`, `טלפון`, `דוא״ל`, `כתובת` |
| Placeholders | Short hint, noun/phrase | `שם מלא` (not `הכנס את שמך המלא`) |
| Empty states | Full sentence, conversational | `עדיין לא הוספת לקוחות. אפשר להתחיל כאן.` |
| Toasts / confirmations | Full sentence, often past | `הלקוח נשמר בהצלחה`, `הפגישה נמחקה` |
| Errors | Cause + action, polite | `שמירת הלקוח נכשלה. אפשר לנסות שוב בעוד רגע.` |

Never mix: `שמירה` (noun) or `לשמור` (infinitive) on a button is wrong. `הצג לקוחות` as a menu item is wrong.

---

## 👤 Gender

Hebrew is heavily gendered. Modern tech products solve this in three ways, in order of preference:

1. **Gender-neutral phrasing.** Use nouns instead of user-addressing verbs — `הוספת לקוח` (not `הוסף לקוח שלך`). Use passive / impersonal — `הלקוח נוסף בהצלחה`. Use **"אפשר ל..."** — `אפשר לערוך את הפרטים כאן`.
2. **Masculine singular** when gendered form is unavoidable. Israeli tech standard; not ideal but accepted.
3. **Avoid `/` dual forms** in body copy — `הוסף/י לקוח חדש` is visually ugly and reads badly. Prefer the noun form: `הוספת לקוח חדש`.

Exception: signup/profile pages where the user explicitly provides gender — use their stated gender from that point on.

---

## 📚 Terminology — the short list

Full list in `GLOSSARY.md`. The ones that drift most often:

| Concept | ✅ Use | ❌ Avoid |
|---|---|---|
| Property | נכס | רכוש, נדל״ן (as noun — נדל״ן is the industry) |
| Apartment (residential) | דירה | — |
| Listing | נכס (internal) / מודעה (public) | — |
| Client | לקוח | קליינט, צרכן |
| Lead | ליד | הפניה, פניה |
| Agent / broker | מתווך / סוכן | — |
| Brokerage commission | עמלת תיווך | עמלה |
| Lawyer fees | שכר טרחת עו״ד | תשלום לעורך דין |
| Meeting (client-facing) | פגישה | מפגש, ישיבה |
| Viewing / showing | סיור / ביקור בנכס | תצפית |
| Neighborhood | שכונה | אזור (broader regions only) |
| Asking price | מחיר מבוקש | מחיר דרוש |
| Import (data) | ייבוא | העלאה (= file upload only) |
| Save | שמור (btn) / שמירה (noun/title) | — |
| Cancel | בטל (btn) / ביטול (state/title) | — |
| Delete | מחק / מחיקה | הסר (= remove from a list, different meaning) |

---

## ✍️ Punctuation

- **Gershayim** (`״`): abbreviations — `עו״ד`, `ת״ד`, `דוא״ל`, `ת.ז.` (periods preserved for ת.ז. by convention).
- **Geresh** (`׳`): foreign-letter approximations — `ג׳ורג׳`, `צ׳אט`.
- **Quotes**: `"..."` or `„..."` for quoted strings. Never ASCII straight quotes inside abbreviations.
- **End marks** (`.` `?` `!` `,`): same as English. Logically at the end of the sentence; render at the visual-left due to RTL — don't fight it.
- **Numbers / Latin**: LTR within RTL. The app's RTL handling deals with this. Don't insert Unicode bidi marks.
- **Currency**: `₪ 1,200` OR `1,200 ₪` — pick one per product and stick. **Convention in this product: `₪ 1,200,000`** (symbol first, thin space, en-US commas).
- **Phone numbers**: always LTR — `050-123-4567`, `+972-50-123-4567`. Never interrupted by Hebrew mid-number.
- **Dates**: `DD/MM/YYYY`. Long form `15 ביוני 2025` acceptable in email/notifications.
- **Time**: 24-hour `14:30`.

---

## 🔡 Spelling — ktiv male (כתיב מלא)

Use full spelling with יו"דים and וָאווים. Consistent across the product.

- ✅ `תיווך`, `יומן`, `פגישות`, `אפליקציה`, `מודעה`, `סיור`
- ❌ `תווך`, `ימן`, `מדעה` — ktiv haser reads as archaic.

Exceptions: legal-form terms (`עו״ד`).

---

## 🌍 Loanwords

**Accepted loanwords (keep them).** These are industry-standard and natural to the user:

`ליד` · `אפליקציה` · `סטטוס` · `פרופיל` · `אופציה` · `צ׳אט` · `אקסל` · `וואטסאפ` · `אימייל` / `דוא״ל` (both fine; `דוא״ל` more formal)

**Prefer Hebrew.** These loanwords read as lazy:

| ❌ Loanword | ✅ Hebrew |
|---|---|
| דליט | מחיקה / מחק |
| סייב | שמירה / שמור |
| אדיט | עריכה / ערוך |
| יוזר | משתמש |
| סטינגס | הגדרות |

**The test:** if an Israeli grandmother would say "what?" — use the Hebrew. If a realtor cousin uses it unconsciously — the loanword is fine.

---

## 🚫 Tone traps

- **Government-ese** — ❌ `נא להזין את פרטיך` → ✅ `אפשר להזין את הפרטים כאן` (or just the field label).
- **English calques** — ❌ `אני מקווה שיום טוב` → ✅ `שלום!` or nothing.
- **Over-politeness** — ❌ `אנא אשר את פעולתך` → ✅ `לאשר?` / `אישור`.
- **Technical leak** — ❌ `כשל באימות הטוקן` → ✅ `ההתחברות נכשלה. אפשר לנסות שוב.`
- **Hebrew-English mashup** — ❌ `Save את השינויים` → ✅ `שמור את השינויים` / `שמירת השינויים`.
- **No shouting** — Hebrew has no uppercase but don't shout with `!!!`.

---

## 📏 UI length

Hebrew is usually more compact word-for-word, more verbose when forced to be polite. Limits per surface:

| Surface | Max |
|---|---|
| Buttons | 1–3 words, prefer single-word imperative |
| Menu items | 1–2 words |
| Table column headers | 1–2 words |
| Tab labels | 1–2 words |
| Toast notifications | One short sentence |
| Tooltips | One sentence, preferably a fragment |
| Empty state body | 1–2 short sentences + one CTA |
| Error messages | 1 sentence cause + 1 sentence action, max |

When copy can't be shortened without losing meaning, **flag the UI** (the fix is often a wider container, not shorter copy).

---

## 🔤 RTL — what belongs to the linguist

I do NOT fix layout/RTL rendering. I flag:

- Hebrew text rendered LTR-aligned when it should be RTL
- Phone numbers, currency, dates scrambled inside Hebrew sentences
- Icons on the wrong side of a label (a chevron `←` should be `→` in RTL)
- Mirrored components that shouldn't mirror (logos, clocks, signature canvases)
- Mixed Hebrew + English where the ordering breaks down

Log these in `RTL_BUGS.md`. Engineering fixes, I verify.

---

## 🛠️ Workflow for every string

1. **Find it** — in the translation file or hardcoded in the component.
2. **Understand the context** — what did the user just click? What does the feature do?
3. **Read the current Hebrew** — note what's wrong (tone, grammar, terminology, register, length).
4. **Propose the replacement** — follow the standards above.
5. **Check consistency** — does the same concept appear elsewhere? Match.
6. **Check length** — will the new text fit? If unsure, flag.
7. **Log it** in `HEBREW_REVIEW.md` with old → new, reason, status.
8. **Make the edit** — string value only. Never touch keys, identifiers, test IDs, URL slugs.

### Per-feature checklist

When reviewing a whole feature, walk it in this order:

1. Feature name (menu / nav / page title)
2. Page title + subtitle
3. Tab labels
4. Section headings
5. Table column headers
6. Form field labels + placeholders
7. Validation / inline error messages
8. Buttons (primary / secondary / destructive)
9. Links
10. Tooltips
11. Empty states
12. Loading states (if they have text)
13. Success/error toasts
14. Confirmation dialogs (title + body + buttons)
15. Notifications (email / push / SMS)
16. Help text / microcopy

Partial feature reviews are worse than none — they create inconsistency within the same feature.

---

## ✅ Priority order

1. **High-visibility surfaces** — main nav, dashboard, login/signup, top 3 features.
2. **Transactional surfaces** — forms users submit often (customer create, asset create, meeting schedule), error messages they actually see.
3. **Admin / settings surfaces** — less-traveled but they set the "this product respects the professional" tone.
4. **Email / SMS / push templates** — they leave the product; mistakes travel further.
5. **Legal / policy copy** — last; flag issues, don't unilaterally rewrite.

---

## 🗣️ Communication rules

- **Ask before changing** anything where intent is unclear. A `שלח` button could mean "send message" or "submit form" — different verbs.
- **Propose, then apply** for anything beyond a typo. Feature names especially have product-decision weight.
- **Don't rename features unilaterally.** `לקוחות` → `אנשי קשר` is a product decision, not a copy decision. Flag.
- **Explain reasoning in commit messages.** `copy(he): normalize button imperatives across forms` beats `copy edit`.
- **Disagree once, clearly, then defer.** I'm the expert voice; the team owns the product.
- **Flag untranslated English in the UI, don't translate silently.** Sometimes English is intentional (brand terms, technical labels).

---

## The standard

The finished product should read like it was **written in Hebrew first, by someone who respects the reader and knows real-estate**. Not translated. Not mechanical. Not over-formal. Not chatty. Just right.

If someone opens the app and the copy disappears into the experience — they don't notice the language, they just use the product — the job is done.
