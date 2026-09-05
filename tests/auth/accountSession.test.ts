// Copyright 2026 DgVerse LLP
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearAccountSession,
  getAccountSession,
  setAccountSession,
} from '../../src/auth/accountSession';

describe('auth/accountSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(getAccountSession()).toBeNull();
  });

  it('round-trips a session through sessionStorage', () => {
    const session = {
      account: { id: 'acct:1', email: 'a@acme.example', issuerDid: null, companyName: 'Acme', fieldOfOperation: null },
      accessToken: 'at_1',
      refreshToken: 'rt_1',
      expiresIn: 900,
    };
    setAccountSession(session);
    expect(getAccountSession()).toEqual(session);
  });

  it('clears the stored session', () => {
    setAccountSession({
      account: { id: 'acct:1', email: 'a@acme.example', issuerDid: null, companyName: null, fieldOfOperation: null },
      accessToken: 'at_1',
      refreshToken: 'rt_1',
      expiresIn: 900,
    });
    clearAccountSession();
    expect(getAccountSession()).toBeNull();
  });

  it('returns null instead of throwing on malformed stored JSON', () => {
    sessionStorage.setItem('helixid.account.session', '{not json');
    expect(getAccountSession()).toBeNull();
  });
});
