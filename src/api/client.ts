// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0

import { getApiConfig } from '../runtimeConfig';
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
 * How a request's auth header gets set, and what to do on a 401 — pluggable
 * so a downstream product (e.g. one layering hosted accounts on top) can
 * swap in bearer-token/refresh behavior via setAuthHeaderStrategy() without
 * forking this file or any page component that calls `api.*`. Default
 * behavior (below) is exactly the original self-hosted, admin-key-only
 * client.
 */
export interface AuthHeaderStrategy {
  apply(headers: Headers): void;
  /** Called once on a 401. Return true to retry the original request. */
  handleUnauthorized?(): Promise<boolean>;
}

let authHeaderStrategy: AuthHeaderStrategy = {
  apply(headers) {
    if (adminApiKey) headers.set('x-admin-api-key', adminApiKey);
  },
};

export function setAuthHeaderStrategy(strategy: AuthHeaderStrategy): void {
  authHeaderStrategy = strategy;
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
    authHeaderStrategy.apply(headers);
    const requestInit: RequestInit = { method, headers };
    if (options.body !== undefined) requestInit.body = JSON.stringify(options.body);
    return fetch(url, requestInit);
  };

  let response = await send();

  if (response.status === 401 && authHeaderStrategy.handleUnauthorized) {
    const retried = await authHeaderStrategy.handleUnauthorized();
    if (retried) response = await send();
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
