// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App';
import { api } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  api: {
    listAgents: vi.fn(),
    getAgent: vi.fn(),
    revokeAgent: vi.fn(),
    onboardAgentNow: vi.fn(),
    getAuditLog: vi.fn(),
  },
}));

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
    mocked.getAuditLog.mockResolvedValue({
      items: [
        {
          id: 'ledger_a:epoch_1:1',
          recordedAt: '2026-06-01T12:00:00.000Z',
          eventDigest: `sha256:${'1'.repeat(64)}`,
          event: {
            eventId: 'evt-1',
            eventType: 'delegation.revoked',
            occurredAt: Date.parse('2026-06-01T12:00:00.000Z'),
            action: { category: 'credential', name: 'revoked' },
            outcome: 'succeeded',
            resource: { kind: 'public_did', did: 'did:hedera:testnet:billing' },
            source: { producer: { kind: 'public_did', did: 'did:web:api.example' }, sourceId: 'helix-api' },
            details: { family: 'delegation', phase: 'revoked', delegationRef: 'vc:helix:billing' },
          },
          ledgerId: 'ledger_a',
          ledgerEpochId: 'epoch_1',
          sequence: '1',
          entryDigest: `sha256:${'2'.repeat(64)}`,
          receipt: {
            core: {
              ledgerId: 'ledger_a',
              ledgerEpochId: 'epoch_1',
              sequence: '1',
              eventId: 'evt-1',
              entryDigest: `sha256:${'2'.repeat(64)}`,
              previousEntryDigest: `sha256:${'3'.repeat(64)}`,
              recordedAt: Date.parse('2026-06-01T12:00:00.000Z'),
              recorder: { did: 'did:key:z6MkRecorder', kid: 'z6MkRecorder', alg: 'EdDSA' },
              integritySuite: 'org.kya-os.audit-integrity.v1',
            },
            jws: 'eyJ.sig',
          },
        },
      ],
      nextCursor: null,
    });
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

  it('navigates to the Audit page and links an opened event\'s DIDs to the Agents page', async () => {
    sessionStorage.setItem(AUTH_KEY, 'true');
    renderApp('/');
    await screen.findByRole('heading', { name: 'Agents' });

    await userEvent.click(screen.getByRole('link', { name: 'Audit' }));

    expect(
      await screen.findByRole('heading', { name: /audit & governance/i }),
    ).toBeInTheDocument();
    expect(mocked.getAuditLog).toHaveBeenCalledWith({ limit: 50 });
    // Opening the row shows its parties, each DID linked to the Agents page.
    await userEvent.click(await screen.findByRole('button', { name: /Credential revoked/ }));
    expect(
      await screen.findByRole('link', { name: /did:hedera:testnet:billing/ }),
    ).toHaveAttribute(
      'href',
      `/agents?subjectDid=${encodeURIComponent('did:hedera:testnet:billing')}`,
    );
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
