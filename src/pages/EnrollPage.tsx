// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { EnrollmentTokenInput, OnboardAgentResult } from '../api/types';
import { EnrollForm } from '../components/enroll/EnrollForm';

export function EnrollPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState<OnboardAgentResult | null>(null);

  const handleSubmit = useCallback((input: EnrollmentTokenInput) => {
    setSubmitting(true);
    setError(null);
    api
      .onboardAgentNow(input)
      .then(setOnboarded)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to onboard agent');
      })
      .finally(() => setSubmitting(false));
  }, []);

  const reset = () => {
    setOnboarded(null);
    setError(null);
  };

  return (
    <div className="enroll-page">
      <div className="page-header">
        <div>
          <h1>Enroll an agent</h1>
          <p className="page-subtitle">Onboard an agent and get its DID back immediately.</p>
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
      ) : (
        <div className="card form-card">
          <h2>Agent details</h2>
          {error && <p role="alert">{error}</p>}
          <EnrollForm onSubmit={handleSubmit} submitting={submitting} />
        </div>
      )}
    </div>
  );
}
