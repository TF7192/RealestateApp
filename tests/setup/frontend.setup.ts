// Extends vitest's `expect` with Testing Library matchers
// (toBeInTheDocument, toHaveTextContent, etc.) — without this, every
// frontend test reinvents helpers for asserting DOM state.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Each test unmounts its tree so the next test starts with a clean DOM.
afterEach(() => cleanup());
