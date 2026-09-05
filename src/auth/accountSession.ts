// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Single source of truth for the hosted-account session (as opposed to the
// operator admin-key gate in AuthContext.tsx). Both AuthContext (to know
// whether a user is signed in at all) and api/client.ts (to attach the
// right auth header, and to persist a refreshed token) need to read/write
// this same sessionStorage entry — centralizing it here means there's only
// one place that knows its key and shape.

import type { AccountSummary, AuthTokens } from '../api/accountAuth';

const STORAGE_KEY = 'helixid.account.session';

export interface AccountSession {
  account: AccountSummary;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function getAccountSession(): AccountSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AccountSession;
  } catch {
    return null;
  }
}

export function setAccountSession(session: { account: AccountSummary } & AuthTokens): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Best-effort; the in-memory AuthContext state still reflects the session for this tab.
  }
}

export function clearAccountSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
