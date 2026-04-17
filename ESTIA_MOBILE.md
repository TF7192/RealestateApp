# Estia Mobile — Capacitor

A native iOS + Android wrapper for the Estia real-estate CRM, plus a fully
rebuilt mobile UI tuned for agents working in the field.

## What's on this branch

- `frontend/capacitor.config.json` — app id `com.estia.agent`, name "Estia",
  dark splash, Hebrew/RTL-aware.
- `frontend/ios/` — native Xcode project (open in Xcode).
- `frontend/android/` — native Android Studio project (open in Android Studio).
- `frontend/src/native/` — thin wrappers around Capacitor plugins
  (haptics, status bar, share sheet, preferences, geolocation) + URL
  builders for `tel:`, `sms:`, `whatsapp://`, `waze://`.
- `frontend/src/mobile/` — mobile-optimized UI layer. Bottom tab bar,
  floating quick-action FAB, swipe-to-call/WhatsApp/Navigate on every
  property and lead card, sticky action bars, bottom sheets for filters.
- `App.jsx` — detects platform (Capacitor native OR viewport ≤ 820px) and
  renders the mobile stack; falls back to the existing desktop stack on
  larger screens.

## Run locally (browser)

```
cd frontend
npm run dev        # Vite dev server, same as before
```

The mobile UI activates automatically when the viewport is ≤ 820px wide.
Open DevTools → responsive mode and pick iPhone 14 Pro to preview.

## Build for iOS

```
cd frontend
npm run cap:ios    # builds web assets, syncs to Xcode, opens Xcode
```

In Xcode:
1. Select the `App` scheme.
2. Signing & Capabilities → pick your team (Apple Developer Team ID `WV9WGBW3AG`).
3. Choose a device or simulator.
4. ▶ Run.

## Build for Android

```
cd frontend
npm run cap:android    # builds, syncs to Android Studio, opens it
```

In Android Studio, press ▶ to run on a device or emulator.

## Other scripts

| Script | What it does |
| --- | --- |
| `npm run cap:sync` | `vite build` + `cap sync` — refreshes native projects with latest web bundle + plugins |
| `npm run cap:run:ios` | Build, sync, and run on iOS simulator/device via CLI |
| `npm run cap:run:android` | Same, for Android |

## Mobile UX decisions (and why)

- **Bottom tab bar (5 slots)** instead of a drawer. Faster thumb
  navigation while the agent is on the phone with a client.
- **Floating "+" FAB** opens a quick-action sheet: new property, new
  lead, nearby properties, hot leads. Matches the agent's top intents
  without a third level of menu.
- **Swipe-left on any property card** reveals Call / WhatsApp / Navigate
  (Waze). Swipe-left on a lead card reveals Call / WhatsApp / SMS.
  These are the three things the agent will do 90% of the time.
- **Sticky action bar** on property detail: Navigate · Call owner ·
  Send to client via WhatsApp. Built specifically for the moment the
  agent is standing at the curb.
- **Filter sheet** with proximity search (street/city fuzzy-match +
  radius slider) and a "לידי" chip that requests the phone's current
  location via Capacitor Geolocation.
- **Haptics** on every tap, select, and success/error. Makes it feel
  native, not web.
- **StatusBar / SplashScreen** configured to Estia's dark palette
  (`#0d0f14`) with the gold diamond mark.
- **Preferences plugin** stores auth and recent searches — survives
  app kills, unlike localStorage in some WebView configs.

## Design language

Same as desktop (dark indigo-black `#0d0f14`, gold `#c9a96e`, Frank
Ruhl Libre display + Heebo body) but re-cut for thumb reach, with
bolder typography at the top of each screen and denser, information-
rich cards. Intentionally calm and professional rather than flashy —
matches Adam's "practical, not cheesy" constraint.

## Known follow-ups

- Real backend wiring for mobile new-lead/new-property (mock-only for now).
- Camera plugin for photo upload from the property form (UI is in place).
- Push notifications for new hot-lead alerts.
- Offline property cache (Preferences + mock data is in place; needs
  backend integration).
