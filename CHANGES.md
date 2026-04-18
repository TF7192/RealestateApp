# CHANGES — UI/UX Fixes + New Features

Covers tasks T1–T11 from the full-stack implementation request.

All commits on `main`, each prefixed with its task number. Migrations run automatically on deploy via the CI/CD workflow's `prisma migrate deploy` step.

---

## T1 — iPhone: asset header buttons no longer crowd the rail
**Commit:** `T1: stop overflow/similar buttons from crowding the asset rail`

The overflow (⋯) button and the "חפש דומים" pill were pinned with `left: 4px` / `left: 36px` — the **same visual side** as the call/WA/nav rail in RTL, so the two overlapped at the rail's top corner.

Fix in `frontend/src/pages/Properties.css` — switched both to logical positioning (`inset-inline-start`) so they attach to the card's logical start (visual right in RTL, opposite the rail). Tap target bumped to 36×36, frosted-glass backdrop so the controls read cleanly when they sit over the thumb corner.

## T2 — "ללא הגבלה" overflow on the add-lead price range
**Commit:** `T2: stop PriceRange overflow on 375px iPhones`

Grid cells defaulted to `min-content`, so the Hebrew placeholder "ללא הגבלה" could push the row wider than its container on 375px screens.

Fix in `frontend/src/components/SmartFields.css` (`.sf-range` / `.sf-range-pair` / `.sf-range-cell`) — `minmax(0, 1fr)` + `min-width: 0` + `overflow: hidden` on the cells so the grid shrinks to the parent's available width.

## T3 — No bounce on an assets list with a single item
**Commit:** `T3: no overscroll bounce on Properties when list has ≤1 asset`

Toggle `document.body.style.overscrollBehaviorY = 'none'` while the Properties page has ≤1 asset, restore on unmount. PullRefresh is JS-driven, so it still works.

## T4 — iPhone full-screen template editor
**Commit:** `T4: iPhone-only full-screen template editor`

Editing long templates in the ~150px inline ChipEditor on iPhone was cramped. New "מסך מלא" link in the editor header (mobile only) opens a Portal modal with:

- `100dvh` container so iOS subtracts toolbar + keyboard correctly
- 17px font (iOS won't auto-zoom on focus)
- `60dvh` min-height editor area
- Field chips pinned above the keyboard
- Safe-area insets for notch + home indicator
- `onMouseDown preventDefault` on chips preserves caret + selection

## T5 — Share to Instagram Story (iPhone)
**Commit:** `T5: 'Share to Instagram Story' on iPhone`

New `frontend/src/native/storyComposer.js` renders the property's cover photo + caption into a 1080×1920 PNG via Canvas — backdrop photo, gold hairline card, right-aligned Hebrew text, Estia watermark. Font-steps down if the caption is too tall.

`native/share.js` adds `shareToInstagramStory()`: compose → write to Filesystem cache → `Share.share` with the file. User picks Instagram from the sheet and lands in Story composer with the image attached. Web fallback downloads the PNG. Install-less iOS fallback saves to camera roll + toast.

PropertyDetail shows a new Instagram-gradient "סטורי" button, **native only**. Web hides it.

**Why not `instagram-stories://share` directly:** Instagram's typed-pasteboard handoff requires a native UIPasteboard plugin (Capacitor's Clipboard plugin only does text). The `Share.share` route works today with zero native additions.

## T6 — Faster tab/nav switching on desktop
**Commit:** `T6: smoother tab/nav switching on desktop`

- Scoped `.nav-item` + `.filter-tab` transitions to `background-color` / `color` only. The previous `transition: all 0.2s` was running layout on padding/border/font-weight every hover.
- Added `content-visibility: auto` on `.customer-card` / `.owner-card` / `.property-card` (desktop only) so the browser skips rendering offscreen cards — tab clicks repaint ~20 visible ones instead of every card.
- Respects `prefers-reduced-motion`: nav/tab/panel transitions are fully disabled for that preference.

## T7 — PropertyPanelSheet no longer hidden behind the sidebar
**Commit:** `T7: PropertyPanelSheet no longer sits under the sidebar`

Root cause: `.pps-backdrop` was z-index **80**, below `.sidebar`'s **100**. The panel docked to the visual right — same edge as the sidebar — so the sidebar painted on top.

Fix in `frontend/src/components/PropertyPanelSheet.css` — z-index lifted to 1100 (above sidebar on every viewport). Redesigned per instruction: desktop centers the panel in the content area with a blurred backdrop + rounded card + rise animation. Mobile stays as a bottom sheet.

## T8 — Customer-facing page redesign
**Commit:** `T8: customer-facing page redesign — editorial, premium, full-data`

Full rebuild of `/agents/:slug/:propertySlug` (+ legacy `/p/:id`):

- Hero: 16:10 cover with overlaid gradient, chips (למכירה/השכרה, type, neighborhood), title, price
- Headline stats (חדרים, מ״ר, קומה, גיל הבניין)
- "מה כלול" shows only present amenities — no binary ✓/✗
- "פרטי הנכס" surfaces the new schema fields: שכונה, שטח בטאבו, ארנונה, ועד בית, commercial gross/net + buildState + workstations, parking/storage breakdowns
- Map card adds Waze alongside Google Maps
- Desktop: sticky contact card with WA + tel CTAs + price reminder
- Mobile: fixed bottom bar, safe-area insets, `100dvh` page
- Image lightbox with keyboard nav
- Shimmer skeleton instead of spinner
- `useEffect` writes OG + Twitter meta tags for WhatsApp/Twitter link previews
- CSS rewrite on the existing token system (one design language with the agent console)

Known follow-ups: blurhash placeholders (needs server-side encode), Lighthouse measurement after deploy.

## T9 — iPhone UX audit + polish pass

### Audit summary (screen by screen)

| Screen | Findings | Severity | Status |
|---|---|---|---|
| Login | Already uses safe-area insets + dvh in `login-page`; tap targets OK | — | ✅ no action |
| Dashboard | 6 KPI tiles + recent lists; empty-card flicker fixed in earlier commit (`useDelayedFlag(220)`) | — | ✅ no action |
| Properties list | Header button crowding (T1), single-item bounce (T3) | Med | ✅ fixed |
| Property detail | Card header crowding (earlier commit), panel-sheet z-index (T7), added IG-story share (T5) | Med | ✅ fixed |
| NewProperty / edit | Price-range overflow fixed separately for lead form; edit-save bug fixed (edit-mode sends full field union) | High | ✅ fixed in earlier session |
| Owners | Skeleton flicker fixed (`useDelayedFlag`); list is dense 64px row w/ swipe actions | — | ✅ no action |
| Customers | Skeleton flicker fixed; inline edit works w/ keyboard | — | ✅ no action |
| Templates | Cramped on iPhone | High | ✅ fixed (T4 full-screen editor) |
| Transfers | Skeleton flicker fixed; cards render fine at 375px | — | ✅ no action |
| Customer portal / Agent portal | Both get `100dvh` via the @supports rule | Low | ✅ fixed |
| iOS safe-area | Spot-check — all fixed bottom bars and modals use `env(safe-area-inset-bottom)` | — | ✅ ok |
| `100vh` jumps on iOS toolbar | Multiple screens used `min-height: 100vh` which jumps when Safari's toolbar animates | Med | ✅ fixed — progressive `@supports (height: 100dvh)` override in `index.css` |
| Reduced motion | Nav/tab/panel/fadeIn all respect `prefers-reduced-motion` via index.css | — | ✅ ok |

**Commit:** `T9: 100dvh progressive enhancement for key screens` (included in the T9 audit-doc commit)

No screen-specific regressions found that aren't already covered by T1–T8 plus the earlier-session fixes.

## T10 — First-login onboarding tour
**Commit:** `T10: first-login onboarding tour for agents (react-joyride)`

Backend (additive migration `20260418200000_add_tutorial_fields`):
- `User.hasCompletedTutorial BOOLEAN DEFAULT false`
- `User.firstLoginPlatform TEXT NULL`
- `GET /api/me` sets `firstLoginPlatform` on first call with `X-Estia-Platform` header
- `POST /api/me/tutorial/complete` flips the flag (idempotent)

Frontend:
- `api.js` forwards `X-Estia-Platform` (web | ios | android) on every call
- `components/OnboardingTour.jsx` — react-joyride wrapper, agent-only, runs only if `hasCompletedTutorial === false` AND `platform === firstLoginPlatform`
- 7 steps: welcome → Properties → Owners → Customers → Templates → Transfers → done. Hebrew locale (דלג / הבא / הקודם / סיימתי)
- Skip and Finish both POST `/tutorial/complete` so the tour never re-appears
- `Layout.jsx` sidebar NavLinks get `data-tour` anchors

## T11 — In-app chat + admin panel
**Commit:** `T11: in-app chat (users ↔ developer) + /admin/chats panel`

Data model (migration `20260418210000_add_chat`):
- `Conversation` (userId unique, status OPEN|ARCHIVED, lastMessageAt)
- `Message` (conversationId, senderId, senderRole, body, createdAt, readAt)
- Indexes: `Message(conversationId, createdAt)`, `Conversation(status, lastMessageAt)`

Backend (`backend/src/routes/chat.ts`):
- Admin identity via `ADMIN_EMAILS` env allowlist (default: `talfuks1234@gmail.com`)
- User REST:
  - `GET /api/chat/me` — get-or-create + last 200 messages
  - `POST /api/chat/me/messages` — send; 30 msg/min rate limit
  - `POST /api/chat/me/read`
- Admin REST (allowlist-gated):
  - `GET /api/chat/admin/conversations?filter=open|all|archived&search=`
  - `GET /api/chat/admin/conversations/:id`
  - `POST /api/chat/admin/conversations/:id/messages`
  - `POST /api/chat/admin/conversations/:id/read`
  - `POST /api/chat/admin/conversations/:id/archive` (+ `/unarchive`)
- WebSocket: `GET /api/chat/ws` via `@fastify/websocket`, same JWT-cookie auth. Single in-process broadcast hub pushes `message:new` + `message:read` events to the conversation owner + every admin socket
- `nginx.conf`: Upgrade/Connection headers added so WebSocket handshake proxies correctly

Frontend:
- `lib/api.js`: chat + admin endpoints
- `hooks/chat.js`: `useChat()` — REST fetch + WebSocket subscription + optimistic send + markRead
- `components/ChatWidget.jsx` + `.css`: floating 48×48 neutral button, subtle 9px gold unread dot (**no numbers, no pulse** per spec), slide-up 360×520 panel with welcome copy, bubble thread, Enter-to-send. Hidden for admin accounts. Dimmed while the onboarding tour is up (uses `:has(.react-joyride__spotlight)`).
- `pages/AdminChats.jsx` + `.css`: two-pane inbox at `/admin/chats`. Filter (open/all/archived) + search (name/email/body). Unread bubble to top with gold dot. Live updates via the same WebSocket. Archive/unarchive actions. Route component self-enforces the email allowlist and redirects non-admins.

**Known limitations (deferred to v2):**
- Text only (no attachments)
- No typing indicator (read receipts are in)
- In-process pub/sub — would need Redis if backend scales horizontally

---

## How to test

1. **Deploy.** CI/CD tag-push runs `prisma migrate deploy` automatically. Two new migrations apply (tutorial fields + chat tables).
2. **iOS app rebuild.** The new features include native changes (IG Story share needs `storyComposer` + `share.js`). `npx cap sync ios && npx cap open ios`, then Product → Run in Xcode.
3. Smoke tests:
   - On iPhone: open a property card → tap "סטורי" → Instagram opens with the composed image; check price range on /customers/new at 375px width; open a template on /templates and tap "מסך מלא"; click the chat floating button, send a message.
   - On desktop: navigate Properties → Owners → Customers — no empty-card flash; click a KPI tile on a property → panel opens centered, no sidebar overlap; sign in with a fresh agent account → tutorial starts; go to `/admin/chats` as `talfuks1234@gmail.com` → see the conversation created by your test session.
   - Share the customer URL (`/agents/<slug>/<propertySlug>`) on WhatsApp → preview card renders with cover photo + price.

## Deploy commands

Because the user explicitly requested a deploy at the end of this work batch, the recommended sequence is:

```bash
cd /Users/adam/RealestateApp
git push origin main
TAG=v$(date +%Y.%m.%d-%H%M) && git tag "$TAG" && git push origin "$TAG"
gh run watch "$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

iOS app (T5 adds `storyComposer` which is web-side, but a rebuild is advisable so the bundled web assets match the server):

```bash
cd frontend
npx cap sync ios
npx cap open ios  # then Product → Run in Xcode
```
