// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PassportCard } from '../../../../src/components/agents/passport/PassportCard';
import type { PassportAgent } from '../../../../src/components/agents/passport/passportModel';
import { PassportStamp } from '../../../../src/components/agents/passport/passportUi';
import { formatDate, shortenId } from '../../../../src/components/agents/wallet/credentialModel';
import {
  AGENT_DID,
  FUTURE,
  activeAgent,
  expiredAgent,
  passportAgentOf,
  revokedAgent,
  stubClipboard,
  summaryOf,
} from '../wallet/fixtures';

const NOW = Date.parse('2026-10-01T00:00:00.000Z');
const active = passportAgentOf(activeAgent);

function renderCard(agent: PassportAgent) {
  const onOpen = vi.fn();
  const view = render(<PassportCard agent={agent} now={NOW} onOpen={onOpen} />);
  return { ...view, onOpen, card: view.container.querySelector('article')! };
}

describe('PassportCard', () => {
  it('is a dark passport cover, opened by a button named for the agent, its stamp and expiry', () => {
    const { card } = renderCard(active);

    expect(card).toHaveAttribute('data-theme', 'dark');
    expect(within(card).getByText('Agent passport')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Agent billing-agent, Active, expires ${formatDate(FUTURE)}` }),
    ).toHaveTextContent('billing-agent');
  });

  it.each([
    ['active', 'Active', active],
    ['expired', 'Expired', passportAgentOf(expiredAgent)],
    ['revoked', 'Revoked', passportAgentOf(revokedAgent)],
  ] as const)('stamps an %s agent with a glyph and the word %s', (status, word, agent) => {
    const { card } = renderCard(agent);

    const ink = within(card).getByText(word);
    expect(ink.querySelector('svg')).toBeInTheDocument();
    expect(ink.closest('.passport-stamp')).toHaveClass(`passport-stamp--${status}`);
    // The cover steps back with it: desaturated once expired, muted once revoked.
    expect(card).toHaveClass(`passport-card--${status}`);
  });

  it('adds no caption to a revocation or an expiry', () => {
    for (const summary of [revokedAgent, expiredAgent]) {
      const { card, unmount } = renderCard(passportAgentOf(summary));
      expect(card.querySelector('.passport-stamp__caption')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('shows up to three scopes, then +N naming the rest', () => {
    const agent = passportAgentOf(summaryOf({ scopes: ['read:a', 'read:b', 'read:c', 'read:d', 'read:e'] }));
    const { card } = renderCard(agent);

    expect(within(card).getByText('read:a')).toBeInTheDocument();
    expect(within(card).getByText('read:c')).toBeInTheDocument();
    expect(within(card).queryByText('read:d')).not.toBeInTheDocument();
    expect(within(card).getByText('+2')).toHaveAttribute('title', 'read:d, read:e');
  });

  it('shows all the scopes when there are three or fewer, and says when there are none', () => {
    const { card, unmount } = renderCard(passportAgentOf(summaryOf({ scopes: ['read:a', 'read:b', 'read:c'] })));
    expect(within(card).queryByText(/^\+/)).not.toBeInTheDocument();
    unmount();

    expect(
      within(renderCard(passportAgentOf(summaryOf({ scopes: [] }))).card).getByText('No scopes'),
    ).toBeInTheDocument();
  });

  it('shows when its own credential expires, or a dash when it has no expiry', () => {
    const { card, unmount } = renderCard(active);
    expect(within(card).getByText(formatDate(FUTURE))).toHaveAttribute('datetime', FUTURE);
    unmount();

    const undated = renderCard({ ...active, credential: { ...active.credential, expiresAt: '' } }).card;
    expect(within(undated).getByText('Expires').parentElement).toHaveTextContent('Expires—');
  });

  it('carries a Delegated badge only for an agent holding delegated authority', () => {
    const { card, unmount } = renderCard({ ...active, delegatedFromVcId: 'vc:helix:parent' });
    expect(within(card).getByText('Delegated')).toBeInTheDocument();
    unmount();

    expect(within(renderCard(active).card).queryByText('Delegated')).not.toBeInTheDocument();
  });

  it('hides the decorative strip and avatar from assistive tech', () => {
    const { card } = renderCard(active);

    const strip = card.querySelector('.passport-mrz')!;
    expect(strip).toHaveAttribute('aria-hidden', 'true');
    expect(strip.textContent).toMatch(/^AP<HELIXID<<BILLING<AGENT/);
    expect(card.querySelector('svg.passport-avatar')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws the same avatar for the same DID, and a different one for another', () => {
    const avatar = (agent: PassportAgent) => {
      const { card, unmount } = renderCard(agent);
      const markup = card.querySelector('svg.passport-avatar')!.innerHTML;
      unmount();
      return markup;
    };

    const first = avatar(active);
    expect(first).not.toBe('');
    expect(avatar({ ...active, name: 'renamed' })).toBe(first);
    expect(avatar({ ...active, agentDid: 'did:web:example.test:agents:other' })).not.toBe(first);
  });

  it('cuts a long DID short and keeps a short one whole', () => {
    const longDid = 'did:hedera:testnet:z6MkVeryLongIdentifier12345';
    const { unmount } = renderCard({ ...active, agentDid: longDid });
    expect(screen.getByRole('button', { name: `Copy agent DID ${longDid}` })).toHaveTextContent(shortenId(longDid));
    expect(shortenId(longDid)).toContain('…');
    unmount();

    renderCard({ ...active, agentDid: 'did:key:abc' });
    expect(screen.getByRole('button', { name: 'Copy agent DID did:key:abc' })).toHaveTextContent('did:key:abc');
  });

  it('copies the full DID without opening the passport', async () => {
    const writeText = stubClipboard();
    const { onOpen } = renderCard(active);

    await userEvent.click(screen.getByRole('button', { name: `Copy agent DID ${AGENT_DID}` }));

    expect(writeText).toHaveBeenCalledWith(AGENT_DID);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens on a click, and names an agent without a name by its DID', async () => {
    const unnamed: PassportAgent = { ...active, name: null };
    const { onOpen } = renderCard(unnamed);

    const open = screen.getByRole('button', { name: new RegExp(`^Agent ${shortenId(AGENT_DID)}, Active`) });
    expect(open).toHaveTextContent(shortenId(AGENT_DID));
    await userEvent.click(open);

    expect(onOpen).toHaveBeenCalledWith(unnamed, open);
  });

  it('opens from the keyboard with Enter or Space', async () => {
    const { onOpen } = renderCard(active);
    const open = screen.getByRole('button', { name: /^Agent billing-agent/ });

    await userEvent.tab();
    expect(open).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});

describe('PassportStamp', () => {
  it('prints a caption under the stamp when one is given', () => {
    const { container } = render(<PassportStamp status="revoked" caption="A few words" />);

    expect(screen.getByText('Revoked')).toBeInTheDocument();
    expect(container.querySelector('.passport-stamp__caption')).toHaveTextContent('A few words');
    expect(container.querySelector('.passport-stamp')).toHaveClass('passport-stamp--card');
  });
});
