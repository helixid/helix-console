// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnrollForm } from '../../../src/components/enroll/EnrollForm';

describe('EnrollForm', () => {
  it('submits a selected scope', async () => {
    const onSubmit = vi.fn();
    render(<EnrollForm onSubmit={onSubmit} submitting={false} />);

    await userEvent.type(screen.getByLabelText(/agent name/i), 'billing-agent');
    await userEvent.type(screen.getByLabelText(/requested scopes/i), 'read');
    await userEvent.click(await screen.findByRole('button', { name: 'read:orders' }));
    await userEvent.type(screen.getByLabelText(/domains/i), 'example.com');
    await userEvent.type(screen.getByLabelText(/max delegation depth/i), '2');
    await userEvent.click(screen.getByRole('button', { name: /mint enrollment token/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      agentName: 'billing-agent',
      requestedScopes: ['read:orders'],
      requestedDomains: ['example.com'],
      maxDelegationDepth: 2,
    });
  });

  it('submits a custom scope that is not in the suggestions', async () => {
    const onSubmit = vi.fn();
    render(<EnrollForm onSubmit={onSubmit} submitting={false} />);

    await userEvent.type(screen.getByLabelText(/agent name/i), 'simple-agent');
    await userEvent.type(screen.getByLabelText(/requested scopes/i), 'custom:billing');
    await userEvent.click(screen.getByRole('button', { name: /mint enrollment token/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      agentName: 'simple-agent',
      requestedScopes: ['custom:billing'],
    });
  });

  it('disables the submit button while submitting', () => {
    render(<EnrollForm onSubmit={vi.fn()} submitting />);
    expect(screen.getByRole('button', { name: /minting/i })).toBeDisabled();
  });

  it('has no "Onboard now" button when onOnboardNow is not passed', () => {
    render(<EnrollForm onSubmit={vi.fn()} submitting={false} />);
    expect(screen.queryByRole('button', { name: /onboard now/i })).not.toBeInTheDocument();
  });

  it('calls onOnboardNow instead of onSubmit when "Onboard now" is clicked', async () => {
    const onSubmit = vi.fn();
    const onOnboardNow = vi.fn();
    render(
      <EnrollForm onSubmit={onSubmit} submitting={false} onOnboardNow={onOnboardNow} />,
    );

    await userEvent.type(screen.getByLabelText(/agent name/i), 'billing-agent');
    await userEvent.type(screen.getByLabelText(/requested scopes/i), 'custom:billing');
    await userEvent.click(screen.getByRole('button', { name: /onboard now/i }));

    expect(onOnboardNow).toHaveBeenCalledWith({
      agentName: 'billing-agent',
      requestedScopes: ['custom:billing'],
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables both buttons while onboarding', () => {
    render(
      <EnrollForm onSubmit={vi.fn()} submitting={false} onOnboardNow={vi.fn()} onboarding />,
    );
    expect(screen.getByRole('button', { name: /onboarding/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /mint enrollment token/i })).toBeDisabled();
  });
});
