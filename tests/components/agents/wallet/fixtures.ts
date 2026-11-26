// Copyright 2026 DgVerse LLP
//
// Shared wallet fixtures. Fake DIDs, VC IDs and proof values only — nothing
// here is, or resembles, a real credential.
import type { VCResponse, VCStatus, VCSummary } from '../../../../src/api/types';
import {
  toPassportAgent,
  type PassportAgent,
} from '../../../../src/components/agents/passport/passportModel';
import type { WalletState } from '../../../../src/components/agents/wallet/credentialModel';

export const AGENT_DID = 'did:web:example.test:agents:billing';
export const ISSUER_DID = 'did:web:issuer.example.test';
export const SERVICE_DID = 'did:web:travel.example.test';
export const FAKE_PROOF_VALUE = 'zFakeProofValueForTestsOnly';

/** Far enough from any real clock that tests never depend on the day they run. */
export const PAST = '2020-01-01T00:00:00.000Z';
export const LONG_AGO = '2019-01-01T00:00:00.000Z';
export const FUTURE = '2099-01-01T00:00:00.000Z';

export function summaryOf(overrides: Partial<VCSummary> = {}): VCSummary {
  return {
    vcId: 'vc:helix:agent-active',
    subjectDid: AGENT_DID,
    agentName: 'billing-agent',
    scopes: ['read:orders'],
    status: 'active',
    issuedAt: PAST,
    expiresAt: FUTURE,
    ...overrides,
  };
}

export function agentVc(
  summary: VCSummary,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    '@context': ['https://www.w3.org/ns/credentials/v2', 'https://helixid.io/contexts/v1'],
    id: summary.vcId,
    type: ['VerifiableCredential', 'HelixAgentCredential'],
    issuer: ISSUER_DID,
    validFrom: summary.issuedAt,
    validUntil: summary.expiresAt,
    credentialStatus: {
      id: 'https://api.example.test/v1/status-list/helix-status-list-1#4',
      type: 'BitstringStatusListEntry',
      statusPurpose: 'revocation',
      statusListIndex: '4',
      statusListCredential: 'https://api.example.test/v1/status-list/helix-status-list-1',
    },
    credentialSubject: {
      id: summary.subjectDid,
      type: 'HelixAgent',
      privilegeScopes: summary.scopes,
      agentName: summary.agentName,
    },
    proof: {
      type: 'Ed25519Signature2020',
      created: summary.issuedAt,
      verificationMethod: `${ISSUER_DID}#key-1`,
      proofPurpose: 'assertionMethod',
      proofValue: FAKE_PROOF_VALUE,
    },
    ...overrides,
  };
}

export function detailOf(
  summary: VCSummary,
  vcOverrides: Record<string, unknown> = {},
  responseOverrides: Partial<VCResponse> = {},
): VCResponse {
  return {
    vcId: summary.vcId,
    vc: agentVc(summary, vcOverrides),
    status: summary.status,
    expiresAt: summary.expiresAt,
    revokedAt: null,
    renewedByVcId: null,
    ...responseOverrides,
  };
}

/** `count` summaries for one DID, newest first, the way the API lists them. */
export function manySummaries(count: number, status: VCStatus = 'expired'): VCSummary[] {
  return Array.from({ length: count }, (_, index) =>
    summaryOf({
      vcId: `vc:helix:bulk-${String(index).padStart(2, '0')}`,
      status,
      issuedAt: new Date(Date.parse(PAST) - index * 86_400_000).toISOString(),
      expiresAt: status === 'active' ? FUTURE : PAST,
    }),
  );
}

// A small, varied wallet: the agent's own credential, a consent grant from a
// service, and two past credentials.

export const activeAgent = summaryOf();

export const grant = summaryOf({
  vcId: 'vc:helix:grant:standing-0001-0002-0003-000000000004',
  scopes: ['book:flights', 'read:itinerary', 'pay:card', 'cancel:booking'],
  issuedAt: '2021-01-01T00:00:00.000Z',
});

export const expiredAgent = summaryOf({
  vcId: 'vc:helix:agent-expired',
  status: 'expired',
  issuedAt: LONG_AGO,
  expiresAt: PAST,
});

export const revokedAgent = summaryOf({
  vcId: 'vc:helix:agent-revoked',
  status: 'revoked',
  issuedAt: '2018-01-01T00:00:00.000Z',
});

export const grantDetail = detailOf(grant, {
  type: ['VerifiableCredential', 'DelegationGrantCredential'],
  issuer: SERVICE_DID,
  credentialSubject: {
    id: AGENT_DID,
    type: 'DelegationGrant',
    userDid: 'did:web:example.test:users:ada',
    scopes: grant.scopes,
    durability: 'standing',
  },
});

export const revokedDetail = detailOf(
  revokedAgent,
  {},
  { revokedAt: '2018-06-01T00:00:00.000Z' },
);

export const WALLET_SUMMARIES = [grant, activeAgent, expiredAgent, revokedAgent];

export const WALLET_DETAILS = [
  grantDetail,
  detailOf(activeAgent),
  detailOf(expiredAgent),
  revokedDetail,
];

export function readyWallet(
  summaries: VCSummary[] = WALLET_SUMMARIES,
  details: VCResponse[] = WALLET_DETAILS,
  extra: Partial<WalletState> = {},
): WalletState {
  return {
    phase: 'ready',
    message: '',
    summaries,
    details: Object.fromEntries(details.map((detail) => [detail.vcId, detail])),
    failed: {},
    pending: {},
    ...extra,
  };
}

/** An agent as its passport shows it, built from its own credential. */
export function passportAgentOf(own: VCSummary, overrides: Partial<PassportAgent> = {}): PassportAgent {
  return { ...toPassportAgent(own), ...overrides };
}

/** Installs a clipboard the component can write to; returns the spy. */
export function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}
