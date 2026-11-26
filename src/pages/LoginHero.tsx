// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// The brand half of the sign-in page: what HelixID is for, and a live-typed
// preview of the did:web issuer DID a deployment signs agent credentials
// with. The DID shown is an example — the real one is this deployment's.

import { useEffect, useState } from 'react';
import helixMark from '../assets/helix-mark.svg';

const DID_TEMPLATE = 'did:web:helix.example.com';

export function LoginHero() {
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setTyped(DID_TEMPLATE);
      setDone(true);
      return;
    }
    let i = 0;
    const interval = window.setInterval(() => {
      i += 1;
      setTyped(DID_TEMPLATE.slice(0, i));
      if (i >= DID_TEMPLATE.length) {
        window.clearInterval(interval);
        setDone(true);
      }
    }, 38);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="account-auth__hero">
      <div className="account-auth__brand">
        <img src={helixMark} alt="" />
        <span className="account-auth__word">
          HELIX<span className="accent">ID</span>
        </span>
      </div>

      <div className="account-auth__copy">
        <div className="account-auth__eyebrow">Identity and authorization for AI agents</div>
        <h2 className="account-auth__headline">Give every agent a verifiable identity.</h2>
        <p className="account-auth__subhead">
          Issue scoped, revocable credentials to your AI agents and let any service verify them —
          delegation chains, audit trails and cryptographic proof instead of shared API keys.
        </p>

        <div className="did-seal" aria-hidden="true">
          <div className="did-seal__row">
            <span className="did-seal__ring" />
            <span className="did-seal__label">Your agent issuer DID</span>
          </div>
          <div className="did-seal__value">
            {typed}
            {!done && <span className="did-seal__cursor" />}
          </div>
          <div className="did-seal__foot">Signs every agent credential you issue. Verifiable anywhere.</div>
        </div>
      </div>

      <p className="account-auth__footnote">
        W3C DIDs and Verifiable Credentials. Open source and self-hosted.
      </p>
    </div>
  );
}
