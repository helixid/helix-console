// Copyright 2026 DgVerse LLP
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AgentsPage } from '../../src/pages/AgentsPage';
import { api } from '../../src/api/client';
import type { VcFilters, VCResponse, VCSummary } from '../../src/api/types';
import { EAGER_DETAIL_LIMIT } from '../../src/components/agents/wallet/credentialModel';
import {
  AGENT_DID,
  activeAgent,
  detailOf,
  expiredAgent,
  grant,
  grantDetail,
  manySummaries,
  revokedAgent,
  revokedDetail,
} from '../components/agents/wallet/fixtures';

vi.mock('../../src/api/client', () => ({
  api: {
    listAgents: vi.fn(),
    getAgent: vi.fn(),
    revokeAgent: vi.fn(),
  },
}));

// GET /v1/vcs does both jobs: unfiltered (or narrowed by the page's
// ?subjectDid=) it fills the grid, and narrowed to one DID it fills a wallet.
const listAgents = vi.mocked(api.listAgents);
const getAgent = vi.mocked(api.getAgent);
const revokeAgent = vi.mocked(api.revokeAgent);

const billing: VCSummary = {
  vcId: 'vc:helix:billing',
  subjectDid: 'did:hedera:testnet:billing',
  agentName: 'billing-agent',
  scopes: ['read:orders'],
  status: 'active',
  issuedAt: '2026-06-01T00:00:00.000Z',
  expiresAt: '2026-09-01T00:00:00.000Z',
};

const delegated: VCSummary = {
  vcId: 'vc:helix:delegated',
  subjectDid: 'did:hedera:testnet:delegated',
  agentName: 'delegated-agent',
  scopes: ['read:orders'],
  status: 'active',
  issuedAt: '2026-06-02T00:00:00.000Z',
  expiresAt: '2026-09-01T00:00:00.000Z',
  parentVcId: 'vc:helix:billing',
};

/** What GET /v1/vcs returns for `filters`, out of `all`. */
function byDid(all: VCSummary[], filters?: VcFilters): VCSummary[] {
  return filters?.subjectDid === undefined ? all : all.filter((vc) => vc.subjectDid === filters.subjectDid);
}

function detailFor(summary: VCSummary, status = summary.status): VCResponse {
  return {
    vcId: summary.vcId,
    vc: { id: summary.vcId },
    status,
    expiresAt: summary.expiresAt,
    revokedAt: null,
    renewedByVcId: null,
  };
}

function renderPage(initialEntry = '/agents') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AgentsPage />
    </MemoryRouter>,
  );
}

/** The passport covers in the Agents grid. */
function covers(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Agents' })).getAllByRole('listitem');
}

/** The button that opens an agent's passport from its cover. */
function coverButton(agentName: string): Promise<HTMLElement> {
  return screen.findByRole('button', { name: new RegExp(`^Agent ${agentName},`) });
}

/** An agent's passport cover in the Agents grid. */
function coverOf(agentName: string): HTMLElement {
  const grid = screen.getByRole('list', { name: 'Agents' });
  return within(grid).getByRole('button', { name: new RegExp(`^Agent ${agentName},`) }).closest('li')!;
}

/** Opens an agent's passport from its cover and waits for its wallet to finish loading. */
async function openPanel(agentName: string): Promise<HTMLElement> {
  await userEvent.click(await coverButton(agentName));
  const panel = await screen.findByRole('dialog', { name: agentName });
  await waitFor(() => expect(within(panel).queryByText('Loading credentials…')).not.toBeInTheDocument());
  return panel;
}

/** The passport's facing pages, the wallet. The identity page prints the agent's VC ID too. */
function walletOf(panel: HTMLElement): HTMLElement {
  return within(panel).getByRole('region', { name: 'Credentials' });
}

function identityOf(panel: HTMLElement): HTMLElement {
  return within(panel).getByRole('region', { name: 'Identity' });
}

/** Opens the card for one credential and returns its detail dialog. */
async function openCredential(panel: HTMLElement, vcId: string): Promise<HTMLElement> {
  const card = (await within(walletOf(panel)).findByText(vcId)).closest('article')!;
  await userEvent.click(within(card).getAllByRole('button')[0]!);
  return within(panel).getByRole('dialog');
}

/** Narrows a text query to status badges — the status filter's options carry the same words. */
const BADGE = { selector: '.status-badge' };

/** A promise the test settles by hand, to hold a request open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Lists billing (revoked once revokeAgent has been called) and delegated,
 * and serves billing's VC in the same state.
 */
function revocableBilling() {
  const current = () =>
    revokeAgent.mock.calls.length > 0 ? { ...billing, status: 'revoked' as const } : billing;
  listAgents.mockImplementation(async (filters) => byDid([current(), delegated], filters));
  getAgent.mockImplementation(async () => detailFor(billing, current().status));
}

describe('AgentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    listAgents.mockImplementation(async (filters) => byDid([billing, delegated], filters));
    getAgent.mockImplementation(async (vcId) => detailFor(vcId === delegated.vcId ? delegated : billing));
  });

  it('loads the list, opens the passport, and revokes non-optimistically', async () => {
    revocableBilling();
    revokeAgent.mockResolvedValue({ vcId: billing.vcId, revoked: true, revokedAt: '2026-07-04T00:00:00.000Z' });

    renderPage();

    // One passport per agent; delegation is marked on the cover.
    const cover = await screen.findByText('billing-agent');
    expect(covers()).toHaveLength(2);
    expect(within(coverOf('delegated-agent')).getByText('Delegated')).toBeInTheDocument();
    expect(within(coverOf('billing-agent')).queryByText('Delegated')).not.toBeInTheDocument();

    // Open the passport: its wallet is every VC for the agent's DID.
    await userEvent.click(cover);
    const panel = await screen.findByRole('dialog', { name: 'billing-agent' });
    expect(await within(walletOf(panel)).findByText('vc:helix:billing')).toBeInTheDocument();
    expect(getAgent).toHaveBeenCalledWith(billing.vcId);
    expect(listAgents).toHaveBeenCalledWith({ subjectDid: billing.subjectDid });

    // Revoke from the credential's card detail. The badge flips only after
    // the API confirms and the wallet is re-fetched.
    const detail = await openCredential(panel, billing.vcId);
    expect(within(detail).getByText('Active')).toBeInTheDocument();
    await userEvent.click(within(detail).getByRole('button', { name: 'Revoke' }));
    expect(revokeAgent).toHaveBeenCalledWith(billing.vcId);
    expect(await within(detail).findByText('Revoked')).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(`Revoked ${billing.vcId}`);
  });

  it('keeps showing the old status until the revocation is confirmed', async () => {
    const revocation = deferred<{ vcId: string; revoked: true; revokedAt: string }>();
    revokeAgent.mockReturnValue(revocation.promise);
    revocableBilling();
    renderPage();
    const panel = await openPanel('billing-agent');
    const detail = await openCredential(panel, billing.vcId);

    await userEvent.click(within(detail).getByRole('button', { name: 'Revoke' }));

    // The request is out, nothing has come back: still Active, no toast.
    expect(within(detail).getByRole('button', { name: 'Revoking…' })).toBeDisabled();
    expect(within(detail).getByText('Active')).toBeInTheDocument();
    expect(within(panel).queryByText('Revoked', BADGE)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    revocation.resolve({ vcId: billing.vcId, revoked: true, revokedAt: '2026-07-04T00:00:00.000Z' });

    expect(await within(detail).findByText('Revoked')).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(`Revoked ${billing.vcId}`);
  });

  it('shows an error toast and keeps the badge when revocation fails', async () => {
    revokeAgent.mockRejectedValue(new Error('revocation exploded'));
    renderPage();

    const panel = await openPanel('billing-agent');
    const detail = await openCredential(panel, billing.vcId);
    await userEvent.click(within(detail).getByRole('button', { name: 'Revoke' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/revocation exploded/i);
    expect(within(panel).getAllByText('Active', BADGE).length).toBeGreaterThan(0);
    expect(within(panel).queryByText('Revoked', BADGE)).not.toBeInTheDocument();
    expect(within(coverOf('billing-agent')).getByText('Active')).toBeInTheDocument();
  });

  it('refreshes the list only when Refresh is clicked', async () => {
    renderPage();
    await screen.findByText('billing-agent');
    expect(listAgents).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(listAgents).toHaveBeenCalledTimes(2);
    expect(await coverButton('billing-agent')).toBeInTheDocument();
  });

  it('counts agents, not credentials, in the tiles', async () => {
    listAgents.mockImplementation(async (filters) =>
      byDid([billing, delegated, { ...revokedAgent, agentName: 'old-agent' }], filters),
    );
    renderPage();

    await screen.findByText('billing-agent');
    const tile = (label: string) => screen.getByText(label, { selector: '.stat-label' }).previousElementSibling;
    expect(tile('Total Agents')).toHaveTextContent('3');
    expect(tile('Active Agents')).toHaveTextContent('2');
    expect(tile('Revoked')).toHaveTextContent('1');
    // The tile, not the cover's Delegated badge.
    expect(tile('Delegated')).toHaveTextContent('1');
  });

  it('lists one passport per agent from its identity credential when the API types its credentials (story F-1)', async () => {
    const identity: VCSummary = { ...billing, vcId: 'vc:identity', vcType: 'AgentIdentityCredential', scopes: [] };
    // Newest first: a reissued identity wins over the one it replaced.
    const reissued: VCSummary = { ...identity, vcId: 'vc:identity-2', issuedAt: '2026-06-05T00:00:00.000Z' };
    const { agentName: _name, ...unnamed } = billing;
    const attestation: VCSummary = {
      ...unnamed,
      vcId: 'vc:attestation',
      vcType: 'CapabilityAttestationCredential',
      issuedAt: '2026-06-03T00:00:00.000Z',
    };
    const hop: VCSummary = { ...unnamed, vcId: 'vc:hop', vcType: 'DelegationCredential', issuedAt: '2026-06-04T00:00:00.000Z' };
    listAgents.mockImplementation(async (filters) => byDid([reissued, hop, attestation, identity], filters));
    renderPage();

    expect(await screen.findByText('billing-agent')).toBeInTheDocument();
    expect(covers()).toHaveLength(1);

    // The passport is the reissued identity's.
    const panel = await openPanel('billing-agent');
    expect(within(identityOf(panel)).getByText('vc:identity-2')).toBeInTheDocument();
  });

  it('keeps one passport per DID for a list without types', async () => {
    const older: VCSummary = { ...billing, vcId: 'vc:helix:billing-old', issuedAt: '2026-05-01T00:00:00.000Z' };
    listAgents.mockImplementation(async (filters) => byDid([billing, older, delegated], filters));
    renderPage();

    await screen.findByText('billing-agent');
    expect(covers()).toHaveLength(2);
  });

  it('applies the subjectDid filter from the query string', async () => {
    renderPage(`/agents?subjectDid=${encodeURIComponent(billing.subjectDid)}`);

    await screen.findByText('billing-agent');
    expect(listAgents).toHaveBeenCalledWith({ subjectDid: billing.subjectDid });
    expect(screen.queryByText('delegated-agent')).not.toBeInTheDocument();
    expect(screen.getByText(/filtered by did/i)).toHaveTextContent(billing.subjectDid);
  });

  it('clears the subjectDid filter', async () => {
    renderPage(`/agents?subjectDid=${encodeURIComponent(billing.subjectDid)}`);
    await screen.findByText(/filtered by did/i);

    await userEvent.click(screen.getByRole('button', { name: /clear filter/i }));
    expect(screen.queryByText(/filtered by did/i)).not.toBeInTheDocument();
    expect(listAgents).toHaveBeenLastCalledWith(undefined);
    expect(await screen.findByText('delegated-agent')).toBeInTheDocument();
  });

  it('closes the passport and dismisses toasts', async () => {
    revokeAgent.mockRejectedValue(new Error('nope'));
    renderPage();

    const panel = await openPanel('billing-agent');
    const detail = await openCredential(panel, billing.vcId);
    await userEvent.click(within(detail).getByRole('button', { name: 'Revoke' }));
    await screen.findByRole('status');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await userEvent.click(within(detail).getByRole('button', { name: 'Close credential detail' }));
    expect(within(panel).queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Close passport' }));
    expect(screen.queryByRole('dialog', { name: 'billing-agent' })).not.toBeInTheDocument();
    // Focus goes back to the cover that opened it.
    expect(await coverButton('billing-agent')).toHaveFocus();
  });

  it('toasts when loading the detail fails', async () => {
    getAgent.mockRejectedValue(new Error('detail exploded'));
    renderPage();

    await userEvent.click(await screen.findByText('billing-agent'));
    expect(await screen.findByRole('status')).toHaveTextContent('detail exploded');
  });

  it('shows a delegated agent lineage in the passport', async () => {
    renderPage();

    const panel = await openPanel('delegated-agent');
    expect(within(identityOf(panel)).getByText('Delegated from').nextElementSibling).toHaveTextContent(
      'vc:helix:billing',
    );
    // History is part of the wallet: no prior credentials means one card.
    expect(within(walletOf(panel)).getAllByRole('listitem')).toHaveLength(1);

    const detail = await openCredential(panel, delegated.vcId);
    expect(within(detail).getByText('Delegated from').nextElementSibling).toHaveTextContent('vc:helix:billing');
  });

  it('surfaces load errors', async () => {
    listAgents.mockRejectedValue(new Error('api unreachable'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('api unreachable');
  });

  it('surfaces a load failure that is not an Error with a generic message', async () => {
    listAgents.mockRejectedValue('boom');
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load agents');
  });

  it('re-reads the agents after a revocation, so a revoked agent is stamped revoked', async () => {
    revocableBilling();
    revokeAgent.mockResolvedValue({ vcId: billing.vcId, revoked: true, revokedAt: '2026-07-04T00:00:00.000Z' });
    renderPage();
    const panel = await openPanel('billing-agent');
    const detail = await openCredential(panel, billing.vcId);

    await userEvent.click(within(detail).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(listAgents).toHaveBeenLastCalledWith(undefined));
    expect(await within(coverOf('billing-agent')).findByText('Revoked')).toBeInTheDocument();
    expect(within(coverOf('billing-agent')).queryByText('Active')).not.toBeInTheDocument();
    // The open passport follows the re-read agent.
    expect(await within(identityOf(panel)).findByText('Its credential was revoked')).toBeInTheDocument();
  });

  it('keeps the open passport when the re-read list no longer has its agent', async () => {
    revokeAgent.mockResolvedValue({ vcId: billing.vcId, revoked: true, revokedAt: '2026-07-04T00:00:00.000Z' });
    renderPage();
    const panel = await openPanel('billing-agent');
    listAgents.mockImplementation(async (filters) =>
      filters?.subjectDid === undefined ? [delegated] : byDid([billing], filters),
    );

    await userEvent.click(within(identityOf(panel)).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /^Agent billing-agent,/ })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'billing-agent' })).toBeInTheDocument();
  });

  it('re-reads only the filtered DID after a revocation, even once the passport has closed', async () => {
    revokeAgent.mockResolvedValue({ vcId: billing.vcId, revoked: true, revokedAt: '2026-07-04T00:00:00.000Z' });
    const reread = deferred<VCSummary[]>();
    renderPage(`/agents?subjectDid=${encodeURIComponent(billing.subjectDid)}`);
    const panel = await openPanel('billing-agent');
    const calls = listAgents.mock.calls.length;
    // The wallet re-load answers at once; the grid's re-read is held open.
    listAgents.mockImplementation((filters) =>
      listAgents.mock.calls.length > calls + 1 ? reread.promise : Promise.resolve(byDid([billing], filters)),
    );

    await userEvent.click(within(identityOf(panel)).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(listAgents.mock.calls.length).toBe(calls + 2));
    expect(listAgents.mock.calls.slice(calls)).toEqual([
      [{ subjectDid: billing.subjectDid }],
      [{ subjectDid: billing.subjectDid }],
    ]);

    await userEvent.click(within(panel).getByRole('button', { name: 'Close passport' }));
    reread.resolve([{ ...billing, status: 'revoked' }]);

    expect(await within(coverOf('billing-agent')).findByText('Revoked')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the agents as they were when re-reading them after a revocation fails', async () => {
    revokeAgent.mockResolvedValue({ vcId: billing.vcId, revoked: true, revokedAt: '2026-07-04T00:00:00.000Z' });
    renderPage();
    const panel = await openPanel('billing-agent');
    const detail = await openCredential(panel, billing.vcId);
    const calls = listAgents.mock.calls.length;
    listAgents.mockImplementation(async (filters) => {
      if (filters?.subjectDid === undefined) throw new Error('flaky');
      return byDid([billing, delegated], filters);
    });

    await userEvent.click(within(detail).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(listAgents.mock.calls.length).toBe(calls + 2));
    expect(screen.getByText('delegated-agent')).toBeInTheDocument();
    expect(screen.queryByText(/flaky/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(`Revoked ${billing.vcId}`);
  });

  describe('passport', () => {
    it("revokes the agent's own credential from its identity page, non-optimistically", async () => {
      revocableBilling();
      revokeAgent.mockResolvedValue({ vcId: billing.vcId, revoked: true, revokedAt: '2026-07-04T00:00:00.000Z' });
      renderPage();
      const panel = await openPanel('billing-agent');
      const identity = identityOf(panel);

      await userEvent.click(within(identity).getByRole('button', { name: 'Revoke' }));

      expect(revokeAgent).toHaveBeenCalledWith(billing.vcId);
      expect(await within(panel).findByRole('status')).toHaveTextContent(`Revoked ${billing.vcId}`);
      // The wallet was re-read: the credential shows revoked, and Revoke stands down.
      expect(within(walletOf(panel)).getByText('Revoked', BADGE)).toBeInTheDocument();
      expect(within(identity).getByRole('button', { name: 'Revoke' })).toBeDisabled();
    });

    it('hands focus back to the cover when the passport closes on Escape', async () => {
      renderPage();
      await openPanel('billing-agent');

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('dialog', { name: 'billing-agent' })).not.toBeInTheDocument();
      expect(await coverButton('billing-agent')).toHaveFocus();
    });

    it('closes an open credential on Escape and keeps the passport open', async () => {
      renderPage();
      const panel = await openPanel('billing-agent');
      await openCredential(panel, billing.vcId);

      await userEvent.keyboard('{Escape}');

      expect(within(panel).queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'billing-agent' })).toBeInTheDocument();
    });

    it('shows the toast inside an open passport, and on the page once it closes', async () => {
      revokeAgent.mockRejectedValue(new Error('nope'));
      renderPage();
      const panel = await openPanel('billing-agent');

      await userEvent.click(within(identityOf(panel)).getByRole('button', { name: 'Revoke' }));
      expect(await within(panel).findByRole('status')).toHaveTextContent('nope');

      await userEvent.click(within(panel).getByRole('button', { name: 'Close passport' }));
      expect(screen.getByRole('status')).toHaveTextContent('nope');
    });

    it('shows skeleton covers while the agents load', async () => {
      const list = deferred<VCSummary[]>();
      listAgents.mockReturnValue(list.promise);
      renderPage();

      expect(screen.getByText('Loading agents…')).toBeInTheDocument();
      list.resolve([billing]);

      expect(await coverButton('billing-agent')).toBeInTheDocument();
      expect(screen.queryByText('Loading agents…')).not.toBeInTheDocument();
    });

    it('retries a failed load from the error state', async () => {
      listAgents.mockRejectedValueOnce(new Error('api unreachable'));
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not load agents: api unreachable');
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

      expect(await coverButton('billing-agent')).toBeInTheDocument();
      expect(listAgents).toHaveBeenCalledTimes(2);
    });

    it('points an account with no agents at Enroll, but not a filtered list that matched none', async () => {
      listAgents.mockResolvedValue([]);
      const { unmount } = renderPage();
      expect(await screen.findByText('No agents found.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Enroll an agent' })).toBeInTheDocument();
      unmount();

      listAgents.mockImplementation(async (filters) => byDid([billing], filters));
      renderPage(`/agents?subjectDid=${encodeURIComponent('did:web:example.test:agents:nobody')}`);
      expect(await screen.findByText('No agents found.')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Enroll an agent' })).not.toBeInTheDocument();
    });
  });

  describe('wallet', () => {
    const WALLET = [grant, activeAgent, expiredAgent, revokedAgent];
    const DETAILS = [grantDetail, detailOf(activeAgent), detailOf(expiredAgent), revokedDetail];

    beforeEach(() => {
      // The wallet lists all four credentials; the grid lists the agent
      // once, described by its own credential rather than by the newer grant.
      listAgents.mockImplementation(async (filters) =>
        filters?.subjectDid === AGENT_DID ? WALLET : [activeAgent],
      );
      getAgent.mockImplementation(async (vcId) => DETAILS.find((detail) => detail.vcId === vcId)!);
    });

    it('shows the agent, its DID and one card per credential, history included', async () => {
      renderPage();
      const panel = await openPanel('billing-agent');

      // Four credentials, one agent: a single passport in the grid.
      expect(covers()).toHaveLength(1);
      expect(within(panel).getByRole('heading', { name: 'billing-agent' })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Copy agent DID' })).toHaveTextContent(AGENT_DID);
      expect(within(walletOf(panel)).getAllByRole('listitem')).toHaveLength(4);
      expect(within(panel).getByRole('tab', { name: 'Wallet' })).toHaveAttribute('aria-selected', 'true');
      // Each credential's type and issuer come from its own VC.
      expect(getAgent.mock.calls.map(([vcId]) => vcId).sort()).toEqual(
        WALLET.map((summary) => summary.vcId).sort(),
      );
      expect(within(panel).getByRole('button', { name: /^Delegation Grant credential, Active/ })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: /^Agent Authorization credential, Revoked/ })).toBeInTheDocument();
    });

    it('shows skeleton cards while the wallet loads', async () => {
      const list = deferred<VCSummary[]>();
      listAgents.mockImplementation((filters) =>
        filters?.subjectDid === AGENT_DID ? list.promise : Promise.resolve([activeAgent]),
      );
      renderPage();

      await userEvent.click(await screen.findByText('billing-agent'));
      const panel = await screen.findByRole('dialog', { name: 'billing-agent' });
      expect(within(panel).getByText('Loading credentials…')).toBeInTheDocument();
      expect(within(identityOf(panel)).getByText('Loading…')).toBeInTheDocument();

      list.resolve(WALLET);
      expect(await within(walletOf(panel)).findAllByRole('listitem')).toHaveLength(4);
    });

    it('revokes the credential whose card is open, not the newest one', async () => {
      revokeAgent.mockResolvedValue({ vcId: activeAgent.vcId, revoked: true, revokedAt: '2026-09-30T00:00:00.000Z' });
      renderPage();
      const panel = await openPanel('billing-agent');

      const detail = await openCredential(panel, activeAgent.vcId);
      await userEvent.click(within(detail).getByRole('button', { name: 'Revoke' }));

      expect(revokeAgent).toHaveBeenCalledTimes(1);
      expect(revokeAgent).toHaveBeenCalledWith(activeAgent.vcId);
      expect(await screen.findByRole('status')).toHaveTextContent(`Revoked ${activeAgent.vcId}`);
    });

    it('re-fetches the wallet after a revocation without dropping back to the skeleton', async () => {
      revokeAgent.mockResolvedValue({ vcId: activeAgent.vcId, revoked: true, revokedAt: '2026-09-30T00:00:00.000Z' });
      renderPage();
      const panel = await openPanel('billing-agent');
      const detail = await openCredential(panel, activeAgent.vcId);
      getAgent.mockClear();
      listAgents.mockClear();

      await userEvent.click(within(detail).getByRole('button', { name: 'Revoke' }));
      await screen.findByRole('status');

      // The wallet, then the grid.
      await waitFor(() => expect(listAgents.mock.calls).toEqual([[{ subjectDid: AGENT_DID }], [undefined]]));
      // Every VC that was on screen is refreshed, so none goes stale.
      expect(getAgent.mock.calls.map(([vcId]) => vcId).sort()).toEqual(
        WALLET.map((summary) => summary.vcId).sort(),
      );
      expect(within(panel).queryByText('Loading credentials…')).not.toBeInTheDocument();
      expect(within(panel).getByRole('dialog')).toBeInTheDocument();
    });

    it('shows an error state with Retry when the credentials cannot be listed', async () => {
      let attempts = 0;
      listAgents.mockImplementation(async (filters) => {
        if (filters?.subjectDid !== AGENT_DID) return [activeAgent];
        attempts += 1;
        if (attempts === 1) throw new Error('wallet unreachable');
        return WALLET;
      });
      renderPage();

      await userEvent.click(await screen.findByText('billing-agent'));
      const panel = await screen.findByRole('dialog', { name: 'billing-agent' });
      expect(await within(panel).findByRole('alert')).toHaveTextContent(
        'Could not load credentials: wallet unreachable',
      );
      expect(screen.getByRole('status')).toHaveTextContent('wallet unreachable');

      await userEvent.click(within(panel).getByRole('button', { name: 'Retry' }));

      expect(await within(walletOf(panel)).findAllByRole('listitem')).toHaveLength(4);
      expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
    });

    it('degrades one card, not the wallet, when a single VC fails to load', async () => {
      getAgent.mockImplementation(async (vcId) => {
        if (vcId === expiredAgent.vcId) throw new Error('detail exploded');
        return DETAILS.find((detail) => detail.vcId === vcId)!;
      });
      renderPage();
      const panel = await openPanel('billing-agent');

      expect(within(walletOf(panel)).getAllByRole('listitem')).toHaveLength(4);
      expect(screen.getByRole('status')).toHaveTextContent('detail exploded');
      expect(within(panel).getByText('Full details loaded for 3 of 4 credentials.')).toBeInTheDocument();
      const card = within(panel).getByText(expiredAgent.vcId).closest('article')!;
      expect(within(card).getByText('Details not loaded')).toBeInTheDocument();
      expect(within(card).getByText('Expired')).toBeInTheDocument();

      // The card says why, and retrying from it loads just that credential.
      const detail = await openCredential(panel, expiredAgent.vcId);
      expect(within(detail).getByRole('alert')).toHaveTextContent('detail exploded');
      getAgent.mockImplementation(async (vcId) => DETAILS.find((candidate) => candidate.vcId === vcId)!);
      getAgent.mockClear();

      await userEvent.click(within(detail).getByRole('button', { name: 'Retry' }));

      expect(await within(detail).findByText('HelixAgentCredential')).toBeInTheDocument();
      expect(getAgent.mock.calls).toEqual([[expiredAgent.vcId]]);
      expect(within(panel).queryByText(/Full details loaded for/)).not.toBeInTheDocument();
    });

    it('falls back to generic messages when the API rejects with something that is not an Error', async () => {
      getAgent.mockImplementation(async (vcId) => {
        if (vcId === expiredAgent.vcId) throw 'boom';
        return DETAILS.find((detail) => detail.vcId === vcId)!;
      });
      revokeAgent.mockRejectedValue('boom');
      renderPage();
      const panel = await openPanel('billing-agent');
      expect(screen.getByRole('status')).toHaveTextContent('Failed to load agent detail');

      const detail = await openCredential(panel, activeAgent.vcId);
      await userEvent.click(within(detail).getByRole('button', { name: 'Revoke' }));
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Revocation failed'));
    });

    it('falls back to a generic message when the list rejects with something that is not an Error', async () => {
      listAgents.mockImplementation(async (filters) => {
        if (filters?.subjectDid === AGENT_DID) throw 'boom';
        return [activeAgent];
      });
      renderPage();

      await userEvent.click(await screen.findByText('billing-agent'));
      const panel = await screen.findByRole('dialog', { name: 'billing-agent' });
      expect(await within(panel).findByRole('alert')).toHaveTextContent('Failed to load agent detail');
      expect(within(identityOf(panel)).getByText('Not loaded')).toBeInTheDocument();
    });
  });

  describe('a wallet too large to load in full', () => {
    const many = manySummaries(EAGER_DETAIL_LIMIT + 3);
    const manyDetails = many.map((summary) => detailOf(summary));
    const bulkAgent: VCSummary = { ...many[0]!, agentName: 'bulk-agent' };
    const beyond = many.slice(EAGER_DETAIL_LIMIT).map((summary) => summary.vcId);

    beforeEach(() => {
      listAgents.mockImplementation(async (filters) =>
        filters?.subjectDid === AGENT_DID ? many : [bulkAgent],
      );
      getAgent.mockImplementation(async (vcId) => manyDetails.find((detail) => detail.vcId === vcId)!);
    });

    it('fetches only the first cards up front and the rest on request', async () => {
      renderPage();
      const panel = await openPanel('bulk-agent');

      expect(within(walletOf(panel)).getAllByRole('listitem')).toHaveLength(EAGER_DETAIL_LIMIT + 3);
      expect(getAgent).toHaveBeenCalledTimes(EAGER_DETAIL_LIMIT);
      expect(
        within(panel).getByText(
          `Full details loaded for ${EAGER_DETAIL_LIMIT} of ${EAGER_DETAIL_LIMIT + 3} credentials.`,
        ),
      ).toBeInTheDocument();
      getAgent.mockClear();

      await userEvent.click(within(panel).getByRole('button', { name: 'Load the rest' }));

      await waitFor(() =>
        expect(within(panel).queryByText(/Full details loaded for/)).not.toBeInTheDocument(),
      );
      expect(getAgent.mock.calls.map(([vcId]) => vcId)).toEqual(beyond);
      expect(within(panel).queryByText('Details not loaded')).not.toBeInTheDocument();
    });

    it('loads one more VC when its card is opened', async () => {
      renderPage();
      const panel = await openPanel('bulk-agent');
      getAgent.mockClear();

      const detail = await openCredential(panel, beyond[2]!);

      expect(await within(detail).findByText('HelixAgentCredential')).toBeInTheDocument();
      expect(getAgent.mock.calls).toEqual([[beyond[2]]]);
      expect(
        within(panel).getByText(
          `Full details loaded for ${EAGER_DETAIL_LIMIT + 1} of ${EAGER_DETAIL_LIMIT + 3} credentials.`,
        ),
      ).toBeInTheDocument();
    });

    it('asks once for a VC even when the request is triggered twice', async () => {
      // StrictMode runs the opening effect twice, as it does in development.
      render(
        <StrictMode>
          <MemoryRouter initialEntries={['/agents']}>
            <AgentsPage />
          </MemoryRouter>
        </StrictMode>,
      );
      const panel = await openPanel('bulk-agent');
      getAgent.mockClear();

      const detail = await openCredential(panel, beyond[0]!);

      expect(await within(detail).findByText('HelixAgentCredential')).toBeInTheDocument();
      expect(getAgent.mock.calls).toEqual([[beyond[0]]]);
    });

    it('keeps on-demand VCs loaded across a revocation re-fetch', async () => {
      const active = manySummaries(EAGER_DETAIL_LIMIT + 3, 'active');
      const activeDetails = active.map((summary) => detailOf(summary));
      listAgents.mockImplementation(async (filters) =>
        filters?.subjectDid === AGENT_DID ? active : [{ ...active[0]!, agentName: 'bulk-agent' }],
      );
      getAgent.mockImplementation(async (vcId) => activeDetails.find((detail) => detail.vcId === vcId)!);
      revokeAgent.mockResolvedValue({ vcId: beyond[1]!, revoked: true, revokedAt: '2026-09-30T00:00:00.000Z' });
      renderPage();
      const panel = await openPanel('bulk-agent');
      const detail = await openCredential(panel, beyond[1]!);
      expect(await within(detail).findByText('HelixAgentCredential')).toBeInTheDocument();
      getAgent.mockClear();

      await userEvent.click(within(detail).getByRole('button', { name: 'Revoke' }));
      await screen.findByRole('status');

      expect(revokeAgent).toHaveBeenCalledWith(beyond[1]);
      expect(getAgent.mock.calls.map(([vcId]) => vcId)).toContain(beyond[1]);
      expect(getAgent).toHaveBeenCalledTimes(EAGER_DETAIL_LIMIT + 1);
    });

    it('surfaces a failure to load a VC on demand', async () => {
      renderPage();
      const panel = await openPanel('bulk-agent');
      getAgent.mockRejectedValue(new Error('on-demand exploded'));

      const detail = await openCredential(panel, beyond[0]!);

      expect(await within(detail).findByRole('alert')).toHaveTextContent('on-demand exploded');
      expect(screen.getByRole('status')).toHaveTextContent('on-demand exploded');
    });
  });

  describe('responses that arrive too late', () => {
    it('ignores a wallet for an agent that is no longer selected', async () => {
      const slow = deferred<VCSummary[]>();
      listAgents.mockImplementation((filters) => {
        if (filters?.subjectDid === billing.subjectDid) return slow.promise;
        if (filters?.subjectDid === delegated.subjectDid) return Promise.resolve([delegated]);
        return Promise.resolve([billing, delegated]);
      });
      getAgent.mockImplementation(async (vcId) => ({
        vcId,
        vc: { id: vcId },
        status: 'active',
        expiresAt: delegated.expiresAt,
        revokedAt: null,
        renewedByVcId: null,
      }));
      renderPage();

      // The passport is modal, so the first one is closed before the next opens.
      await userEvent.click(await screen.findByText('billing-agent'));
      await userEvent.keyboard('{Escape}');
      const panel = await openPanel('delegated-agent');
      expect(within(walletOf(panel)).getByText(delegated.vcId)).toBeInTheDocument();

      slow.resolve([billing]);
      await waitFor(() => expect(getAgent).toHaveBeenCalledWith(billing.vcId));

      // The late wallet for the first agent never replaces the one on screen.
      expect(within(walletOf(panel)).getByText(delegated.vcId)).toBeInTheDocument();
      expect(within(walletOf(panel)).queryByText(billing.vcId)).not.toBeInTheDocument();
      expect(within(walletOf(panel)).getAllByRole('listitem')).toHaveLength(1);
    });

    it('ignores a failure for an agent that is no longer selected', async () => {
      const slow = deferred<VCSummary[]>();
      listAgents.mockImplementation((filters) => {
        if (filters?.subjectDid === billing.subjectDid) return slow.promise;
        if (filters?.subjectDid === delegated.subjectDid) return Promise.resolve([delegated]);
        return Promise.resolve([billing, delegated]);
      });
      renderPage();

      await userEvent.click(await screen.findByText('billing-agent'));
      await userEvent.keyboard('{Escape}');
      const panel = await openPanel('delegated-agent');

      slow.reject(new Error('too late to matter'));
      await Promise.resolve();

      expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(within(walletOf(panel)).getAllByRole('listitem')).toHaveLength(1);
    });

    it('drops an on-demand VC that arrives after the passport was closed', async () => {
      const many = manySummaries(EAGER_DETAIL_LIMIT + 1);
      const details = many.map((summary) => detailOf(summary));
      const late = deferred<VCResponse>();
      const lateId = many[EAGER_DETAIL_LIMIT]!.vcId;
      listAgents.mockImplementation(async (filters) =>
        filters?.subjectDid === AGENT_DID ? many : [{ ...many[0]!, agentName: 'bulk-agent' }],
      );
      getAgent.mockImplementation((vcId) =>
        vcId === lateId ? late.promise : Promise.resolve(details.find((detail) => detail.vcId === vcId)!),
      );
      renderPage();
      const panel = await openPanel('bulk-agent');
      const detail = await openCredential(panel, lateId);
      expect(within(detail).getByText('Loading credential details…')).toBeInTheDocument();

      await userEvent.click(within(detail).getByRole('button', { name: 'Close credential detail' }));
      await userEvent.click(within(panel).getByRole('button', { name: 'Close passport' }));
      late.reject(new Error('nobody is listening'));
      await Promise.resolve();

      expect(screen.queryByRole('dialog', { name: 'bulk-agent' })).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });
});
