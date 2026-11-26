// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CredentialCard } from '../../../../src/components/agents/wallet/CredentialCard';
import {
  credentialAccessibleName,
  formatDate,
  formatRelative,
  toWalletCredential,
} from '../../../../src/components/agents/wallet/credentialModel';
import type { VCResponse, VCSummary } from '../../../../src/api/types';
import {
  ISSUER_DID,
  SERVICE_DID,
  activeAgent,
  detailOf,
  expiredAgent,
  grant,
  grantDetail,
  revokedAgent,
  revokedDetail,
  stubClipboard,
  summaryOf,
} from './fixtures';

const NOW = Date.now();

function renderCard(summary: VCSummary, detail?: VCResponse, onOpen = vi.fn()) {
  const credential = toWalletCredential(summary, detail, NOW);
  const view = render(<CredentialCard credential={credential} now={NOW} onOpen={onOpen} />);
  return { ...view, credential, onOpen, card: view.container.querySelector('article')! };
}

describe('CredentialCard', () => {
  it('names itself by type, status and expiry for assistive tech', () => {
    const { credential } = renderCard(expiredAgent, detailOf(expiredAgent));

    const open = screen.getByRole('button', { name: /^Agent Authorization credential, Expired, valid until / });
    expect(open).toHaveAccessibleName(credentialAccessibleName(credential));
    // The visible title is the start of that name, so voice control can target it.
    expect(open).toHaveTextContent('Agent Authorization');
  });

  it('shows the status as a pill with an icon and words', () => {
    renderCard(activeAgent, detailOf(activeAgent));

    const pill = screen.getByText('Active');
    expect(pill).toHaveClass('status-active');
    expect(pill.querySelector('svg')).toBeInTheDocument();
  });

  it('gives each known type its own card treatment', () => {
    const agent = renderCard(activeAgent, detailOf(activeAgent));
    expect(agent.card).toHaveClass('cred-card--agent', 'cred-card--active');
    agent.unmount();

    const consent = renderCard(grant, grantDetail);
    expect(consent.card).toHaveClass('cred-card--grant');
    expect(screen.getByRole('button', { name: /^Delegation Grant credential/ })).toBeInTheDocument();
  });

  it('falls back to a generic card for a type it does not know', () => {
    const { card } = renderCard(
      activeAgent,
      detailOf(activeAgent, { type: ['VerifiableCredential', 'KycLevelTwoCredential'] }),
    );

    expect(card).toHaveClass('cred-card--generic');
    expect(screen.getByRole('button', { name: /^Kyc Level Two credential, Active/ })).toBeInTheDocument();
  });

  it('shows up to three scopes and folds the rest into +N', () => {
    renderCard(grant, grantDetail);

    expect(screen.getByText('book:flights')).toBeInTheDocument();
    expect(screen.getByText('read:itinerary')).toBeInTheDocument();
    expect(screen.getByText('pay:card')).toBeInTheDocument();
    expect(screen.queryByText('cancel:booking')).not.toBeInTheDocument();
    // The folded scopes stay discoverable on hover.
    expect(screen.getByText('+1')).toHaveAttribute('title', 'cancel:booking');
  });

  it('has no +N when everything fits, and says so when there are no scopes', () => {
    const three = summaryOf({ scopes: ['a:1', 'b:2', 'c:3'] });
    const fits = renderCard(three, detailOf(three));
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
    fits.unmount();

    const none = summaryOf({ scopes: [] });
    renderCard(none, detailOf(none, { credentialSubject: { id: none.subjectDid } }));
    expect(screen.getByText('No scopes')).toBeInTheDocument();
  });

  it('shows the expiry as a date, with the relative time on hover', () => {
    const { card } = renderCard(activeAgent, detailOf(activeAgent));

    const time = card.querySelector('time')!;
    expect(time).toHaveTextContent(formatDate(activeAgent.expiresAt));
    expect(time).toHaveAttribute('datetime', activeAgent.expiresAt);
    expect(time).toHaveAttribute('title', formatRelative(activeAgent.expiresAt, NOW));
    expect(time.getAttribute('title')).toMatch(/\d/);
  });

  it('omits the hover text when the expiry cannot be read', () => {
    const broken = summaryOf({ expiresAt: 'not a date' });
    const { card } = renderCard(broken, detailOf(broken));

    const time = card.querySelector('time')!;
    expect(time).toHaveTextContent('—');
    expect(time).not.toHaveAttribute('title');
  });

  it('opens the detail from the card, handing over the element to return focus to', async () => {
    const { onOpen } = renderCard(activeAgent, detailOf(activeAgent));
    const open = screen.getByRole('button', { name: /^Agent Authorization credential/ });

    await userEvent.click(open);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(activeAgent.vcId, open);
  });

  it('opens from the keyboard with Enter and with Space', async () => {
    const { onOpen } = renderCard(activeAgent, detailOf(activeAgent));
    screen.getByRole('button', { name: /^Agent Authorization credential/ }).focus();

    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('copies the full issuer DID without opening the detail', async () => {
    const writeText = stubClipboard();
    const { onOpen } = renderCard(activeAgent, detailOf(activeAgent));

    await userEvent.click(screen.getByRole('button', { name: `Copy issuer DID ${ISSUER_DID}` }));

    expect(writeText).toHaveBeenCalledWith(ISSUER_DID);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shortens a long issuer and VC ID on the card but copies them whole', async () => {
    const writeText = stubClipboard();
    const { card, onOpen } = renderCard(grant, grantDetail);

    expect(within(card).getByRole('button', { name: `Copy issuer DID ${SERVICE_DID}` })).toHaveTextContent(
      'did:web:travel.e…e.test',
    );
    expect(within(card).getByText('vc:helix:grant:s…000004')).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Copy VC ID' }));

    expect(writeText).toHaveBeenCalledWith(grant.vcId);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('keeps the tab order in reading order: open, copy issuer, copy VC ID', async () => {
    renderCard(activeAgent, detailOf(activeAgent));

    await userEvent.tab();
    expect(screen.getByRole('button', { name: /^Agent Authorization credential/ })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /^Copy issuer DID/ })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Copy VC ID' })).toHaveFocus();
  });

  it('marks a revoked credential with a band, dated when the date is known', () => {
    const dated = renderCard(revokedAgent, revokedDetail);
    expect(dated.card).toHaveClass('cred-card--revoked');
    expect(
      within(dated.card).getByText(`Revoked ${formatDate(revokedDetail.revokedAt ?? undefined)}`),
    ).toHaveClass('cred-card__band');
    dated.unmount();

    // From the list summary alone there is no revocation date to show.
    const undated = renderCard(revokedAgent);
    expect(undated.card.querySelector('.cred-card__band')).toHaveTextContent(/^Revoked$/);
  });

  it('has no band unless the credential is revoked', () => {
    const { card } = renderCard(expiredAgent, detailOf(expiredAgent));
    expect(card).toHaveClass('cred-card--expired');
    expect(card.querySelector('.cred-card__band')).toBeNull();
  });

  it('renders from the summary alone until the VC is loaded', () => {
    const { card } = renderCard(expiredAgent);

    expect(card).toHaveClass('cred-card--generic', 'cred-card--expired');
    expect(screen.getByRole('button', { name: /^Credential, Expired, valid until / })).toBeInTheDocument();
    expect(within(card).getByText('Details not loaded')).toBeInTheDocument();
    expect(within(card).getByText('read:orders')).toBeInTheDocument();
    expect(within(card).getByText(expiredAgent.vcId)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy issuer DID/ })).not.toBeInTheDocument();
  });

  it('shows a dash for an issuer the loaded VC does not name', () => {
    const { card } = renderCard(activeAgent, detailOf(activeAgent, { issuer: undefined }));

    expect(within(card).queryByText('Details not loaded')).not.toBeInTheDocument();
    expect(within(card).getByText('Issuer').nextElementSibling).toHaveTextContent('—');
  });

  it('keeps the proof value off the card', () => {
    const { card } = renderCard(activeAgent, detailOf(activeAgent));
    expect(card.outerHTML).not.toContain('zFakeProofValueForTestsOnly');
  });
});
