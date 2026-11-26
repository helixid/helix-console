// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Everything the passport derives from an agent record, kept free of React
// so it can be unit-tested directly: which stamp it carries, what it is
// called, the decorative machine-readable strip and the avatar pattern.
//
// The passport is a metaphor only. Nothing here follows a real country's
// passport: the strip borrows the look of a machine-readable zone, not its
// format, and carries no state code.

import type { VCStatus, VCSummary } from '../../../api/types';
import { formatDate, shortenId } from '../wallet/credentialModel';

/**
 * An agent as its passport shows it, worked out from its own credential (the
 * identity VC the Agents page lists one per DID). The operator API has no
 * agent record of its own, so the agent's standing is that credential's.
 */
export interface PassportAgent {
  agentDid: string;
  name: string | null;
  status: 'active' | 'revoked';
  /** Why the agent is revoked; null while it is active. */
  statusReason: 'revoked' | 'expired' | null;
  /** The agent's own credential, the one its status follows. */
  credential: {
    vcId: string;
    status: VCStatus;
    scopes: string[];
    issuedAt: string;
    expiresAt: string;
  };
  /** The credential this one was delegated from, or null. */
  delegatedFromVcId: string | null;
}

export function toPassportAgent(summary: VCSummary): PassportAgent {
  return {
    agentDid: summary.subjectDid,
    name: summary.agentName ?? null,
    status: summary.status === 'active' ? 'active' : 'revoked',
    statusReason: summary.status === 'active' ? null : summary.status,
    credential: {
      vcId: summary.vcId,
      status: summary.status,
      scopes: summary.scopes,
      issuedAt: summary.issuedAt,
      expiresAt: summary.expiresAt,
    },
    delegatedFromVcId: summary.parentVcId || null,
  };
}

/**
 * The stamp on an agent's passport. The API has two agent states, active and
 * revoked; an expired one is a revoked agent whose server-given reason is
 * that its own credential expired.
 */
export type PassportStatus = 'active' | 'expired' | 'revoked';

type StatusReason = NonNullable<PassportAgent['statusReason']>;

export const STAMP_LABELS: Record<PassportStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
};

/** Why an agent is not active, in the server's terms. */
export const STATUS_REASONS: Record<StatusReason, string> = {
  revoked: 'Its credential was revoked',
  expired: 'Its credential has expired',
};

export function passportStatus(agent: Pick<PassportAgent, 'status' | 'statusReason'>): PassportStatus {
  if (agent.status === 'active') return 'active';
  return agent.statusReason === 'expired' ? 'expired' : 'revoked';
}

/** The reason an agent is not active, or undefined while it is. */
export function statusReasonText(
  agent: Pick<PassportAgent, 'status' | 'statusReason'>,
): string | undefined {
  return agent.status === 'revoked' && agent.statusReason !== null
    ? STATUS_REASONS[agent.statusReason]
    : undefined;
}

/** The agent's name, or its DID cut short when it has none. */
export function agentDisplayName(agent: Pick<PassportAgent, 'name' | 'agentDid'>): string {
  return agent.name?.trim() || shortenId(agent.agentDid);
}

/** "Agent billing-agent, Expired, expired Sep 18, 2026". */
export function passportAccessibleName(agent: PassportAgent, now: number, locale?: string): string {
  const intro = `Agent ${agentDisplayName(agent)}, ${STAMP_LABELS[passportStatus(agent)]}`;
  const { expiresAt } = agent.credential;
  const until = Date.parse(expiresAt);
  const tense = !Number.isNaN(until) && until <= now ? 'expired' : 'expires';
  return `${intro}, ${tense} ${formatDate(expiresAt, locale)}`;
}

// ---------------------------------------------------------------------------
// Machine-readable strip (decorative)
// ---------------------------------------------------------------------------

/** Characters per line, as on a passport's machine-readable zone. */
export const MRZ_LINE_LENGTH = 44;

const FILLER = '<';

/** Upper-case letters and digits; every other run becomes one filler. */
function mrzField(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, FILLER)
    .replace(/^<+|<+$/g, '');
}

function fit(line: string): string {
  return line.slice(0, MRZ_LINE_LENGTH).padEnd(MRZ_LINE_LENGTH, FILLER);
}

/** The last segment of a DID or VC ID, the part that tells two apart. */
function lastSegment(id: string): string {
  return id.slice(id.lastIndexOf(':') + 1);
}

/** YYMMDD in UTC, or fillers when there is no usable date. */
function mrzDate(iso: string | undefined): string {
  const time = Date.parse(iso ?? '');
  if (Number.isNaN(time)) return FILLER.repeat(6);
  return new Date(time).toISOString().slice(2, 10).replaceAll('-', '');
}

/**
 * Two lines in the style of a machine-readable zone: the name on the first,
 * the DID, the credential and its expiry on the second. Decorative and cut to
 * length, so it is never the only place a value appears.
 */
export function mrzLines(agent: PassportAgent): [string, string] {
  const name = mrzField(agent.name ?? '') || 'UNNAMED';
  const did = mrzField(lastSegment(agent.agentDid)).slice(0, 20);
  const vc = mrzField(lastSegment(agent.credential.vcId)).slice(0, 12);
  return [
    fit(`AP${FILLER}HELIXID${FILLER}${FILLER}${name}`),
    fit(`${did}${FILLER}${vc}${FILLER}${mrzDate(agent.credential.expiresAt)}`),
  ];
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

/** 32-bit FNV-1a, then murmur3's finaliser so DIDs one character apart look nothing alike. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** 0 is an empty cell, 1 a soft one, 2 a solid one. */
export type IdenticonCell = 0 | 1 | 2;

export const IDENTICON_SIZE = 5;

/**
 * The avatar's 5×5 pattern, mirrored left to right: fifteen cells are
 * chosen and the other ten reflect them. One hash of the DID picks which
 * cells are filled, a second picks each filled cell's tone. Never blank —
 * a DID that fills nothing gets the centre cell.
 */
export function identiconCells(did: string): IdenticonCell[][] {
  const shape = hashString(did);
  const tone = hashString(`${did}#tone`);
  const rows: IdenticonCell[][] = [];
  for (let row = 0; row < IDENTICON_SIZE; row += 1) {
    const half = [0, 1, 2].map((column): IdenticonCell => {
      const bit = row * 3 + column;
      if (((shape >>> bit) & 1) === 0) return 0;
      return ((tone >>> bit) & 1) === 1 ? 2 : 1;
    });
    rows.push([half[0]!, half[1]!, half[2]!, half[1]!, half[0]!]);
  }
  if (!rows.some((cells) => cells.some((cell) => cell !== 0))) rows[2]![2] = 2;
  return rows;
}
