// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0
//
// The operator's Audit page (stories A-1, A-2): a table of helix-api's
// journal entries, one open at a time, each opening onto the typed event,
// its parties and delegation, its evidence references and the signed receipt.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuditPage, actingParty, isConsentHandshake, shortDid, titleFor, toneFor } from '../../src/pages/AuditPage';
import { api } from '../../src/api/client';
import type { AuditLogEntry } from '../../src/api/types';

vi.mock('../../src/api/client', () => ({ api: { getAuditLog: vi.fn() } }));
const getAuditLog = vi.mocked(api.getAuditLog);

function renderPage() {
  return render(
    <MemoryRouter>
      <AuditPage />
    </MemoryRouter>,
  );
}

const AGENT = 'did:key:z6MkPlannerPlannerPlannerPlanner1';
const SERVICE = 'did:web:skyair.example';
const API = 'did:web:api.example';
const RECORDER = 'did:key:z6MkRecorderRecorderRecorderRecorder';
const EVIDENCE = { objectId: `evi_${'a'.repeat(32)}`, ciphertextDigest: `sha256:${'b'.repeat(64)}`, mediaType: 'application/json' };

function entry(sequence: string, event: Partial<AuditLogEntry['event']>, recordedAt = new Date(Date.now() - 5 * 60_000).toISOString(), previous: string | null = `sha256:${'3'.repeat(64)}`): AuditLogEntry {
  return {
    id: `ledger_a:epoch_1:${sequence}`,
    recordedAt,
    eventDigest: `sha256:${'4'.repeat(64)}`,
    event: {
      eventId: `evt-${sequence}`,
      eventType: 'tool.call.completed',
      occurredAt: Date.parse(recordedAt),
      action: { category: 'tool' },
      outcome: 'succeeded',
      source: { producer: { kind: 'pairwise_did', did: SERVICE }, sourceId: 'skyair-mcp', sourceSequence: '41' },
      details: { family: 'tool', phase: 'completed', attempt: '1' },
      ...event,
    },
    ledgerId: 'ledger_a',
    ledgerEpochId: 'epoch_1',
    sequence,
    entryDigest: `sha256:${'2'.repeat(64)}`,
    receipt: {
      core: {
        ledgerId: 'ledger_a',
        ledgerEpochId: 'epoch_1',
        sequence,
        eventId: `evt-${sequence}`,
        entryDigest: `sha256:${'2'.repeat(64)}`,
        previousEntryDigest: previous,
        recordedAt: Date.parse(recordedAt),
        recorder: { did: RECORDER, kid: 'z6MkRecorder', alg: 'EdDSA' },
        integritySuite: 'org.kya-os.audit-integrity.v1',
      },
      jws: `eyJhbGciOiJFZERTQSJ9.eyJzZXEiOiI${sequence}In0.c2lnbmF0dXJl`,
    },
  };
}

/** A denial with every member: authorization, evidence, a commitment party. */
const DENIED = entry('7', {
  eventType: 'authorization.denied',
  action: { category: 'authorization', name: 'book_flight', detailRef: EVIDENCE },
  outcome: 'denied',
  correlationId: 'call-7',
  causationId: 'call-6',
  actor: { kind: 'public_did', did: AGENT },
  responsibleParty: { kind: 'keyed_commitment', value: `sha256:${'c'.repeat(64)}`, keyId: 'users-v1' },
  tenantRef: { kind: 'public_did', did: API },
  reason: { code: 'SCOPE_MISSING', detailRef: EVIDENCE },
  authorization: {
    source: 'delegation',
    decision: 'denied',
    scopeId: 'flights:book',
    delegationRef: 'vc:delegation-1',
    delegationCredentialDigest: `sha256:${'d'.repeat(64)}`,
    delegationChainDigests: [`sha256:${'e'.repeat(64)}`],
    statusEvidence: [EVIDENCE],
    grantRef: 'grant-1',
    policyId: 'travel',
    policyVersion: '3',
    policyDigest: `sha256:${'1'.repeat(64)}`,
    verificationCode: 'SCOPE_MISSING',
  },
  proof: EVIDENCE,
  evidence: [EVIDENCE],
  details: { family: 'authorization', phase: 'denied', grantRef: 'grant-1' },
  privacy: { classification: 'confidential', retentionClass: 'audit', legalHold: 'hold-1' },
});

const ISSUED = entry(
  '6',
  {
    eventType: 'delegation.issued',
    action: { category: 'credential', name: 'renewed' },
    resource: { kind: 'public_did', did: AGENT },
    source: { producer: { kind: 'public_did', did: API }, sourceId: 'helix-api' },
    details: { family: 'delegation', phase: 'issued', delegationRef: 'vc:2', parentRef: 'vc:1' },
  },
  new Date(Date.now() - 3 * 3_600_000).toISOString(),
  null,
);

const GENESIS = entry('0', {
  eventType: 'ledger.epoch.started',
  action: { category: 'ledger.epoch' },
  source: { producer: { kind: 'public_did', did: RECORDER }, sourceId: 'helix-audit-recorder' },
  details: { family: 'ledger', phase: 'epoch_started' },
}, '2026-01-02T10:00:00.000Z', null);

function rows(): HTMLElement[] {
  return screen.getAllByTestId('audit-row');
}

function detailsRegion(): HTMLElement {
  const region = document.querySelector('.audit-details-row');
  if (!region) throw new Error('no row is open');
  return region as HTMLElement;
}

describe('AuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuditLog.mockResolvedValue({ items: [DENIED, ISSUED, GENESIS], nextCursor: null });
  });

  it('lists one row per event with its time, event, actor, outcome and sequence', async () => {
    renderPage();
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(getAuditLog).toHaveBeenCalledWith({ limit: 50 });
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Time', 'Event', 'Actor / agent', 'Outcome', 'Seq']);
    const [denied, issued, genesis] = rows().map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
    expect(denied).toEqual(['5m ago', '▸Access deniedauthorization.denied', shortDid(AGENT), 'deniedSCOPE_MISSING', '7']);
    expect(issued).toEqual(['3h ago', '▸Credential reneweddelegation.issued', 'did:web:api.example', 'succeeded', '6']);
    expect(genesis![1]).toBe('▸Ledger epoch startedledger.epoch.started');
    expect(rows()[0]).toHaveClass('tone-blocked');
    expect(screen.getByText('3 events')).toBeInTheDocument();
  });

  it('opens one row at a time: clicking another row moves it, clicking the open row closes it', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(rows()[0]!);
    expect(screen.getByRole('button', { name: /Access denied/, expanded: true })).toHaveAttribute('aria-controls', 'audit-details-ledger_a:epoch_1:7');
    expect(detailsRegion()).toHaveAttribute('id', 'audit-details-ledger_a:epoch_1:7');

    await userEvent.click(screen.getByRole('button', { name: /Credential renewed/ }));
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);
    expect(document.querySelectorAll('.audit-details-row')).toHaveLength(1);

    await userEvent.click(rows()[1]!);
    expect(screen.queryByRole('button', { expanded: true })).not.toBeInTheDocument();
    expect(document.querySelector('.audit-details-row')).toBeNull();
  });

  it('shows the whole entry: event, parties, delegation, evidence and the signed receipt', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(rows()[0]!);
    const details = within(detailsRegion());
    const section = (name: string) => within(details.getByRole('region', { name }));

    for (const text of ['authorization / book_flight', 'SCOPE_MISSING', 'authorization / denied', 'evt-7', 'call-7', 'call-6', 'confidential · audit · hold hold-1']) {
      expect(section('Event').getAllByText(text).length, text).toBeGreaterThan(0);
    }
    const parties = section('Parties');
    expect(parties.getByRole('link', { name: AGENT })).toHaveAttribute('href', `/agents?subjectDid=${encodeURIComponent(AGENT)}`);
    expect(parties.getByRole('link', { name: SERVICE })).toBeInTheDocument();
    expect(parties.getByRole('link', { name: API })).toBeInTheDocument();
    expect(parties.getByText('Commitment (users-v1)')).toBeInTheDocument();
    expect(parties.getByText('skyair-mcp #41')).toBeInTheDocument();

    const delegation = section('Authorization and delegation');
    for (const text of ['denied (delegation)', 'flights:book', 'vc:delegation-1', `sha256:${'d'.repeat(64)}`, `sha256:${'e'.repeat(64)}`, 'grant-1', 'travel v3', `sha256:${'1'.repeat(64)}`]) {
      expect(delegation.getAllByText(text).length, text).toBeGreaterThan(0);
    }
    const evidence = section('Evidence');
    for (const label of ['Evidence 1', 'Proof', 'Reason detail', 'Action detail', 'Status evidence 1']) expect(evidence.getByText(label)).toBeInTheDocument();

    const receipt = section('Receipt');
    for (const text of ['ledger_a', 'epoch_1', `sha256:${'2'.repeat(64)}`, `sha256:${'3'.repeat(64)}`, `sha256:${'4'.repeat(64)}`, `${RECORDER}#z6MkRecorder (EdDSA)`, DENIED.receipt.jws]) {
      expect(receipt.getByText(text), text).toBeInTheDocument();
    }
    // A party link opens the agent, not the row toggle.
    await userEvent.click(parties.getByRole('link', { name: AGENT }));
    expect(document.querySelector('.audit-details-row')).not.toBeNull();
  });

  it('shows the first entry of an epoch, and an event without authorization or evidence', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(rows()[1]!);
    const details = within(detailsRegion());
    expect(details.getByText('none (first entry of the epoch)')).toBeInTheDocument();
    expect(details.queryByRole('region', { name: 'Evidence' })).not.toBeInTheDocument();
    expect(details.queryByRole('region', { name: 'Authorization and delegation' })).not.toBeInTheDocument();
    expect(within(details.getByRole('region', { name: 'Event' })).getByText('vc:1')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    getAuditLog.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText('No audit events yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows loading, then an error, and recovers on Refresh', async () => {
    let fail!: (error: unknown) => void;
    getAuditLog.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
    renderPage();
    expect(screen.getByText('Loading audit log…')).toBeInTheDocument();
    fail(new Error('audit down'));
    expect(await screen.findByRole('alert')).toHaveTextContent('audit down');

    getAuditLog.mockRejectedValueOnce('not an error');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load audit log');

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('pages with Load more, and keeps the rows when the next page fails', async () => {
    getAuditLog.mockResolvedValueOnce({ items: [DENIED], nextCursor: 'cursor-1' });
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByText('1+ events')).toBeInTheDocument();

    getAuditLog.mockRejectedValueOnce(new Error('page down'));
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('page down');
    expect(rows()).toHaveLength(1);

    getAuditLog.mockRejectedValueOnce('nope');
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load more audit events');

    getAuditLog.mockResolvedValueOnce({ items: [ISSUED], nextCursor: null });
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('2 events')).toBeInTheDocument();
    expect(getAuditLog).toHaveBeenLastCalledWith({ limit: 50, cursor: 'cursor-1' });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('shows one event as "1 event"', async () => {
    getAuditLog.mockResolvedValue({ items: [GENESIS], nextCursor: null });
    renderPage();
    expect(await screen.findByText('1 event')).toBeInTheDocument();
  });
});

describe('AuditPage helpers', () => {
  const base = GENESIS.event;

  it('titles events by type and action, falling back to the type in words', () => {
    expect(titleFor({ ...base, eventType: 'credential.verified', action: { category: 'onboarding', name: 'agent_onboarded' } })).toBe('Agent enrolled');
    expect(titleFor({ ...base, eventType: 'delegation.issued', action: { category: 'delegation' } })).toBe('Authority delegated');
    expect(titleFor({ ...base, eventType: 'checkpoint.created', action: { category: 'ledger' } })).toBe('Checkpoint created');
  });

  it('shows a not-yet-consented service as Consent required, not a block', () => {
    const handshake = { ...base, eventType: 'authorization.denied', outcome: 'denied' as const, reason: { code: 'NO_GRANT_FOR_THIS_SERVICE' } };
    expect(isConsentHandshake(handshake)).toBe(true);
    expect(titleFor(handshake)).toBe('Consent required');
    expect(toneFor(handshake)).toBe('neutral');
    expect(isConsentHandshake({ ...handshake, reason: { code: 'SCOPE_MISSING' } })).toBe(false);
    expect(isConsentHandshake({ ...handshake, reason: undefined as never })).toBe(false);
  });

  it('tones by outcome, a successful revocation or rejection as danger', () => {
    expect(toneFor({ ...base, eventType: 'delegation.issued', outcome: 'succeeded' })).toBe('success');
    expect(toneFor({ ...base, eventType: 'proof.rejected', outcome: 'succeeded' })).toBe('danger');
    expect(toneFor({ ...base, outcome: 'failed' })).toBe('danger');
    expect(toneFor({ ...base, outcome: 'challenged' })).toBe('accent');
    expect(toneFor({ ...base, outcome: 'unknown' })).toBe('neutral');
    expect(toneFor({ ...base, outcome: 'other' as never })).toBe('neutral');
  });

  it('names the acting party by actor, session or producer, a commitment as withheld', () => {
    expect(actingParty({ ...GENESIS, event: { ...base, session: { ref: { kind: 'public_did', did: SERVICE } } } })).toBe(SERVICE);
    expect(actingParty({ ...GENESIS, event: { ...base, actor: { kind: 'keyed_commitment', value: 'x' } } })).toBe('Withheld (commitment)');
    expect(actingParty(GENESIS)).toBe(shortDid(RECORDER));
    expect(actingParty({ ...GENESIS, event: { ...base, source: { producer: { kind: 'keyed_commitment' }, sourceId: 's' } } })).toBe('Withheld (commitment)');
  });
});
