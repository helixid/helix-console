// Copyright 2026 DgVerse LLP
import { describe, it, expect } from 'vitest';
import {
  EAGER_DETAIL_LIMIT,
  NO_FILTERS,
  buildWallet,
  buildWalletDocument,
  credentialAccessibleName,
  deriveStatus,
  eagerDetailIds,
  filterCredentials,
  formatDate,
  formatRelative,
  humanizeTypeName,
  jsonFilename,
  resolveCredentialType,
  shortenId,
  sortCredentials,
  splitScopes,
  toWalletCredential,
  tokenizeJson,
  typeOptions,
} from '../../../../src/components/agents/wallet/credentialModel';
import type { VCResponse, VCStatus } from '../../../../src/api/types';
import {
  AGENT_DID,
  FAKE_PROOF_VALUE,
  FUTURE,
  ISSUER_DID,
  LONG_AGO,
  PAST,
  detailOf,
  manySummaries,
  summaryOf,
} from './fixtures';

const NOW = Date.parse('2026-09-18T00:00:00.000Z');
const DAY = 86_400_000;

describe('resolveCredentialType', () => {
  it('maps the known Helix types to a label and a card kind', () => {
    expect(resolveCredentialType(['VerifiableCredential', 'HelixAgentCredential'])).toEqual({
      kind: 'agent',
      label: 'Agent Authorization',
      types: ['HelixAgentCredential'],
    });
    expect(resolveCredentialType(['VerifiableCredential', 'DelegationGrantCredential'])).toMatchObject({
      kind: 'grant',
      label: 'Delegation Grant',
    });
    expect(resolveCredentialType(['HelixUserCredential'])).toMatchObject({
      kind: 'user',
      label: 'User Identity',
    });
  });

  it('prefers a known type wherever it sits in the array', () => {
    expect(
      resolveCredentialType(['VerifiableCredential', 'SomethingElse', 'DelegationGrantCredential']),
    ).toMatchObject({ kind: 'grant', types: ['SomethingElse', 'DelegationGrantCredential'] });
  });

  it('falls back to a generic card named after an unknown type', () => {
    expect(resolveCredentialType(['VerifiableCredential', 'SelfSignedDevCredential'])).toEqual({
      kind: 'generic',
      label: 'Self Signed Dev',
      types: ['SelfSignedDevCredential'],
    });
  });

  it('accepts a bare string type', () => {
    expect(resolveCredentialType('HelixAgentCredential')).toMatchObject({ kind: 'agent' });
  });

  it('stays generic when there is no usable type at all', () => {
    const generic = { kind: 'generic', label: 'Verifiable Credential', types: [] };
    expect(resolveCredentialType(['VerifiableCredential'])).toEqual(generic);
    expect(resolveCredentialType(undefined)).toEqual(generic);
    expect(resolveCredentialType({ not: 'an array' })).toEqual(generic);
    expect(resolveCredentialType([42, null])).toEqual(generic);
  });

  it('does not mistake an inherited object property for a known type', () => {
    // A plain-object lookup table would resolve these to Object.prototype members.
    expect(resolveCredentialType(['constructor'])).toMatchObject({
      kind: 'generic',
      label: 'constructor',
    });
    expect(resolveCredentialType(['toString'])).toMatchObject({ kind: 'generic' });
  });

  it('names a type that is nothing but the suffix generically', () => {
    expect(resolveCredentialType(['Credential'])).toMatchObject({ label: 'Verifiable Credential' });
  });
});

describe('humanizeTypeName', () => {
  it('drops the Credential suffix and splits words', () => {
    expect(humanizeTypeName('HelixAgentCredential')).toBe('Helix Agent');
    expect(humanizeTypeName('kyc_level2-Credential')).toBe('kyc level2');
  });
});

describe('deriveStatus', () => {
  const window = { validFrom: PAST, validUntil: FUTURE, revokedAt: undefined };

  it('takes the server status as given', () => {
    expect(deriveStatus({ ...window, serverStatus: 'active' }, NOW)).toBe('active');
    expect(deriveStatus({ ...window, serverStatus: 'expired' }, NOW)).toBe('expired');
    expect(deriveStatus({ ...window, serverStatus: 'revoked' }, NOW)).toBe('revoked');
  });

  it('never overrides a server "active" with its own expiry check', () => {
    // The server owns expiry; a skewed browser clock must not contradict it.
    expect(deriveStatus({ ...window, validUntil: PAST, serverStatus: 'active' }, NOW)).toBe('active');
  });

  it('keeps revoked ahead of everything else', () => {
    expect(
      deriveStatus({ validFrom: FUTURE, validUntil: PAST, revokedAt: PAST, serverStatus: 'revoked' }, NOW),
    ).toBe('revoked');
  });

  it('shows not-yet-valid when the server says active but validFrom is still ahead', () => {
    expect(deriveStatus({ ...window, validFrom: FUTURE, serverStatus: 'active' }, NOW)).toBe(
      'not-yet-valid',
    );
  });

  it('does not downgrade a server "expired" to not-yet-valid', () => {
    expect(deriveStatus({ ...window, validFrom: FUTURE, serverStatus: 'expired' }, NOW)).toBe('expired');
  });

  describe('when the server sent no status', () => {
    const absent = { serverStatus: undefined };

    it('derives expired from validUntil', () => {
      expect(deriveStatus({ ...window, ...absent, validUntil: PAST }, NOW)).toBe('expired');
    });

    it('treats the exact expiry instant as expired, like the server does', () => {
      expect(
        deriveStatus({ ...window, ...absent, validUntil: new Date(NOW).toISOString() }, NOW),
      ).toBe('expired');
    });

    it('reports revoked when the payload carries a revocation time', () => {
      expect(deriveStatus({ ...window, ...absent, revokedAt: PAST }, NOW)).toBe('revoked');
    });

    it('derives not-yet-valid from validFrom', () => {
      expect(deriveStatus({ ...window, ...absent, validFrom: FUTURE }, NOW)).toBe('not-yet-valid');
    });

    it('falls back to active when the dates are missing or unreadable', () => {
      expect(
        deriveStatus({ ...absent, validFrom: undefined, validUntil: undefined, revokedAt: undefined }, NOW),
      ).toBe('active');
      expect(
        deriveStatus({ ...absent, validFrom: 'nonsense', validUntil: 'nonsense', revokedAt: undefined }, NOW),
      ).toBe('active');
    });
  });
});

describe('toWalletCredential', () => {
  it('maps a loaded agent credential field by field', () => {
    const summary = summaryOf({ scopes: ['read:orders', 'write:orders'] });
    const credential = toWalletCredential(summary, detailOf(summary), NOW);

    expect(credential).toMatchObject({
      vcId: summary.vcId,
      kind: 'agent',
      typeLabel: 'Agent Authorization',
      types: ['HelixAgentCredential'],
      status: 'active',
      serverStatus: 'active',
      scopes: ['read:orders', 'write:orders'],
      issuer: ISSUER_DID,
      subjectDid: AGENT_DID,
      validFrom: PAST,
      validUntil: FUTURE,
      parentVcId: undefined,
      revokedAt: undefined,
      renewedByVcId: undefined,
      credentialStatus: {
        type: 'BitstringStatusListEntry',
        statusListIndex: '4',
        statusPurpose: 'revocation',
      },
      proof: {
        type: 'Ed25519Signature2020',
        proofPurpose: 'assertionMethod',
        verificationMethod: `${ISSUER_DID}#key-1`,
      },
      detailLoaded: true,
    });
  });

  it('keeps proofValue out of the view model, but leaves the raw VC intact for the JSON view', () => {
    const summary = summaryOf();
    const credential = toWalletCredential(summary, detailOf(summary), NOW);

    expect(JSON.stringify(credential.proof)).not.toContain(FAKE_PROOF_VALUE);
    expect(JSON.stringify(credential.vc)).toContain(FAKE_PROOF_VALUE);
  });

  it('renders from the summary alone while the VC is not loaded', () => {
    const summary = summaryOf({ status: 'expired', expiresAt: PAST, parentVcId: 'vc:helix:parent' });
    const credential = toWalletCredential(summary, undefined, NOW);

    expect(credential).toMatchObject({
      kind: 'generic',
      typeLabel: 'Credential',
      types: [],
      status: 'expired',
      scopes: ['read:orders'],
      issuer: undefined,
      subjectDid: AGENT_DID,
      validFrom: PAST,
      validUntil: PAST,
      parentVcId: 'vc:helix:parent',
      credentialStatus: undefined,
      proof: undefined,
      vc: undefined,
      detailLoaded: false,
    });
  });

  it('prefers the detail status over the list status, as the panel always has', () => {
    const summary = summaryOf({ status: 'active' });
    const credential = toWalletCredential(
      summary,
      detailOf(summary, {}, { status: 'revoked', revokedAt: '2026-09-01T00:00:00.000Z' }),
      NOW,
    );

    expect(credential.status).toBe('revoked');
    expect(credential.serverStatus).toBe('revoked');
    expect(credential.revokedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('derives a status only when neither payload carries a usable one', () => {
    const summary = summaryOf({ status: 'weird' as VCStatus, expiresAt: PAST });
    const detail = detailOf(summary, {}, { status: undefined as unknown as VCStatus });
    const credential = toWalletCredential(summary, detail, NOW);

    expect(credential.serverStatus).toBeUndefined();
    expect(credential.status).toBe('expired');
  });

  it('reads scopes from the claim when the list did not provide any', () => {
    const agent = summaryOf({ scopes: [] });
    const fromPrivilegeScopes = toWalletCredential(
      agent,
      detailOf(agent, {
        credentialSubject: { id: AGENT_DID, privilegeScopes: ['read:calendar'] },
      }),
      NOW,
    );
    expect(fromPrivilegeScopes.scopes).toEqual(['read:calendar']);

    // Delegation grants name the same claim `scopes`.
    const fromGrantScopes = toWalletCredential(
      agent,
      detailOf(agent, {
        type: ['VerifiableCredential', 'DelegationGrantCredential'],
        credentialSubject: { id: AGENT_DID, type: 'DelegationGrant', scopes: ['book:flights'] },
      }),
      NOW,
    );
    expect(fromGrantScopes).toMatchObject({ kind: 'grant', scopes: ['book:flights'] });

    expect(toWalletCredential(agent, undefined, NOW).scopes).toEqual([]);
  });

  it('accepts an issuer object as well as an issuer string', () => {
    const summary = summaryOf();
    expect(
      toWalletCredential(summary, detailOf(summary, { issuer: { id: ISSUER_DID, name: 'Issuer' } }), NOW)
        .issuer,
    ).toBe(ISSUER_DID);
    expect(toWalletCredential(summary, detailOf(summary, { issuer: 42 }), NOW).issuer).toBeUndefined();
  });

  it('copes with a missing or differently-typed credentialStatus and proof', () => {
    const summary = summaryOf();
    const none = toWalletCredential(
      summary,
      detailOf(summary, { credentialStatus: undefined, proof: undefined }),
      NOW,
    );
    expect(none.credentialStatus).toBeUndefined();
    expect(none.proof).toBeUndefined();

    const numericIndex = toWalletCredential(
      summary,
      detailOf(summary, { credentialStatus: { type: 'BitstringStatusListEntry', statusListIndex: 7 } }),
      NOW,
    );
    expect(numericIndex.credentialStatus).toEqual({
      type: 'BitstringStatusListEntry',
      statusListIndex: '7',
      statusPurpose: undefined,
    });

    const untyped = toWalletCredential(
      summary,
      detailOf(summary, { credentialStatus: { statusListIndex: {} }, proof: [] }),
      NOW,
    );
    expect(untyped.credentialStatus).toBeUndefined();
    expect(untyped.proof).toBeUndefined();

    const noIndex = toWalletCredential(
      summary,
      detailOf(summary, { credentialStatus: { type: 'SomeOtherStatus', statusListIndex: null } }),
      NOW,
    );
    expect(noIndex.credentialStatus).toMatchObject({ type: 'SomeOtherStatus', statusListIndex: undefined });
  });

  it('reads delegation lineage and renewal from the payload', () => {
    const summary = summaryOf();
    const credential = toWalletCredential(
      summary,
      detailOf(
        summary,
        { credentialSubject: { id: AGENT_DID, parentVcId: 'vc:helix:root' } },
        { renewedByVcId: 'vc:helix:next' },
      ),
      NOW,
    );
    expect(credential.parentVcId).toBe('vc:helix:root');
    expect(credential.renewedByVcId).toBe('vc:helix:next');
  });

  it('falls back to the response expiry, then the summary, when the VC has no window', () => {
    const summary = summaryOf({ expiresAt: FUTURE });
    const credential = toWalletCredential(
      summary,
      detailOf(summary, { validFrom: undefined, validUntil: undefined }, { expiresAt: PAST }),
      NOW,
    );
    expect(credential.validFrom).toBe(summary.issuedAt);
    expect(credential.validUntil).toBe(PAST);
  });

  it('treats a detail without a usable VC as not describing a type', () => {
    const summary = summaryOf();
    const detail = { ...detailOf(summary), vc: 'corrupt' } as unknown as VCResponse;
    expect(toWalletCredential(summary, detail, NOW)).toMatchObject({
      kind: 'generic',
      typeLabel: 'Credential',
      vc: undefined,
      detailLoaded: true,
    });
  });
});

describe('ordering', () => {
  const active = summaryOf({ vcId: 'vc:active', issuedAt: LONG_AGO });
  const newestExpired = summaryOf({ vcId: 'vc:expired-new', status: 'expired', issuedAt: PAST, expiresAt: PAST });
  const oldestRevoked = summaryOf({ vcId: 'vc:revoked-old', status: 'revoked', issuedAt: LONG_AGO });
  const undated = summaryOf({ vcId: 'vc:undated', status: 'expired', issuedAt: '' });

  it('puts active credentials first, then newest first', () => {
    const wallet = buildWallet([oldestRevoked, undated, newestExpired, active], {}, NOW);
    expect(wallet.map((credential) => credential.vcId)).toEqual([
      'vc:active',
      'vc:expired-new',
      'vc:revoked-old',
      'vc:undated',
    ]);
  });

  it('does not mutate the list it is given', () => {
    const wallet = buildWallet([newestExpired, active], {}, NOW);
    const before = [...wallet].reverse();
    const snapshot = [...before];
    sortCredentials(before);
    expect(before).toEqual(snapshot);
  });

  it('uses loaded details when they are there', () => {
    const wallet = buildWallet([active], { [active.vcId]: detailOf(active) }, NOW);
    expect(wallet[0]).toMatchObject({ kind: 'agent', detailLoaded: true });
  });

  it('picks the eager set in display order and caps it', () => {
    expect(eagerDetailIds([oldestRevoked, undated, newestExpired, active], 2)).toEqual([
      'vc:active',
      'vc:expired-new',
    ]);

    const many = manySummaries(EAGER_DETAIL_LIMIT + 5);
    expect(eagerDetailIds(many)).toHaveLength(EAGER_DETAIL_LIMIT);
    expect(eagerDetailIds(many)[0]).toBe('vc:helix:bulk-00');
    expect(eagerDetailIds([])).toEqual([]);
  });

  it('always includes an old active credential in the eager set, ahead of newer history', () => {
    const history = manySummaries(EAGER_DETAIL_LIMIT + 5);
    const oldActive = summaryOf({ vcId: 'vc:old-active', issuedAt: LONG_AGO });
    expect(eagerDetailIds([...history, oldActive])[0]).toBe('vc:old-active');
  });
});

describe('filtering', () => {
  const agent = summaryOf({ vcId: 'vc:helix:agent-1', scopes: ['read:orders'] });
  const grant = summaryOf({ vcId: 'vc:helix:grant-1', scopes: ['book:flights'], status: 'expired' });
  const unloaded = summaryOf({ vcId: 'vc:helix:old-1', scopes: ['read:email'], status: 'revoked' });
  const wallet = buildWallet(
    [agent, grant, unloaded],
    {
      [agent.vcId]: detailOf(agent),
      [grant.vcId]: detailOf(grant, {
        type: ['VerifiableCredential', 'DelegationGrantCredential'],
        issuer: 'did:web:travel.example.test',
      }),
    },
    NOW,
  );
  const ids = (list: typeof wallet) => list.map((credential) => credential.vcId);

  it('returns everything when no filter is set', () => {
    expect(filterCredentials(wallet, NO_FILTERS)).toHaveLength(3);
  });

  it('filters by status', () => {
    expect(ids(filterCredentials(wallet, { ...NO_FILTERS, status: 'active' }))).toEqual([agent.vcId]);
    expect(ids(filterCredentials(wallet, { ...NO_FILTERS, status: 'expired' }))).toEqual([grant.vcId]);
    expect(ids(filterCredentials(wallet, { ...NO_FILTERS, status: 'revoked' }))).toEqual([unloaded.vcId]);
  });

  it('filters by type label', () => {
    expect(ids(filterCredentials(wallet, { ...NO_FILTERS, type: 'Delegation Grant' }))).toEqual([
      grant.vcId,
    ]);
  });

  it('searches VC ID, scope and issuer, ignoring case and surrounding space', () => {
    expect(ids(filterCredentials(wallet, { ...NO_FILTERS, query: '  GRANT-1 ' }))).toEqual([grant.vcId]);
    expect(ids(filterCredentials(wallet, { ...NO_FILTERS, query: 'read:email' }))).toEqual([unloaded.vcId]);
    expect(ids(filterCredentials(wallet, { ...NO_FILTERS, query: 'travel.example' }))).toEqual([grant.vcId]);
    expect(filterCredentials(wallet, { ...NO_FILTERS, query: 'no such thing' })).toEqual([]);
  });

  it('combines filters', () => {
    expect(
      filterCredentials(wallet, { status: 'active', type: 'Delegation Grant', query: '' }),
    ).toEqual([]);
  });

  it('offers only the types of credentials whose VC is loaded', () => {
    expect(typeOptions(wallet)).toEqual(['Agent Authorization', 'Delegation Grant']);
    expect(typeOptions(buildWallet([unloaded], {}, NOW))).toEqual([]);
  });
});

describe('presentation helpers', () => {
  it('splits scopes into the visible few and an overflow count', () => {
    expect(splitScopes([])).toEqual({ visible: [], hidden: 0 });
    expect(splitScopes(['a', 'b', 'c'])).toEqual({ visible: ['a', 'b', 'c'], hidden: 0 });
    expect(splitScopes(['a', 'b', 'c', 'd'])).toEqual({ visible: ['a', 'b', 'c'], hidden: 1 });
    expect(splitScopes(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toMatchObject({ hidden: 4 });
    expect(splitScopes(['a', 'b', 'c'], 1)).toEqual({ visible: ['a'], hidden: 2 });
  });

  it('shortens long identifiers and leaves short ones alone', () => {
    expect(shortenId('vc:helix:billing')).toBe('vc:helix:billing');
    expect(shortenId('x'.repeat(24))).toBe('x'.repeat(24));
    expect(shortenId('did:web:api.helixid.dev:agents:4450abcdef67374b')).toBe('did:web:api.heli…67374b');
  });

  it('formats dates for people and shrugs at bad input', () => {
    // A day either side: the rendered day depends on the machine's time zone.
    expect(formatDate('2026-09-18T12:00:00.000Z', 'en-US')).toMatch(/^Sep (17|18|19), 2026$/);
    expect(formatDate('not a date')).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('describes a timestamp relative to now', () => {
    const at = (offset: number) => new Date(NOW + offset).toISOString();
    expect(formatRelative(at(3 * DAY), NOW, 'en-US')).toBe('in 3 days');
    expect(formatRelative(at(-3 * DAY), NOW, 'en-US')).toBe('3 days ago');
    expect(formatRelative(at(5 * 3_600_000), NOW, 'en-US')).toBe('in 5 hours');
    expect(formatRelative(at(-10 * 60_000), NOW, 'en-US')).toBe('10 minutes ago');
    expect(formatRelative(at(30_000), NOW, 'en-US')).toBe('in 30 seconds');
    expect(formatRelative(at(60 * DAY), NOW, 'en-US')).toBe('in 2 months');
    expect(formatRelative(at(-800 * DAY), NOW, 'en-US')).toBe('2 years ago');
    expect(formatRelative('nonsense', NOW)).toBe('');
    expect(formatRelative(undefined, NOW)).toBe('');
  });

  it('builds the accessible name a card announces', () => {
    const summary = summaryOf({ status: 'expired', expiresAt: '2026-09-18T12:00:00.000Z' });
    expect(credentialAccessibleName(toWalletCredential(summary, detailOf(summary), NOW), 'en-US')).toMatch(
      /^Agent Authorization credential, Expired, valid until Sep (17|18|19), 2026$/,
    );
    // No "Credential credential" when the label already says it.
    expect(credentialAccessibleName(toWalletCredential(summary, undefined, NOW), 'en-US')).toMatch(
      /^Credential, Expired, valid until /,
    );
  });
});

describe('JSON views', () => {
  it('builds the wallet document from loaded VCs only, in the order given', () => {
    const first = summaryOf({ vcId: 'vc:one' });
    const second = summaryOf({ vcId: 'vc:two', status: 'expired' });
    const wallet = buildWallet([first, second], { [first.vcId]: detailOf(first) }, NOW);

    const document = buildWalletDocument(AGENT_DID, wallet);
    expect(document.agent).toBe(AGENT_DID);
    expect(document.credentials).toHaveLength(1);
    expect(document.credentials[0]).toMatchObject({ id: 'vc:one' });
    expect(buildWalletDocument(AGENT_DID, [])).toEqual({ agent: AGENT_DID, credentials: [] });
  });

  it('turns an identifier into a safe .json filename', () => {
    expect(jsonFilename('vc:helix:dc0b4a402b28')).toBe('vc-helix-dc0b4a402b28.json');
    expect(jsonFilename('wallet-did:web:api.example.test:agents:1')).toBe(
      'wallet-did-web-api.example.test-agents-1.json',
    );
    expect(jsonFilename('///')).toBe('credential.json');
  });

  it('tokenizes JSON losslessly', () => {
    const text = JSON.stringify(
      { id: 'vc:1', nested: { count: -2.5e3, ok: true, none: null, list: ['a', 1, false] } },
      null,
      2,
    );
    const tokens = tokenizeJson(text);

    expect(tokens.map((token) => token.text).join('')).toBe(text);
    expect(tokens.filter((token) => token.kind === 'key').map((token) => token.text)).toEqual([
      '"id"',
      '"nested"',
      '"count"',
      '"ok"',
      '"none"',
      '"list"',
    ]);
    expect(tokens.filter((token) => token.kind === 'string').map((token) => token.text)).toEqual([
      '"vc:1"',
      '"a"',
    ]);
    expect(tokens.filter((token) => token.kind === 'number').map((token) => token.text)).toEqual([
      '-2500',
      '1',
    ]);
    expect(tokens.filter((token) => token.kind === 'literal').map((token) => token.text)).toEqual([
      'true',
      'null',
      'false',
    ]);
  });

  it('keeps escaped quotes and colons inside a string as one token', () => {
    const text = JSON.stringify({ note: 'say "hi": now', 'key: odd': 1 });
    const tokens = tokenizeJson(text);

    expect(tokens.map((token) => token.text).join('')).toBe(text);
    expect(tokens.find((token) => token.kind === 'string')?.text).toBe('"say \\"hi\\": now"');
    expect(tokens.filter((token) => token.kind === 'key').map((token) => token.text)).toEqual([
      '"note"',
      '"key: odd"',
    ]);
  });

  it('passes through text that is not JSON rather than dropping it', () => {
    const text = '{ oops } trailing';
    const tokens = tokenizeJson(text);

    expect(tokens.map((token) => token.text).join('')).toBe(text);
    expect(tokens.some((token) => token.kind === 'plain' && token.text.includes('oops'))).toBe(true);
    expect(tokens.at(-1)).toEqual({ kind: 'plain', text: ' trailing' });
    expect(tokenizeJson('')).toEqual([]);
  });
});
