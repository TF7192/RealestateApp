# Estia — RTL Layout Bugs (handed off to engineering)

Logged by the Hebrew review pass; fixed by engineering; verified by the linguist afterwards.

---

## Format

| # | Location | Symptom | Repro | Severity | Status |
|---|---|---|---|---|---|
| 1 | _(file:line)_ | _(what breaks visually)_ | _(how to see it — URL + steps)_ | low / med / high | open / in-progress / fixed / verified |

Severity:
- **high** — breaks the reading experience or the perception of quality on a high-traffic surface (login, dashboard, main nav).
- **medium** — visible and wrong but on a less-traveled path, or only in specific conditions (narrow viewport, specific browser).
- **low** — cosmetic; doesn't affect comprehension.

---

## Known from prior audits (already shipped as fixes — listed for reference)

See `docs/audit-2026-04-21.md` + the `fix(rtl): …` commit trail on main. The systemic physical→logical CSS sweep is partially complete; individual files still drift.

## Open

_(none yet logged for this engagement — discovery sweep pending)_

## In progress

_(none)_

## Fixed, awaiting linguist verification

_(none)_

## Verified

_(none)_
