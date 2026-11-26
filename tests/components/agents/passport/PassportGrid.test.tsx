// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  PassportGrid,
  type PassportGridProps,
} from '../../../../src/components/agents/passport/PassportGrid';
import { passportAgentOf, summaryOf } from '../wallet/fixtures';

const billing = passportAgentOf(summaryOf());
const travel = passportAgentOf(
  summaryOf({ vcId: 'vc:helix:travel', subjectDid: 'did:web:example.test:agents:travel', agentName: 'travel-agent' }),
);

function renderGrid(props: Partial<PassportGridProps> = {}) {
  const handlers = { onRetry: vi.fn(), onOpen: vi.fn() };
  render(
    <MemoryRouter>
      <PassportGrid agents={[billing, travel]} loading={false} error={null} {...handlers} {...props} />
    </MemoryRouter>,
  );
  return handlers;
}

describe('PassportGrid', () => {
  it('lists one passport per agent, in the order the server gave them', () => {
    renderGrid({ agents: [travel, billing] });

    const covers = within(screen.getByRole('list', { name: 'Agents' })).getAllByRole('listitem');
    expect(covers).toHaveLength(2);
    expect(covers.map((cover) => within(cover).getByRole('button', { name: /^Agent / }).textContent)).toEqual([
      'travel-agent',
      'billing-agent',
    ]);
  });

  it('shows skeleton covers, hidden from assistive tech, while the agents load', () => {
    const { container } = render(
      <MemoryRouter>
        <PassportGrid agents={[]} loading error={null} onRetry={vi.fn()} onOpen={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading agents…')).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(container.querySelectorAll('.passport-card--skeleton')).toHaveLength(4);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('says why the agents could not be loaded, and retries on request', async () => {
    const { onRetry } = renderGrid({ error: 'api unreachable' });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load agents: api unreachable');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('points an account with no agents at Enroll', () => {
    renderGrid({ agents: [] });

    expect(screen.getByText(/no agents found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Enroll an agent' })).toHaveAttribute('href', '/enroll');
  });

  it('does not send a filtered, empty list to Enroll', () => {
    renderGrid({ agents: [], filtered: true });

    expect(screen.getByText(/no agents found/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps the keyboard in reading order: open, copy, then the next passport', async () => {
    const { onOpen } = renderGrid();
    const [billingCover, travelCover] = within(screen.getByRole('list', { name: 'Agents' })).getAllByRole('listitem');

    await userEvent.tab();
    expect(within(billingCover!).getByRole('button', { name: /^Agent billing-agent/ })).toHaveFocus();
    await userEvent.tab();
    expect(within(billingCover!).getByRole('button', { name: /^Copy agent DID/ })).toHaveFocus();
    await userEvent.tab();
    const travelOpen = within(travelCover!).getByRole('button', { name: /^Agent travel-agent/ });
    expect(travelOpen).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith(travel, travelOpen);
  });
});
