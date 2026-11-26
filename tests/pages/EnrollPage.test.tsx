// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EnrollPage } from '../../src/pages/EnrollPage';
import { api } from '../../src/api/client';

vi.mock('../../src/api/client', () => ({
  api: {
    createAgent: vi.fn(),
  },
}));

const createAgent = vi.mocked(api.createAgent);

const CREATED = {
  did: 'did:web:127.0.0.1%3A3000:agents:0123456789abcdef0123456789abcdef',
  name: 'billing-agent',
  keyCustody: 'self' as const,
  didHosting: 'helix' as const,
  label: 'custody: self',
  status: 'pending_key',
  enrollmentToken: 'enroll:abc123',
  enrollmentExpiresAt: '2026-11-24T12:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <EnrollPage />
    </MemoryRouter>,
  );
}

async function submit(scope = 'read:orders') {
  await userEvent.type(screen.getByLabelText(/agent name/i), 'billing-agent');
  await userEvent.type(screen.getByLabelText(/requested scopes/i), scope);
  await userEvent.click(screen.getByRole('button', { name: /onboard now/i }));
}

describe('EnrollPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a self-custody agent and ends on its DID, its token and the helix init commands', async () => {
    createAgent.mockResolvedValue(CREATED);
    renderPage();

    await submit();

    expect(createAgent).toHaveBeenCalledWith({ agentName: 'billing-agent', requestedScopes: ['read:orders'], discoverable: true });
    const region = await screen.findByRole('region', { name: 'Agent enrollment' });
    expect(within(region).getByText('Agent created — run helix init')).toBeInTheDocument();
    expect(within(region).getByText(CREATED.did)).toBeInTheDocument();
    expect(within(region).getByText('custody: self')).toBeInTheDocument();
    expect(within(region).getByText('Waiting for helix init')).toBeInTheDocument();
    expect(within(region).getByText('enroll:abc123')).toBeInTheDocument();
    expect(within(region).getByLabelText('helix init command')).toHaveTextContent(
      `npx @helixid/cli init --token enroll:abc123 --out ./helix-agent --api-url ${window.location.origin}`,
    );
    expect(within(region).getByLabelText('Python helix init command')).toHaveTextContent('helix-custody init --token enroll:abc123');
    expect(within(region).getByText(/valid until/)).toBeInTheDocument();
  });

  it('leaves out the expiry when the API gives none', async () => {
    const { enrollmentExpiresAt: _expires, ...withoutExpiry } = CREATED;
    createAgent.mockResolvedValue(withoutExpiry);
    renderPage();

    await submit();

    await screen.findByText('Agent created — run helix init');
    expect(screen.queryByText(/valid until/)).not.toBeInTheDocument();
  });

  it('returns to the form when onboarding another agent', async () => {
    createAgent.mockResolvedValue(CREATED);
    renderPage();

    await submit();
    await screen.findByText(CREATED.did);

    await userEvent.click(screen.getByRole('button', { name: /onboard another agent/i }));
    expect(screen.getByLabelText(/agent name/i)).toBeInTheDocument();
    expect(screen.queryByText(CREATED.did)).not.toBeInTheDocument();
  });

  it('shows an error when onboarding fails and keeps the form', async () => {
    createAgent.mockRejectedValue(new Error('invalid scope'));
    renderPage();

    await submit('bogus');

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid scope');
    expect(screen.getByLabelText(/agent name/i)).toBeInTheDocument();
  });

  it('shows a generic error for a non-Error rejection', async () => {
    createAgent.mockRejectedValue('nope');
    renderPage();

    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to onboard agent');
  });
});
