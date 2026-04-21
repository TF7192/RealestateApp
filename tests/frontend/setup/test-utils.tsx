// Custom render() — wraps every component with the real providers the
// app uses (Router, Theme, Toast, optional Auth). Tests import from
// this module, not directly from @testing-library/react, so providers
// stay consistent and we don't duplicate boilerplate.
//
// Usage:
//   import { render, screen, userEvent } from '../../setup/test-utils';
//
//   test('renders', async () => {
//     const user = userEvent.setup();
//     render(<MyComponent />);
//     await user.click(screen.getByRole('button'));
//   });

import React, { type ReactElement, type ReactNode } from 'react';
import { render as rtlRender, type RenderOptions, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider } from '@estia/frontend/lib/auth.jsx';
import { ThemeProvider } from '@estia/frontend/lib/theme.jsx';
import { ToastProvider } from '@estia/frontend/lib/toast.jsx';

export interface WrapperOptions {
  /** Initial pathname. Default '/'. */
  route?: string;
  /** If the component uses useParams(), register a path pattern here. */
  path?: string;
  /** Include AuthProvider. Default true. Pass false for Login-page tests
   *  that need to assert the pre-auth state. */
  withAuth?: boolean;
}

function AllProviders({
  children,
  route = '/',
  path,
  withAuth = true,
}: WrapperOptions & { children: ReactNode }) {
  // Order matters: children sit deepest so the nearest providers (Toast,
  // Theme, Auth) are above them and useContext finds the right values.
  const routed = path ? (
    <Routes>
      <Route path={path} element={<>{children}</>} />
    </Routes>
  ) : (
    children
  );
  let tree: ReactNode = <MemoryRouter initialEntries={[route]}>{routed}</MemoryRouter>;
  tree = <ToastProvider>{tree}</ToastProvider>;
  tree = <ThemeProvider>{tree}</ThemeProvider>;
  if (withAuth) tree = <AuthProvider>{tree}</AuthProvider>;
  return <>{tree}</>;
}

export interface CustomRenderOptions extends WrapperOptions, Omit<RenderOptions, 'wrapper'> {}

export function render(ui: ReactElement, opts: CustomRenderOptions = {}): RenderResult {
  const { route, path, withAuth, ...rest } = opts;
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <AllProviders route={route} path={path} withAuth={withAuth}>
        {children}
      </AllProviders>
    ),
    ...rest,
  });
}

// Explicit re-exports — we intentionally do NOT use `export *` from
// `@testing-library/react`, because that would re-export RTL's own
// `render` under the same name as ours. The runtime then picks RTL's,
// our providers never run, and every context-using component silently
// fails with "useX must be used inside <XProvider>". Add new names here
// as tests start needing them.
export {
  screen, within, waitFor, waitForElementToBeRemoved,
  cleanup, fireEvent, act, configure,
  renderHook,
} from '@testing-library/react';
export { userEvent };

/**
 * Peek at the current URL params from inside a test. Useful when a
 * component doesn't render its params visibly.
 */
export function useCurrentParams() {
  return useParams();
}
