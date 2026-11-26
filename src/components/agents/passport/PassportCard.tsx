// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// One agent as a passport cover: who it is, whether it is in good standing,
// what it may do and until when. Covers are dark in both themes, like the
// sidebar — data-theme="dark" on the card gives it the dark token set.
//
// The whole cover opens the passport, but the cover is not itself a
// <button>: it also holds a copy button, and buttons cannot nest. As on a
// wallet card, the name is the button and its hit area is stretched over
// the cover in CSS, with the copy button layered above it. Tab order is the
// reading order: open, then copy.

import helixMark from '../../../assets/helix-mark.svg';
import { formatDate, shortenId, splitScopes } from '../wallet/credentialModel';
import { CopyButton } from '../wallet/walletUi';
import {
  agentDisplayName,
  mrzLines,
  passportAccessibleName,
  passportStatus,
  type PassportAgent,
} from './passportModel';
import { AgentAvatar, MrzStrip, PassportStamp } from './passportUi';

export interface PassportCardProps {
  agent: PassportAgent;
  /** The clock reading the grid rendered with, so every card agrees on "now". */
  now: number;
  /** `trigger` is the element to hand focus back to when the passport closes. */
  onOpen: (agent: PassportAgent, trigger: HTMLElement) => void;
}

export function PassportCard({ agent, now, onOpen }: PassportCardProps) {
  const status = passportStatus(agent);
  const scopes = agent.credential.scopes;
  const { visible, hidden } = splitScopes(scopes);
  const { expiresAt } = agent.credential;

  return (
    <article className={`passport-card passport-card--${status}`} data-theme="dark">
      <header className="passport-card__cover">
        <img className="passport-card__mark" src={helixMark} alt="" />
        <span className="passport-card__label">Agent passport</span>
      </header>

      <div className="passport-card__identity">
        <AgentAvatar did={agent.agentDid} />
        <div className="passport-card__who">
          <h3 className="passport-card__name">
            <button
              type="button"
              className="passport-card__open unstyled"
              aria-label={passportAccessibleName(agent, now)}
              onClick={(event) => onOpen(agent, event.currentTarget)}
            >
              {agentDisplayName(agent)}
            </button>
          </h3>
          <CopyButton
            className="did-copy unstyled"
            value={agent.agentDid}
            label={`Copy agent DID ${agent.agentDid}`}
            text={shortenId(agent.agentDid)}
          />
        </div>
      </div>

      <PassportStamp status={status} />

      <div className="passport-card__scopes">
        {visible.length === 0 && <span className="passport-card__none">No scopes</span>}
        {visible.map((scope) => (
          <span key={scope} className="scope-chip">
            {scope}
          </span>
        ))}
        {hidden > 0 && (
          <span className="scope-chip scope-chip--more" title={scopes.slice(visible.length).join(', ')}>
            +{hidden}
          </span>
        )}
      </div>

      <div className="passport-card__facts">
        <span>
          <span className="passport-card__key">Expires</span>
          {!expiresAt ? '—' : <time dateTime={expiresAt}>{formatDate(expiresAt)}</time>}
        </span>
        {agent.delegatedFromVcId !== null && (
          <span className="passport-card__badge">Delegated</span>
        )}
      </div>

      <MrzStrip lines={mrzLines(agent)} />
    </article>
  );
}
