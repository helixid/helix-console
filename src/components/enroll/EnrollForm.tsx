// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { EnrollmentTokenInput } from '../../api/types';

export interface EnrollFormProps {
  /** Mint a token for a separate agent process to redeem later (async). */
  onSubmit: (input: EnrollmentTokenInput) => void;
  submitting: boolean;
  /** Mint and redeem in this same interaction (single click, still 2 API calls). Omit to hide the button. */
  onOnboardNow?: (input: EnrollmentTokenInput) => void;
  onboarding?: boolean;
}

const SCOPE_OPTIONS = [
  'read:orders',
  'write:orders',
  'read:invoices',
  'write:invoices',
  'read:profile',
  'write:profile',
  'read:payments',
  'write:payments',
  'read:inventory',
  'write:inventory',
  'read:catalog',
  'write:catalog',
] as const;

function addUnique(values: string[], additions: string[]): string[] {
  const next = [...values];
  for (const value of additions) {
    if (!next.includes(value)) {
      next.push(value);
    }
  }
  return next;
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseScopeInput(value: string): { committed: string[]; remainder: string } {
  const pieces = value.split(/[\n,]/);
  const remainder = (pieces.pop() ?? '').trimStart();
  return {
    committed: pieces.map((item) => item.trim()).filter((item) => item.length > 0),
    remainder,
  };
}

export function EnrollForm({ onSubmit, submitting, onOnboardNow, onboarding }: EnrollFormProps) {
  const [agentName, setAgentName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [scopeQuery, setScopeQuery] = useState('');
  const [domains, setDomains] = useState('');
  const [maxDelegationDepth, setMaxDelegationDepth] = useState('');
  const [scopeError, setScopeError] = useState<string | null>(null);
  const scopeInputId = useId();
  const scopeHelpId = useId();
  const scopeErrorId = useId();
  const scopeInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestedDomains = splitList(domains);
    const depth = maxDelegationDepth.trim() === '' ? undefined : Number(maxDelegationDepth);
    const pendingScope = (scopeInputRef.current?.value ?? scopeQuery).trim();
    const requestedScopes = pendingScope ? addUnique(scopes, [pendingScope]) : scopes;
    if (requestedScopes.length === 0) {
      setScopeError('Add at least one requested scope.');
      scopeInputRef.current?.focus();
      return;
    }
    const input: EnrollmentTokenInput = {
      agentName: agentName.trim(),
      requestedScopes,
      ...(requestedDomains.length > 0 ? { requestedDomains } : {}),
      ...(depth !== undefined && !Number.isNaN(depth) ? { maxDelegationDepth: depth } : {}),
    };
    // Two submit buttons share this handler; the submitter (the button
    // actually clicked) is how we tell which action fired — plain
    // `new FormData(form)` does NOT include a button's value unless the
    // submitter is passed explicitly, so read it off the native event instead.
    const submitter = (event.nativeEvent as SubmitEvent).submitter as
      | HTMLButtonElement
      | undefined;
    if (submitter?.value === 'onboard-now' && onOnboardNow) {
      onOnboardNow(input);
    } else {
      onSubmit(input);
    }
  };

  const commitScope = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setScopes((current) => addUnique(current, [trimmed]));
    setScopeQuery('');
    setScopeError(null);
  };

  const handleScopeChange = (value: string) => {
    setScopeError(null);
    const { committed, remainder } = parseScopeInput(value);
    if (committed.length > 0) {
      setScopes((current) => addUnique(current, committed));
    }
    setScopeQuery(remainder);
  };

  const handleScopeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitScope(scopeQuery);
    }
  };

  const filteredScopeOptions = SCOPE_OPTIONS.filter(
    (option) =>
      option.toLowerCase().includes(scopeQuery.toLowerCase()) && !scopes.includes(option),
  );

  return (
    <form className="enroll-form" onSubmit={handleSubmit}>
      <label>
        Agent name
        <input
          required
          value={agentName}
          onChange={(event) => setAgentName(event.target.value)}
        />
      </label>
      <label>
        Requested scopes
        <div className="scope-picker">
          <div className="scope-picker-field">
            {scopes.map((scope) => (
              <span key={scope} className="scope-chip">
                {scope}
                <button
                  type="button"
                  className="scope-chip-remove"
                  onClick={() => {
                    setScopes((current) => current.filter((item) => item !== scope));
                    setScopeError(null);
                  }}
                  aria-label={`Remove ${scope}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              id={scopeInputId}
              ref={scopeInputRef}
              value={scopeQuery}
              onChange={(event) => handleScopeChange(event.target.value)}
              onKeyDown={handleScopeKeyDown}
              onBlur={() => commitScope(scopeQuery)}
              placeholder="Start typing a scope"
              aria-describedby={`${scopeHelpId}${scopeError ? ` ${scopeErrorId}` : ''}`}
              aria-invalid={scopeError ? 'true' : undefined}
            />
          </div>
          {scopeQuery.trim().length > 0 && filteredScopeOptions.length > 0 && (
            <div className="scope-suggestions" role="listbox" aria-label="Suggested scopes">
              {filteredScopeOptions.map((option) => (
                <button
                  type="button"
                  key={option}
                  className="scope-suggestion"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setScopes((current) => addUnique(current, [option]));
                    setScopeQuery('');
                    setScopeError(null);
                    scopeInputRef.current?.focus();
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          <p id={scopeHelpId} className="field-help">
            Pick a suggested scope or press Enter to add a custom one.
          </p>
          {scopeError && (
            <p id={scopeErrorId} className="field-error" role="alert">
              {scopeError}
            </p>
          )}
        </div>
      </label>
      <label>
        Domains (optional)
        <input
          value={domains}
          onChange={(event) => setDomains(event.target.value)}
          placeholder="example.com"
        />
      </label>
      <label>
        Max delegation depth (optional)
        <input
          type="number"
          min="0"
          value={maxDelegationDepth}
          onChange={(event) => setMaxDelegationDepth(event.target.value)}
        />
      </label>
      <div className="enroll-form-actions">
        {onOnboardNow && (
          <button
            type="submit"
            name="action"
            value="onboard-now"
            disabled={submitting || Boolean(onboarding)}
          >
            {onboarding ? 'Onboarding…' : 'Onboard now'}
          </button>
        )}
        <button
          type="submit"
          name="action"
          value="mint"
          disabled={submitting || Boolean(onboarding)}
        >
          {submitting ? 'Minting…' : 'Mint enrollment token'}
        </button>
      </div>
    </form>
  );
}
