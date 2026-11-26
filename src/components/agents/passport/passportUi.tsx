// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// The pieces a passport is drawn from, shared by the cover card and the
// identity page: the agent's avatar, its status stamp and the decorative
// machine-readable strip.

import { useMemo, type ComponentType } from 'react';
import { BanIcon, CheckIcon, ClockIcon } from '../../layout/icons';
import {
  IDENTICON_SIZE,
  STAMP_LABELS,
  identiconCells,
  type PassportStatus,
} from './passportModel';

const STAMP_ICONS: Record<PassportStatus, ComponentType> = {
  active: CheckIcon,
  expired: ClockIcon,
  revoked: BanIcon,
};

/**
 * The agent's picture: a pattern worked out from its DID in the browser, so
 * the same agent always looks the same and nothing is fetched or uploaded.
 * Decorative — the name beside it is what identifies the agent.
 */
export function AgentAvatar({ did }: { did: string }) {
  const cells = useMemo(() => identiconCells(did), [did]);
  return (
    <svg
      className="passport-avatar"
      viewBox={`-1 -1 ${IDENTICON_SIZE + 2} ${IDENTICON_SIZE + 2}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {cells.flatMap((row, y) =>
        row.flatMap((cell, x) =>
          cell === 0
            ? []
            : [
                <rect
                  key={`${x}-${y}`}
                  className={`passport-avatar__cell passport-avatar__cell--${
                    cell === 2 ? 'solid' : 'soft'
                  }`}
                  x={x}
                  y={y}
                  width={1}
                  height={1}
                />,
              ],
        ),
      )}
    </svg>
  );
}

export interface PassportStampProps {
  status: PassportStatus;
  /** A few words under the stamp, for a revocation the word alone would not explain. */
  caption?: string | undefined;
  /** `page` is the larger stamp on the identity page. */
  size?: 'card' | 'page';
}

/** The status as a rubber stamp: an icon and a word, never colour alone. */
export function PassportStamp({ status, caption, size = 'card' }: PassportStampProps) {
  const Icon = STAMP_ICONS[status];
  return (
    <div className={`passport-stamp passport-stamp--${status} passport-stamp--${size}`}>
      <span className="passport-stamp__ink">
        <Icon />
        {STAMP_LABELS[status]}
      </span>
      {caption !== undefined && <span className="passport-stamp__caption">{caption}</span>}
    </div>
  );
}

/** Two lines in the style of a machine-readable zone. Decorative: hidden from assistive tech. */
export function MrzStrip({ lines }: { lines: readonly [string, string] }) {
  return (
    <div className="passport-mrz" aria-hidden="true">
      <span>{lines[0]}</span>
      <span>{lines[1]}</span>
    </div>
  );
}
