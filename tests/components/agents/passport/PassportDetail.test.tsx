// Copyright 2026 DgVerse LLP
import { useRef, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PassportDetail,
  type PassportDetailProps,
} from '../../../../src/components/agents/passport/PassportDetail';
import {
  LOADING_WALLET,
  formatDate,
  shortenId,
} from '../../../../src/components/agents/wallet/credentialModel';
import {
  AGENT_DID,
  FUTURE,
  ISSUER_DID,
  PAST,
  activeAgent,
  detailOf,
  expiredAgent,
  passportAgentOf,
  readyWallet,
  revokedAgent,
  revokedDetail,
  stubClipboard,
  summaryOf,
} from '../wallet/fixtures';

const billing = passportAgentOf(activeAgent);
const WALLET = readyWallet([activeAgent, expiredAgent], [detailOf(activeAgent), detailOf(expiredAgent)]);

function callbacks() {
  return {
    onRetry: vi.fn(),
    onLoadDetails: vi.fn(),
    onRevoke: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };
}

function renderPassport(props: Partial<PassportDetailProps> = {}) {
  const handlers = callbacks();
  const view = render(<PassportDetail agent={billing} wallet={WALLET} {...handlers} {...props} />);
  return { ...view, ...handlers };
}

const passport = (name = 'billing-agent') => screen.getByRole('dialog', { name });
const identityPage = () => screen.getByRole('region', { name: 'Identity' });
const visaPages = () => screen.getByRole('region', { name: 'Credentials' });

/** The value next to one label on the identity page. */
function field(label: string): HTMLElement {
  return within(identityPage()).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;
}

/** Opens a passport from a button, the way the Agents page does, and closes it on request. */
function Opener({ returnToCard }: { returnToCard: boolean }) {
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={card} type="button">
        Card
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Open passport
      </button>
      {open && (
        <PassportDetail
          agent={billing}
          wallet={WALLET}
          {...callbacks()}
          {...(returnToCard ? { returnFocusRef: card } : {})}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

describe('PassportDetail', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a modal dialog named after the agent, rendered into <body>', () => {
    const { container } = renderPassport();

    const dialog = passport();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(container).not.toContainElement(dialog);
    expect(document.body).toContainElement(dialog);
    expect(within(dialog).getByRole('heading', { level: 2, name: 'billing-agent' })).toBeInTheDocument();
  });

  it('starts on Close, in a bar drawn as the dark cover', () => {
    renderPassport();

    const close = screen.getByRole('button', { name: 'Close passport' });
    expect(close).toHaveFocus();
    expect(close.closest('header')).toHaveAttribute('data-theme', 'dark');
  });

  it("shows the page's notice inside, where the backdrop does not hide it", () => {
    renderPassport({ notice: <p role="status">Revoked vc:helix:agent-active</p> });

    expect(within(passport()).getByRole('status')).toHaveTextContent('Revoked vc:helix:agent-active');
  });

  describe('the identity page', () => {
    it("shows who the agent is and what its own credential says", () => {
      renderPassport();
      const identity = identityPage();

      expect(within(identity).getByRole('button', { name: 'Copy agent DID' })).toHaveTextContent(AGENT_DID);
      expect(within(identity).getByText('Active').closest('.passport-stamp')).toHaveClass('passport-stamp--page');
      expect(field('Issuer')).toHaveTextContent(ISSUER_DID);
      expect(field('Issued')).toHaveTextContent(formatDate(PAST));
      expect(field('Expires')).toHaveTextContent(formatDate(FUTURE));
      expect(field('VC ID')).toHaveTextContent(activeAgent.vcId);
      expect(within(field('Scopes')).getByText('read:orders')).toHaveClass('scope-chip');
      expect(within(identity).queryByText('Delegated from')).not.toBeInTheDocument();
      expect(identity.querySelector('.passport-mrz')).toHaveAttribute('aria-hidden', 'true');
      expect(identity.querySelector('svg.passport-avatar')).toHaveAttribute('aria-hidden', 'true');
    });

    it('shows dates as dates, with the relative reading as a tooltip', () => {
      renderPassport();
      const expires = within(field('Expires')).getByText(formatDate(FUTURE));
      expect(expires).toHaveAttribute('datetime', FUTURE);
      expect(expires).toHaveAttribute('title', expect.stringMatching(/^in \d+ years$/));
    });

    it('invents no tooltip for a date it cannot read', () => {
      renderPassport({ agent: { ...billing, credential: { ...billing.credential, issuedAt: 'not a date' } } });
      const issued = within(field('Issued')).getByText('—');
      expect(issued).not.toHaveAttribute('title');
    });

    it('copies the agent DID, the VC ID and the issuer', async () => {
      const writeText = stubClipboard();
      renderPassport();
      const identity = identityPage();

      await userEvent.click(within(identity).getByRole('button', { name: 'Copy agent DID' }));
      await userEvent.click(within(identity).getByRole('button', { name: 'Copy VC ID' }));
      await userEvent.click(within(identity).getByRole('button', { name: 'Copy issuer DID' }));

      expect(writeText.mock.calls).toEqual([[AGENT_DID], [activeAgent.vcId], [ISSUER_DID]]);
    });

    it('says the issuer is still loading, then when its credential was not loaded', () => {
      const { rerender } = renderPassport({ wallet: LOADING_WALLET });
      expect(field('Issuer')).toHaveTextContent('Loading…');

      rerender(<PassportDetail agent={billing} wallet={readyWallet([activeAgent], [])} {...callbacks()} />);
      expect(field('Issuer')).toHaveTextContent('Not loaded');
    });

    it('stamps an expired agent and says why', () => {
      renderPassport({
        agent: passportAgentOf(expiredAgent),
        wallet: readyWallet([expiredAgent], [detailOf(expiredAgent)]),
      });

      expect(within(identityPage()).getByText('Expired').closest('.passport-stamp')).toHaveClass(
        'passport-stamp--expired',
      );
      expect(within(identityPage()).getByText('Its credential has expired')).toBeInTheDocument();
      expect(passport()).toHaveClass('passport-detail--expired');
    });

    it('stamps a revoked agent, says why, and offers no Revoke', () => {
      renderPassport({
        agent: passportAgentOf(revokedAgent),
        wallet: readyWallet([revokedAgent], [revokedDetail]),
      });

      expect(within(identityPage()).getByText('Revoked').closest('.passport-stamp')).toHaveClass(
        'passport-stamp--revoked',
      );
      expect(within(identityPage()).getByText('Its credential was revoked')).toBeInTheDocument();
      expect(within(identityPage()).getByRole('button', { name: 'Revoke' })).toBeDisabled();
    });

    it('says so when its credential carries no scopes', () => {
      const bare = summaryOf({ scopes: [] });
      renderPassport({ agent: passportAgentOf(bare), wallet: readyWallet([bare], [detailOf(bare)]) });

      expect(field('Scopes')).toHaveTextContent('No scopes');
    });

    it("names the credential a delegated agent's authority comes from", () => {
      renderPassport({ agent: { ...billing, delegatedFromVcId: 'vc:helix:parent' } });

      expect(field('Delegated from')).toHaveTextContent('vc:helix:parent');
    });

    it('falls back to the DID, cut short, for an agent without a name', () => {
      renderPassport({ agent: { ...billing, name: null } });
      const short = shortenId(AGENT_DID);

      expect(passport(short)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: short })).toBeInTheDocument();
      // The full DID is still there to read and copy.
      expect(within(identityPage()).getByRole('button', { name: 'Copy agent DID' })).toHaveTextContent(AGENT_DID);
    });
  });

  describe('Revoke on the identity page', () => {
    it("revokes the agent's own credential", async () => {
      const { onRevoke } = renderPassport();

      await userEvent.click(within(identityPage()).getByRole('button', { name: 'Revoke' }));

      expect(onRevoke).toHaveBeenCalledWith(activeAgent.vcId);
    });

    it('is enabled only while the server reports that credential active', () => {
      renderPassport({
        agent: passportAgentOf(expiredAgent),
        wallet: readyWallet([expiredAgent], [detailOf(expiredAgent)]),
      });

      expect(within(identityPage()).getByRole('button', { name: 'Revoke' })).toBeDisabled();
    });

    it('goes by the status the wallet re-read, ahead of the agent record', () => {
      const revoked = { ...activeAgent, status: 'revoked' as const };
      renderPassport({ wallet: readyWallet([revoked], [detailOf(revoked)]) });

      expect(within(identityPage()).getByRole('button', { name: 'Revoke' })).toBeDisabled();
    });

    it('goes by the agent record while the wallet loads', () => {
      renderPassport({ wallet: LOADING_WALLET });

      expect(within(identityPage()).getByRole('button', { name: 'Revoke' })).toBeEnabled();
    });
  });

  describe('the visa pages', () => {
    it('hold the wallet: a card per credential and the Wallet | JSON switch', () => {
      renderPassport();

      expect(within(visaPages()).getAllByRole('listitem')).toHaveLength(2);
      expect(within(visaPages()).getByRole('tablist', { name: 'Credential view' })).toBeInTheDocument();
      expect(within(identityPage()).queryAllByRole('listitem')).toHaveLength(0);
    });

    it('pass revocation and retry through to the page', async () => {
      const { onRevoke, onRetry, rerender } = renderPassport();

      await userEvent.click(screen.getByRole('button', { name: /^Agent Authorization credential, Active/ }));
      await userEvent.click(within(within(passport()).getByRole('dialog')).getByRole('button', { name: 'Revoke' }));
      expect(onRevoke).toHaveBeenCalledWith(activeAgent.vcId);

      rerender(
        <PassportDetail
          agent={billing}
          wallet={{ ...readyWallet([], []), phase: 'error', message: 'wallet unreachable' }}
          {...callbacks()}
          onRetry={onRetry}
        />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('start a fresh wallet view when the agent changes', async () => {
      const { rerender } = renderPassport();
      await userEvent.type(screen.getByLabelText('Search credentials'), 'no such credential');
      expect(within(visaPages()).queryByRole('listitem')).not.toBeInTheDocument();

      const otherCredential = { ...activeAgent, subjectDid: 'did:web:example.test:agents:other' };
      rerender(
        <PassportDetail
          agent={passportAgentOf(otherCredential)}
          wallet={readyWallet([otherCredential], [detailOf(otherCredential)])}
          {...callbacks()}
        />,
      );

      // The previous agent's search does not carry over and hide this one's card.
      expect(screen.getByLabelText('Search credentials')).toHaveValue('');
      expect(within(visaPages()).getAllByRole('listitem')).toHaveLength(1);
    });

    it('leave Escape to an open credential, and close on the next one', async () => {
      const { onClose } = renderPassport();
      const card = screen.getByRole('button', { name: /^Agent Authorization credential, Active/ });
      await userEvent.click(card);
      expect(within(passport()).getByRole('dialog')).toBeInTheDocument();

      await userEvent.keyboard('{Escape}');
      expect(within(passport()).queryByRole('dialog')).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(card).toHaveFocus();

      await userEvent.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('leave focus in an open credential when the passport updates underneath it', async () => {
      const { rerender } = renderPassport();
      await userEvent.click(screen.getByRole('button', { name: /^Agent Authorization credential, Active/ }));
      const close = within(within(passport()).getByRole('dialog')).getByRole('button', {
        name: 'Close credential detail',
      });
      expect(close).toHaveFocus();

      rerender(
        <PassportDetail agent={billing} wallet={WALLET} {...callbacks()} notice={<p role="status">Saved</p>} />,
      );

      expect(close).toHaveFocus();
    });

    it('leave Tab to an open credential', async () => {
      renderPassport();
      await userEvent.click(screen.getByRole('button', { name: /^Agent Authorization credential, Active/ }));
      const drawer = within(passport()).getByRole('dialog');
      expect(within(drawer).getByRole('button', { name: 'Close credential detail' })).toHaveFocus();

      await userEvent.tab({ shift: true });

      expect(drawer).toContainElement(document.activeElement as HTMLElement);
    });
  });

  describe('closing', () => {
    it('closes from the Close button', async () => {
      const { onClose } = renderPassport();
      await userEvent.click(screen.getByRole('button', { name: 'Close passport' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape from anywhere inside', async () => {
      const { onClose } = renderPassport();
      await userEvent.click(screen.getByLabelText('Search credentials'));
      await userEvent.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes when the backdrop is pressed, but not when the passport itself is', () => {
      const { onClose } = renderPassport();

      fireEvent.mouseDown(passport());
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.mouseDown(passport().parentElement!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('hands focus back to the card it was given', async () => {
      render(<Opener returnToCard />);

      await userEvent.click(screen.getByRole('button', { name: 'Open passport' }));
      expect(screen.getByRole('button', { name: 'Close passport' })).toHaveFocus();
      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Card' })).toHaveFocus();
    });

    it('otherwise hands focus back to whatever had it when it opened', async () => {
      render(<Opener returnToCard={false} />);

      await userEvent.click(screen.getByRole('button', { name: 'Open passport' }));
      await userEvent.click(screen.getByRole('button', { name: 'Close passport' }));

      expect(screen.getByRole('button', { name: 'Open passport' })).toHaveFocus();
    });

    it('stops listening for keys once it is gone', async () => {
      const { onClose, unmount } = renderPassport();
      unmount();

      await userEvent.keyboard('{Escape}');

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('focus trap', () => {
    const lastControl = () => within(visaPages()).getAllByRole('button', { name: 'Copy VC ID' }).at(-1)!;

    it('wraps backward from Close to the last control, and forward again', async () => {
      renderPassport();

      await userEvent.tab({ shift: true });
      expect(lastControl()).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Close passport' })).toHaveFocus();
    });

    it('lets Tab move normally between controls in the middle', async () => {
      renderPassport();

      await userEvent.tab();

      expect(within(identityPage()).getByRole('button', { name: 'Copy agent DID' })).toHaveFocus();
    });

    it('sends Tab from outside to the first control and Shift+Tab to the last, not to the page behind', async () => {
      renderPassport();

      (document.activeElement as HTMLElement).blur();
      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Close passport' })).toHaveFocus();

      (document.activeElement as HTMLElement).blur();
      await userEvent.tab({ shift: true });
      expect(lastControl()).toHaveFocus();
    });

    it('takes a dropped focus back on its next update', () => {
      const { rerender } = renderPassport();

      (document.activeElement as HTMLElement).blur();
      rerender(<PassportDetail agent={billing} wallet={WALLET} {...callbacks()} />);

      expect(passport()).toHaveFocus();
    });

    it('ignores keys that are neither Tab nor Escape', async () => {
      const { onClose } = renderPassport();

      await userEvent.keyboard('a');

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Close passport' })).toHaveFocus();
    });
  });

  describe('motion', () => {
    it('swings the cover open when motion is welcome', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }) as MediaQueryList);
      renderPassport();

      expect(passport().querySelector('.passport-detail__leaf')).toHaveAttribute('aria-hidden', 'true');
      expect(passport().parentElement).not.toHaveClass('passport-overlay--still');
    });

    it('opens with no leaf and no entrance when reduced motion is preferred', () => {
      vi.stubGlobal(
        'matchMedia',
        (query: string) =>
          ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }) as MediaQueryList,
      );
      renderPassport();

      expect(passport().querySelector('.passport-detail__leaf')).not.toBeInTheDocument();
      expect(passport().parentElement).toHaveClass('passport-overlay--still');
    });

    it('treats a browser that cannot say as allowing motion', () => {
      vi.stubGlobal('matchMedia', undefined);
      renderPassport();

      expect(passport().querySelector('.passport-detail__leaf')).toBeInTheDocument();
    });
  });
});
