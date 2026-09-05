// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0

import { Link, Navigate, Route, Routes } from 'react-router-dom';
import {
  ThemeProvider,
  RequireAuth,
  AppLayout,
  LoginPage,
  AgentsPage,
  EnrollPage,
  AuditPage,
} from '@helixid/console-core';
import { AuthProvider, useAccountAuth } from './auth/AuthContext';
import { AccountLoginPage } from './pages/account/AccountLoginPage';
import { AccountRegisterPage } from './pages/account/AccountRegisterPage';

function OperatorLoginPage() {
  return (
    <LoginPage
      footer={
        <p className="login-switch">
          Not an operator? <Link to="/account/login">Sign in with your HelixID account</Link>
        </p>
      }
    />
  );
}

function EnterpriseAppLayout() {
  const { sessionKind, accountSession } = useAccountAuth();
  return (
    <AppLayout
      footer={
        sessionKind === 'account' && accountSession
          ? `signed in as ${accountSession.account.email}`
          : 'operator console'
      }
    />
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<OperatorLoginPage />} />
          <Route path="/account/login" element={<AccountLoginPage />} />
          <Route path="/account/register" element={<AccountRegisterPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<EnterpriseAppLayout />}>
              <Route path="/" element={<Navigate to="/agents" replace />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/enroll" element={<EnrollPage />} />
              <Route path="/audit" element={<AuditPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/agents" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
