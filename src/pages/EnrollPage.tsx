// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { AgentOnboarding, EnrollmentTokenInput } from '../api/types';
import { EnrollForm } from '../components/enroll/EnrollForm';
import { getApiConfig } from '../runtimeConfig';

/** The API base `helix init` talks to: the configured one, or this console's origin (the Vite proxy forwards /v1). */
export function apiUrlForCli(): string {
  const { apiBaseUrl } = getApiConfig();
  return (apiBaseUrl || window.location.origin).replace(/\/+$/, '');
}

export function helixInitCommand(token: string): string {
  return `npx @helixid/cli init --token ${token} --out ./helix-agent --api-url ${apiUrlForCli()}`;
}

export function pythonInitCommand(token: string): string {
  return `helix-custody init --token ${token} --out ./helix-agent --api-url ${apiUrlForCli()}`;
}

/**
 * KYA-OS story F-3: helixid holds no agent keys, so an agent is created
 * self-custody (POST /v1/agents) and ends on its enrollment token and the
 * `helix init` instructions; the key is generated on the agent's own host and
 * never reaches this console or the API.
 */
export function EnrollPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<AgentOnboarding | null>(null);

  const handleSubmit = useCallback((input: EnrollmentTokenInput) => {
    setSubmitting(true);
    setError(null);
    api
      .createAgent(input)
      .then(setCreated)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to onboard agent');
      })
      .finally(() => setSubmitting(false));
  }, []);

  const reset = () => {
    setCreated(null);
    setError(null);
  };

  return (
    <div className="enroll-page">
      <div className="page-header">
        <div>
          <h1>Enroll an agent</h1>
          <p className="page-subtitle">Create an agent, then run helix init where it runs: its key never leaves that host.</p>
        </div>
      </div>

      {created !== null ? (
        <div className="card minted-token" role="region" aria-label="Agent enrollment">
          <h2>Agent created — run helix init</h2>
          <p className="token-hint">This is the agent&apos;s DID.</p>
          <code className="token-value">{created.did}</code>
          <p>
            <span className="badge">{created.label}</span> <span className="field-hint">Waiting for helix init</span>
          </p>
          <div className="custody-instructions">
            <p className="token-hint">
              Run this on the machine where the agent runs. It generates the agent&rsquo;s private key there, sends
              Helix only the public key and writes <code>did.json</code>, <code>card.json</code> and the private key
              (<code>signing-key.env</code>, readable only by you) to the output directory.
            </p>
            <div>
              <strong>Enrollment token</strong>{' '}
              {created.enrollmentExpiresAt && (
                <span className="field-hint">valid until {new Date(created.enrollmentExpiresAt).toLocaleString()} · shown once</span>
              )}
              <div className="custody-instructions__token">
                <code className="token-value">{created.enrollmentToken}</code>
              </div>
            </div>
            <div>
              <strong>Node.js</strong>
              <pre aria-label="helix init command">{helixInitCommand(created.enrollmentToken)}</pre>
            </div>
            <div>
              <strong>Python</strong>
              <pre aria-label="Python helix init command">{pythonInitCommand(created.enrollmentToken)}</pre>
            </div>
            <p className="field-hint">
              Helix publishes the DID document and card; the agent is active as soon as <code>helix init</code> finishes,
              and then appears under <Link to="/agents">Agents</Link>. Your code signs with <code>EnvSigner</code> reading{' '}
              <code>signing-key.env</code>.
            </p>
          </div>
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
