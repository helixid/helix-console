// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// What an agent holds, as a wallet: one card per credential issued to its
// DID — current and past — with the raw JSON one toggle away. Replaces the
// panel's "Full VC JSON" block and "Credential history" list.
//
// Presentational, like the rest of components/agents: AgentsPage owns the
// data and the API calls and hands both in. What lives here is view state
// only — which view, which filters, which card is open.

import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { CredentialCard } from './CredentialCard';
import { CredentialDetailDrawer } from './CredentialDetailDrawer';
import { JsonBlock } from './JsonBlock';
import {
  NO_FILTERS,
  STATUS_FILTERS,
  buildWallet,
  buildWalletDocument,
  filterCredentials,
  jsonFilename,
  typeOptions,
  type StatusFilter,
  type WalletFilters,
  type WalletState,
} from './credentialModel';
import { SegmentedTabs, panelId, tabId, type TabOption } from './walletUi';

type WalletView = 'wallet' | 'json';

const VIEWS: ReadonlyArray<TabOption<WalletView>> = [
  { value: 'wallet', label: 'Wallet' },
  { value: 'json', label: 'JSON' },
];

const VIEW_STORAGE_KEY = 'helixid.console.walletView';

/** Wallet is the default; a stored choice of JSON wins on the next visit. */
function storedView(): WalletView {
  try {
    if (localStorage.getItem(VIEW_STORAGE_KEY) === 'json') return 'json';
  } catch {
    // Private mode / storage disabled — fall through to the default.
  }
  return 'wallet';
}

export interface CredentialWalletProps {
  agentDid: string;
  state: WalletState;
  onRetry: () => void;
  /** Fetch the full VC for credentials that were not loaded up front. */
  onLoadDetails: (vcIds: string[]) => void;
  onRevoke: (vcId: string) => Promise<void>;
}

export function CredentialWallet({
  agentDid,
  state,
  onRetry,
  onLoadDetails,
  onRevoke,
}: CredentialWalletProps) {
  const [view, setView] = useState<WalletView>(storedView);
  const [filters, setFilters] = useState<WalletFilters>(NO_FILTERS);
  const [openVcId, setOpenVcId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const tabsId = useId();

  // One clock reading per data change, shared by every card.
  const { credentials, now } = useMemo(() => {
    const at = Date.now();
    return { now: at, credentials: buildWallet(state.summaries, state.details, at) };
  }, [state]);
  const walletDocument = useMemo(
    () => buildWalletDocument(agentDid, credentials),
    [agentDid, credentials],
  );

  const changeView = (next: WalletView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Ignore storage failures; the view still applies for this session.
    }
  };

  const types = typeOptions(credentials);
  // A type that is no longer on offer (the wallet re-loaded) must not keep filtering.
  const type = filters.type !== null && types.includes(filters.type) ? filters.type : null;
  const visible = filterCredentials(credentials, { ...filters, type });
  const unloaded = credentials.filter((credential) => !credential.detailLoaded);
  const opened = credentials.find((credential) => credential.vcId === openVcId);

  const closeDetail = () => {
    setOpenVcId(null);
    opener.current?.focus();
  };

  const detailsNotice = unloaded.length > 0 && (
    <p className="wallet__notice">
      <span>
        Full details loaded for {credentials.length - unloaded.length} of {credentials.length}{' '}
        credentials.
      </span>
      <button
        type="button"
        disabled={unloaded.some((credential) => state.pending[credential.vcId])}
        onClick={() => onLoadDetails(unloaded.map((credential) => credential.vcId))}
      >
        Load the rest
      </button>
    </p>
  );

  let body: ReactNode;
  if (state.phase === 'loading') {
    body = (
      <div className="wallet__grid-wrap" aria-busy="true">
        <p className="loading-note">Loading credentials…</p>
        <div className="wallet__grid" aria-hidden="true">
          {[0, 1, 2].map((slot) => (
            <div key={slot} className="cred-card cred-card--skeleton">
              <span className="skeleton-line skeleton-line--title" />
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line--short" />
            </div>
          ))}
        </div>
      </div>
    );
  } else if (state.phase === 'error') {
    body = (
      <div role="alert" className="wallet__error">
        <span>Could not load credentials: {state.message}</span>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  } else if (view === 'json') {
    body = (
      <>
        {detailsNotice}
        <JsonBlock
          value={walletDocument}
          label="Wallet JSON"
          filename={jsonFilename(`wallet-${agentDid}`)}
          collapsibleSummary={`Wallet JSON · ${walletDocument.credentials.length} ${
            walletDocument.credentials.length === 1 ? 'credential' : 'credentials'
          }`}
        />
      </>
    );
  } else if (credentials.length === 0) {
    body = <p className="empty-state">No credentials issued to this agent yet.</p>;
  } else if (visible.length === 0) {
    body = (
      <p className="empty-state">
        No credentials match these filters.{' '}
        <button type="button" onClick={() => setFilters(NO_FILTERS)}>
          Clear filters
        </button>
      </p>
    );
  } else {
    body = (
      <>
        {detailsNotice}
        <div className="wallet__grid-wrap">
          <ul className={`wallet__grid${credentials.length === 1 ? ' wallet__grid--single' : ''}`}>
            {visible.map((credential) => (
              <li key={credential.vcId}>
                <CredentialCard
                  credential={credential}
                  now={now}
                  onOpen={(vcId, trigger) => {
                    opener.current = trigger;
                    setOpenVcId(vcId);
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  }

  const showFilters = state.phase === 'ready' && view === 'wallet' && credentials.length > 0;

  return (
    <div className="wallet">
      <div className="wallet__toolbar">
        <h3 className="wallet__title">
          Credentials
          {state.phase === 'ready' && <span className="wallet__count">{credentials.length}</span>}
        </h3>
        <SegmentedTabs
          label="Credential view"
          idBase={tabsId}
          options={VIEWS}
          value={view}
          onChange={changeView}
        />
        {showFilters && (
          <div className="wallet__filters">
            <select
              aria-label="Filter by status"
              value={filters.status}
              onChange={(event) =>
                setFilters({ ...filters, status: event.target.value as StatusFilter })
              }
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {types.length > 1 && (
              <select
                aria-label="Filter by type"
                value={type ?? ''}
                onChange={(event) => setFilters({ ...filters, type: event.target.value || null })}
              >
                <option value="">All types</option>
                {types.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            <input
              type="search"
              className="wallet__search"
              aria-label="Search credentials"
              placeholder="Search VC ID, scope or issuer"
              value={filters.query}
              onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            />
          </div>
        )}
      </div>

      <div
        className="wallet__panel"
        role="tabpanel"
        id={panelId(tabsId, view)}
        aria-labelledby={tabId(tabsId, view)}
      >
        {body}
      </div>

      {/* Outside the grid wrapper on purpose: that element is a size
          container, which would become the containing block for the
          drawer's fixed positioning. */}
      {opened !== undefined && (
        <CredentialDetailDrawer
          credential={opened}
          now={now}
          detailPending={state.pending[opened.vcId] === true}
          detailError={state.failed[opened.vcId]}
          onLoadDetail={(vcId) => onLoadDetails([vcId])}
          onRevoke={onRevoke}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}
