// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0

import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import { getAuthConfig } from '../runtimeConfig';
import {
  clearAccountSession,
  getAccountSession,
  setAccountSession as persistAccountSession,
  type AccountSession,
} from './accountSession';

const STORAGE_KEY = 'helixid.console.auth';

export interface AuthValue {
  /** True if signed in as either the operator (admin key) or a hosted account. */
  isAuthenticated: boolean;
  /** Which kind of session is active, or null if neither. Lets the UI (nav footer, etc.) tell them apart. */
  sessionKind: 'operator' | 'account' | null;
  /** Populated only when sessionKind === 'account'. */
  accountSession: AccountSession | null;
  /** Validates against runtime-config credentials; returns success. */
  login: (username: string, password: string) => boolean;
  /** Called after a successful /account/register or /account/login — this is the one place that writes the session. */
  setAccountSession: (session: AccountSession) => void;
  /** Clears whichever session is active (operator flag and/or hosted-account session). */
  logout: () => void;
}

export const AuthContext = createContext<AuthValue>({
  isAuthenticated: false,
  sessionKind: null,
  accountSession: null,
  login: () => false,
  setAccountSession: () => {},
  logout: () => {},
});

/**
 * Client-side access gate (dev spec §8 override). This is a gate, not a
 * security boundary — the ADMIN_API_KEY still ships in runtime config.
 * The session flag lives in sessionStorage so it survives a reload within
 * the tab but not a new tab / restart.
 *
 * Tracks two independent session kinds: the original operator admin-key
 * flag, and a hosted-account session (email/password or Google, provisioned
 * with its own DID — see docs/proposal-hosted-instance.md). Either one is
 * enough to pass RequireAuth. The account session is read here on mount so
 * a page reload after registering/logging in doesn't lose it — previously
 * it was written to sessionStorage but never read back anywhere.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [isOperator, setIsOperator] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [accountSession, setAccountSessionState] = useState<AccountSession | null>(() =>
    getAccountSession(),
  );

  const login = useCallback((username: string, password: string): boolean => {
    const expected = getAuthConfig();
    if (username === expected.username && password === expected.password) {
      try {
        sessionStorage.setItem(STORAGE_KEY, 'true');
      } catch {
        // Session flag is best-effort; state still reflects the login.
      }
      setIsOperator(true);
      return true;
    }
    return false;
  }, []);

  const setAccountSession = useCallback((session: AccountSession) => {
    persistAccountSession(session);
    setAccountSessionState(session);
  }, []);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore; clearing state below is what gates the UI.
    }
    clearAccountSession();
    setIsOperator(false);
    setAccountSessionState(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      isAuthenticated: isOperator || accountSession !== null,
      sessionKind: isOperator ? 'operator' : accountSession ? 'account' : null,
      accountSession,
      login,
      setAccountSession,
      logout,
    }),
    [isOperator, accountSession, login, setAccountSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
