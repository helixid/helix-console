// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0

import { getApiConfig } from '../runtimeConfig';
import { accountAuth } from './accountAuth';
import { clearAccountSession, getAccountSession, setAccountSession } from '../auth/accountSession';
import type {
  AuditFilters,
  AuditLogEntry,
  EnrollmentTokenInput,
  EnrollmentTokenResult,
  VcFilters,
  VCSummary,
  VCResponse,
} from './types';

const { apiBaseUrl, adminApiKey } = getApiConfig();

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path, apiBaseUrl || window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Which auth header to send is a per-request decision, not a fixed one
 * picked at module load: a hosted-account session (email/password or
 * Google — see AuthContext.tsx) takes priority when present, so that
 * account's Console view is scoped to just their own agents/audit trail
 * (server-side, via the same bearer token /v1/enrollment-tokens and
 * /v1/vcs already accept). Falls back to the operator admin key
 * (self-hosted / no account session) exactly as before.
 */
function applyAuthHeader(headers: Headers): void {
  const session = getAccountSession();
  if (session) {
    headers.set('authorization', `Bearer ${session.accessToken}`);
    return;
  }
  if (adminApiKey) headers.set('x-admin-api-key', adminApiKey);
}

/** One-shot refresh-on-401: access tokens are short-lived (~15 min, see docs/proposal-hosted-instance.md). */
async function tryRefreshAccountSession(): Promise<boolean> {
  const session = getAccountSession();
  if (!session) return false;
  try {
    const tokens = await accountAuth.refresh(session.refreshToken);
    setAccountSession({ account: session.account, ...tokens });
    return true;
  } catch {
    clearAccountSession();
    if (typeof window !== 'undefined') window.location.assign('/account/login');
    return false;
  }
}

async function requestJson<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | undefined>;
    expectJsonArray?: boolean;
  } = {},
): Promise<T> {
  const url = buildUrl(path, options.query);
  const method = options.method ?? 'GET';

  const send = () => {
    const headers = new Headers();
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    applyAuthHeader(headers);
    const requestInit: RequestInit = { method, headers };
    if (options.body !== undefined) requestInit.body = JSON.stringify(options.body);
    return fetch(url, requestInit);
  };

  let response = await send();

  if (response.status === 401 && getAccountSession()) {
    const refreshed = await tryRefreshAccountSession();
    if (refreshed) response = await send();
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      message = payload.error?.message ?? message;
    } catch {
      // Ignore non-JSON error payloads.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json()) as T;
  if (options.expectJsonArray && !Array.isArray(payload)) {
    throw new Error('Unexpected response shape');
  }
  return payload;
}

export const api = {
  listAgents: async (filters?: VcFilters): Promise<VCSummary[]> =>
    filters
      ? requestJson<VCSummary[]>('/v1/vcs', { query: { ...filters } })
      : requestJson<VCSummary[]>('/v1/vcs'),
  getAgent: async (vcId: string): Promise<VCResponse> =>
    requestJson<VCResponse>(`/v1/vcs/${encodeURIComponent(vcId)}`),
  revokeAgent: async (vcId: string): Promise<{ vcId: string; revoked: true; revokedAt: string }> =>
    requestJson(`/v1/vcs/${encodeURIComponent(vcId)}/revoke`, { method: 'POST' }),
  createEnrollmentToken: async (input: EnrollmentTokenInput): Promise<EnrollmentTokenResult> =>
    requestJson<EnrollmentTokenResult>('/v1/enrollment-tokens', {
      method: 'POST',
      body: input,
    }),
  getAuditLog: async (filters?: AuditFilters): Promise<AuditLogEntry[]> =>
    filters
      ? requestJson<AuditLogEntry[]>('/v1/audit-log', { query: { ...filters } })
      : requestJson<AuditLogEntry[]>('/v1/audit-log'),
};

export type Api = typeof api;
