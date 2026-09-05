// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Enterprise's own AuthProvider — reuses @helixid/console-core's AuthContext
// object (so its useAuth()/RequireAuth/AppLayout/LoginPage all keep working
// unmodified) but provides a richer value: authenticated if EITHER the
// operator admin-key flag OR a hosted-account session is present. Tracks
// two independent session kinds: the original operator admin-key flag, and
// a hosted-account session (email/password or Google, provisioned with its
// own DID — see docs/proposal-hosted-instance.md). The account session is
// read here on mount so a page reload after registering/logging in doesn't
// lose it.

import { useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, getAuthConfig, type AuthValue } from '@helixid/console-core';
import {
  clearAccountSession,
  getAccountSession,
  setAccountSession as persistAccountSession,
  type AccountSession,
} from './accountSession';

const STORAGE_KEY = 'helixid.console.auth';

export interface EnterpriseAuthValue extends AuthValue {
  /** Which kind of session is active, or null if neither. Lets the UI (nav footer, etc.) tell them apart. */
  sessionKind: 'operator' | 'account' | null;
  /** Populated only when sessionKind === 'account'. */
  accountSession: AccountSession | null;
  /** Called after a successful /account/register or /account/login — this is the one place that writes the session. */
  setAccountSession: (session: AccountSession) => void;
}

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

  const value = useMemo<EnterpriseAuthValue>(
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

/**
 * console-core's own useAuth() is typed to the base AuthValue shape (it has
 * no idea this enterprise build's AuthProvider supplies the richer one
 * above). This is the enterprise-only equivalent for code that needs
 * sessionKind/accountSession/setAccountSession — safe because this
 * AuthProvider is the only one ever mounted in this app.
 */
export function useAccountAuth(): EnterpriseAuthValue {
  return useContext(AuthContext) as EnterpriseAuthValue;
}
