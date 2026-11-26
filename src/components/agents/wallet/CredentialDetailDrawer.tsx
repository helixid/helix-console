// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Everything about one credential, in a side drawer: a Details tab (the
// fields the panel's summary row used to show, plus issuer, subject,
// status-list entry and proof metadata), a JSON tab (the full signed VC),
// and the Revoke action.
//
// Revoke is the existing RevokeButton, unchanged, under the rule it has
// always had: enabled only while the server reports the credential active.
// The proof's signature (proofValue) is never rendered on the Details tab —
// the JSON tab is the explicit view for that.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { RevokeButton } from '../RevokeButton';
import { JsonBlock } from './JsonBlock';
import { formatRelative, jsonFilename, type WalletCredential } from './credentialModel';
import {
  CopyButton,
  SegmentedTabs,
  StatusPill,
  panelId,
  tabId,
  type TabOption,
} from './walletUi';

type DetailTab = 'details' | 'json';

const TABS: ReadonlyArray<TabOption<DetailTab>> = [
  { value: 'details', label: 'Details' },
  { value: 'json', label: 'JSON' },
];

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]';

export interface CredentialDetailDrawerProps {
  credential: WalletCredential;
  now: number;
  /** True while this credential's full VC is being fetched. */
  detailPending: boolean;
  /** The error from the last attempt to fetch it, if that failed. */
  detailError: string | undefined;
  onLoadDetail: (vcId: string) => void;
  onRevoke: (vcId: string) => Promise<void>;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-pair">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Timestamp({ iso, now }: { iso: string; now: number }) {
  const relative = formatRelative(iso, now);
  // The ISO string stays the visible value, as it was in the summary row:
  // it is the exact, unambiguous one. The relative reading is the tooltip.
  return (
    <time dateTime={iso} title={relative === '' ? undefined : relative}>
      {iso}
    </time>
  );
}

export function CredentialDetailDrawer({
  credential,
  now,
  detailPending,
  detailError,
  onLoadDetail,
  onRevoke,
  onClose,
}: CredentialDetailDrawerProps) {
  const [tab, setTab] = useState<DetailTab>('details');
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const tabsId = useId();
  const { vcId, detailLoaded } = credential;

  // Opening a card is what asks for a VC that was not fetched up front.
  // Keyed on the credential alone, deliberately: a failed or in-flight
  // request must not re-fire just because its own state changed — Retry is
  // the way back in.
  useEffect(() => {
    closeButton.current?.focus();
    if (!detailLoaded && !detailPending && detailError === undefined) onLoadDetail(vcId);
  }, [vcId]);

  // Escape and the Tab trap listen on the document, not the dialog: Revoke
  // disables itself while it works, and a focused control that becomes
  // disabled drops focus to <body> — from where a handler on the dialog
  // would never hear another key.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const node = dialog.current!;
      // The Close button is always present, so there is always somewhere to land.
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.tabIndex !== -1,
      );
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      const outside = active === node || !node.contains(active);
      if (outside || active === (event.shiftKey ? first : last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // And once the wallet has re-loaded, bring a dropped focus back inside.
  useEffect(() => {
    if (!dialog.current!.contains(document.activeElement)) dialog.current!.focus();
  });

  const detailNotice = detailLoaded ? null : detailError !== undefined ? (
    <p role="alert" className="cred-drawer__notice">
      <span>Could not load this credential&rsquo;s details: {detailError}</span>
      <button type="button" onClick={() => onLoadDetail(vcId)}>
        Retry
      </button>
    </p>
  ) : (
    <p className="loading-note">Loading credential details…</p>
  );

  return (
    <div
      className="cred-drawer-overlay"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        // Without this the press itself moves focus to <body>, undoing the
        // hand-back to the card that onClose does.
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={dialog}
        className="cred-drawer card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="cred-drawer__header">
          <div className="cred-drawer__heading">
            <h3 id={titleId} className="cred-drawer__title">
              {credential.typeLabel}
            </h3>
            <StatusPill status={credential.status} />
          </div>
          <button
            ref={closeButton}
            type="button"
            aria-label="Close credential detail"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <SegmentedTabs
          label="Credential detail"
          idBase={tabsId}
          options={TABS}
          value={tab}
          onChange={setTab}
        />

        <div
          className="cred-drawer__panel"
          role="tabpanel"
          id={panelId(tabsId, tab)}
          aria-labelledby={tabId(tabsId, tab)}
        >
          {detailNotice}

          {tab === 'details' && (
            <dl className="cred-drawer__fields">
              <Field label="Type">
                {credential.types.length > 0 ? credential.types.join(', ') : credential.typeLabel}
              </Field>
              <Field label="VC ID">
                <span className="cred-drawer__copyable">
                  {vcId}
                  <CopyButton className="unstyled" value={vcId} label="Copy VC ID" />
                </span>
              </Field>
              <Field label="Subject DID">
                <span className="cred-drawer__copyable">
                  {credential.subjectDid}
                  <CopyButton
                    className="unstyled"
                    value={credential.subjectDid}
                    label="Copy subject DID"
                  />
                </span>
              </Field>
              <Field label="Issuer">
                {credential.issuer === undefined ? (
                  '—'
                ) : (
                  <span className="cred-drawer__copyable">
                    {credential.issuer}
                    <CopyButton
                      className="unstyled"
                      value={credential.issuer}
                      label="Copy issuer DID"
                    />
                  </span>
                )}
              </Field>
              <Field label="Scopes">
                {credential.scopes.length === 0
                  ? '—'
                  : credential.scopes.map((scope) => (
                      <span key={scope} className="scope-chip">
                        {scope}
                      </span>
                    ))}
              </Field>
              <Field label="Issued">
                <Timestamp iso={credential.validFrom} now={now} />
              </Field>
              <Field label="Expires">
                <Timestamp iso={credential.validUntil} now={now} />
              </Field>
              {credential.revokedAt !== undefined && (
                <Field label="Revoked at">
                  <Timestamp iso={credential.revokedAt} now={now} />
                </Field>
              )}
              {credential.parentVcId !== undefined && (
                <Field label="Delegated from">{credential.parentVcId}</Field>
              )}
              {credential.renewedByVcId !== undefined && (
                <Field label="Renewed by">{credential.renewedByVcId}</Field>
              )}
              <Field label="Credential status">
                {credential.credentialStatus === undefined
                  ? '—'
                  : [
                      credential.credentialStatus.type,
                      credential.credentialStatus.statusPurpose,
                      credential.credentialStatus.statusListIndex !== undefined &&
                        `list index ${credential.credentialStatus.statusListIndex}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </Field>
              <Field label="Proof type">{credential.proof?.type ?? '—'}</Field>
              <Field label="Proof purpose">{credential.proof?.proofPurpose ?? '—'}</Field>
              <Field label="Verification method">
                {credential.proof?.verificationMethod ?? '—'}
              </Field>
            </dl>
          )}

          {tab === 'json' &&
            (credential.vc === undefined ? (
              detailLoaded && <p className="empty-state">This credential has no JSON to show.</p>
            ) : (
              <JsonBlock
                value={credential.vc}
                label="Credential JSON"
                filename={jsonFilename(vcId)}
              />
            ))}
        </div>

        <footer className="cred-drawer__footer">
          <RevokeButton
            onRevoke={() => onRevoke(vcId)}
            disabled={credential.serverStatus !== 'active'}
          />
        </footer>
      </div>
    </div>
  );
}
