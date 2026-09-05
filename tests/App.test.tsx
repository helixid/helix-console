// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App';
import { api } from '@helixid/console-core';

vi.mock('@helixid/console-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@helixid/console-core')>();
  return {
    ...actual,
    api: {
      listAgents: vi.fn(),
      getAgent: vi.fn(),
      revokeAgent: vi.fn(),
      createEnrollmentToken: vi.fn(),
      getAuditLog: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);
const AUTH_KEY = 'helixid.console.auth';

function renderApp(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App shell + routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    delete window.__HELIXID_CONFIG__;
    mocked.listAgents.mockResolvedValue([]);
    mocked.getAuditLog.mockResolvedValue([
      {
        id: '1',
        eventType: 'vc_revoked',
        timestamp: '2026-06-01T12:00:00.000Z',
        subjectDid: 'did:hedera:testnet:billing',
        vcId: 'vc:helix:billing',
      },
    ]);
  });

  it('redirects an unauthenticated visit to the login page', async () => {
    renderApp('/agents');
    expect(
      await screen.findByRole('heading', { name: /operator sign in/i }),
    ).toBeInTheDocument();
    // Protected chrome is not rendered.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('renders the shell with a three-item nav (incl. Audit) when authenticated', async () => {
    sessionStorage.setItem(AUTH_KEY, 'true');
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Agents' })).toBeInTheDocument();
    for (const name of ['Agents', 'Enroll', 'Audit']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    // The persistent audit rail is gone — audit now lives on its own page.
    expect(
      screen.queryByRole('complementary', { name: /audit log/i }),
    ).not.toBeInTheDocument();
  });

  it('navigates to the Audit page', async () => {
    // AuditPage's own data-fetching behavior (calling api.getAuditLog with
    // the right filters, rendering deep-linked events) is console-core's
    // own responsibility and already covered by its test suite there —
    // console-core's pages import `api` via a relative path internal to
    // that package, which this app's module mock above can't intercept.
    // This only verifies route composition: the nav link actually reaches
    // the Audit page in this app's own routing.
    sessionStorage.setItem(AUTH_KEY, 'true');
    renderApp('/');
    await screen.findByRole('heading', { name: 'Agents' });

    await userEvent.click(screen.getByRole('link', { name: 'Audit' }));

    expect(
      await screen.findByRole('heading', { name: /audit & governance/i }),
    ).toBeInTheDocument();
  });

  it('signs out back to the login page', async () => {
    sessionStorage.setItem(AUTH_KEY, 'true');
    renderApp('/');
    await screen.findByRole('heading', { name: 'Agents' });

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(
      await screen.findByRole('heading', { name: /operator sign in/i }),
    ).toBeInTheDocument();
  });
});
