// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JsonBlock } from '../../../../src/components/agents/wallet/JsonBlock';
import { FAKE_PROOF_VALUE, activeAgent, agentVc, stubClipboard } from './fixtures';

const VC = agentVc(activeAgent);

describe('JsonBlock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the value as pretty-printed JSON that parses back to the same thing', () => {
    render(<JsonBlock value={VC} label="Credential JSON" filename="vc.json" />);

    const code = screen.getByRole('group', { name: 'Credential JSON' });
    expect(code.textContent).toBe(JSON.stringify(VC, null, 2));
    expect(JSON.parse(code.textContent ?? '')).toEqual(VC);
    // The explicit JSON view is where the full proof is allowed to appear.
    expect(code).toHaveTextContent(FAKE_PROOF_VALUE);
  });

  it('highlights by token kind, with keys told apart from string values', () => {
    const { container } = render(
      <JsonBlock value={{ id: 'vc:1', count: 2, ok: true }} label="JSON" filename="x.json" />,
    );

    const texts = (selector: string) =>
      Array.from(container.querySelectorAll(selector)).map((node) => node.textContent);
    expect(texts('.json-key')).toEqual(['"id"', '"count"', '"ok"']);
    expect(texts('.json-string')).toEqual(['"vc:1"']);
    expect(texts('.json-number')).toEqual(['2']);
    expect(texts('.json-literal')).toEqual(['true']);
  });

  it('renders credential text as text, never as markup', () => {
    const hostile = { note: '<img src=x onerror="alert(1)"><b>bold</b>' };
    const { container } = render(<JsonBlock value={hostile} label="JSON" filename="x.json" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByRole('group', { name: 'JSON' }).textContent).toBe(
      JSON.stringify(hostile, null, 2),
    );
  });

  it('makes the scrollable code reachable by keyboard', () => {
    render(<JsonBlock value={VC} label="Credential JSON" filename="vc.json" />);
    expect(screen.getByRole('group', { name: 'Credential JSON' })).toHaveAttribute('tabindex', '0');
  });

  it('copies exactly the text it shows', async () => {
    const writeText = stubClipboard();
    render(<JsonBlock value={VC} label="Credential JSON" filename="vc.json" />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(VC, null, 2));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('downloads the same text as a .json file under the given name', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    let downloadName = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });
    render(<JsonBlock value={VC} label="Credential JSON" filename="vc-helix-1.json" />);

    // The filename is the button's tooltip; the label stays short.
    expect(screen.getByRole('button', { name: 'Download JSON' })).toHaveAttribute('title', 'vc-helix-1.json');
    await userEvent.click(screen.getByRole('button', { name: 'Download JSON' }));

    expect(downloadName).toBe('vc-helix-1.json');
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('application/json;charset=utf-8');
    // jsdom's Blob has no text(); FileReader reads it the same.
    const downloaded = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(downloaded).toBe(JSON.stringify(VC, null, 2));
    // The object URL is released rather than leaked, and the link does not linger.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull();
    click.mockRestore();
  });

  it('is a plain block by default', () => {
    const { container } = render(<JsonBlock value={VC} label="JSON" filename="x.json" />);
    expect(container.querySelector('details')).toBeNull();
  });

  it('becomes an open disclosure when given a summary', async () => {
    const { container } = render(
      <JsonBlock
        value={VC}
        label="Wallet JSON"
        filename="wallet.json"
        collapsibleSummary="Wallet JSON · 1 credential"
      />,
    );

    const details = container.querySelector('details')!;
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('Wallet JSON · 1 credential')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Wallet JSON' })).toBeInTheDocument();
  });
});
