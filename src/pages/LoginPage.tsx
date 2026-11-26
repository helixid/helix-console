// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0

import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { LoginHero } from './LoginHero';

interface LocationState {
  from?: { pathname?: string };
}

export interface LoginPageProps {
  /** Rendered below the sign-in form — a downstream product can add its own alternate sign-in link without forking this component. */
  footer?: ReactNode;
}

export function LoginPage({ footer }: LoginPageProps = {}) {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/agents';

  // Already signed in (or navigated back to /login) — skip the form.
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (login(username, password)) {
      navigate(from, { replace: true });
    } else {
      setError('Invalid username or password.');
    }
  };

  return (
    <div className="account-auth">
      <LoginHero />
      <div className="account-auth__panel">
        <div className="account-auth__card">
          <h1>Operator sign in</h1>
          <p className="account-auth__lede">Sign in to manage your AI agent identity layer.</p>
          <form className="account-auth__form" onSubmit={handleSubmit}>
            <label>
              Username
              <input
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error && (
              <p className="account-auth__error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary">
              Sign in
            </button>
          </form>
          {footer}
        </div>
      </div>
    </div>
  );
}
