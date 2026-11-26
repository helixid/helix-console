// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CredentialDetailDrawer,
  type CredentialDetailDrawerProps,
} from '../../../../src/components/agents/wallet/CredentialDetailDrawer';
import { toWalletCredential } from '../../../../src/components/agents/wallet/credentialModel';
import type { VCResponse, VCSummary } from '../../../../src/api/types';
import {
  AGENT_DID,
  FAKE_PROOF_VALUE,
  FUTURE,
  ISSUER_DID,
  PAST,
  activeAgent,
  detailOf,
  expiredAgent,
  revokedAgent,
  revokedDetail,
  stubClipboard,
  summaryOf,
} from './fixtures';

const NOW = Date.now();

function renderDrawer(
  summary: VCSummary,
  detail?: VCResponse,
  props: Partial<CredentialDetailDrawerProps> = {},
) {
  const handlers = {
    onLoadDetail: vi.fn(),
    onRevoke: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };
  const view = render(
    <CredentialDetailDrawer
      credential={toWalletCredential(summary, detail, NOW)}
      now={NOW}
      detailPending={false}
      detailError={undefined}
      {...handlers}
      {...props}
    />,
  );
  return { ...view, ...handlers, dialog: screen.getByRole('dialog') };
}

/** The <dd> next to a field label. */
function field(label: string): HTMLElement {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;
}

describe('CredentialDetailDrawer', () => {
  it('is a modal dialog named after the credential, showing its status', () => {
    const { dialog } = renderDrawer(activeAgent, detailOf(activeAgent));

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Agent Authorization');
    expect(within(dialog).getByText('Active')).toHaveClass('status-active');
  });

  it('moves focus into the dialog when it opens', () => {
    renderDrawer(activeAgent, detailOf(activeAgent));
    expect(screen.getByRole('button', { name: 'Close credential detail' })).toHaveFocus();
  });

  it('lists the summary fields plus issuer, subject, status entry and proof metadata', () => {
    renderDrawer(activeAgent, detailOf(activeAgent));

    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    expect(field('Type')).toHaveTextContent('HelixAgentCredential');
    expect(field('VC ID')).toHaveTextContent(activeAgent.vcId);
    expect(field('Subject DID')).toHaveTextContent(AGENT_DID);
    expect(field('Issuer')).toHaveTextContent(ISSUER_DID);
    expect(field('Scopes')).toHaveTextContent('read:orders');
    expect(field('Issued')).toHaveTextContent(PAST);
    expect(field('Expires')).toHaveTextContent(FUTURE);
    expect(field('Credential status')).toHaveTextContent(
      'BitstringStatusListEntry · revocation · list index 4',
    );
    expect(field('Proof type')).toHaveTextContent('Ed25519Signature2020');
    expect(field('Proof purpose')).toHaveTextContent('assertionMethod');
    expect(field('Verification method')).toHaveTextContent(`${ISSUER_DID}#key-1`);
  });

  it('shows timestamps exactly, with the relative reading as a tooltip', () => {
    renderDrawer(activeAgent, detailOf(activeAgent));

    const expires = within(field('Expires')).getByText(FUTURE);
    expect(expires).toHaveAttribute('datetime', FUTURE);
    expect(expires.getAttribute('title')).toMatch(/\d/);
  });

  it('shows an unreadable timestamp as it came, without inventing a tooltip', () => {
    const odd = summaryOf({ issuedAt: 'sometime' });
    renderDrawer(odd, detailOf(odd));

    const issued = within(field('Issued')).getByText('sometime');
    expect(issued).not.toHaveAttribute('title');
  });

  it('never shows the proof value on the Details tab — only in the JSON tab', async () => {
    const { dialog } = renderDrawer(activeAgent, detailOf(activeAgent));
    expect(dialog).not.toHaveTextContent(FAKE_PROOF_VALUE);
    expect(dialog.outerHTML).not.toContain(FAKE_PROOF_VALUE);

    await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));

    const json = screen.getByRole('group', { name: 'Credential JSON' });
    expect(json).toHaveTextContent(FAKE_PROOF_VALUE);
    expect(JSON.parse(json.textContent ?? '')).toEqual(detailOf(activeAgent).vc);
    expect(screen.queryByText('Subject DID')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'JSON' })).toBeInTheDocument();
  });

  it('offers the JSON as a download named after the VC ID', async () => {
    renderDrawer(activeAgent, detailOf(activeAgent));
    await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));

    expect(screen.getByRole('button', { name: 'Download JSON' })).toHaveAttribute(
      'title',
      'vc-helix-agent-active.json',
    );
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument();
  });

  it('copies identifiers from the Details tab', async () => {
    const writeText = stubClipboard();
    renderDrawer(activeAgent, detailOf(activeAgent));

    await userEvent.click(screen.getByRole('button', { name: 'Copy VC ID' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy subject DID' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy issuer DID' }));

    expect(writeText.mock.calls.map(([value]) => value)).toEqual([
      activeAgent.vcId,
      AGENT_DID,
      ISSUER_DID,
    ]);
  });

  it('adds revocation, delegation and renewal rows only when they apply', () => {
    const plain = renderDrawer(activeAgent, detailOf(activeAgent));
    expect(screen.queryByText('Revoked at')).not.toBeInTheDocument();
    expect(screen.queryByText('Delegated from')).not.toBeInTheDocument();
    expect(screen.queryByText('Renewed by')).not.toBeInTheDocument();
    plain.unmount();

    const delegated = summaryOf({ status: 'revoked', parentVcId: 'vc:helix:parent' });
    renderDrawer(
      delegated,
      detailOf(delegated, {}, { revokedAt: '2026-07-04T00:00:00.000Z', renewedByVcId: 'vc:helix:next' }),
    );
    expect(field('Revoked at')).toHaveTextContent('2026-07-04T00:00:00.000Z');
    expect(field('Delegated from')).toHaveTextContent('vc:helix:parent');
    expect(field('Renewed by')).toHaveTextContent('vc:helix:next');
  });

  it('shows dashes for what a credential does not carry', () => {
    const bare = summaryOf({ scopes: [] });
    renderDrawer(bare, detailOf(bare, { type: undefined, issuer: undefined, credentialStatus: undefined, proof: undefined, credentialSubject: {} }));

    expect(field('Type')).toHaveTextContent('Verifiable Credential');
    expect(field('Issuer')).toHaveTextContent('—');
    expect(field('Scopes')).toHaveTextContent('—');
    expect(field('Credential status')).toHaveTextContent('—');
    expect(field('Proof type')).toHaveTextContent('—');
    expect(field('Proof purpose')).toHaveTextContent('—');
    expect(field('Verification method')).toHaveTextContent('—');
  });

  it('describes a status entry that has no list index or purpose by its type alone', () => {
    renderDrawer(activeAgent, detailOf(activeAgent, { credentialStatus: { type: 'SomeOtherStatus' } }));
    expect(field('Credential status').textContent).toBe('SomeOtherStatus');
  });

  describe('Revoke', () => {
    it('calls back with this credential’s id', async () => {
      const { onRevoke } = renderDrawer(activeAgent, detailOf(activeAgent));

      await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));

      expect(onRevoke).toHaveBeenCalledWith(activeAgent.vcId);
    });

    it('is enabled only while the server reports the credential active', () => {
      const expired = renderDrawer(expiredAgent, detailOf(expiredAgent));
      expect(screen.getByRole('button', { name: 'Revoke' })).toBeDisabled();
      expired.unmount();

      renderDrawer(revokedAgent, revokedDetail);
      expect(screen.getByRole('button', { name: 'Revoke' })).toBeDisabled();
    });

    it('keys off the server status, not the displayed one', () => {
      // Server says active; only the pill reads "Not yet valid". The rule
      // Revoke has always had is about the server status, so it stays enabled.
      const upcoming = summaryOf({ issuedAt: FUTURE });
      const { dialog } = renderDrawer(upcoming, detailOf(upcoming));

      expect(within(dialog).getByText('Not yet valid')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled();
    });

    it('stays reachable on the JSON tab', async () => {
      renderDrawer(activeAgent, detailOf(activeAgent));
      await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));
      expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled();
    });
  });

  describe('closing', () => {
    it('closes from the Close button', async () => {
      const { onClose } = renderDrawer(activeAgent, detailOf(activeAgent));
      await userEvent.click(screen.getByRole('button', { name: 'Close credential detail' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape from anywhere inside', async () => {
      const { onClose } = renderDrawer(activeAgent, detailOf(activeAgent));
      screen.getByRole('tab', { name: 'Details' }).focus();

      await userEvent.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes when the backdrop is pressed, but not when the dialog itself is', () => {
      const { onClose, dialog } = renderDrawer(activeAgent, detailOf(activeAgent));

      // fireEvent returns false when the handler prevented the default action.
      expect(fireEvent.mouseDown(dialog)).toBe(true);
      expect(fireEvent.mouseDown(screen.getByText('Subject DID'))).toBe(true);
      expect(onClose).not.toHaveBeenCalled();

      // The backdrop press is swallowed: left alone, it would move focus to
      // <body> and undo the hand-back to the card that closing does.
      expect(fireEvent.mouseDown(dialog.parentElement!)).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('focus trap', () => {
    it('wraps forward from the last control to the first', async () => {
      renderDrawer(activeAgent, detailOf(activeAgent));
      const revoke = screen.getByRole('button', { name: 'Revoke' });
      revoke.focus();

      await userEvent.tab();

      expect(screen.getByRole('button', { name: 'Close credential detail' })).toHaveFocus();
    });

    it('wraps backward from the first control to the last', async () => {
      renderDrawer(activeAgent, detailOf(activeAgent));
      expect(screen.getByRole('button', { name: 'Close credential detail' })).toHaveFocus();

      await userEvent.tab({ shift: true });

      expect(screen.getByRole('button', { name: 'Revoke' })).toHaveFocus();
    });

    it('sends Shift+Tab from the dialog itself to the last control', async () => {
      const { dialog } = renderDrawer(activeAgent, detailOf(activeAgent));
      dialog.focus();

      await userEvent.tab({ shift: true });

      expect(screen.getByRole('button', { name: 'Revoke' })).toHaveFocus();
    });

    it('skips a disabled Revoke and the unselected tab', async () => {
      renderDrawer(expiredAgent, detailOf(expiredAgent));
      const order: Array<string | null> = [];
      for (let step = 0; step < 6; step += 1) {
        await userEvent.tab();
        order.push(document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? null);
      }

      // Close -> Details tab -> three copy buttons -> back to Close.
      expect(order).toEqual([
        'Details',
        'Copy VC ID',
        'Copy subject DID',
        'Copy issuer DID',
        'Close credential detail',
        'Details',
      ]);
    });

    it('lets Tab move normally between controls in the middle', async () => {
      renderDrawer(activeAgent, detailOf(activeAgent));

      await userEvent.tab();

      expect(screen.getByRole('tab', { name: 'Details' })).toHaveFocus();
    });

    it('ignores keys that are neither Tab nor Escape', async () => {
      const { onClose } = renderDrawer(activeAgent, detailOf(activeAgent));
      await userEvent.keyboard('x');
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Close credential detail' })).toHaveFocus();
    });
  });

  // A browser drops focus to <body> when the focused control becomes
  // disabled — which Revoke does to itself while the request is out. jsdom
  // does not, so these blur by hand to stand in for it.
  describe('when focus has dropped out of the dialog', () => {
    const dropFocus = () => {
      (document.activeElement as HTMLElement).blur();
      expect(document.body).toHaveFocus();
    };

    it('still closes on Escape', async () => {
      const { onClose } = renderDrawer(activeAgent, detailOf(activeAgent));
      dropFocus();

      await userEvent.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('sends Tab to the first control and Shift+Tab to the last, not to the page behind', async () => {
      renderDrawer(activeAgent, detailOf(activeAgent));

      dropFocus();
      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Close credential detail' })).toHaveFocus();

      dropFocus();
      await userEvent.tab({ shift: true });
      expect(screen.getByRole('button', { name: 'Revoke' })).toHaveFocus();
    });

    it('takes focus back inside when the credential updates', () => {
      const { rerender, dialog } = renderDrawer(activeAgent, detailOf(activeAgent));
      dropFocus();

      const revoked = { ...activeAgent, status: 'revoked' as const };
      rerender(
        <CredentialDetailDrawer
          credential={toWalletCredential(revoked, detailOf(revoked), NOW)}
          now={NOW}
          detailPending={false}
          detailError={undefined}
          onLoadDetail={vi.fn()}
          onRevoke={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(dialog).toHaveFocus();
    });

    it('leaves focus alone on an update when it is already inside', () => {
      const { rerender } = renderDrawer(activeAgent, detailOf(activeAgent));
      const close = screen.getByRole('button', { name: 'Close credential detail' });
      expect(close).toHaveFocus();

      rerender(
        <CredentialDetailDrawer
          credential={toWalletCredential(activeAgent, detailOf(activeAgent), NOW)}
          now={NOW}
          detailPending={false}
          detailError={undefined}
          onLoadDetail={vi.fn()}
          onRevoke={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(close).toHaveFocus();
    });
  });

  it('stops listening for keys once it is gone', async () => {
    const { onClose, unmount } = renderDrawer(activeAgent, detailOf(activeAgent));
    unmount();

    await userEvent.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });

  describe('a credential whose VC is not loaded yet', () => {
    it('asks for it once on opening and shows what the summary already knows', () => {
      const { onLoadDetail } = renderDrawer(expiredAgent);

      expect(onLoadDetail).toHaveBeenCalledTimes(1);
      expect(onLoadDetail).toHaveBeenCalledWith(expiredAgent.vcId);
      expect(screen.getByText('Loading credential details…')).toBeInTheDocument();
      expect(field('VC ID')).toHaveTextContent(expiredAgent.vcId);
      expect(field('Scopes')).toHaveTextContent('read:orders');
      expect(field('Issuer')).toHaveTextContent('—');
      expect(field('Type')).toHaveTextContent('Credential');
    });

    it('does not ask again while the request is already in flight', () => {
      const { onLoadDetail } = renderDrawer(expiredAgent, undefined, { detailPending: true });

      expect(onLoadDetail).not.toHaveBeenCalled();
      expect(screen.getByText('Loading credential details…')).toBeInTheDocument();
    });

    it('does not re-ask when its own state changes', () => {
      const { onLoadDetail, rerender } = renderDrawer(expiredAgent);
      rerender(
        <CredentialDetailDrawer
          credential={toWalletCredential(expiredAgent, undefined, NOW)}
          now={NOW}
          detailPending
          detailError={undefined}
          onLoadDetail={onLoadDetail}
          onRevoke={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(onLoadDetail).toHaveBeenCalledTimes(1);
    });

    it('reports a failed load and retries on request, not by itself', async () => {
      const { onLoadDetail } = renderDrawer(expiredAgent, undefined, { detailError: 'detail exploded' });

      expect(onLoadDetail).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not load this credential’s details: detail exploded',
      );

      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(onLoadDetail).toHaveBeenCalledWith(expiredAgent.vcId);
    });

    it('has no JSON to offer until the VC arrives', async () => {
      renderDrawer(expiredAgent);
      await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));

      expect(screen.queryByRole('group', { name: 'Credential JSON' })).not.toBeInTheDocument();
      expect(screen.getByText('Loading credential details…')).toBeInTheDocument();
      expect(screen.queryByText('This credential has no JSON to show.')).not.toBeInTheDocument();
    });

    it('still lets an active credential be revoked', () => {
      renderDrawer(activeAgent);
      expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled();
    });
  });

  it('says so when the API response carried no usable VC', async () => {
    const corrupt = { ...detailOf(activeAgent), vc: null } as unknown as VCResponse;
    const { onLoadDetail } = renderDrawer(activeAgent, corrupt);
    await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));

    expect(screen.getByText('This credential has no JSON to show.')).toBeInTheDocument();
    expect(onLoadDetail).not.toHaveBeenCalled();
  });
});
