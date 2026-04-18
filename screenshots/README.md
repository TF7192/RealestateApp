# Screenshots

Phase 0 testing was done in Chrome DevTools emulation + macOS Safari + Xcode iOS 17 simulator — no real iPhone device. Emulated screenshots were not persisted because they add no information beyond the written findings.

If you want real device captures for the Ship list review, I can:
1. Script Playwright with `devices['iPhone 15']` to generate consistent before-shots of every flagged screen.
2. Record a 30-second screen capture of the worst offenders (PriceRange overflow regression check, 100vh jump on Login, gallery arrow size on CustomerPropertyView).

Say the word and I'll produce either.
