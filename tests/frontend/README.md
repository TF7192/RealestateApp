# Frontend Test Suite

Browser-layer tests. Everything that runs in the user's browser — components,
hooks, pages, a11y, responsive. Backend and integration tests live in
`tests/integration/` and `tests/unit/backend/`.

## Run

```bash
npm run test:frontend           # unit-frontend + frontend projects
npm run test:frontend:watch     # watch mode
npx vitest run --project=frontend -t "EmptyState"   # filter by name
```

## Layout

```
tests/frontend/
├── COVERAGE.md        # living map of what's covered
├── README.md          # this file
├── setup/
│   ├── vitest.setup.ts     # runs before every test file
│   ├── test-utils.tsx      # custom render() with providers
│   ├── msw-server.ts       # node-side MSW server
│   └── msw-handlers.ts     # default HTTP mocks
├── mocks/
│   └── browser-apis.ts     # matchMedia / IntersectionObserver / etc. polyfills
├── unit/              # pure-logic, no DOM
├── hooks/             # renderHook tests
├── components/
│   ├── primitives/    # Button / Input / Portal / etc.
│   ├── composites/    # Dialogs, pickers, form-widgets
│   └── features/      # PropertyHero, ChatWidget, Layout, etc.
├── pages/             # page-level component tests
├── a11y/              # dedicated axe sweeps
└── fixtures/          # canned HTML/JSON fixtures (e.g. Yad2 pages)
```

## Conventions

- **Always** import `render`, `screen`, `userEvent` from
  `tests/frontend/setup/test-utils`. It wraps every tree in ThemeProvider +
  ToastProvider + MemoryRouter + AuthProvider. Do **not** import directly
  from `@testing-library/react` — you'll miss providers.
- **Queries**: role → label → text → placeholder → testid. Never class
  selectors (they break on refactor).
- **Interactions**: `userEvent.setup()` then `await user.click(...)`. Never
  `fireEvent`.
- **Network**: default MSW handlers cover the common endpoints. For
  per-test overrides:
  ```ts
  import { http, HttpResponse } from 'msw';
  import { server } from '../../setup/msw-server';
  server.use(http.get('/api/foo', () => HttpResponse.json({ ... })));
  ```
  Anything that hits an endpoint with no handler is a test failure
  (`onUnhandledRequest: 'error'`).
- **Axe**: every non-trivial component test includes at least one
  `expect(await axe(container)).toHaveNoViolations()` check.
- **Timers**: if the component debounces/throttles, use
  `vi.useFakeTimers({ shouldAdvanceTime: true })` so userEvent doesn't hang.
- **Dates**: freeze the clock with `vi.setSystemTime(new Date('...'))`.
- **Snapshots**: avoid. If you reach for one, ask whether an explicit
  assertion would be clearer.

## The single most important rule

If a test you wrote fails because it uncovered a real bug in the app, **fix
the app, not the test**. List the bug in COVERAGE.md's "Bugs Found While
Writing Tests" section.

Only rewrite a test when:
- It was coupled to implementation details (class names, internal state).
- It had a genuine logic error (wrong expected value).

Never weaken an assertion to make it pass. Never add `.skip` without a
linked ticket.

## Debugging a failing test

1. Run just that test: `npx vitest run --project=frontend <path>`.
2. `screen.debug()` prints the current DOM.
3. `npx vitest --project=frontend --ui` opens the Vitest UI with a
   DOM viewer + re-run hooks.
4. If it's a flake, run it 50× in a loop before assuming it's flaky —
   usually it's a real race in the app code.
