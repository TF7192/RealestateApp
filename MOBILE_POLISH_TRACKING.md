# Mobile Polish — Implementation Tracking

Status legend:
- `pending` — not started
- `in-progress` — agent assigned
- `shipped` — code change applied + verified
- `committed` — also git-committed locally (no push)
- `deferred-needs-device` — requires iPhone hardware to verify
- `deferred-blocked` — needs human decision
- `skipped` — duplicates / out-of-scope

| ID | Severity | Area | File(s) | Status |
|---|---|---|---|---|
| IOS-1 | P0 | Native | Info.plist | committed (prior sweep) |
| IOS-2 | P0 | Native | Info.plist | committed (prior sweep) |
| IOS-3 | P0 | Native | PrivacyInfo.xcprivacy | deferred-blocked |
| IOS-4 | P0 | Native / App Review | App Store Connect notes | deferred-blocked |
| IOS-5 | P1 | Native | Info.plist:50 | shipped |
| IOS-6 | P1 | Native | SignInWithApplePlugin.swift | deferred-needs-device |
| IOS-7 | P2 | Native | Info.plist + capacitor.config.json | deferred-blocked |
| IOS-8 | P2 | Native | capacitor.config.json | skipped (Google rotates hosts) |
| IOS-9 | P2 | Native | AppIcon.appiconset | deferred-needs-device |
| IOS-10 | P2 | Native | capacitor.config.json | deferred-needs-device |
| GLOB-1 | P1 | Global CSS | index.css:88 | shipped |
| GLOB-2 | P1 | Global | scattered | deferred-blocked |
| GLOB-3 | P1 | Global ESLint | eslint.config.js | deferred-blocked |
| GLOB-4 | P1 | Global ESLint | eslint.config.js | deferred-blocked |
| GLOB-5 | P2 | Global CSS | ~25 files | shipped |
| GLOB-6 | P2 | Global JS | AddressField.css | shipped (via SF-2) |
| GLOB-7 | P2 | Global CSS | scattered | deferred-blocked |
| GLOB-8 | P2 | Global | index.css | deferred-needs-device |
| SHELL-1 | P0 | Layout | Layout.jsx:911, 979 | shipped |
| SHELL-2..8 | P1/P2 | Layout shell | various | deferred-needs-device |
| LOGIN-1 | P1 | /login | Login.jsx:245, 333 | shipped |
| LOGIN-2 | P1 | /login | Login.jsx:306 | shipped |
| LOGIN-3 | P1 | /login | Login.jsx:253 | shipped |
| LOGIN-4 | P2 | /login | Login.jsx:413 | shipped |
| FORGOT-1 | P1 | /forgot-password | ForgotPassword.jsx:53 | shipped |
| FORGOT-2 | P2 | /forgot-password | ForgotPassword.jsx:102 | shipped |
| RESET-1 | P1 | /reset-password | ResetPassword.jsx:59 | shipped |
| RESET-2 | P1 | /reset-password | ResetPassword.jsx:167 | shipped |
| RESET-3 | P2 | /reset-password | ResetPassword.jsx | shipped |
| CONTACT-1 | P1 | /contact | Contact.jsx:91 | shipped |
| CONTACT-2 | P1 | /contact | Contact.jsx:176 | shipped |
| CONTACT-3 | P2 | /contact | Contact.jsx:222 | shipped |
| CONTACT-4 | P2 | /contact | Contact.jsx:184 | already-satisfied |
| LEGAL-1 | P1 | /terms /privacy | landing/Landing.css `.lp-nav` | shipped |
| LEGAL-2 | P2 | /terms /privacy | LegalPage.css | already-satisfied (already sticky) |
| LEGAL-3 | P2 | /terms /privacy | LegalPage.css `.legal-h1` | shipped |
| AGENTP-1 | P1 | /agents/:slug | AgentPortal.css:477 | already-satisfied (28px existing) |
| AGENTP-2 | P1 | /agents/:slug | AgentPortal.jsx:212 | already-satisfied |
| AGENTP-3 | P1 | /agents/:slug | AgentPortal.css `.ap-contact-chip:focus-visible` | shipped |
| AGENTP-4 | P2 | /agents/:slug | AgentPortal.css `.ap-tabs` | shipped |
| AGENTP-5 | P2 | /agents/:slug | AgentPortal.css `.ap-search input` | shipped |
| CPV-1 | P0 | CustomerPropertyView | css | deferred-needs-device |
| CPV-2 | P1 | CustomerPropertyView | css:84 | shipped |
| CPV-3 | P1 | CustomerPropertyView | css | deferred-needs-device |
| CPV-4 | P1 | CustomerPropertyView | css `.cpv-counter` | shipped |
| CPV-5..6 | P2 | CustomerPropertyView | css | deferred-needs-device |
| PLP-1 | P0 | PropertyLandingPage | css `.lp-hero-arrows` | shipped |
| PLP-2 | P1 | PropertyLandingPage | css @media 600 | shipped |
| PLP-3 | P1 | PropertyLandingPage | css `.lp-form-heading` clamp | shipped |
| PLP-4 | P2 | PropertyLandingPage | css `.lp-eyebrow` | shipped |
| PLP-5 | P2 | PropertyLandingPage | css 100dvh | shipped |
| PLP-6 | P2 | PropertyLandingPage | css | deferred-needs-device |
| PROS-1 | P0 | ProspectSign | jsx + css | deferred-needs-device |
| PROS-2 | P1 | ProspectSign | css `.psn-cta:focus-visible` | shipped |
| PROS-3 | P2 | ProspectSign | css | deferred-blocked |
| PROS-4 | P2 | ProspectSign | jsx | deferred-needs-device |
| DASH-1 | P1 | /dashboard | Properties.css:98 (`.filter-dot`) | shipped |
| DASH-2 | P1 | /dashboard | Dashboard.css:527 | shipped |
| DASH-3 | P1 | /dashboard | Dashboard.css:621 | shipped |
| DASH-4 | P2 | /dashboard | Dashboard.jsx:226 | shipped |
| PROP-1 | P1 | /properties | Properties.css:413 | shipped |
| PROP-2 | P1 | /properties | Properties.css:784 | shipped |
| PROP-3 | P1 | /properties | Properties.css:602 | deferred-blocked |
| PROP-4 | P2 | /properties | Properties.css:609 | shipped |
| PROP-5 | P2 | /properties | Properties.css:1051 | not-applicable (no datalist) |
| NEWP-1 | P0 | /properties/new | NewProperty.jsx:1306 | shipped |
| NEWP-2 | P0 | /properties/new | NewProperty.jsx:1832 | deferred-needs-device |
| NEWP-3 | P0 | /properties/new | NewProperty.jsx:1824, 1833 | shipped |
| NEWP-4 | P1 | /properties/new | NewProperty.jsx:1057 | shipped |
| NEWP-5 | P1 | /properties/new | NewProperty.jsx:1701 | shipped |
| NEWP-6 | P1 | /properties/new | NewProperty.jsx:1882 | shipped |
| NEWP-7 | P2 | /properties/new | NewProperty.css:17 | shipped |
| PD-1 | P1 | /properties/:id | PropertyDetail.jsx | deferred-needs-device |
| PD-2 | P2 | /properties/:id | PropertyHero.css | deferred-needs-device |
| OWN-1 | P1 | /owners | Owners.jsx:194 | shipped |
| OWN-2 | P2 | /owners | Owners.jsx | deferred-blocked |
| CUST-1 | P1 | /customers | Customers.jsx:405 | already-satisfied |
| CUST-2 | P1 | /customers | Customers.css:286 | shipped |
| CUST-3 | P1 | /customers | LeadFiltersSheet.jsx | deferred-needs-device |
| CUST-4 | P2 | /customers | Customers.jsx | deferred-blocked |
| PROF-1 | P0 | /profile | Profile.jsx:199 | deferred-needs-device |
| PROF-2 | P0 | /profile | Profile.jsx:344 | not-applicable (no URL field) |
| PROF-3 | P1 | /profile | Profile.jsx:177 | shipped |
| PROF-4 | P1 | /profile | Profile.jsx:659 | deferred-needs-device |
| PROF-5 | P1 | /profile | Profile.jsx:532 | shipped |
| PROF-6 | P2 | /profile | Profile.jsx | deferred-needs-device |
| PROF-7 | P2 | /profile | Profile.jsx:384 | already-satisfied |
| AC-1 | P0 | /agent-card | AgentCard.jsx:339, 366 | already-satisfied |
| AC-2 | P1 | /agent-card | AgentCard.jsx:147 | deferred-needs-device |
| AC-3 | P1 | /agent-card | AgentCard.jsx:306 | shipped |
| AC-4 | P1 | /agent-card | AgentCard.jsx:122 | deferred-needs-device |
| AC-5 | P2 | /agent-card | AgentCard.jsx | deferred-needs-device |
| TRAN-1 | P0 | /transfers | Transfers.css:278 | shipped |
| TRAN-2 | P0 | /transfers | Transfers.jsx:43 | shipped |
| TRAN-3 | P1 | /transfers | Transfers.jsx:480 | shipped |
| TRAN-4 | P1 | /transfers | Transfers.jsx:392 | shipped |
| TRAN-5 | P2 | /transfers | Transfers.jsx | deferred-needs-device |
| TPL-1 | P0 | /templates | ChipEditor.jsx | deferred-needs-device |
| TPL-2 | P0 | /templates | Templates.css:689 | deferred-needs-device |
| TPL-3 | P1 | /templates | Templates.jsx:105 | deferred-needs-device |
| TPL-4 | P1 | /templates | Templates.css:484 | shipped |
| TPL-5 | P1 | /templates | Templates.css:1001 | shipped |
| TPL-6 | P1 | /templates | Templates.css:1394 | shipped |
| TPL-7 | P2 | /templates | Templates.css:288 | shipped |
| TPL-8 | P2 | /templates | Templates.css:432 | shipped |
| ADM-1 | P0 | /admin/chats | AdminChats.css:259 | shipped |
| ADM-2 | P0 | /admin/users | AdminUsers.jsx | deferred-needs-device |
| ADM-3 | P1 | /admin/chats | AdminChats.css | shipped |
| ADM-4 | P1 | /admin/users | AdminUsers.jsx | deferred-needs-device |
| CALC-1 | P1 | /calculator | SellerCalculator.css:68 | deferred-needs-device |
| CALC-2 | P1 | /calculator | MobileSellerCalculator | deferred-needs-device |
| CALC-3 | P2 | /calculator | SellerCalculator.css:362 | deferred-needs-device |
| CALC-4 | P2 | /calculator | SellerCalculator.css:358 | shipped |
| YAD-1 | P0 | /integrations/yad2 | Yad2Import.jsx | deferred-needs-device |
| YAD-2 | P0 | /integrations/yad2 | Yad2Import.jsx | deferred-needs-device |
| YAD-3 | P0 | /integrations/yad2 | Yad2Import.jsx:309 | already-satisfied |
| YAD-4 | P1 | /integrations/yad2 | Yad2Import.jsx:370 | shipped |
| YAD-5 | P1 | /integrations/yad2 | Yad2Import.jsx | deferred-blocked |
| YAD-6 | P2 | /integrations/yad2 | Yad2Import.jsx:613 | shipped |
| YAD-7 | P2 | /integrations/yad2 | Yad2Import.jsx | already-satisfied |
| IMP-1..2 | P0 | /import | Import.jsx | deferred-needs-device |
| IMP-3 | P1 | /import | ImportPicker.css:53 | shipped |
| IMP-4 | P1 | /import | ImportPicker.css:86 | shipped |
| IMP-5 | P2 | /import | Import.jsx | deferred-needs-device |
| VD-1 | P1 | /voice-demo | VoiceDemo.jsx + useMediaRecorder.js | (covered by VC-1, agent 6) |
| VD-2 | P1 | /voice-demo | VoiceDemo.jsx:74 | shipped |
| VD-3 | P2 | /voice-demo | VoiceDemo.jsx | deferred-needs-device |
| VD-4 | P2 | /voice-demo | VoiceDemo.jsx:86 | shipped |
| REP-1 | P0 | /reports | Reports.jsx:549 | shipped |
| REP-2 | P0 | /reports | DateRangePicker.jsx | deferred-needs-device |
| REP-3 | P1 | /reports | Reports.jsx:258 | deferred-needs-device |
| REP-4 | P1 | /reports | Reports.jsx:421 | already-satisfied |
| REP-5 | P2 | /reports | Reports.jsx:189 | deferred-needs-device |
| ACT-1 | P1 | /activity | ActivityLog.jsx:519 | deferred-blocked |
| ACT-2 | P1 | /activity | ActivityLog.jsx:279 | shipped |
| REM-1 | P0 | /reminders | Reminders.jsx | already-satisfied (global :focus-visible) |
| REM-2 | P0 | /reminders | Reminders.jsx:660, 685 | shipped |
| REM-3 | P0 | /reminders | Reminders.jsx:286 | shipped |
| REM-4 | P1 | /reminders | Reminders.jsx:338 | deferred-needs-device |
| REM-5 | P2 | /reminders | Reminders.jsx:298 | shipped |
| PUB-1 | P0 | /public-matches | PublicMatches.jsx:918 | deferred-blocked |
| PUB-2 | P0 | /public-matches | PublicMatches.jsx:405 | shipped |
| PUB-3 | P0 | /public-matches | PublicMatches.jsx:511 | shipped |
| PUB-4 | P1 | /public-matches | PublicMatches.jsx:287 | shipped |
| PUB-5 | P1 | /public-matches | PublicMatches.jsx:419 | shipped |
| PUB-6 | P1 | /public-matches | PublicMatches.jsx:166 | shipped |
| DOC-1 | P0 | /documents | Documents.jsx:367 | already-satisfied |
| DOC-2 | P0 | /documents | Documents.jsx | deferred-needs-device |
| DOC-3 | P1 | /documents | Documents.jsx:209 | shipped |
| DOC-4 | P1 | /documents | Documents.jsx:333 | already-satisfied |
| MKT-1 | P0 | /marketing | Marketing.jsx:1212 | shipped |
| MKT-2 | P0 | /marketing | Marketing.jsx:123 | deferred-needs-device |
| MKT-3 | P1 | /marketing | Marketing.jsx | shipped (via MKT-1) |
| MKT-4 | P2 | /marketing | Marketing.jsx:632 | already-satisfied |
| MKT-5 | P2 | /marketing | Marketing.jsx:364 | deferred-needs-device |
| MAP-1 | P0 | /map | Map.jsx:19 | deferred-needs-device |
| MAP-2 | P0 | /map | Map.jsx:142 | shipped |
| MAP-3 | P0 | /map | Map.jsx:53 | shipped |
| MAP-4 | P1 | /map | Map.jsx:172 | deferred-needs-device |
| MAP-5 | P1 | /map | Map.jsx:204 | already-satisfied |
| MAP-6 | P1 | /map | Map.jsx:233 | deferred-needs-device |
| OFC-1 | P0 | /office | Office.css:74 | shipped |
| OFC-2 | P0 | /office | Office.jsx | deferred-needs-device |
| OFC-3 | P1 | /office | Office.jsx:67 | deferred-needs-device |
| OFC-4 | P1 | /office | ConfirmDialog.jsx | deferred-needs-device |
| TEAM-1 | P0 | /team | Team.jsx:49 | deferred-needs-device |
| TEAM-2 | P1 | /team | Team.jsx:75 | deferred-needs-device |
| TEAM-3 | P1 | /team | Team.jsx:123 | deferred-needs-device |
| SET-1 | P1 | /settings | Settings.css:34 | shipped |
| SET-2 | P2 | /settings | Settings.jsx | deferred-needs-device |
| TAG-1 | P0 | /settings/tags | TagSettings.jsx:506 | shipped |
| TAG-2 | P0 | /settings/tags | TagSettings.jsx:553 | shipped |
| TAG-3 | P1 | /settings/tags | TagSettings.jsx:198 | shipped |
| TAG-4 | P1 | /settings/tags | TagSettings.jsx | deferred-needs-device |
| TAG-5 | P2 | /settings/tags | TagSettings.jsx | deferred-blocked |
| NBH-1 | P0 | /settings/neighborhoods | NeighborhoodAdmin.jsx:280 | shipped |
| NBH-2 | P0 | /settings/neighborhoods | NeighborhoodAdmin.jsx:365 | shipped |
| NBH-3 | P1 | /settings/neighborhoods | NeighborhoodAdmin.jsx:185 | deferred-needs-device |
| NBH-4 | P1 | /settings/neighborhoods | NeighborhoodAdmin.css:144 | shipped |
| NBH-5 | P1 | /settings/neighborhoods | NeighborhoodAdmin.jsx:233 | shipped |
| NBH-6 | P2 | /settings/neighborhoods | NeighborhoodAdmin.css | deferred-needs-device |
| HLP-1 | P0 | /help | Help.jsx:148 | shipped |
| HLP-2 | P0 | /help | Help.jsx | shipped (clear button added) |
| HLP-3 | P0 | /help | Help.jsx:252 | deferred-needs-device |
| HLP-4..5 | P1 | /help | Help.jsx | deferred-needs-device |
| HLP-6 | P1 | /help | Help.jsx:203 | shipped |
| HLP-7 | P2 | /help | Help.jsx:88 | shipped |
| INB-1 | P1 | /inbox | Inbox.jsx:92 | shipped |
| INB-2 | P1 | /inbox | Inbox.jsx | deferred-needs-device |
| INB-3 | P2 | /inbox | Inbox.jsx | deferred-needs-device |
| NTF-1 | P0 | /notifications | Notifications.jsx:152 | shipped |
| NTF-2 | P1 | /notifications | Notifications.jsx:256 | shipped |
| NTF-3..5 | P1/P2 | /notifications | Notifications.jsx | deferred-needs-device |
| CAL-1 | P0 | /calendar | Calendar.jsx:240 | shipped |
| CAL-2 | P0 | /calendar | Calendar.jsx:324 | shipped |
| CAL-3 | P1 | /calendar | Calendar.jsx:442 | shipped |
| CAL-4 | P1 | /calendar | Calendar.jsx:428, 457 | shipped |
| CAL-5 | P1 | /calendar | Calendar.jsx:195 | deferred-needs-device |
| CAL-6 | P1 | /calendar | Calendar.jsx:296 | shipped |
| MEET-1 | P0 | /meetings/:id | MeetingDetail.jsx:320 | shipped |
| MEET-2 | P1 | /meetings/:id | MeetingSummarizerCard.jsx | deferred-needs-device |
| AI-1 | P0 | /ai | Ai.jsx:270 | shipped |
| AI-2 | P0 | /ai | Ai.jsx:270 | shipped |
| AI-3 | P1 | /ai | Ai.jsx:662 | shipped |
| AI-4 | P1 | /ai | Ai.jsx:79 | deferred-needs-device |
| AI-5 | P2 | /ai | Ai.jsx | deferred-blocked |
| AI-6 | P2 | /ai | Ai.jsx:614 | shipped |
| DEAL-1 | P0 | /deals | Deals.jsx:271 + .css:639 | shipped |
| DEAL-2 | P0 | /deals | Deals + AgreementDialog.css | deferred-needs-device |
| DEAL-3 | P0 | /deals | Deals.jsx:362 | shipped |
| DEAL-4 | P1 | /deals | Deals.jsx:231 | shipped |
| DEAL-5 | P1 | /deals | Deals.jsx:604 | shipped |
| DEAL-6 | P2 | /deals | AgreementDialog.css | deferred-needs-device |
| DD-1 | P1 | /deals/:id | DealDetail.jsx:303 + index.css:1059 | shipped |
| DD-2 | P1 | /deals/:id | DealDetail.jsx:200 | shipped |
| DD-3 | P2 | /deals/:id | DealDetail.jsx | deferred-needs-device |
| CONT-1 | P1 | /contracts | Contracts.jsx:121 | deferred-needs-device |
| CONT-2 | P2 | /contracts | Contracts.jsx | deferred-blocked |
| CD-1 | P0 | /contracts/:id | ContractDetail.jsx:245 | shipped |
| CD-2 | P0 | /contracts/:id | ContractDetail.jsx:282 | deferred-needs-device |
| CD-3 | P0 | /contracts/:id | ContractDetail.jsx:324 | shipped |
| CD-4 | P1 | /contracts/:id | ContractDetail.jsx:155 | shipped |
| CD-5 | P1 | /contracts/:id | ContractDetail.jsx:367 | shipped |
| CD-6 | P2 | /contracts/:id | ContractDetail.jsx:407 | shipped |
| SR-1 | P0 | /search | SearchResults.jsx:177 | committed (prior sweep) |
| SR-2 | P0 | /search | SearchResults.jsx:323 | shipped |
| SR-3 | P0 | /search | SearchResults.jsx:204 | already-satisfied (global :focus-visible) |
| SR-4..6 | P1/P2 | /search | SearchResults.jsx | deferred-needs-device |
| NF-1 | P2 | /404 | NotFound.css:23 | shipped |
| SF-1 | P0 | SmartFields | SmartFields.css:58, 131, 177 | shipped |
| SF-2 | P0 | AddressField | AddressField.css | shipped |
| SF-3 | P0 | AddressField | AddressField.css `.addr-field-clear` | shipped |
| SF-4 | P1 | SmartFields | SmartFields.jsx:97 | deferred-needs-device |
| SF-5 | P1 | AddressField | AddressField.css `.addr-field-list` | shipped |
| SF-6..7 | P1/P2 | SmartFields/AddressField | various | deferred-needs-device |
| MOD-1 | P0 | ConfirmDialog | css | deferred-needs-device |
| MOD-2 | P0 | CommandPalette | css:16 | shipped |
| MOD-3 | P0 | useFocusTrap | js:54 | deferred-needs-device |
| MOD-4..7 | P1/P2 | various modals | various | deferred-needs-device |
| MOD-8 | P2 | ConfirmDialog | jsx:45 | shipped |
| MOD-9 | P1 | sheets | LeadFiltersSheet.jsx | deferred-needs-device |
| VC-1 | P0 | useMediaRecorder | js:101 | shipped |
| VC-2 | P0 | VoiceCaptureFab | css | deferred-needs-device |
| VC-3 | P0 | useMediaRecorder | js (notice state added) | shipped |
| VC-4 | P1 | VoiceCaptureFab | jsx:127 | deferred-needs-device |
| VC-5 | P1 | useMediaRecorder | js:132 | deferred-needs-device |
| VC-6 | P1 | VoiceCaptureFab | jsx:144 | shipped |
| VC-7 | P2 | useMediaRecorder | js:114 | deferred-needs-device |
| DT-1 | P0 | DataTable | jsx + css | deferred-blocked |
| DT-2 | P0 | ChatWidget | css:83 | deferred-needs-device |
| DT-3 | P1 | DataTable | css | shipped |
| DT-4 | P1 | ChatWidget | css `.chatw-bubble` | shipped |
| DT-5 | P2 | DataTable | css | shipped |
| TT-1 | P0 | mass tap-target | scattered | shipped (folded into per-page edits) |

**Pending count: ~120**
**Deferred-needs-device: ~70**
**Deferred-blocked: ~12**
**Committed (prior): 3**
