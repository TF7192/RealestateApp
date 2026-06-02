// Lazy-loaded re-exports of DashboardCharts. Recharts (and its
// transitive es-toolkit CJS modules) trip rolldown's CJS interop and
// throw `require_isUnsafeProperty is not a function` at module init
// when bundled into the eager critical-path chunk. Moving the recharts
// payload behind React.lazy splits it into its own chunk, so the
// login-path bundle never touches the broken CJS wrap.
//
// React.lazy unwraps default exports, so each named chart gets its own
// lazy wrapper that targets the corresponding named export. All five
// share a single dynamic import; rolldown dedupes them into one chunk.

import { lazy } from 'react';

const loadChartsModule = () => import('./DashboardCharts');

export const PipelineDonut       = lazy(() => loadChartsModule().then((m) => ({ default: m.PipelineDonut })));
export const LeadSourceDonut     = lazy(() => loadChartsModule().then((m) => ({ default: m.LeadSourceDonut })));
export const MatchCoverageGauge  = lazy(() => loadChartsModule().then((m) => ({ default: m.MatchCoverageGauge })));
export const DaysOnMarketBar     = lazy(() => loadChartsModule().then((m) => ({ default: m.DaysOnMarketBar })));
export const SilenceBucketsBar   = lazy(() => loadChartsModule().then((m) => ({ default: m.SilenceBucketsBar })));
