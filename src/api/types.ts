// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// These types describe helix-api's *admin* HTTP surface (/v1/vcs,
// /v1/enrollment-tokens, /v1/audit-log), authenticated with the admin API
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

export interface EnrollmentTokenInput {
  agentName: string;
  requestedScopes: string[];
  requestedDomains?: string[];
  maxDelegationDepth?: number;
}

export interface EnrollmentTokenResult {
  token: string;
  expiresAt: string;
}

export interface AuditFilters {
  eventType?: string;
  since?: string;
  limit?: number;
}

/**
 * The activity-trail envelope GET /v1/audit-log returns — a single shape
 * describing issuance, presentation, verification, authorization,
 * invocation, and consent-grant events, so almost every field is optional.
 */
export interface AuditLogEntry {
  id: string;
  eventType: string;
  timestamp: string;
  subjectDid?: string;
  vcId?: string;
  targetService?: string;
  result?: string;
  delegatedFrom?: string;
  delegatedTo?: string;
  parentVcId?: string;
  delegationDepth?: number;
  attemptedVcId?: string;
  attemptedParentVcId?: string;
  attemptedDelegatedFrom?: string;
  issuer?: string;
  userDid?: string;
  scopes?: string[];
  durability?: string;
  correlationId?: string;
  credentialType?: string;
  validUntil?: string;
  credentialStatus?: string;
  serviceDid?: string;
  serviceName?: string;
  toolName?: string;
  requiredScope?: string;
  effectiveScopes?: string[];
  reason?: string;
  resultSummary?: string;
}
