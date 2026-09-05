// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function headersOf(init: RequestInit | undefined): Headers {
  return new Headers(init?.headers);
}

async function importApi() {
  vi.resetModules();
  return import('../../src/api/client');
}

describe('api/client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.__HELIXID_CONFIG__;
    vi.unstubAllEnvs();
    vi.stubGlobal('fetch', fetchMock);
    sessionStorage.clear();
  });

  describe('hosted-account session auth', () => {
    const session = {
      account: { id: 'acct:1', email: 'a@acme.example', issuerDid: null, companyName: null, fieldOfOperation: null },
      accessToken: 'at_1',
      refreshToken: 'rt_1',
      expiresIn: 900,
    };

    it('sends the account bearer token instead of the admin key when a session is present', async () => {
      window.__HELIXID_CONFIG__ = { ADMIN_API_KEY: 'admin-key' };
      sessionStorage.setItem('helixid.account.session', JSON.stringify(session));
      fetchMock.mockResolvedValueOnce(jsonResponse([]));
      const { api } = await importApi();

      await api.listAgents();

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(headersOf(init).get('authorization')).toBe('Bearer at_1');
      expect(headersOf(init).get('x-admin-api-key')).toBeNull();
    });

    it('refreshes once on a 401 and retries the original request', async () => {
      sessionStorage.setItem('helixid.account.session', JSON.stringify(session));
      const { api } = await importApi();

      fetchMock
        .mockResolvedValueOnce(jsonResponse({ error: { message: 'expired' } }, 401))
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'at_2', refreshToken: 'rt_2', expiresIn: 900 }))
        .mockResolvedValueOnce(jsonResponse([{ vcId: 'vc:1' }]));

      await expect(api.listAgents()).resolves.toEqual([{ vcId: 'vc:1' }]);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      const refreshCall = fetchMock.mock.calls[1]?.[0] as string;
      expect(refreshCall).toContain('/v1/auth/refresh');
      const retryInit = fetchMock.mock.calls[2]?.[1] as RequestInit | undefined;
      expect(headersOf(retryInit).get('authorization')).toBe('Bearer at_2');
      expect(JSON.parse(sessionStorage.getItem('helixid.account.session') ?? '{}').accessToken).toBe(
        'at_2',
      );
    });

    it('clears the session and gives up if the refresh token is also rejected', async () => {
      sessionStorage.setItem('helixid.account.session', JSON.stringify(session));
      const { api } = await importApi();
      const assignSpy = vi.fn();
      vi.stubGlobal('location', { ...window.location, assign: assignSpy });

      fetchMock
        .mockResolvedValueOnce(jsonResponse({ error: { message: 'expired' } }, 401))
        .mockResolvedValueOnce(jsonResponse({ error: { message: 'invalid refresh token' } }, 401));

      await expect(api.listAgents()).rejects.toThrow();
      expect(sessionStorage.getItem('helixid.account.session')).toBeNull();
      expect(assignSpy).toHaveBeenCalledWith('/account/login');
    });
  });

  describe('configuration', () => {
    it('prefers runtime config injected via window.__HELIXID_CONFIG__', async () => {
      window.__HELIXID_CONFIG__ = {
        API_BASE_URL: 'http://runtime:4000',
        ADMIN_API_KEY: 'runtime-key',
      };
      fetchMock.mockResolvedValueOnce(jsonResponse([]));
      const { api } = await importApi();

      await api.listAgents({ status: 'active' });

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(fetchMock).toHaveBeenCalledWith(
        'http://runtime:4000/v1/vcs?status=active',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(headersOf(init).get('x-admin-api-key')).toBe('runtime-key');
    });

    it('falls back to VITE_* env vars for local dev', async () => {
      vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000');
      vi.stubEnv('VITE_ADMIN_API_KEY', 'dev-key');
      fetchMock.mockResolvedValueOnce(jsonResponse([]));
      const { api } = await importApi();

      await api.listAgents();

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4000/v1/vcs',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(headersOf(init).get('x-admin-api-key')).toBe('dev-key');
    });
  });

  describe('api surface', () => {
    it('listAgents calls GET /v1/vcs', async () => {
      const { api } = await importApi();
      const origin = window.location.origin;
      fetchMock.mockResolvedValueOnce(jsonResponse([{ vcId: 'vc:1' }]));

      await expect(api.listAgents({ status: 'active' })).resolves.toEqual([{ vcId: 'vc:1' }]);
      expect(fetchMock).toHaveBeenCalledWith(
        `${origin}/v1/vcs?status=active`,
        expect.objectContaining({ method: 'GET' }),
      );

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'list failed' } }),
      } as Response);
      await expect(api.listAgents()).rejects.toThrow('list failed');
    });

    it('getAgent calls GET /v1/vcs/:vcId', async () => {
      const { api } = await importApi();
      const origin = window.location.origin;
      fetchMock.mockResolvedValueOnce(jsonResponse({ vcId: 'vc:1' }));

      await expect(api.getAgent('vc:1')).resolves.toEqual({ vcId: 'vc:1' });
      expect(fetchMock).toHaveBeenCalledWith(
        `${origin}/v1/vcs/vc%3A1`,
        expect.objectContaining({ method: 'GET' }),
      );

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'not found' } }),
      } as Response);
      await expect(api.getAgent('vc:x')).rejects.toThrow('not found');
    });

    it('revokeAgent calls POST /v1/vcs/:vcId/revoke', async () => {
      const { api } = await importApi();
      const origin = window.location.origin;
      fetchMock.mockResolvedValueOnce(jsonResponse({ vcId: 'vc:1', revoked: true }));

      await expect(api.revokeAgent('vc:1')).resolves.toEqual({ vcId: 'vc:1', revoked: true });
      expect(fetchMock).toHaveBeenCalledWith(
        `${origin}/v1/vcs/vc%3A1/revoke`,
        expect.objectContaining({ method: 'POST' }),
      );

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: { message: 'already revoked' } }),
      } as Response);
      await expect(api.revokeAgent('vc:1')).rejects.toThrow('already revoked');
    });

    it('createEnrollmentToken calls POST /v1/enrollment-tokens', async () => {
      const { api } = await importApi();
      const origin = window.location.origin;
      const input = { agentName: 'billing', requestedScopes: ['read:orders'] };
      fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'enroll:abc', expiresAt: 'later' }));

      await expect(api.createEnrollmentToken(input)).resolves.toEqual({
        token: 'enroll:abc',
        expiresAt: 'later',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        `${origin}/v1/enrollment-tokens`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(input),
        }),
      );

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'bad scopes' } }),
      } as Response);
      await expect(api.createEnrollmentToken(input)).rejects.toThrow('bad scopes');
    });

    it('getAuditLog calls GET /v1/audit-log', async () => {
      const { api } = await importApi();
      const origin = window.location.origin;
      fetchMock.mockResolvedValueOnce(jsonResponse([{ id: '1' }]));

      await expect(api.getAuditLog({ limit: 20 })).resolves.toEqual([{ id: '1' }]);
      expect(fetchMock).toHaveBeenCalledWith(
        `${origin}/v1/audit-log?limit=20`,
        expect.objectContaining({ method: 'GET' }),
      );

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'audit down' } }),
      } as Response);
      await expect(api.getAuditLog()).rejects.toThrow('audit down');
    });
  });
});
