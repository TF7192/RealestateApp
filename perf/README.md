# Estia — Performance Workspace

```
perf/
├── DISCOVERY.md        # System + traffic map (populated from repo + memory)
├── WHERE_TO_RUN.md     # The "where do tests run?" blocker, four options
├── BASELINE.md         # Current "as-is" numbers (pending first run)
├── BUDGETS.md          # Targets the team holds the line on
├── FINDINGS.md         # Bottlenecks + fixes
├── load-tests/
│   ├── scenarios/
│   │   ├── smoke.js            # 1 VU, 1 min
│   │   ├── load-baseline.js    # Expected peak, 15 min
│   │   ├── stress.js           # Ramp to failure
│   │   ├── spike.js            # 10× burst, 2 min
│   │   ├── soak.js             # 2-4 h at expected peak
│   │   └── breakpoint.js       # Binary-search capacity
│   ├── helpers/
│   │   ├── auth.js             # Login once, reuse token
│   │   ├── data.js             # Test-data factory
│   │   └── checks.js           # Shared assertions
│   └── reports/                # Saved run outputs
└── optimizations/              # One file per fix; before/after
```

## Status (2026-04-21)

- ✅ `DISCOVERY.md` written.
- ✅ `BUDGETS.md` draft calibrated to `CLAUDE.md` defaults.
- ✅ `FINDINGS.md` scaffolded with pre-baseline suspicions.
- ⏸️ `BASELINE.md` empty — **blocked on `WHERE_TO_RUN.md`**.
- ⏸️ Load-test scripts — skeleton stubs only; not runnable until the "where" question is answered.

## How to run, once unblocked

```bash
# Install k6 locally (macOS)
brew install k6

# Every scenario is parameterized by BASE_URL + TEST_AGENT_EMAIL/PASSWORD.
# Staging-lite default once it's set up:
BASE_URL=https://staging.estia.tripzio.xyz \
  TEST_AGENT_EMAIL=agent.demo@estia.app \
  TEST_AGENT_PASSWORD=estia-demo-1234 \
  k6 run perf/load-tests/scenarios/smoke.js

# Local against docker-compose.test.yml:
docker compose -f docker-compose.test.yml up -d
# (run the test backend + frontend — see reference_test_suite memory)
BASE_URL=http://localhost:4100 k6 run perf/load-tests/scenarios/smoke.js
```

Each scenario writes a JSON summary to `perf/load-tests/reports/<timestamp>-<scenario>.json` and a short Markdown report alongside. `BASELINE.md` is re-written from the latest `load-baseline` run.
