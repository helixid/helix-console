// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// The Agents page's list: one passport cover per agent, in the order the
// server returned them, plus the loading, empty and error states.
// Presentational, like the rest of components/agents — AgentsPage owns the
// data and hands it in.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PassportCard } from './PassportCard';
import type { PassportAgent } from './passportModel';

export interface PassportGridProps {
  agents: PassportAgent[];
  loading: boolean;
  /** Why the list could not be loaded, or null. */
  error: string | null;
  /** True while the list is narrowed to one DID, so an empty one is not "you have none". */
  filtered?: boolean;
  onRetry: () => void;
  /** `trigger` is the element to hand focus back to when the passport closes. */
  onOpen: (agent: PassportAgent, trigger: HTMLElement) => void;
}

const SKELETON_SLOTS = [0, 1, 2, 3];

export function PassportGrid({
  agents,
  loading,
  error,
  filtered = false,
  onRetry,
  onOpen,
}: PassportGridProps) {
  // One clock reading per list, shared by every card.
  const now = useMemo(() => Date.now(), [agents]);

  if (loading) {
    return (
      <div aria-busy="true">
        <p className="loading-note">Loading agents…</p>
        <ul className="passport-grid" aria-hidden="true">
          {SKELETON_SLOTS.map((slot) => (
            <li key={slot}>
              <div className="passport-card passport-card--skeleton" data-theme="dark">
                <span className="skeleton-line skeleton-line--short" />
                <span className="passport-card__skeleton-avatar" />
                <span className="skeleton-line skeleton-line--title" />
                <span className="skeleton-line" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div role="alert" className="passport-grid__error">
        <span>Could not load agents: {error}</span>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="card empty-state passport-grid__empty">
        <p>No agents found.</p>
        {!filtered && <Link to="/enroll">Enroll an agent</Link>}
      </div>
    );
  }

  return (
    <ul className="passport-grid" aria-label="Agents">
      {agents.map((agent) => (
        <li key={agent.agentDid}>
          <PassportCard agent={agent} now={now} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}
