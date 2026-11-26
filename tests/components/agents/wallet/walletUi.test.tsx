// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  CopyButton,
  SegmentedTabs,
  StatusPill,
  panelId,
  tabId,
} from '../../../../src/components/agents/wallet/walletUi';
import type { DisplayStatus } from '../../../../src/components/agents/wallet/credentialModel';
import { stubClipboard } from './fixtures';

describe('StatusPill', () => {
  it.each<[DisplayStatus, string]>([
    ['active', 'Active'],
    ['expired', 'Expired'],
    ['revoked', 'Revoked'],
    ['not-yet-valid', 'Not yet valid'],
  ])('shows %s as an icon plus the words "%s"', (status, label) => {
    const { container } = render(<StatusPill status={status} />);

    const pill = screen.getByText(label);
    expect(pill).toHaveClass('status-badge', `status-${status}`);
    // Not colour alone: every state carries its own glyph next to the text.
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('gives each state a different glyph', () => {
    const glyphs = (['active', 'expired', 'revoked', 'not-yet-valid'] as const).map((status) => {
      const { container, unmount } = render(<StatusPill status={status} />);
      const markup = container.querySelector('svg')!.innerHTML;
      unmount();
      return markup;
    });
    expect(new Set(glyphs).size).toBe(4);
  });
});

describe('CopyButton', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('copies the full value and says so, then settles back', async () => {
    vi.useFakeTimers();
    const writeText = stubClipboard();
    render(<CopyButton value="vc:helix:full-value" label="Copy VC ID" />);
    const button = screen.getByRole('button', { name: 'Copy VC ID' });

    fireEvent.click(button);
    await act(async () => {
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('vc:helix:full-value');
    expect(button).toHaveAccessibleName('Copied');
    expect(button).toHaveClass('copied');

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(button).toHaveAccessibleName('Copy VC ID');
    expect(button).not.toHaveClass('copied');
  });

  it('shows its visible text, swapped for "Copied" while the confirmation is up', async () => {
    stubClipboard();
    render(<CopyButton value="did:web:full" label="Copy issuer DID" text="did:web:fu…" className="did-copy" />);
    const button = screen.getByRole('button', { name: 'Copy issuer DID' });
    expect(button).toHaveTextContent('did:web:fu…');
    expect(button).toHaveClass('copy-button', 'did-copy');

    await userEvent.click(button);

    expect(await screen.findByRole('button', { name: 'Copied' })).toHaveTextContent('Copied');
  });

  it('restarts the confirmation when copied again before it clears', async () => {
    vi.useFakeTimers();
    stubClipboard();
    render(<CopyButton value="x" label="Copy" />);
    const button = screen.getByRole('button');

    const click = async () => {
      fireEvent.click(button);
      await act(async () => {
        await Promise.resolve();
      });
    };
    await click();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await click();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // 2s after the first copy, but only 1s after the second.
    expect(button).toHaveAccessibleName('Copied');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(button).toHaveAccessibleName('Copy');
  });

  it('does nothing, quietly, where there is no clipboard', async () => {
    Object.assign(navigator, { clipboard: undefined });
    render(<CopyButton value="x" label="Copy" />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('confirms nothing when the browser refuses the write', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Write permission denied.'));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyButton value="x" label="Copy VC ID" />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy VC ID' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Copy VC ID' })).not.toHaveClass('copied');
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
  });

  it('can be unmounted while the confirmation is showing', async () => {
    stubClipboard();
    const { unmount } = render(<CopyButton value="x" label="Copy" />);
    await userEvent.click(screen.getByRole('button'));
    await screen.findByRole('button', { name: 'Copied' });

    expect(() => unmount()).not.toThrow();
  });
});

describe('SegmentedTabs', () => {
  const OPTIONS = [
    { value: 'wallet', label: 'Wallet' },
    { value: 'json', label: 'JSON' },
    { value: 'raw', label: 'Raw' },
  ] as const;
  type Value = (typeof OPTIONS)[number]['value'];

  function Harness({ onChange }: { onChange?: (value: Value) => void }) {
    const [value, setValue] = useState<Value>('wallet');
    return (
      <>
        <SegmentedTabs
          label="View"
          idBase="t"
          options={OPTIONS}
          value={value}
          onChange={(next) => {
            setValue(next);
            onChange?.(next);
          }}
        />
        <div role="tabpanel" id={panelId('t', value)} aria-labelledby={tabId('t', value)}>
          {value} panel
        </div>
      </>
    );
  }

  it('exposes a labelled tab list with exactly one selected, tabbable tab', () => {
    render(<Harness />);

    expect(screen.getByRole('tablist', { name: 'View' })).toBeInTheDocument();
    const [wallet, json, raw] = screen.getAllByRole('tab');
    expect(wallet).toHaveAttribute('aria-selected', 'true');
    expect(wallet).toHaveAttribute('tabindex', '0');
    expect(wallet).toHaveAttribute('aria-controls', 't-panel-wallet');
    for (const other of [json, raw]) {
      expect(other).toHaveAttribute('aria-selected', 'false');
      expect(other).toHaveAttribute('tabindex', '-1');
      expect(other).not.toHaveAttribute('aria-controls');
    }
    // The panel names itself after the selected tab.
    expect(screen.getByRole('tabpanel', { name: 'Wallet' })).toHaveTextContent('wallet panel');
  });

  it('selects on click', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));

    expect(onChange).toHaveBeenCalledWith('json');
    expect(screen.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'JSON' })).toBeInTheDocument();
  });

  it('moves with the arrow keys, wrapping at both ends, and takes focus along', async () => {
    render(<Harness />);
    const tab = (name: string) => screen.getByRole('tab', { name });
    tab('Wallet').focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(tab('JSON')).toHaveAttribute('aria-selected', 'true');
    expect(tab('JSON')).toHaveFocus();

    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(tab('Wallet')).toHaveFocus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(tab('Raw')).toHaveFocus();
    expect(tab('Raw')).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowLeft}');
    expect(tab('JSON')).toHaveFocus();
  });

  it('jumps to the ends with Home and End, and leaves other keys alone', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const tab = (name: string) => screen.getByRole('tab', { name });
    tab('Wallet').focus();

    await userEvent.keyboard('{End}');
    expect(tab('Raw')).toHaveFocus();

    await userEvent.keyboard('{Home}');
    expect(tab('Wallet')).toHaveFocus();

    onChange.mockClear();
    await userEvent.keyboard('a{ArrowDown}');
    expect(onChange).not.toHaveBeenCalled();
    expect(tab('Wallet')).toHaveAttribute('aria-selected', 'true');
  });
});
