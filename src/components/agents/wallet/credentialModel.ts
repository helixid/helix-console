// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Everything the wallet derives from the API payloads, kept free of React so
// it can be unit-tested directly: what a credential is (type, issuer,
// scopes), what state it is in, and how the wallet orders and filters cards.
//
// The VC itself is `Record<string, unknown>` in api/types.ts — the console
// does not own that shape — so every field is read defensively here rather
// than by widening the shared API types.

import type { VCResponse, VCStatus, VCSummary } from '../../../api/types';

/** What the status pill shows. `not-yet-valid` is the one value the API never sends. */
export type DisplayStatus = 'active' | 'expired' | 'revoked' | 'not-yet-valid';

/** Drives the card's icon and accent. `generic` covers unknown and not-yet-loaded types. */
export type CredentialKind = 'agent' | 'grant' | 'user' | 'generic';

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
  'not-yet-valid': 'Not yet valid',
};

/**
 * GET /v1/vcs returns summaries only — no `type`, no `issuer` — so a card
 * needs GET /v1/vcs/:vcId before it can show either. That is one request
 * per credential against a rate-limited API, so only the first cards in
 * display order are fetched up front; the rest load when asked for.
 */
export const EAGER_DETAIL_LIMIT = 12;

export interface WalletState {
  phase: 'loading' | 'ready' | 'error';
  /** Why the wallet could not be loaded; empty unless phase is 'error'. */
  message: string;
  /** Every credential for the DID, as GET /v1/vcs?subjectDid= returned them. */
  summaries: VCSummary[];
  /** Full VCs fetched so far, by vcId. */
  details: Record<string, VCResponse>;
  /** vcIds whose detail request failed, with the error message. */
  failed: Record<string, string>;
  /** vcIds whose detail request is in flight. */
  pending: Record<string, true>;
}

export const LOADING_WALLET: WalletState = {
  phase: 'loading',
  message: '',
  summaries: [],
  details: {},
  failed: {},
  pending: {},
};

export interface CredentialStatusEntry {
  type: string;
  statusListIndex: string | undefined;
  statusPurpose: string | undefined;
}

/** Deliberately without `proofValue`: that belongs to the explicit JSON view only. */
export interface CredentialProofSummary {
  type: string | undefined;
  proofPurpose: string | undefined;
  verificationMethod: string | undefined;
}

export interface WalletCredential {
  vcId: string;
  kind: CredentialKind;
  typeLabel: string;
  /** The VC's `type[]` minus the base type; empty until the VC is loaded. */
  types: string[];
  status: DisplayStatus;
  /** Raw server status — Revoke keys off this, exactly as it did before the wallet. */
  serverStatus: VCStatus | undefined;
  scopes: string[];
  issuer: string | undefined;
  subjectDid: string;
  validFrom: string;
  validUntil: string;
  parentVcId: string | undefined;
  revokedAt: string | undefined;
  renewedByVcId: string | undefined;
  credentialStatus: CredentialStatusEntry | undefined;
  proof: CredentialProofSummary | undefined;
  /** The signed VC, for the explicit JSON views only. */
  vc: Record<string, unknown> | undefined;
  detailLoaded: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function timeOf(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

// ---------------------------------------------------------------------------
// Type -> card identity
// ---------------------------------------------------------------------------

const BASE_TYPE = 'VerifiableCredential';

// A Map, not an object literal: type names come from the payload, and a
// plain-object lookup would happily resolve 'constructor' or 'toString'.
const KNOWN_TYPES = new Map<string, { kind: CredentialKind; label: string }>([
  ['AgentIdentityCredential', { kind: 'agent', label: 'Agent Identity' }],
  ['HelixAgentCredential', { kind: 'agent', label: 'Agent Authorization' }],
  ['CapabilityAttestationCredential', { kind: 'grant', label: 'Capability Attestation' }],
  ['DelegationCredential', { kind: 'grant', label: 'Delegation' }],
  ['DelegationGrantCredential', { kind: 'grant', label: 'Delegation Grant' }],
  ['HelixUserCredential', { kind: 'user', label: 'User Identity' }],
]);

/** 'SelfSignedDevCredential' -> 'Self Signed Dev'. */
export function humanizeTypeName(name: string): string {
  return name
    .replace(/Credential$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

export function resolveCredentialType(type: unknown): {
  kind: CredentialKind;
  label: string;
  types: string[];
} {
  const types = (typeof type === 'string' ? [type] : asStringArray(type)).filter(
    (name) => name !== BASE_TYPE,
  );
  for (const name of types) {
    const known = KNOWN_TYPES.get(name);
    if (known) return { ...known, types };
  }
  // Unknown types still get a card — a wallet that hides what it does not
  // recognise is not showing what the agent holds.
  const label = types[0] === undefined ? '' : humanizeTypeName(types[0]);
  return { kind: 'generic', label: label || 'Verifiable Credential', types };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const SERVER_STATUSES: readonly string[] = ['active', 'revoked', 'expired'];

function toServerStatus(value: unknown): VCStatus | undefined {
  return typeof value === 'string' && SERVER_STATUSES.includes(value)
    ? (value as VCStatus)
    : undefined;
}

/**
 * The server's status wins whenever it sent one. The client only fills in
 * what the server does not say: an expiry when no status came back at all,
 * and "not yet valid", which the API has no value for. Revocation is never
 * worked out here — that would mean resolving the status list in the browser.
 */
export function deriveStatus(
  input: {
    serverStatus: VCStatus | undefined;
    validFrom: string | undefined;
    validUntil: string | undefined;
    revokedAt: string | undefined;
  },
  now: number,
): DisplayStatus {
  if (input.serverStatus === 'revoked') return 'revoked';
  if (input.serverStatus === 'expired') return 'expired';
  if (input.serverStatus === undefined) {
    if (input.revokedAt !== undefined) return 'revoked';
    const until = Date.parse(input.validUntil ?? '');
    if (!Number.isNaN(until) && until <= now) return 'expired';
  }
  const from = Date.parse(input.validFrom ?? '');
  if (!Number.isNaN(from) && from > now) return 'not-yet-valid';
  return 'active';
}

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

function readIssuer(issuer: unknown): string | undefined {
  // VCDM v2 allows `issuer` to be a DID string or an object carrying `id`.
  return asString(issuer) ?? asString(asRecord(issuer).id);
}

function readCredentialStatus(value: unknown): CredentialStatusEntry | undefined {
  const entry = asRecord(value);
  const type = asString(entry.type);
  if (type === undefined) return undefined;
  const index = entry.statusListIndex;
  return {
    type,
    statusListIndex:
      typeof index === 'string' || typeof index === 'number' ? String(index) : undefined,
    statusPurpose: asString(entry.statusPurpose),
  };
}

function readProof(value: unknown): CredentialProofSummary | undefined {
  if (!isRecord(value)) return undefined;
  return {
    type: asString(value.type),
    proofPurpose: asString(value.proofPurpose),
    verificationMethod: asString(value.verificationMethod),
  };
}

export function toWalletCredential(
  summary: VCSummary,
  detail: VCResponse | undefined,
  now: number,
): WalletCredential {
  const vc = detail !== undefined && isRecord(detail.vc) ? detail.vc : undefined;
  const subject = asRecord(vc?.credentialSubject);
  const resolved =
    vc === undefined
      ? { kind: 'generic' as const, label: 'Credential', types: [] }
      : resolveCredentialType(vc.type);

  // Same precedence the panel has always used: the detail's status, then the
  // list's. Both are computed server-side from the same row.
  const serverStatus = toServerStatus(detail?.status) ?? toServerStatus(summary.status);
  const validFrom = asString(vc?.validFrom) ?? summary.issuedAt;
  const validUntil = asString(vc?.validUntil) ?? detail?.expiresAt ?? summary.expiresAt;
  const revokedAt = detail?.revokedAt ?? undefined;

  // The list's scopes come from the server's own column. The claim names
  // differ by type (`privilegeScopes` on agent credentials, `scopes` on
  // delegation grants), so they are only the fallback.
  const summaryScopes = asStringArray(summary.scopes);
  const claimScopes = asStringArray(subject.privilegeScopes);
  const scopes =
    summaryScopes.length > 0
      ? summaryScopes
      : claimScopes.length > 0
        ? claimScopes
        : asStringArray(subject.scopes);

  return {
    vcId: summary.vcId,
    kind: resolved.kind,
    typeLabel: resolved.label,
    types: resolved.types,
    status: deriveStatus({ serverStatus, validFrom, validUntil, revokedAt }, now),
    serverStatus,
    scopes,
    issuer: readIssuer(vc?.issuer),
    subjectDid: asString(subject.id) ?? summary.subjectDid,
    validFrom,
    validUntil,
    parentVcId: summary.parentVcId ?? asString(subject.parentVcId),
    revokedAt,
    renewedByVcId: detail?.renewedByVcId ?? undefined,
    credentialStatus: readCredentialStatus(vc?.credentialStatus),
    proof: readProof(vc?.proof),
    vc,
    detailLoaded: detail !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Ordering, filtering
// ---------------------------------------------------------------------------

/** Active first, then newest first. */
export function sortCredentials(credentials: WalletCredential[]): WalletCredential[] {
  return [...credentials].sort(
    (a, b) =>
      Number(a.status !== 'active') - Number(b.status !== 'active') ||
      timeOf(b.validFrom) - timeOf(a.validFrom),
  );
}

export function buildWallet(
  summaries: VCSummary[],
  details: Record<string, VCResponse>,
  now: number,
): WalletCredential[] {
  return sortCredentials(
    summaries.map((summary) => toWalletCredential(summary, details[summary.vcId], now)),
  );
}

/**
 * Which credentials to fetch in full up front: the first `limit` in display
 * order, worked out from the summaries alone (the details are what is being
 * decided on, so they cannot be used to decide).
 */
export function eagerDetailIds(summaries: VCSummary[], limit = EAGER_DETAIL_LIMIT): string[] {
  return [...summaries]
    .sort(
      (a, b) =>
        Number(a.status !== 'active') - Number(b.status !== 'active') ||
        timeOf(b.issuedAt) - timeOf(a.issuedAt),
    )
    .slice(0, limit)
    .map((summary) => summary.vcId);
}

export type StatusFilter = 'all' | 'active' | 'expired' | 'revoked';

export const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'revoked', label: 'Revoked' },
];

export interface WalletFilters {
  status: StatusFilter;
  /** A type label from typeOptions(), or null for every type. */
  type: string | null;
  query: string;
}

export const NO_FILTERS: WalletFilters = { status: 'all', type: null, query: '' };

export function filterCredentials(
  credentials: WalletCredential[],
  filters: WalletFilters,
): WalletCredential[] {
  const query = filters.query.trim().toLowerCase();
  return credentials.filter((credential) => {
    if (filters.status !== 'all' && credential.status !== filters.status) return false;
    if (filters.type !== null && credential.typeLabel !== filters.type) return false;
    if (query === '') return true;
    return [credential.vcId, credential.issuer ?? '', ...credential.scopes].some((field) =>
      field.toLowerCase().includes(query),
    );
  });
}

/** Distinct type labels among credentials whose VC is loaded, in display order. */
export function typeOptions(credentials: WalletCredential[]): string[] {
  const labels = new Set<string>();
  for (const credential of credentials) {
    if (credential.detailLoaded) labels.add(credential.typeLabel);
  }
  return [...labels];
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

export function splitScopes(scopes: string[], max = 3): { visible: string[]; hidden: number } {
  return { visible: scopes.slice(0, max), hidden: Math.max(0, scopes.length - max) };
}

/** Same cut as the agents table's DID column: anything up to 24 characters stays whole. */
export function shortenId(value: string, head = 16, tail = 6): string {
  return value.length <= head + tail + 2 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatDate(iso: string | undefined, locale?: string): string {
  const time = Date.parse(iso ?? '');
  if (Number.isNaN(time)) return '—';
  return new Date(time).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

/** 'in 3 days', '2 months ago' — empty when the timestamp is unusable. */
export function formatRelative(iso: string | undefined, now: number, locale?: string): string {
  const time = Date.parse(iso ?? '');
  if (Number.isNaN(time)) return '';
  const delta = time - now;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(delta) >= size) return formatter.format(Math.round(delta / size), unit);
  }
  return formatter.format(Math.round(delta / 1000), 'second');
}

/** "Agent Authorization credential, Expired, valid until Sep 18, 2026". */
export function credentialAccessibleName(credential: WalletCredential, locale?: string): string {
  const noun = /credential$/i.test(credential.typeLabel)
    ? credential.typeLabel
    : `${credential.typeLabel} credential`;
  return `${noun}, ${STATUS_LABELS[credential.status]}, valid until ${formatDate(
    credential.validUntil,
    locale,
  )}`;
}

// ---------------------------------------------------------------------------
// JSON views
// ---------------------------------------------------------------------------

/** The wallet as one document. Only loaded VCs can be in it — nothing is invented for the rest. */
export function buildWalletDocument(
  agentDid: string,
  credentials: WalletCredential[],
): { agent: string; credentials: Array<Record<string, unknown>> } {
  return {
    agent: agentDid,
    credentials: credentials.flatMap((credential) => (credential.vc ? [credential.vc] : [])),
  };
}

/** A DID or VC ID made safe to use as a download name. */
export function jsonFilename(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safe || 'credential'}.json`;
}

export type JsonTokenKind = 'key' | 'string' | 'number' | 'literal' | 'punctuation' | 'plain';

export interface JsonToken {
  kind: JsonTokenKind;
  text: string;
}

const JSON_TOKEN_SOURCE =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}[\],:])/
    .source;

/**
 * Splits pretty-printed JSON into highlightable tokens. Lossless — joining
 * the tokens' text gives the input back — so whatever is on screen is
 * exactly what Copy and Download hand over.
 */
export function tokenizeJson(text: string): JsonToken[] {
  const pattern = new RegExp(JSON_TOKEN_SOURCE, 'g');
  const tokens: JsonToken[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    // Whitespace, and anything that is not JSON at all, falls between matches.
    if (match.index > cursor) tokens.push({ kind: 'plain', text: text.slice(cursor, match.index) });
    const [whole, quoted, colon, number, literal] = match;
    if (quoted !== undefined) {
      tokens.push({ kind: colon === undefined ? 'string' : 'key', text: quoted });
      if (colon !== undefined) tokens.push({ kind: 'punctuation', text: colon });
    } else if (number !== undefined) {
      tokens.push({ kind: 'number', text: number });
    } else if (literal !== undefined) {
      tokens.push({ kind: 'literal', text: literal });
    } else {
      tokens.push({ kind: 'punctuation', text: whole });
    }
    cursor = match.index + whole.length;
  }
  if (cursor < text.length) tokens.push({ kind: 'plain', text: text.slice(cursor) });
  return tokens;
}
