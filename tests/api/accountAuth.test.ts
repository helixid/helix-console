// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

async function importAccountAuth() {
  vi.resetModules();
  return import('../../src/api/accountAuth');
}

describe('api/accountAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.__HELIXID_CONFIG__;
    vi.stubGlobal('fetch', fetchMock);
  });

  it('login posts email/password to /v1/auth/login', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        account: { id: 'acct:1', email: 'a@acme.example', issuerDid: null, hasPassword: true, hasGoogle: false, companyName: null, fieldOfOperation: null },
        accessToken: 'at_1',
        refreshToken: 'rt_1',
        expiresIn: 900,
      }),
    );
    const { accountAuth } = await importAccountAuth();

    const result = await accountAuth.login('a@acme.example', 'pw');

    expect(result.accessToken).toBe('at_1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/auth/login');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@acme.example', password: 'pw' });
  });

  it('login surfaces a server error message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'Invalid credentials' } }, 401));
    const { accountAuth } = await importAccountAuth();
    await expect(accountAuth.login('a@acme.example', 'wrong')).rejects.toThrow('Invalid credentials');
  });

  it('refresh posts the refresh token to /v1/auth/refresh', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: 'at_2', refreshToken: 'rt_2', expiresIn: 900 }));
    const { accountAuth } = await importAccountAuth();

    const result = await accountAuth.refresh('rt_1');

    expect(result.accessToken).toBe('at_2');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/auth/refresh');
    expect(JSON.parse(init.body as string)).toEqual({ refreshToken: 'rt_1' });
  });

  it('register omits companyName/fieldOfOperation when not provided', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        account: { id: 'acct:1', email: 'a@acme.example', issuerDid: null, hasPassword: true, hasGoogle: false, companyName: null, fieldOfOperation: null },
        accessToken: 'at_1',
        refreshToken: 'rt_1',
        expiresIn: 900,
      }),
    );
    const { accountAuth } = await importAccountAuth();
    await accountAuth.register('a@acme.example', 'pw');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.companyName).toBeUndefined();
    expect(body.fieldOfOperation).toBeUndefined();
  });

  it('googleSignInUrl builds an absolute URL to /v1/auth/google', async () => {
    window.__HELIXID_CONFIG__ = { API_BASE_URL: 'http://api.example' };
    const { accountAuth } = await importAccountAuth();
    expect(accountAuth.googleSignInUrl()).toBe('http://api.example/v1/auth/google');
  });

  it('falls back to a generic message when the error response has no JSON body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);
    const { accountAuth } = await importAccountAuth();
    await expect(accountAuth.login('a@acme.example', 'pw')).rejects.toThrow('status 500');
  });
});
