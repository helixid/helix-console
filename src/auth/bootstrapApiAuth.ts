// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Registers the enterprise auth-header strategy with @helixid/console-core's
// api client, once, at app startup — every page importing `api` from
// console-core (AgentsPage, EnrollPage, AuditPage, ...) then transparently
// sends a hosted-account bearer token instead of the admin key when one is
// present, with one-shot refresh-on-401. See api/client.ts's
// AuthHeaderStrategy for the seam this plugs into.

import { getApiConfig, setAuthHeaderStrategy } from '@helixid/console-core';
import { accountAuth } from '../api/accountAuth';
import { clearAccountSession, getAccountSession, setAccountSession } from './accountSession';

const { adminApiKey } = getApiConfig();

setAuthHeaderStrategy({
  apply(headers) {
    const session = getAccountSession();
    if (session) {
      headers.set('authorization', `Bearer ${session.accessToken}`);
      return;
    }
    // setAuthHeaderStrategy() replaces console-core's default strategy
    // wholesale rather than layering on top of it, so the admin-key
    // fallback has to be repeated here explicitly.
    if (adminApiKey) headers.set('x-admin-api-key', adminApiKey);
  },
  async handleUnauthorized() {
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
  },
});
