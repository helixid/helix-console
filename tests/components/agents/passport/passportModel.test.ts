// Copyright 2026 DgVerse LLP
import { describe, it, expect } from 'vitest';
import {
  IDENTICON_SIZE,
  MRZ_LINE_LENGTH,
  agentDisplayName,
  hashString,
  identiconCells,
  mrzLines,
  passportAccessibleName,
  passportStatus,
  statusReasonText,
  toPassportAgent,
  type PassportAgent,
} from '../../../../src/components/agents/passport/passportModel';
import { formatDate, shortenId } from '../../../../src/components/agents/wallet/credentialModel';
import {
  AGENT_DID,
  FUTURE,
  PAST,
  activeAgent,
  expiredAgent,
  passportAgentOf,
  revokedAgent,
  summaryOf,
} from '../wallet/fixtures';

const NOW = Date.parse('2026-10-01T00:00:00.000Z');

const active = passportAgentOf(activeAgent);
const expired = passportAgentOf(expiredAgent);
const revoked = passportAgentOf(revokedAgent);

describe('toPassportAgent', () => {
  it('describes an active agent by its own credential', () => {
    expect(toPassportAgent(activeAgent)).toEqual({
      agentDid: AGENT_DID,
      name: 'billing-agent',
      status: 'active',
      statusReason: null,
      credential: {
        vcId: activeAgent.vcId,
        status: 'active',
        scopes: ['read:orders'],
        issuedAt: PAST,
        expiresAt: FUTURE,
      },
      delegatedFromVcId: null,
    });
  });

  it('marks an agent whose credential was revoked as revoked, for that reason', () => {
    const agent = toPassportAgent(revokedAgent);
    expect(agent.status).toBe('revoked');
    expect(agent.statusReason).toBe('revoked');
    expect(agent.credential.status).toBe('revoked');
  });

  it('marks an agent whose credential expired as revoked, because it expired', () => {
    const agent = toPassportAgent(expiredAgent);
    expect(agent.status).toBe('revoked');
    expect(agent.statusReason).toBe('expired');
    expect(agent.credential.status).toBe('expired');
  });

  it('carries the parent credential of a delegated agent, and a null name for an unnamed one', () => {
    const { agentName: _name, ...unnamed } = summaryOf({ parentVcId: 'vc:helix:parent' });
    const agent = toPassportAgent(unnamed);
    expect(agent.delegatedFromVcId).toBe('vc:helix:parent');
    expect(agent.name).toBeNull();
  });
});

describe('passportStatus', () => {
  it.each([
    ['an active agent', 'active', active],
    ['an agent whose own credential expired', 'expired', expired],
    ['an agent whose own credential was revoked', 'revoked', revoked],
  ] as const)('stamps %s %s', (_, stamp, agent) => {
    expect(passportStatus(agent)).toBe(stamp);
  });

  it('stamps a revoked agent that came with no reason as revoked', () => {
    expect(passportStatus({ status: 'revoked', statusReason: null })).toBe('revoked');
  });
});

describe('reasons', () => {
  it('explains every way an agent stops being active, and nothing while it is', () => {
    expect(statusReasonText(expired)).toBe('Its credential has expired');
    expect(statusReasonText(revoked)).toBe('Its credential was revoked');
    expect(statusReasonText(active)).toBeUndefined();
    expect(statusReasonText({ status: 'revoked', statusReason: null })).toBeUndefined();
  });
});

describe('names', () => {
  it('uses the agent name, or its DID cut short when it has none', () => {
    expect(agentDisplayName(active)).toBe('billing-agent');
    expect(agentDisplayName({ ...active, name: '  ' })).toBe(shortenId(AGENT_DID));
    expect(agentDisplayName({ ...active, name: null })).toBe(shortenId(AGENT_DID));
  });

  it('names a cover by agent, stamp and expiry, in the right tense', () => {
    expect(passportAccessibleName(active, NOW, 'en-US')).toBe(
      `Agent billing-agent, Active, expires ${formatDate(FUTURE, 'en-US')}`,
    );
    expect(passportAccessibleName(expired, NOW, 'en-US')).toBe(
      `Agent billing-agent, Expired, expired ${formatDate(PAST, 'en-US')}`,
    );
    expect(passportAccessibleName(revoked, NOW, 'en-US')).toBe(
      `Agent billing-agent, Revoked, expires ${formatDate(FUTURE, 'en-US')}`,
    );
  });

  it('does not call an unreadable expiry past', () => {
    const unreadable: PassportAgent = { ...active, credential: { ...active.credential, expiresAt: 'soon' } };
    expect(passportAccessibleName(unreadable, NOW)).toBe('Agent billing-agent, Active, expires —');
  });
});

describe('mrzLines', () => {
  it('draws two 44-character lines of capitals, digits and fillers', () => {
    const odd: PassportAgent = { ...active, name: 'Café — Bot ✈ 2' };
    const unnamed: PassportAgent = { ...active, name: null };
    for (const agent of [active, expired, unnamed, odd]) {
      const lines = mrzLines(agent);
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(line).toHaveLength(MRZ_LINE_LENGTH);
        expect(line).toMatch(/^[A-Z0-9<]+$/);
      }
    }
  });

  it('carries the name on the first line and the DID, credential and expiry on the second', () => {
    const agent = passportAgentOf(
      summaryOf({ vcId: 'vc:helix:dc0b4a402b28', expiresAt: '2026-09-18T07:00:55.919Z' }),
    );
    const [first, second] = mrzLines(agent);
    expect(first).toBe('AP<HELIXID<<BILLING<AGENT'.padEnd(MRZ_LINE_LENGTH, '<'));
    expect(second).toBe('BILLING<DC0B4A402B28<260918'.padEnd(MRZ_LINE_LENGTH, '<'));
  });

  it('fills in for a missing name and an unreadable expiry', () => {
    const agent: PassportAgent = {
      ...active,
      name: null,
      credential: { ...active.credential, vcId: 'vc:helix:abc', expiresAt: 'not a date' },
    };
    const [first, second] = mrzLines(agent);
    expect(first).toBe('AP<HELIXID<<UNNAMED'.padEnd(MRZ_LINE_LENGTH, '<'));
    expect(second).toBe('BILLING<ABC<<<<<<<'.padEnd(MRZ_LINE_LENGTH, '<'));
  });

  it('cuts long values at the edge instead of wrapping', () => {
    const long: PassportAgent = {
      ...active,
      name: 'An agent with a very long name indeed, longer than any strip',
      agentDid: 'did:web:example.test:agents:4507a9ae7d6802b5aad990a167374b',
    };
    const [first, second] = mrzLines(long);
    expect(first).toBe('AP<HELIXID<<AN<AGENT<WITH<A<VERY<LONG<NAME<I');
    expect(second.startsWith('4507A9AE7D6802B5AAD9<')).toBe(true);
    expect(second).toHaveLength(MRZ_LINE_LENGTH);
  });

  it('is the same every time for the same agent', () => {
    expect(mrzLines(active)).toEqual(mrzLines({ ...active }));
  });
});

describe('the avatar pattern', () => {
  it('is fixed for a DID', () => {
    expect(hashString(AGENT_DID)).toBe(803435204);
    expect(identiconCells(AGENT_DID)).toEqual([
      [0, 0, 2, 0, 0],
      [0, 0, 0, 0, 0],
      [1, 1, 0, 1, 1],
      [2, 0, 0, 0, 2],
      [1, 2, 2, 2, 1],
    ]);
  });

  it('is a 5×5 grid that mirrors left to right', () => {
    for (let index = 0; index < 25; index += 1) {
      const cells = identiconCells(`did:web:example.test:agents:agent-${index}`);
      expect(cells).toHaveLength(IDENTICON_SIZE);
      for (const row of cells) {
        expect(row).toHaveLength(IDENTICON_SIZE);
        expect(row).toEqual([...row].reverse());
      }
    }
  });

  it('tells agents apart', () => {
    const patterns = new Set(
      Array.from({ length: 20 }, (_, index) =>
        JSON.stringify(identiconCells(`did:web:example.test:agents:agent-${index}`)),
      ),
    );
    expect(patterns.size).toBe(20);
  });

  it('is never blank', () => {
    // A seed whose fifteen shape bits all come out empty, found by search.
    const blank = 'blank-26969';
    expect(hashString(blank) & 0x7fff).toBe(0);
    const cells = identiconCells(blank);
    expect(cells.flat().filter((cell) => cell !== 0)).toEqual([2]);
    expect(cells[2]![2]).toBe(2);
  });
});
