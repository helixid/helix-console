// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// These types describe helix-api's *admin* HTTP surface (/v1/vcs,
// /v1/agents, /v1/audit-log), authenticated with the admin API
// key — a different, console-only concern from @helixid/sdk-js's HelixClient
// (which is the agent/verifier-facing SDK, authenticated per-agent/VP and
// living in a separate repo since the monorepo split). They previously were
// (mis-)imported from @helixid/sdk-js under names that package never
// actually exported (AuditFilters, AuditLogEntry, EnrollmentTokenInput,
// EnrollmentTokenResult, VcFilters) or exported under different names
// (VCResponse/VCSummary existed but weren't part of the public API) — a
// pre-existing mismatch, not something introduced by the split. Declared
// locally here instead, matching the real response shapes in
// helix-api/src/routes/{vc,agent,audit-log}/index.ts.

export type VCStatus = 'active' | 'revoked' | 'expired';

export interface VcFilters {
  subjectDid?: string;
  status?: VCStatus;
  limit?: number;
}

export interface VCSummary {
  vcId: string;
  subjectDid: string;
  /** AgentIdentityCredential, CapabilityAttestationCredential, DelegationCredential, … (story F-1). */
  vcType?: string;
  agentName?: string;
  scopes: string[];
  status: VCStatus;
  issuedAt: string;
  expiresAt: string;
  parentVcId?: string;
}

export interface VCResponse {
  vcId: string;
  vc: Record<string, unknown>;
  status: VCStatus;
  expiresAt: string;
  revokedAt: string | null;
  renewedByVcId: string | null;
}

/** What the Enroll form collects. */
export interface EnrollmentTokenInput {
  agentName: string;
  requestedScopes: string[];
  requestedDomains?: string[];
  maxDelegationDepth?: number;
}

/**
 * POST /v1/agents for a self-custody agent (KYA-OS story F-3): helixid holds
 * no agent keys, so the agent is created waiting for its key, and the
 * enrollment token (shown once) is what `helix init` redeems on the agent's
 * own host.
 */
export interface AgentOnboarding {
  did: string;
  name: string;
  keyCustody: 'self';
  didHosting: 'helix' | 'own';
  label: string;
  status: string;
  enrollmentToken: string;
  enrollmentExpiresAt?: string;
}

export interface AuditFilters {
  eventType?: string;
  family?: string;
  since?: string;
  /** The `nextCursor` of the previous page. */
  cursor?: string;
  limit?: number;
}

/** A party: a DID, or a keyed commitment that names no one in the clear. */
export type AuditPartyRef =
  | { kind: 'public_did' | 'pairwise_did'; did: string }
  | { kind: 'keyed_commitment' | 'opaque_ref'; value?: string; keyId?: string };

/** A reference to an encrypted evidence object in the vault. */
export interface AuditEvidenceRef {
  objectId: string;
  ciphertextDigest: string;
  mediaType?: string;
  keyId?: string;
  size?: string;
}

export interface AuditAuthorization {
  source: string;
  decision: string;
  scopeId?: string;
  delegationRef?: string;
  delegationCredentialDigest?: string;
  delegationChainDigests?: string[];
  statusEvidence?: AuditEvidenceRef[];
  grantRef?: string;
  policyId?: string;
  policyVersion?: string;
  policyDigest?: string;
  verificationCode?: string;
}

/** The typed producer event (KYA-OS AUDITABILITY.md, story A-1). */
export interface AuditEvent {
  eventId: string;
  eventType: string;
  occurredAt: number;
  action: { category: string; name?: string; detailRef?: AuditEvidenceRef };
  outcome: 'succeeded' | 'failed' | 'denied' | 'challenged' | 'unknown';
  details: { family: string; phase: string } & Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
  actor?: AuditPartyRef;
  resource?: AuditPartyRef;
  responsibleParty?: AuditPartyRef;
  session?: { ref: AuditPartyRef };
  source: { producer: AuditPartyRef; sourceId: string; sourceSequence?: string };
  tenantRef?: AuditPartyRef;
  reason?: { code: string; detailRef?: AuditEvidenceRef };
  authorization?: AuditAuthorization;
  proof?: AuditEvidenceRef;
  evidence?: AuditEvidenceRef[];
  privacy?: { classification: string; retentionClass: string; legalHold?: string };
}

/** The recorder's signed receipt (story A-2): `jws` signs `core`. */
export interface AuditReceipt {
  core: {
    ledgerId: string;
    ledgerEpochId: string;
    sequence: string;
    eventId: string;
    entryDigest: string;
    previousEntryDigest: string | null;
    recordedAt: number;
    recorder: { did: string; kid: string; alg: string };
    integritySuite: string;
  };
  jws: string;
}

/** One row of helix-api's `GET /v1/audit-log`: the event as recorded, where, and its receipt. */
export interface AuditLogEntry {
  /** `<ledgerId>:<ledgerEpochId>:<sequence>`. */
  id: string;
  recordedAt: string;
  eventDigest: string;
  event: AuditEvent;
  ledgerId: string;
  ledgerEpochId: string;
  sequence: string;
  entryDigest: string;
  receipt: AuditReceipt;
}

/** One page of `GET /v1/audit-log`, newest first; `nextCursor` is null on the last. */
export interface AuditLogPage {
  items: AuditLogEntry[];
  nextCursor: string | null;
}
