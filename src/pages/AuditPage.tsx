// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// The operator's audit view (stories A-1, A-2): helix-api's journal, one
// table row per typed event, newest first. Opening a row shows the whole
// entry under it: the typed event, the parties and delegation, the evidence
// references, and the recorder's signed receipt. One row is open at a time.

import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { AuditEvidenceRef, AuditLogEntry, AuditPartyRef } from '../api/types';

const PAGE_SIZE = 50;

type Tone = 'success' | 'danger' | 'blocked' | 'accent' | 'neutral';

/** Readable names for the events helix-api records; anything else reads from its type. */
const TITLES: Record<string, string> = {
  'delegation.issued': 'Credential issued',
  'delegation.revoked': 'Credential revoked',
  'delegation.rejected': 'Credential rejected',
  'delegation.verified': 'Credential verified',
  'proof.generated': 'Presentation signed',
  'proof.verified': 'Presentation verified',
  'proof.rejected': 'Presentation rejected',
  'consent.approved': 'Consent granted',
  'consent.denied': 'Consent denied',
  'credential.required': 'Credential requested',
  'credential.verified': 'Credential checked',
  'authorization.approved': 'Access granted',
  'authorization.denied': 'Access denied',
  'grant.used': 'Grant used',
  'session.established': 'Session established',
  'tool.call.completed': 'Tool call completed',
  'tool.call.failed': 'Tool call failed',
  'tool.call.denied': 'Tool call denied',
  'configuration.changed': 'Configuration changed',
  'ledger.epoch.started': 'Ledger epoch started',
};

/** Finer titles where the action says more than the type. */
const ACTION_TITLES: Record<string, string> = {
  'credential.verified/onboarding/agent_onboarded': 'Agent enrolled',
  'credential.required/enrollment/token_generated': 'Enrollment token',
  'credential.verified/enrollment/token_consumed': 'Enrollment completed',
  'configuration.changed/did/created': 'DID created',
  'configuration.changed/service/enrolled': 'Service enrolled',
  'delegation.issued/credential/renewed': 'Credential renewed',
  'delegation.issued/credential/registered': 'Credential registered',
  'delegation.issued/delegation': 'Authority delegated',
};

/**
 * Refusals that mean "nobody has asked the user yet" rather than "the user
 * said no to this". Both are genuinely denials, but only the second is a
 * security decision: an agent's first call to a new service is expected to be
 * refused this way, and that refusal is what raises the consent prompt.
 */
const CONSENT_HANDSHAKE_REASONS = new Set(['NO_PRESENTATION', 'NO_GRANT_FOR_THIS_SERVICE']);

export function isConsentHandshake(event: AuditLogEntry['event']): boolean {
  return event.eventType === 'authorization.denied' && CONSENT_HANDSHAKE_REASONS.has(event.reason?.code ?? '');
}

export function titleFor(event: AuditLogEntry['event']): string {
  if (isConsentHandshake(event)) return 'Consent required';
  const { eventType, action } = event;
  const exact = ACTION_TITLES[`${eventType}/${action.category}/${action.name ?? ''}`] ?? ACTION_TITLES[`${eventType}/${action.category}`];
  if (exact) return exact;
  if (TITLES[eventType]) return TITLES[eventType];
  const words = eventType.replaceAll('.', ' ').replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const OUTCOME_TONES: Record<AuditLogEntry['event']['outcome'], Tone> = {
  succeeded: 'success',
  failed: 'danger',
  // A denial is the gate working, not a fault.
  denied: 'blocked',
  challenged: 'accent',
  unknown: 'neutral',
};

export function toneFor(event: AuditLogEntry['event']): Tone {
  if (isConsentHandshake(event)) return 'neutral';
  if (event.outcome === 'succeeded' && /revoked|rejected/.test(event.eventType)) return 'danger';
  return OUTCOME_TONES[event.outcome] ?? 'neutral';
}

/** did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK -> did:key:z6Mkha…a2doK */
export function shortDid(did: string): string {
  return did.length > 28 ? `${did.slice(0, 14)}…${did.slice(-5)}` : did;
}

function didOf(ref: AuditPartyRef | undefined): string | undefined {
  return ref && 'did' in ref ? ref.did : undefined;
}

function partyLabel(ref: AuditPartyRef | undefined): string | undefined {
  if (!ref) return undefined;
  const did = didOf(ref);
  return did === undefined ? 'Withheld (commitment)' : shortDid(did);
}

/** Who acted: the actor, else the session peer, else the producer that recorded it. */
export function actingParty(entry: AuditLogEntry): string {
  const { event } = entry;
  return partyLabel(event.actor) ?? partyLabel(event.session?.ref) ?? partyLabel(event.source.producer) ?? '—';
}

function relativeTime(timestamp: string): string {
  const delta = Date.now() - new Date(timestamp).getTime();
  if (Number.isNaN(delta)) return timestamp;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

type Fact = [label: string, value: ReactNode];

function Section({ title, facts }: { title: string; facts: Fact[] }) {
  if (facts.length === 0) return null;
  return (
    <section className="audit-section" aria-label={title}>
      <h3>{title}</h3>
      <dl className="audit-facts">
        {facts.map(([label, value]) => (
          <div className="audit-fact" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const mono = (value: string): ReactNode => <code className="audit-mono">{value}</code>;

function present(facts: Array<[string, ReactNode | undefined | null | false]>): Fact[] {
  return facts.filter((fact): fact is Fact => fact[1] !== undefined && fact[1] !== null && fact[1] !== false && fact[1] !== '');
}

/** A DID links to its credentials on the Agents page; a commitment names no one. */
function partyValue(ref: AuditPartyRef | undefined): ReactNode | undefined {
  if (!ref) return undefined;
  const did = didOf(ref);
  if (did === undefined) return `Commitment ${'keyId' in ref && ref.keyId ? `(${ref.keyId})` : ''}`.trim();
  return (
    <Link className="audit-mono" to={`/agents?subjectDid=${encodeURIComponent(did)}`} onClick={(click) => click.stopPropagation()}>
      {did}
    </Link>
  );
}

function evidenceValue(ref: AuditEvidenceRef): ReactNode {
  return (
    <>
      {mono(ref.objectId)} {ref.mediaType ? `· ${ref.mediaType} ` : ''}
      {mono(ref.ciphertextDigest)}
    </>
  );
}

/** The detail members other than family and phase, by name. */
function otherDetails(details: AuditLogEntry['event']['details']): Fact[] {
  return Object.entries(details)
    .filter(([key]) => key !== 'family' && key !== 'phase')
    .map(([key, value]): Fact => [key, mono(typeof value === 'string' ? value : JSON.stringify(value))]);
}

function EntryDetails({ entry }: { entry: AuditLogEntry }) {
  const { event, receipt } = entry;
  const auth = event.authorization;
  const evidence: Fact[] = [
    ...(event.evidence ?? []).map((ref, index): Fact => [`Evidence ${index + 1}`, evidenceValue(ref)]),
    ...present([
      ['Proof', event.proof && evidenceValue(event.proof)],
      ['Reason detail', event.reason?.detailRef && evidenceValue(event.reason.detailRef)],
      ['Action detail', event.action.detailRef && evidenceValue(event.action.detailRef)],
    ]),
    ...(auth?.statusEvidence ?? []).map((ref, index): Fact => [`Status evidence ${index + 1}`, evidenceValue(ref)]),
  ];
  const { recorder } = receipt.core;
  return (
    <div className="audit-details">
      <Section
        title="Event"
        facts={present([
          ['Type', mono(event.eventType)],
          ['Action', mono(event.action.name ? `${event.action.category} / ${event.action.name}` : event.action.category)],
          ['Outcome', event.outcome],
          ['Reason', event.reason && mono(event.reason.code)],
          ['Phase', mono(`${event.details.family} / ${event.details.phase}`)],
          ...otherDetails(event.details),
          ['Occurred', new Date(event.occurredAt).toLocaleString()],
          ['Event id', mono(event.eventId)],
          ['Correlation', event.correlationId && mono(event.correlationId)],
          ['Causation', event.causationId && mono(event.causationId)],
          ['Privacy', event.privacy && `${event.privacy.classification} · ${event.privacy.retentionClass}${event.privacy.legalHold ? ` · hold ${event.privacy.legalHold}` : ''}`],
        ])}
      />
      <Section
        title="Parties"
        facts={present([
          ['Actor', partyValue(event.actor)],
          ['Resource', partyValue(event.resource)],
          ['On behalf of', partyValue(event.responsibleParty)],
          ['Session', partyValue(event.session?.ref)],
          ['Recorded by', partyValue(event.source.producer)],
          ['Source', mono(`${event.source.sourceId}${event.source.sourceSequence ? ` #${event.source.sourceSequence}` : ''}`)],
          ['Tenant', partyValue(event.tenantRef)],
        ])}
      />
      {auth && (
        <Section
          title="Authorization and delegation"
          facts={present([
            ['Decision', `${auth.decision} (${auth.source})`],
            ['Scope', auth.scopeId && mono(auth.scopeId)],
            ['Delegation', auth.delegationRef && mono(auth.delegationRef)],
            ['Credential digest', auth.delegationCredentialDigest && mono(auth.delegationCredentialDigest)],
            ['Chain', auth.delegationChainDigests?.length ? <>{auth.delegationChainDigests.map((digest) => <div key={digest}>{mono(digest)}</div>)}</> : undefined],
            ['Grant', auth.grantRef && mono(auth.grantRef)],
            ['Policy', auth.policyId && `${auth.policyId}${auth.policyVersion ? ` v${auth.policyVersion}` : ''}`],
            ['Policy digest', auth.policyDigest && mono(auth.policyDigest)],
            ['Verification', auth.verificationCode && mono(auth.verificationCode)],
          ])}
        />
      )}
      <Section title="Evidence" facts={evidence} />
      <Section
        title="Receipt"
        facts={present([
          ['Ledger', mono(entry.ledgerId)],
          ['Epoch', mono(entry.ledgerEpochId)],
          ['Sequence', mono(entry.sequence)],
          ['Recorded', new Date(entry.recordedAt).toLocaleString()],
          ['Entry hash', mono(entry.entryDigest)],
          ['Previous hash', receipt.core.previousEntryDigest === null ? 'none (first entry of the epoch)' : mono(receipt.core.previousEntryDigest)],
          ['Event digest', mono(entry.eventDigest)],
          ['Recorder', mono(`${recorder.did}#${recorder.kid} (${recorder.alg})`)],
          ['Recorder signature', <code className="audit-mono audit-signature">{receipt.jws}</code>],
        ])}
      />
    </div>
  );
}

export function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.getAuditLog({ limit: PAGE_SIZE });
      setEntries(page.items);
      setNextCursor(page.nextCursor);
      setOpenId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await api.getAuditLog({ limit: PAGE_SIZE, cursor: nextCursor });
      setEntries((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load more audit events');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  // One row open at a time: opening another closes this one, clicking it again closes it.
  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id));

  return (
    <div className="audit-page">
      <div className="page-header">
        <div>
          <h1>Audit &amp; Governance</h1>
          <p className="page-subtitle">
            Every event the audit recorder signed — open a row for the full entry and its receipt.
          </p>
        </div>
        <div className="audit-header-actions">
          {entries.length > 0 && (
            <span className="audit-count">
              {entries.length}
              {nextCursor ? '+' : ''} event{entries.length === 1 && !nextCursor ? '' : 's'}
            </span>
          )}
          <button type="button" onClick={() => void loadAudit()}>
            Refresh
          </button>
        </div>
      </div>

      {loading && <p className="loading-note">Loading audit log…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && entries.length === 0 && <p className="empty-state">No audit events yet.</p>}
      {!loading && entries.length > 0 && (
        <div className="card table-card audit-card">
          <table className="audit-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Event</th>
                <th scope="col">Actor / agent</th>
                <th scope="col">Outcome</th>
                <th scope="col">Seq</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isOpen = openId === entry.id;
                const detailsId = `audit-details-${entry.id}`;
                const tone = toneFor(entry.event);
                return (
                  <Fragment key={entry.id}>
                    <tr className={`audit-row tone-${tone}${isOpen ? ' is-open' : ''}`} data-testid="audit-row" onClick={() => toggle(entry.id)}>
                      <td>
                        <time dateTime={entry.recordedAt} title={new Date(entry.recordedAt).toLocaleString()}>
                          {relativeTime(entry.recordedAt)}
                        </time>
                      </td>
                      <td>
                        {/* The title is the button, so keyboard and screen-reader users open rows too. */}
                        <button
                          type="button"
                          className="unstyled audit-entry-toggle audit-event-type"
                          aria-expanded={isOpen}
                          aria-controls={detailsId}
                          onClick={(click) => {
                            click.stopPropagation();
                            toggle(entry.id);
                          }}
                        >
                          <span className="audit-chevron" aria-hidden="true">
                            {isOpen ? '▾' : '▸'}
                          </span>
                          {titleFor(entry.event)}
                        </button>
                        <div className="audit-event-code">{entry.event.eventType}</div>
                      </td>
                      <td>{actingParty(entry)}</td>
                      <td>
                        <span className={`audit-outcome tone-${tone}`}>{entry.event.outcome}</span>
                        {entry.event.reason && <div className="audit-event-code">{entry.event.reason.code}</div>}
                      </td>
                      <td title={`${entry.ledgerId} / ${entry.ledgerEpochId}`}>{entry.sequence}</td>
                    </tr>
                    {isOpen && (
                      <tr className="audit-details-row" id={detailsId}>
                        <td colSpan={5}>
                          <EntryDetails entry={entry} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {nextCursor && (
            <div className="audit-more">
              <button type="button" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
