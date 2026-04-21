// Node-side MSW server — shared across every frontend test.
// Handlers live in msw-handlers.ts; tests can override any of them
// per-case via `server.use(http.get(...))`.

import { setupServer } from 'msw/node';
import { defaultHandlers } from './msw-handlers';

export const server = setupServer(...defaultHandlers);
