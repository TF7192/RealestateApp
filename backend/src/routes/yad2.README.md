# Yad2 import — POC

Imports an agent's existing Yad2 listings into Estia. Beta / behind a feature flag.

## How it works

1. Agent pastes a Yad2 listings-page URL (their agent / user profile page).
2. `POST /api/integrations/yad2/preview { url }` — server fetches the page once with a respectful User-Agent, parses listings out of the inline `__NEXT_DATA__` JSON (preferred) or falls back to a small DOM extractor. **No DB writes.**
3. Frontend shows a review screen: extracted listings as cards, agent confirms which to import.
4. `POST /api/integrations/yad2/import { listings }` — creates `Property` rows for each picked listing. **Idempotent per Yad2 sourceId** via a `[yad2:<id>]` marker stored in `notes` (POC shortcut — no schema migration).

## Feature flag

```
FEATURE_YAD2_IMPORT=true
```

Off by default. With the flag off, both endpoints return 404. UI hides the entry button.

## Limitations (real)

- **Hot-linked images.** The POC stores Yad2's image URLs directly. If Yad2 changes their CDN paths or blocks hot-linking, the imported property's photos break. A real version would download + re-upload to `/uploads/`.
- **No owner contact.** Yad2 listings rarely expose phone numbers in the public page. We seed `owner: 'בעלים מ-Yad2'`, `ownerPhone: ''` and let the agent fill them in.
- **Defaults assumed.** `assetClass=RESIDENTIAL`, `category=SALE`, `type=דירה`. The agent edits in the review screen if the listing is rent / commercial / non-apartment.
- **Parser fragility.** Yad2's `__NEXT_DATA__` shape will change at some point. When it does, the parser logs a 600-char excerpt of the raw HTML so you can update the selectors. Search server logs for `yad2 parser returned 0 listings`.
- **Single-page only.** No pagination — only what's on the URL the agent pasted.

## Updating selectors when Yad2 changes

1. Save a copy of a current Yad2 listings page HTML to `backend/test-fixtures/yad2/<date>.html`.
2. Update `walkForListings()` heuristics in `routes/yad2.ts` to match the new shape.
3. Add the fixture to the test suite (whenever a test runner is wired into the repo — currently no Jest/Vitest harness).

## Legal / ToS

Yad2's Terms of Service prohibit automated scraping in some readings. This POC:
- Fetches only on user action (paste-URL → click "preview"), not in the background.
- Respects a polite User-Agent identifying the app + a contact email.
- Caps results, doesn't re-fetch on schedule, doesn't crawl across pages.
- Stores data the agent themselves authored on Yad2.

If Yad2 objects, the path forward is OAuth / a partner API. Until then, treat this as a "convenience for the agent who's already willing to manually enter their own data".
