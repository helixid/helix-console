// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// The explicit JSON view: the one place a full credential, proofValue
// included, is rendered. Used for a single credential (card detail) and for
// the wallet as a whole.
//
// Highlighting is done by emitting React elements per token, never by
// injecting markup — a credential's contents are issuer-controlled text.

import { useMemo } from 'react';
import { DownloadIcon } from '../../layout/icons';
import { tokenizeJson } from './credentialModel';
import { CopyButton } from './walletUi';

export interface JsonBlockProps {
  /** Rendered with two-space indentation; that exact text is what Copy and Download hand over. */
  value: unknown;
  /** Accessible name for the scrollable code region. */
  label: string;
  filename: string;
  /** When set, the block is a disclosure (open by default) with this as its summary. */
  collapsibleSummary?: string;
}

export function JsonBlock({ value, label, filename, collapsibleSummary }: JsonBlockProps) {
  const text = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const tokens = useMemo(() => tokenizeJson(text), [text]);

  const handleDownload = () => {
    // Blob + object URL, as CodeSnippetPanel does: no escaping rules to get right.
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const body = (
    <>
      <div className="json-block__actions">
        <CopyButton value={text} label="Copy JSON" text="Copy JSON" />
        {/* The filename is a whole DID or VC ID — too long for a button, so it
            is the tooltip instead. */}
        <button type="button" title={filename} onClick={handleDownload}>
          <DownloadIcon />
          Download JSON
        </button>
      </div>
      {/* Focusable so a keyboard user can scroll a long document. */}
      <pre className="json-block__code" role="group" aria-label={label} tabIndex={0}>
        <code>
          {tokens.map((token, index) =>
            token.kind === 'plain' ? (
              token.text
            ) : (
              <span key={index} className={`json-${token.kind}`}>
                {token.text}
              </span>
            ),
          )}
        </code>
      </pre>
    </>
  );

  if (collapsibleSummary === undefined) {
    return <div className="json-block">{body}</div>;
  }
  return (
    <details className="json-block vc-json" open>
      <summary>{collapsibleSummary}</summary>
      {body}
    </details>
  );
}
