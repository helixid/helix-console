// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EnrollPage } from '../../src/pages/EnrollPage';
import { api } from '../../src/api/client';

vi.mock('../../src/api/client', () => ({
  api: {
    onboardAgentNow: vi.fn(),
  },
}));

const onboardAgentNow = vi.mocked(api.onboardAgentNow);

function renderPage() {
  return render(
    <MemoryRouter>
      <EnrollPage />
    </MemoryRouter>,
  );
}

describe('EnrollPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('onboards an agent in one click and shows the agent DID immediately', async () => {
    onboardAgentNow.mockResolvedValue({ agentDid: 'did:key:zAgent123', vcId: 'vc:helix:agent:1' });
    renderPage();

    await userEvent.type(screen.getByLabelText(/agent name/i), 'billing-agent');
    await userEvent.type(screen.getByLabelText(/requested scopes/i), 'read:orders');
    await userEvent.click(screen.getByRole('button', { name: /onboard now/i }));

    expect(onboardAgentNow).toHaveBeenCalledWith({
      agentName: 'billing-agent',
      requestedScopes: ['read:orders'],
    });
    expect(await screen.findByText('did:key:zAgent123')).toBeInTheDocument();
  });

  it('returns to the form when onboarding another agent', async () => {
    onboardAgentNow.mockResolvedValue({ agentDid: 'did:key:zAgent123', vcId: 'vc:helix:agent:1' });
    renderPage();

    await userEvent.type(screen.getByLabelText(/agent name/i), 'billing-agent');
    await userEvent.type(screen.getByLabelText(/requested scopes/i), 'read:orders');
    await userEvent.click(screen.getByRole('button', { name: /onboard now/i }));
    await screen.findByText('did:key:zAgent123');

    await userEvent.click(screen.getByRole('button', { name: /onboard another agent/i }));
    expect(screen.getByLabelText(/agent name/i)).toBeInTheDocument();
    expect(screen.queryByText('did:key:zAgent123')).not.toBeInTheDocument();
  });

  it('shows an error when onboarding fails and keeps the form', async () => {
    onboardAgentNow.mockRejectedValue(new Error('invalid scope'));
    renderPage();

    await userEvent.type(screen.getByLabelText(/agent name/i), 'billing-agent');
    await userEvent.type(screen.getByLabelText(/requested scopes/i), 'bogus');
    await userEvent.click(screen.getByRole('button', { name: /onboard now/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid scope');
    expect(screen.getByLabelText(/agent name/i)).toBeInTheDocument();
  });
});
