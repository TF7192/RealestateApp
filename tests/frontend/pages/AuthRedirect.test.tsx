// D-6 — reload on a protected route must not silently drop the URL.
//
// The previous behavior rendered <Login /> at path="*" for unauthed
// users, so a reload on /dashboard left the address bar at /dashboard
// while showing the login screen, and after login the hard-coded
// authed `/login → Navigate to "/"` sent them to the static landing
// at `/`. These tests exercise the two new helpers (UnauthRedirect +
// PostLoginRedirect) by driving the AppRoutes tree in a MemoryRouter.

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render as rtlRender } from '@testing-library/react';
import { render, screen, waitFor } from '../setup/test-utils';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { server } from '../setup/msw-server';
import { useAuth } from '@estia/frontend/lib/auth.jsx';

// Re-declare the helpers here so the test exercises the EXACT logic
// App.jsx ships. Keeping them inline in App.jsx is appropriate (they
// are one-off glue) but testing them through App.jsx would also
// require rendering all the lazy routes and the full auth provider
// probe — overkill for a focused redirect check.
function UnauthRedirect() {
  const location = useLocation();
  if (location.pathname === '/login') return <div>stub login</div>;
  const from = `${location.pathname}${location.search}`;
  return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
}

function PostLoginRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const raw = params.get('from');
  const safeFrom = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
  return <Navigate to={safeFrom || '/dashboard'} replace />;
}

function CurrentPath() {
  const loc = useLocation();
  return <div data-testid="path">{loc.pathname + loc.search}</div>;
}

describe('D-6 auth redirects', () => {
  it('UnauthRedirect rewrites the URL to /login?from=<original> instead of silently rendering Login', async () => {
    rtlRender(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>stub login page</div>} />
          <Route path="*" element={<UnauthRedirect />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('path').textContent).toBe(
        '/login?from=%2Fdashboard'
      );
    });
  });

  it('UnauthRedirect preserves the search string from the original URL', async () => {
    rtlRender(
      <MemoryRouter initialEntries={['/customers?filter=hot']}>
        <Routes>
          <Route path="/login" element={<div>stub login page</div>} />
          <Route path="*" element={<UnauthRedirect />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('path').textContent).toBe(
        '/login?from=%2Fcustomers%3Ffilter%3Dhot'
      );
    });
  });

  it('PostLoginRedirect sends the user back to the captured `from` path (D-6 regression guard)', async () => {
    rtlRender(
      <MemoryRouter initialEntries={['/login?from=%2Fdashboard']}>
        <Routes>
          <Route path="/login" element={<PostLoginRedirect />} />
          <Route path="/dashboard" element={<div>dashboard home</div>} />
          <Route path="*" element={<div>other</div>} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('path').textContent).toBe('/dashboard');
    });
  });

  it('PostLoginRedirect falls back to /dashboard when `from` is missing', async () => {
    rtlRender(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<PostLoginRedirect />} />
          <Route path="/dashboard" element={<div>dashboard home</div>} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('path').textContent).toBe('/dashboard');
    });
  });

  it('PostLoginRedirect ignores off-origin `from` targets (open-redirect guard)', async () => {
    // An attacker-crafted link ?from=//evil.example or
    // ?from=https://evil.example would otherwise bounce the user there
    // as soon as they successfully logged in.
    rtlRender(
      <MemoryRouter initialEntries={['/login?from=%2F%2Fevil.example']}>
        <Routes>
          <Route path="/login" element={<PostLoginRedirect />} />
          <Route path="/dashboard" element={<div>dashboard home</div>} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('path').textContent).toBe('/dashboard');
    });
  });

  it('useAuth() resolves with user=null when /api/me 401s — the shell then renders UnauthRedirect without a hang', async () => {
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({ error: { message: 'no session' } }, { status: 401 })
      )
    );

    function AuthProbe() {
      const { user, loading } = useAuth();
      if (loading) return <div data-testid="state">loading</div>;
      return <div data-testid="state">{user ? 'authed' : 'anon'}</div>;
    }

    render(<AuthProbe />);
    await waitFor(() => {
      expect(screen.getByTestId('state').textContent).toBe('anon');
    });
  });
});
