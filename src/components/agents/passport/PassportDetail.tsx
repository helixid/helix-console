// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// An agent's passport, opened: the identity page on the left and, on the
// facing pages, its credentials — the wallet, unchanged. Once the
// screen is too narrow for a spread, the pages stack, identity first.
//
// A modal dialog rendered into <body>, so no ancestor's transform or
// containment can become its containing block. The wallet's credential
// drawer opens on top of it and listens for Escape and Tab on the document,
// as this one does. So this one only answers while it is the topmost dialog
// open; otherwise an Escape meant for the drawer would close the whole
// passport, and the two Tab traps would fight.
//
// Nothing that wraps the wallet may keep a transform, filter, perspective
// or containment: the drawer is position: fixed and would be trapped inside
// it (see CredentialWallet). The opening leaf is the wallet's sibling, never
// its ancestor.

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import helixMark from '../../../assets/helix-mark.svg';
import { RevokeButton } from '../RevokeButton';
import { CredentialWallet } from '../wallet/CredentialWallet';
import {
  formatDate,
  formatRelative,
  toWalletCredential,
  type WalletState,
} from '../wallet/credentialModel';
import { CopyButton } from '../wallet/walletUi';
import {
  agentDisplayName,
  mrzLines,
  passportStatus,
  statusReasonText,
  type PassportAgent,
} from './passportModel';
import { AgentAvatar, MrzStrip, PassportStamp } from './passportUi';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]';

/** True when no other modal dialog is open on top of `node`: later in the document is on top. */
function isTopmost(node: HTMLElement): boolean {
  const open = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
  return open[open.length - 1] === node;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export interface PassportDetailProps {
  /** The agent itself — not one of its credentials. */
  agent: PassportAgent;
  /** Every credential issued to the agent's DID: the facing pages. */
  wallet: WalletState;
  /** The page's toast, shown in here while the passport covers the page. */
  notice?: ReactNode;
  /** Where focus goes when the passport closes. Defaults to whatever had it when it opened. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  onRetry: () => void;
  onLoadDetails: (vcIds: string[]) => void;
  onRevoke: (vcId: string) => Promise<void>;
  onClose: () => void;
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`passport-field${wide ? ' passport-field--wide' : ''}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DateValue({ iso, now }: { iso: string | undefined; now: number }) {
  if (iso === undefined) return '—';
  const relative = formatRelative(iso, now);
  return (
    <time dateTime={iso} title={relative === '' ? undefined : relative}>
      {formatDate(iso)}
    </time>
  );
}

function Copyable({ value, label }: { value: string; label: string }) {
  return (
    <span className="passport-copyable">
      <code>{value}</code>
      <CopyButton className="unstyled" value={value} label={label} />
    </span>
  );
}

export function PassportDetail({
  agent,
  wallet,
  notice,
  returnFocusRef,
  onRetry,
  onLoadDetails,
  onRevoke,
  onClose,
}: PassportDetailProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  // Read once: the leaf either swings open or is never drawn.
  const [still] = useState(prefersReducedMotion);
  const status = passportStatus(agent);
  const reason = statusReasonText(agent);
  const own = agent.credential;

  // The agent's own credential as the wallet holds it. Only the full VC
  // names its issuer, and Revoke keys off the server status the wallet
  // re-reads after a revocation, as the drawer's Revoke does.
  const { now, ownCredential } = useMemo(() => {
    const at = Date.now();
    const summary = wallet.summaries.find((item) => item.vcId === own.vcId);
    return {
      now: at,
      ownCredential:
        summary === undefined
          ? undefined
          : toWalletCredential(summary, wallet.details[summary.vcId], at),
    };
  }, [own, wallet]);

  // Focus starts on Close and goes back to the card on the way out.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    return () => {
      (returnFocusRef?.current ?? opener)?.focus();
    };
  }, []);

  // Escape and the Tab trap listen on the document, as in the drawer: a
  // control that disables itself while it works drops focus to <body>, where
  // a handler on the dialog would never hear another key.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const node = dialog.current!;
      if (!isTopmost(node)) return;
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      // Close is always present, so there is always somewhere to land.
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

  // And after each update, bring a dropped focus back inside — unless one of
  // the dialogs on top of this one has it.
  useEffect(() => {
    const node = dialog.current!;
    if (isTopmost(node) && !node.contains(document.activeElement)) node.focus();
  });

  const issuer: ReactNode =
    ownCredential?.issuer === undefined ? (
      <span className="passport-muted">{wallet.phase === 'loading' ? 'Loading…' : 'Not loaded'}</span>
    ) : (
      <Copyable value={ownCredential.issuer} label="Copy issuer DID" />
    );

  return createPortal(
    <div
      className={`passport-overlay${still ? ' passport-overlay--still' : ''}`}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        // Without this the press itself moves focus to <body>, undoing the
        // hand-back to the card that closing does.
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={dialog}
        className={`passport-detail passport-detail--${status}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="passport-detail__binding" data-theme="dark" aria-hidden="true" />
        <header className="passport-detail__bar" data-theme="dark">
          <img className="passport-detail__mark" src={helixMark} alt="" />
          <span className="passport-detail__label">Agent passport</span>
          <button ref={closeButton} type="button" aria-label="Close passport" onClick={onClose}>
            Close
          </button>
        </header>

        {notice}

        <div className="passport-detail__spread">
          <section className="passport-page passport-identity" aria-label="Identity">
            <div className="passport-identity__head">
              <AgentAvatar did={agent.agentDid} />
              <div className="passport-identity__who">
                <h2 id={titleId} className="passport-identity__name">
                  {agentDisplayName(agent)}
                </h2>
                <CopyButton
                  className="did-copy unstyled"
                  value={agent.agentDid}
                  label="Copy agent DID"
                  text={agent.agentDid}
                />
              </div>
            </div>

            <div className="passport-identity__standing">
              <PassportStamp status={status} size="page" />
              {reason !== undefined && <p className="passport-identity__reason">{reason}</p>}
            </div>

            <dl className="passport-identity__fields">
              <Field label="Issuer" wide>
                {issuer}
              </Field>
              <Field label="Issued">
                <DateValue iso={own.issuedAt} now={now} />
              </Field>
              <Field label="Expires">
                <DateValue iso={own.expiresAt} now={now} />
              </Field>
              <Field label="VC ID" wide>
                <Copyable value={own.vcId} label="Copy VC ID" />
              </Field>
              <Field label="Scopes" wide>
                {own.scopes.length === 0
                  ? 'No scopes'
                  : own.scopes.map((scope) => (
                      <span key={scope} className="scope-chip">
                        {scope}
                      </span>
                    ))}
              </Field>
              {agent.delegatedFromVcId !== null && (
                <Field label="Delegated from" wide>
                  <code>{agent.delegatedFromVcId}</code>
                </Field>
              )}
            </dl>

            <div className="passport-identity__revoke">
              <RevokeButton
                onRevoke={() => onRevoke(own.vcId)}
                disabled={(ownCredential?.serverStatus ?? own.status) !== 'active'}
              />
              <span className="field-help">Revokes this agent&rsquo;s own credential.</span>
            </div>

            <MrzStrip lines={mrzLines(agent)} />
          </section>

          <section className="passport-page passport-visa agent-detail" aria-label="Credentials">
            {/* Keyed by DID so filters and the open card never carry over to another agent. */}
            <CredentialWallet
              key={agent.agentDid}
              agentDid={agent.agentDid}
              state={wallet}
              onRetry={onRetry}
              onLoadDetails={onLoadDetails}
              onRevoke={onRevoke}
            />
          </section>

          {!still && (
            <div className="passport-detail__leaf" data-theme="dark" aria-hidden="true">
              <img src={helixMark} alt="" />
              <span>Agent passport</span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
