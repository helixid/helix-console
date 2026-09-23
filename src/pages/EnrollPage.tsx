// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { EnrollmentTokenInput, EnrollmentTokenResult, OnboardAgentResult } from '../api/types';
import { EnrollForm } from '../components/enroll/EnrollForm';
import { EnrollmentStatus } from '../components/enroll/EnrollmentStatus';

interface MintedToken extends EnrollmentTokenResult {
  createdAt: string;
}

export function EnrollPage() {
  const [submitting, setSubmitting] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintedToken | null>(null);
  const [onboarded, setOnboarded] = useState<OnboardAgentResult | null>(null);

  const handleSubmit = useCallback((input: EnrollmentTokenInput) => {
    setSubmitting(true);
    setError(null);
    api
      .createEnrollmentToken(input)
      .then((result) => {
        setMinted({ ...result, createdAt: new Date().toISOString() });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to mint enrollment token');
      })
      .finally(() => setSubmitting(false));
  }, []);

  const handleOnboardNow = useCallback((input: EnrollmentTokenInput) => {
    setOnboarding(true);
    setError(null);
    api
      .onboardAgentNow(input)
      .then(setOnboarded)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to onboard agent');
      })
      .finally(() => setOnboarding(false));
  }, []);

  const reset = () => {
    setMinted(null);
    setOnboarded(null);
    setError(null);
  };

  return (
    <div className="enroll-page">
      <div className="page-header">
        <div>
          <h1>Enroll an agent</h1>
          <p className="page-subtitle">
            Onboard now for a one-click result, or mint a token for an agent process to redeem itself later.
          </p>
        </div>
      </div>

      {onboarded !== null ? (
        <div className="card minted-token">
          <h2>Agent onboarded</h2>
          <p className="token-hint">This is the agent&apos;s DID.</p>
          <code className="token-value">{onboarded.agentDid}</code>
          <p role="status" className="enrollment-success">
            VC issued — <Link to="/agents">view in Agents</Link>
          </p>
          <button type="button" onClick={reset}>
            Onboard another agent
          </button>
        </div>
      ) : minted !== null ? (
        <div className="card minted-token">
          <h2>Enrollment token</h2>
          <p className="token-hint">Hand this to the agent; it expires at {minted.expiresAt}.</p>
          <code className="token-value">{minted.token}</code>
          <EnrollmentStatus tokenCreatedAt={minted.createdAt} />
          <button type="button" onClick={reset}>
            Mint another token
          </button>
        </div>
      ) : (
        <div className="card form-card">
          <h2>Agent details</h2>
          {error && <p role="alert">{error}</p>}
          <EnrollForm
            onSubmit={handleSubmit}
            submitting={submitting}
            onOnboardNow={handleOnboardNow}
            onboarding={onboarding}
          />
        </div>
      )}
    </div>
  );
}
