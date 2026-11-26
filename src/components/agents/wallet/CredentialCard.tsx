// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// One credential as a wallet card: what it is, whether it is good, what it
// allows, who issued it and until when.
//
// The whole card opens the detail, but the card is not itself a <button>:
// it also holds two copy buttons, and buttons cannot nest. Instead the
// title is the button and its hit area is stretched over the card in CSS,
// with the copy buttons layered above it. Tab order stays the reading
// order: open, copy issuer, copy VC ID.

import type { ComponentType } from 'react';
import { BotIcon, KeyIcon, ShieldIcon, UserIcon } from '../../layout/icons';
import {
  credentialAccessibleName,
  formatDate,
  formatRelative,
  shortenId,
  splitScopes,
  type CredentialKind,
  type WalletCredential,
} from './credentialModel';
import { CopyButton, StatusPill } from './walletUi';

const KIND_ICONS: Record<CredentialKind, ComponentType> = {
  agent: BotIcon,
  grant: KeyIcon,
  user: UserIcon,
  generic: ShieldIcon,
};

export interface CredentialCardProps {
  credential: WalletCredential;
  /** The clock reading the wallet rendered with, so every card agrees on "now". */
  now: number;
  /** `trigger` is the element to hand focus back to when the detail closes. */
  onOpen: (vcId: string, trigger: HTMLElement) => void;
}

export function CredentialCard({ credential, now, onOpen }: CredentialCardProps) {
  const Icon = KIND_ICONS[credential.kind];
  const { visible, hidden } = splitScopes(credential.scopes);
  const relative = formatRelative(credential.validUntil, now);

  return (
    <article className={`cred-card cred-card--${credential.kind} cred-card--${credential.status}`}>
      {credential.status === 'revoked' && (
        <p className="cred-card__band">
          Revoked{credential.revokedAt === undefined ? '' : ` ${formatDate(credential.revokedAt)}`}
        </p>
      )}

      <header className="cred-card__header">
        <span className="cred-card__icon">
          <Icon />
        </span>
        <button
          type="button"
          className="cred-card__open unstyled"
          aria-label={credentialAccessibleName(credential)}
          onClick={(event) => onOpen(credential.vcId, event.currentTarget)}
        >
          {credential.typeLabel}
        </button>
        <StatusPill status={credential.status} />
      </header>

      <div className="cred-card__scopes">
        {visible.length === 0 && <span className="cred-card__none">No scopes</span>}
        {visible.map((scope) => (
          <span key={scope} className="scope-chip">
            {scope}
          </span>
        ))}
        {hidden > 0 && (
          <span
            className="scope-chip scope-chip--more"
            title={credential.scopes.slice(visible.length).join(', ')}
          >
            +{hidden}
          </span>
        )}
      </div>

      <footer className="cred-card__footer">
        <div className="cred-card__row">
          <span className="cred-card__key">Issuer</span>
          {credential.issuer === undefined ? (
            <span className="cred-card__none">
              {credential.detailLoaded ? '—' : 'Details not loaded'}
            </span>
          ) : (
            <CopyButton
              className="did-copy unstyled"
              value={credential.issuer}
              label={`Copy issuer DID ${credential.issuer}`}
              text={shortenId(credential.issuer)}
            />
          )}
        </div>
        <div className="cred-card__row">
          <span className="cred-card__key">Valid until</span>
          <time
            className="cred-card__value"
            dateTime={credential.validUntil}
            title={relative === '' ? undefined : relative}
          >
            {formatDate(credential.validUntil)}
          </time>
        </div>
        <div className="cred-card__row">
          <span className="cred-card__key">VC ID</span>
          <span className="cred-card__value">
            <code>{shortenId(credential.vcId)}</code>
            <CopyButton className="unstyled" value={credential.vcId} label="Copy VC ID" />
          </span>
        </div>
      </footer>
    </article>
  );
}
