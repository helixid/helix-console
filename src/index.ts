// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Package surface for @helixid/console-core. A downstream product (the
// enterprise console, layering hosted-account pages/session handling on
// top) imports everything it needs from here — never from sub-paths —
// then composes its own App.tsx with additional routes, and calls
// setAuthHeaderStrategy() once at startup to make api/client.ts bearer-token
// aware instead of admin-key-only.

export { App } from './App';
export { AuthContext, AuthProvider, type AuthValue } from './auth/AuthContext';
export { useAuth } from './auth/useAuth';
export { RequireAuth } from './auth/RequireAuth';

export { api, setAuthHeaderStrategy, type Api, type AuthHeaderStrategy } from './api/client';
export type * from './api/types';

export { AppLayout, type AppLayoutProps } from './components/layout/AppLayout';
export { ThemeToggle } from './components/layout/ThemeToggle';
export { BotIcon, KeyIcon, ShieldIcon } from './components/layout/icons';
export { AgentList } from './components/agents/AgentList';
export { AgentDetailPanel } from './components/agents/AgentDetailPanel';
export { RevokeButton } from './components/agents/RevokeButton';
export { EnrollForm, type EnrollFormProps } from './components/enroll/EnrollForm';
export { EnrollmentStatus } from './components/enroll/EnrollmentStatus';

export { LoginPage, type LoginPageProps } from './pages/LoginPage';
export { AgentsPage } from './pages/AgentsPage';
export { EnrollPage } from './pages/EnrollPage';
export { AuditPage } from './pages/AuditPage';

export { ThemeProvider } from './theme/ThemeContext';
export { useTheme } from './theme/useTheme';

export { getApiConfig, getAuthConfig } from './runtimeConfig';
export { usePolling } from './hooks/usePolling';
