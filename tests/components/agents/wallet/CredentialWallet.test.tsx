// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CredentialWallet,
  type CredentialWalletProps,
} from '../../../../src/components/agents/wallet/CredentialWallet';
import {
  LOADING_WALLET,
  type WalletState,
} from '../../../../src/components/agents/wallet/credentialModel';
import {
  AGENT_DID,
  FAKE_PROOF_VALUE,
  WALLET_DETAILS,
  WALLET_SUMMARIES,
  activeAgent,
  detailOf,
  expiredAgent,
  grant,
  grantDetail,
  manySummaries,
  readyWallet,
  revokedAgent,
} from './fixtures';

const VIEW_KEY = 'helixid.console.walletView';

function renderWallet(state: WalletState, props: Partial<CredentialWalletProps> = {}) {
  const handlers = {
    onRetry: vi.fn(),
    onLoadDetails: vi.fn(),
    onRevoke: vi.fn().mockResolvedValue(undefined),
  };
  const view = render(
    <CredentialWallet agentDid={AGENT_DID} state={state} {...handlers} {...props} />,
  );
  return { ...view, ...handlers };
}

/** The accessible names of the cards, in the order they are laid out. */
function cardNames(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => within(item).getAllByRole('button')[0]!.getAttribute('aria-label') ?? '');
}

function openButton(name: RegExp): HTMLElement {
  return screen.getByRole('button', { name });
}

describe('CredentialWallet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('wallet view', () => {
    it('is the default view and shows one card per credential, history included', () => {
      renderWallet(readyWallet());

      expect(screen.getByRole('tab', { name: 'Wallet' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel', { name: 'Wallet' })).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(4);
      expect(screen.getByText('Credentials')).toHaveTextContent('Credentials4');
    });

    it('orders cards active first, then newest first', () => {
      renderWallet(readyWallet());

      const names = cardNames();
      expect(names[0]).toMatch(/^Delegation Grant credential, Active/);
      expect(names[1]).toMatch(/^Agent Authorization credential, Active/);
      expect(names[2]).toMatch(/^Agent Authorization credential, Expired/);
      expect(names[3]).toMatch(/^Agent Authorization credential, Revoked/);
    });

    it('gives a single credential the full row rather than a lonely grid cell', () => {
      const { container, rerender } = renderWallet(readyWallet([activeAgent], [detailOf(activeAgent)]));
      expect(container.querySelector('.wallet__grid')).toHaveClass('wallet__grid--single');

      rerender(
        <CredentialWallet
          agentDid={AGENT_DID}
          state={readyWallet()}
          onRetry={vi.fn()}
          onLoadDetails={vi.fn()}
          onRevoke={vi.fn()}
        />,
      );
      expect(container.querySelector('.wallet__grid')).not.toHaveClass('wallet__grid--single');
    });
  });

  describe('states', () => {
    it('shows skeleton cards while loading', () => {
      const { container } = renderWallet(LOADING_WALLET);

      expect(screen.getByText('Loading credentials…')).toBeInTheDocument();
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(container.querySelectorAll('.cred-card--skeleton')).toHaveLength(3);
      // Nothing to filter yet, and no count to show.
      expect(screen.queryByLabelText('Filter by status')).not.toBeInTheDocument();
      expect(screen.getByText('Credentials')).toHaveTextContent(/^Credentials$/);
    });

    it('shows the empty state for an agent with no credentials', () => {
      renderWallet(readyWallet([], []));

      expect(screen.getByText('No credentials issued to this agent yet.')).toBeInTheDocument();
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Filter by status')).not.toBeInTheDocument();
    });

    it('shows the error with a way to retry', async () => {
      const { onRetry } = renderWallet({ ...LOADING_WALLET, phase: 'error', message: 'api unreachable' });

      expect(screen.getByRole('alert')).toHaveTextContent('Could not load credentials: api unreachable');

      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('JSON view', () => {
    it('shows the whole wallet as one valid JSON document', async () => {
      renderWallet(readyWallet());

      await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));

      const document = JSON.parse(screen.getByRole('group', { name: 'Wallet JSON' }).textContent ?? '');
      expect(document.agent).toBe(AGENT_DID);
      // Every credential's full VC, in the wallet's own order.
      expect(document.credentials.map((vc: { id: string }) => vc.id)).toEqual([
        grant.vcId,
        activeAgent.vcId,
        expiredAgent.vcId,
        revokedAgent.vcId,
      ]);
      expect(document.credentials[0]).toEqual(grantDetail.vc);
      expect(screen.getByRole('group', { name: 'Wallet JSON' })).toHaveTextContent(FAKE_PROOF_VALUE);
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('is collapsible, copyable and downloadable', async () => {
      const { container } = renderWallet(readyWallet());
      await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));

      expect(container.querySelector('details')).toHaveAttribute('open');
      expect(screen.getByText('Wallet JSON · 4 credentials')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Download JSON' })).toHaveAttribute(
        'title',
        'wallet-did-web-example.test-agents-billing.json',
      );
    });

    it('counts one credential in the singular', async () => {
      renderWallet(readyWallet([activeAgent], [detailOf(activeAgent)]));
      await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));
      expect(screen.getByText('Wallet JSON · 1 credential')).toBeInTheDocument();
    });

    it('is still a valid document for an empty wallet', async () => {
      renderWallet(readyWallet([], []));
      await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));

      expect(JSON.parse(screen.getByRole('group', { name: 'Wallet JSON' }).textContent ?? '')).toEqual({
        agent: AGENT_DID,
        credentials: [],
      });
    });

    it('hides the card filters, which do not apply to the document', async () => {
      renderWallet(readyWallet());
      expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));

      expect(screen.queryByLabelText('Filter by status')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Search credentials')).not.toBeInTheDocument();
    });

    it('can be reached with the keyboard from the Wallet tab', async () => {
      renderWallet(readyWallet());
      screen.getByRole('tab', { name: 'Wallet' }).focus();

      await userEvent.keyboard('{ArrowRight}');

      expect(screen.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('group', { name: 'Wallet JSON' })).toBeInTheDocument();
    });
  });

  describe('remembering the view', () => {
    it('stores the choice and restores it on the next visit', async () => {
      const first = renderWallet(readyWallet());
      await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));
      expect(localStorage.getItem(VIEW_KEY)).toBe('json');
      first.unmount();

      renderWallet(readyWallet());
      expect(screen.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');

      await userEvent.click(screen.getByRole('tab', { name: 'Wallet' }));
      expect(localStorage.getItem(VIEW_KEY)).toBe('wallet');
    });

    it('ignores a stored value it does not recognise', () => {
      localStorage.setItem(VIEW_KEY, 'grid');
      renderWallet(readyWallet());
      expect(screen.getByRole('tab', { name: 'Wallet' })).toHaveAttribute('aria-selected', 'true');
    });

    it('works with storage unavailable: defaults to Wallet and still switches', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage disabled');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage disabled');
      });
      renderWallet(readyWallet());
      expect(screen.getByRole('tab', { name: 'Wallet' })).toHaveAttribute('aria-selected', 'true');

      await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));

      expect(screen.getByRole('group', { name: 'Wallet JSON' })).toBeInTheDocument();
    });
  });

  describe('filters', () => {
    it('filters by status', async () => {
      renderWallet(readyWallet());
      const status = screen.getByLabelText('Filter by status');
      expect(within(status).getAllByRole('option').map((option) => option.textContent)).toEqual([
        'All statuses',
        'Active',
        'Expired',
        'Revoked',
      ]);

      await userEvent.selectOptions(status, 'Expired');
      expect(cardNames()).toEqual([expect.stringMatching(/Expired/)]);

      await userEvent.selectOptions(status, 'Revoked');
      expect(cardNames()).toEqual([expect.stringMatching(/Revoked/)]);

      await userEvent.selectOptions(status, 'Active');
      expect(cardNames()).toHaveLength(2);

      await userEvent.selectOptions(status, 'All statuses');
      expect(cardNames()).toHaveLength(4);
    });

    it('offers the type filter only when the wallet holds more than one type', async () => {
      const oneType = renderWallet(
        readyWallet([activeAgent, expiredAgent], [detailOf(activeAgent), detailOf(expiredAgent)]),
      );
      expect(screen.queryByLabelText('Filter by type')).not.toBeInTheDocument();
      oneType.unmount();

      renderWallet(readyWallet());
      const type = screen.getByLabelText('Filter by type');
      expect(within(type).getAllByRole('option').map((option) => option.textContent)).toEqual([
        'All types',
        'Delegation Grant',
        'Agent Authorization',
      ]);

      await userEvent.selectOptions(type, 'Delegation Grant');
      expect(cardNames()).toEqual([expect.stringMatching(/^Delegation Grant credential/)]);

      await userEvent.selectOptions(type, 'All types');
      expect(cardNames()).toHaveLength(4);
    });

    it('searches by VC ID, scope and issuer', async () => {
      renderWallet(readyWallet());
      const search = screen.getByLabelText('Search credentials');

      await userEvent.type(search, 'agent-expired');
      expect(cardNames()).toEqual([expect.stringMatching(/Expired/)]);

      await userEvent.clear(search);
      await userEvent.type(search, 'book:flights');
      expect(cardNames()).toEqual([expect.stringMatching(/^Delegation Grant/)]);

      await userEvent.clear(search);
      await userEvent.type(search, 'travel.example');
      expect(cardNames()).toEqual([expect.stringMatching(/^Delegation Grant/)]);
    });

    it('says when nothing matches and clears the filters in one step', async () => {
      renderWallet(readyWallet());
      await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'Revoked');
      await userEvent.type(screen.getByLabelText('Search credentials'), 'book:flights');

      expect(screen.getByText(/No credentials match these filters/)).toBeInTheDocument();
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

      expect(screen.getAllByRole('listitem')).toHaveLength(4);
      expect(screen.getByLabelText('Filter by status')).toHaveValue('all');
      expect(screen.getByLabelText('Search credentials')).toHaveValue('');
    });

    it('drops a type filter whose type is no longer in the wallet', async () => {
      const { rerender } = renderWallet(readyWallet());
      await userEvent.selectOptions(screen.getByLabelText('Filter by type'), 'Delegation Grant');
      expect(screen.getAllByRole('listitem')).toHaveLength(1);

      // The wallet re-loads without the grant: the stale filter must not hide everything.
      rerender(
        <CredentialWallet
          agentDid={AGENT_DID}
          state={readyWallet([activeAgent, expiredAgent], [detailOf(activeAgent), detailOf(expiredAgent)])}
          onRetry={vi.fn()}
          onLoadDetails={vi.fn()}
          onRevoke={vi.fn()}
        />,
      );

      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });
  });

  describe('credentials whose VC is not loaded yet', () => {
    const summaries = manySummaries(14);
    const loaded = summaries.slice(0, 12).map((summary) => detailOf(summary));
    const rest = summaries.slice(12).map((summary) => summary.vcId);

    it('still shows every card, says how many are fully loaded, and offers the rest', async () => {
      const { onLoadDetails } = renderWallet(readyWallet(summaries, loaded));

      expect(screen.getAllByRole('listitem')).toHaveLength(14);
      expect(screen.getByText('Full details loaded for 12 of 14 credentials.')).toBeInTheDocument();
      expect(screen.getAllByText('Details not loaded')).toHaveLength(2);

      await userEvent.click(screen.getByRole('button', { name: 'Load the rest' }));
      expect(onLoadDetails).toHaveBeenCalledWith(rest);
    });

    it('disables "Load the rest" while those requests are in flight', () => {
      renderWallet(readyWallet(summaries, loaded, { pending: { [rest[0]!]: true } }));
      expect(screen.getByRole('button', { name: 'Load the rest' })).toBeDisabled();
    });

    it('has no notice once everything is loaded', () => {
      renderWallet(readyWallet());
      expect(screen.queryByRole('button', { name: 'Load the rest' })).not.toBeInTheDocument();
    });

    it('puts only loaded VCs in the wallet document, and says the rest are missing', async () => {
      renderWallet(readyWallet(summaries, loaded));
      await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));

      const document = JSON.parse(screen.getByRole('group', { name: 'Wallet JSON' }).textContent ?? '');
      expect(document.credentials).toHaveLength(12);
      expect(screen.getByText('Wallet JSON · 12 credentials')).toBeInTheDocument();
      expect(screen.getByText('Full details loaded for 12 of 14 credentials.')).toBeInTheDocument();
    });

    it('asks for one VC when its card is opened', async () => {
      const { onLoadDetails } = renderWallet(readyWallet(summaries, loaded));
      const unloadedCard = screen.getAllByRole('listitem')[13]!;

      await userEvent.click(within(unloadedCard).getByRole('button', { name: /^Credential, Expired/ }));

      expect(onLoadDetails).toHaveBeenCalledWith([rest[1]]);
      expect(within(screen.getByRole('dialog')).getByText('Loading credential details…')).toBeInTheDocument();
    });

    it('passes a failed load through to the open card', async () => {
      renderWallet(
        readyWallet(summaries, loaded, { failed: { [rest[1]!]: 'detail exploded' } }),
      );
      const unloadedCard = screen.getAllByRole('listitem')[13]!;

      await userEvent.click(within(unloadedCard).getByRole('button', { name: /^Credential, Expired/ }));

      expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('detail exploded');
    });

    it('shows the in-flight state on the open card without asking twice', async () => {
      const { onLoadDetails } = renderWallet(
        readyWallet(summaries, loaded, { pending: { [rest[1]!]: true } }),
      );
      const unloadedCard = screen.getAllByRole('listitem')[13]!;

      await userEvent.click(within(unloadedCard).getByRole('button', { name: /^Credential, Expired/ }));

      expect(onLoadDetails).not.toHaveBeenCalled();
      expect(within(screen.getByRole('dialog')).getByText('Loading credential details…')).toBeInTheDocument();
    });
  });

  describe('card detail', () => {
    it('opens from a card and closes again, returning focus to that card', async () => {
      renderWallet(readyWallet());
      const card = openButton(/^Agent Authorization credential, Expired/);

      await userEvent.click(card);
      const dialog = screen.getByRole('dialog', { name: 'Agent Authorization' });
      expect(within(dialog).getByText(expiredAgent.vcId)).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Close credential detail' })).toHaveFocus();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Close credential detail' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(card).toHaveFocus();
    });

    it('opens and closes entirely from the keyboard', async () => {
      renderWallet(readyWallet());
      const card = openButton(/^Delegation Grant credential/);
      card.focus();

      await userEvent.keyboard('{Enter}');
      expect(screen.getByRole('dialog', { name: 'Delegation Grant' })).toBeInTheDocument();

      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(card).toHaveFocus();
    });

    it('revokes the credential whose card is open', async () => {
      const { onRevoke } = renderWallet(readyWallet());

      await userEvent.click(openButton(/^Agent Authorization credential, Active/));
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }));

      expect(onRevoke).toHaveBeenCalledWith(activeAgent.vcId);
    });

    it('keeps the detail open across a re-load and shows the new status', async () => {
      const { rerender } = renderWallet(readyWallet());
      await userEvent.click(openButton(/^Agent Authorization credential, Active/));
      expect(within(screen.getByRole('dialog')).getByText('Active')).toBeInTheDocument();

      const revoked = { ...activeAgent, status: 'revoked' as const };
      rerender(
        <CredentialWallet
          agentDid={AGENT_DID}
          state={readyWallet(
            [grant, revoked, expiredAgent, revokedAgent],
            [
              grantDetail,
              detailOf(revoked, {}, { revokedAt: '2026-09-30T00:00:00.000Z' }),
              ...WALLET_DETAILS.slice(2),
            ],
          )}
          onRetry={vi.fn()}
          onLoadDetails={vi.fn()}
          onRevoke={vi.fn()}
        />,
      );

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Revoked')).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Revoke' })).toBeDisabled();
    });

    it('closes the detail if its credential is no longer in the wallet', async () => {
      const { rerender } = renderWallet(readyWallet());
      await userEvent.click(openButton(/^Delegation Grant credential/));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      rerender(
        <CredentialWallet
          agentDid={AGENT_DID}
          state={readyWallet(WALLET_SUMMARIES.slice(1), WALLET_DETAILS.slice(1))}
          onRetry={vi.fn()}
          onLoadDetails={vi.fn()}
          onRevoke={vi.fn()}
        />,
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
