// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { VCResponse, VCSummary } from '../api/types';
import { PassportDetail } from '../components/agents/passport/PassportDetail';
import { PassportGrid } from '../components/agents/passport/PassportGrid';
import { toPassportAgent, type PassportAgent } from '../components/agents/passport/passportModel';
import {
  LOADING_WALLET,
  eagerDetailIds,
  type WalletState,
} from '../components/agents/wallet/credentialModel';
import { ActivityIcon, BotIcon, KeyIcon, ShieldIcon } from '../components/layout/icons';

/**
 * One row per agent: its identity credential (story F-1), which names it and
 * whose revocation also revokes its attestations. The API returns newest
 * first, so a reissued identity wins. Lists without types (older APIs) keep
 * one row per DID.
 */
function latestPerDid(vcs: VCSummary[]): VCSummary[] {
  const seen = new Set<string>();
  const typed = vcs.some((vc) => vc.vcType !== undefined);
  return vcs.filter((vc) => {
    if (typed && vc.vcType !== 'AgentIdentityCredential') return false;
    if (seen.has(vc.subjectDid)) return false;
    seen.add(vc.subjectDid);
    return true;
  });
}

/**
 * GET /v1/vcs/:vcId for each id. One failure never sinks the rest — a card
 * whose VC did not load still renders from its list summary.
 */
async function fetchDetails(
  vcIds: string[],
): Promise<Pick<WalletState, 'details' | 'failed'>> {
  const results = await Promise.allSettled(vcIds.map((vcId) => api.getAgent(vcId)));
  const details: Record<string, VCResponse> = {};
  const failed: Record<string, string> = {};
  results.forEach((result, index) => {
    const vcId = vcIds[index]!;
    if (result.status === 'fulfilled') {
      details[vcId] = result.value;
    } else {
      failed[vcId] =
        result.reason instanceof Error ? result.reason.message : 'Failed to load agent detail';
    }
  });
  return { details, failed };
}

function without<T>(record: Record<string, T>, keys: string[]): Record<string, T> {
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
}

export function AgentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const subjectDidFilter = searchParams.get('subjectDid');

  const [summaries, setSummaries] = useState<VCSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PassportAgent | null>(null);
  const [wallet, setWallet] = useState<WalletState>(LOADING_WALLET);
  const [toast, setToast] = useState<string | null>(null);
  // Bumped whenever the passport is opened, re-opened or closed. A response
  // that comes back under an older number belongs to a wallet that is no
  // longer on screen, and is dropped.
  const generation = useRef(0);
  // Detail requests in flight, so asking twice for the same VC (a double
  // click, StrictMode's doubled effect) is still one request.
  const inFlight = useRef(new Set<string>());
  // The card that opened the passport, so closing it hands focus back there.
  const opener = useRef<HTMLElement | null>(null);

  const agents = useMemo(() => summaries.map(toPassportAgent), [summaries]);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listAgents(
        subjectDidFilter ? { subjectDid: subjectDidFilter } : undefined,
      );
      setSummaries(latestPerDid(result));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [subjectDidFilter]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  /** Re-reads the list after a change made in the passport, without the loading flash. */
  const refreshAgents = useCallback(async () => {
    try {
      const next = latestPerDid(
        await api.listAgents(subjectDidFilter ? { subjectDid: subjectDidFilter } : undefined),
      );
      setSummaries(next);
      setSelected((current) => {
        if (current === null) return current;
        const match = next.find((vc) => vc.subjectDid === current.agentDid);
        return match === undefined ? current : toPassportAgent(match);
      });
    } catch {
      // The grid keeps what it had; Refresh is still there.
    }
  }, [subjectDidFilter]);

  /**
   * Loads the agent's wallet: every credential issued to its DID, plus the
   * full VC for the first few cards (see EAGER_DETAIL_LIMIT). `alsoDetail`
   * names VCs that were already on screen, so a re-load after Revoke
   * refreshes them rather than blanking them. Rejects only when the list
   * itself cannot be loaded.
   */
  const loadWallet = useCallback(async (agent: PassportAgent, alsoDetail: string[] = []) => {
    const startedAt = generation.current;
    const held = await api.listAgents({ subjectDid: agent.agentDid });
    const listed = new Set(held.map((summary) => summary.vcId));
    const wanted = new Set([
      ...eagerDetailIds(held),
      ...alsoDetail.filter((vcId) => listed.has(vcId)),
    ]);
    const { details, failed } = await fetchDetails([...wanted]);
    if (generation.current !== startedAt) return;
    setWallet({ phase: 'ready', message: '', summaries: held, details, failed, pending: {} });
    const firstFailure = Object.values(failed)[0];
    if (firstFailure !== undefined) setToast(firstFailure);
  }, []);

  const handleSelect = useCallback(
    (agent: PassportAgent) => {
      generation.current += 1;
      const openedAt = generation.current;
      inFlight.current.clear();
      setSelected(agent);
      setWallet(LOADING_WALLET);
      void loadWallet(agent).catch((err: unknown) => {
        if (generation.current !== openedAt) return;
        const message = err instanceof Error ? err.message : 'Failed to load agent detail';
        setWallet({ ...LOADING_WALLET, phase: 'error', message });
        setToast(message);
      });
    },
    [loadWallet],
  );

  const handleOpen = useCallback(
    (agent: PassportAgent, trigger: HTMLElement) => {
      opener.current = trigger;
      handleSelect(agent);
    },
    [handleSelect],
  );

  /** Fetches VCs that were not loaded up front — a card was opened, or "Load the rest". */
  const loadDetails = useCallback(async (vcIds: string[]) => {
    const startedAt = generation.current;
    const wanted = vcIds.filter((vcId) => !inFlight.current.has(vcId));
    if (wanted.length === 0) return;
    for (const vcId of wanted) inFlight.current.add(vcId);
    setWallet((current) => ({
      ...current,
      failed: without(current.failed, wanted),
      pending: {
        ...current.pending,
        ...Object.fromEntries(wanted.map((vcId): [string, true] => [vcId, true])),
      },
    }));

    const { details, failed } = await fetchDetails(wanted);
    for (const vcId of wanted) inFlight.current.delete(vcId);
    if (generation.current !== startedAt) return;
    setWallet((current) => ({
      ...current,
      details: { ...current.details, ...details },
      failed: { ...current.failed, ...failed },
      pending: without(current.pending, wanted),
    }));
    const firstFailure = Object.values(failed)[0];
    if (firstFailure !== undefined) setToast(firstFailure);
  }, []);

  // Revocation is confirmed-then-shown: the status flips only after the API
  // succeeds and the wallet is re-fetched (dev spec §5.1). The grid is
  // re-read too, since revoking the agent's own credential revokes the agent.
  const handleRevoke = useCallback(
    async (agent: PassportAgent, vcId: string, loadedVcIds: string[]) => {
      try {
        await api.revokeAgent(vcId);
        await loadWallet(agent, loadedVcIds);
        setToast(`Revoked ${vcId}`);
        void refreshAgents();
      } catch (err: unknown) {
        setToast(err instanceof Error ? err.message : 'Revocation failed');
      }
    },
    [loadWallet, refreshAgents],
  );

  const activeCount = agents.filter((a) => a.status === 'active').length;
  const revokedCount = agents.filter((a) => a.status === 'revoked').length;
  const delegatedCount = agents.filter((a) => a.delegatedFromVcId).length;

  // An open passport covers the page, so the toast shows inside it instead.
  const toastNode = toast && (
    <p role="status" className="toast">
      {toast}{' '}
      <button type="button" onClick={() => setToast(null)}>
        Dismiss
      </button>
    </p>
  );

  return (
    <div className="agents-page">
      <div className="page-header">
        <div>
          <h1>Agents</h1>
          <p className="page-subtitle">
            Browse every agent&apos;s identity, scopes, status and delegation lineage.
          </p>
        </div>
        <button type="button" onClick={() => void loadAgents()}>
          Refresh
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card card">
          <div className="stat-top">
            <span className="stat-icon">
              <BotIcon />
            </span>
            <span className="stat-hint">↗ {activeCount} active</span>
          </div>
          <div>
            <div className="stat-value">{agents.length}</div>
            <div className="stat-label">Total Agents</div>
          </div>
        </div>
        <div className="stat-card card">
          <div className="stat-top">
            <span className="stat-icon">
              <ShieldIcon />
            </span>
            <span className="stat-hint">↗ own credential valid</span>
          </div>
          <div>
            <div className="stat-value">{activeCount}</div>
            <div className="stat-label">Active Agents</div>
          </div>
        </div>
        <div className="stat-card card">
          <div className="stat-top">
            <span className="stat-icon">
              <KeyIcon />
            </span>
            <span className="stat-hint">↘ revoked or expired</span>
          </div>
          <div>
            <div className="stat-value">{revokedCount}</div>
            <div className="stat-label">Revoked</div>
          </div>
        </div>
        <div className="stat-card card">
          <div className="stat-top">
            <span className="stat-icon">
              <ActivityIcon />
            </span>
            <span className="stat-hint">↗ hold delegated authority</span>
          </div>
          <div>
            <div className="stat-value">{delegatedCount}</div>
            <div className="stat-label">Delegated</div>
          </div>
        </div>
      </div>

      {subjectDidFilter && (
        <p className="filter-note">
          Filtered by DID {subjectDidFilter}{' '}
          <button type="button" onClick={() => setSearchParams({})}>
            Clear filter
          </button>
        </p>
      )}

      {!selected && toastNode}

      <PassportGrid
        agents={agents}
        loading={loading}
        error={error}
        filtered={subjectDidFilter !== null}
        onRetry={() => void loadAgents()}
        onOpen={handleOpen}
      />

      {selected && (
        <PassportDetail
          agent={selected}
          wallet={wallet}
          notice={toastNode}
          returnFocusRef={opener}
          onRetry={() => handleSelect(selected)}
          onLoadDetails={(vcIds) => void loadDetails(vcIds)}
          onRevoke={(vcId) => handleRevoke(selected, vcId, Object.keys(wallet.details))}
          onClose={() => {
            generation.current += 1;
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
