// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AccountLoginPage } from '../../../src/pages/account/AccountLoginPage';
import { AuthProvider } from '../../../src/auth/AuthContext';
import { accountAuth } from '../../../src/api/accountAuth';

vi.mock('../../../src/api/accountAuth', () => ({
  accountAuth: {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    googleSignInUrl: () => 'http://localhost/v1/auth/google',
  },
}));
const mocked = vi.mocked(accountAuth);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/account/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/account/login" element={<AccountLoginPage />} />
          <Route path="/agents" element={<div>Agents landing</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AccountLoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('signs in and stores the session, then navigates to /agents', async () => {
    mocked.login.mockResolvedValueOnce({
      account: {
        id: 'acct:1',
        email: 'founder@acme.example',
        issuerDid: 'did:web:x',
        hasPassword: true,
        hasGoogle: false,
        companyName: null,
        fieldOfOperation: null,
      },
      accessToken: 'at_1',
      refreshToken: 'rt_1',
      expiresIn: 900,
    });

    renderPage();
    await userEvent.type(screen.getByLabelText(/^email$/i), 'founder@acme.example');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'correct-horse-battery');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText('Agents landing')).toBeInTheDocument();
    expect(
      JSON.parse(sessionStorage.getItem('helixid.account.session') ?? '{}').accessToken,
    ).toBe('at_1');
  });

  it('shows an error on invalid credentials and does not store a session', async () => {
    mocked.login.mockRejectedValueOnce(new Error('Invalid email or password'));
    renderPage();
    await userEvent.type(screen.getByLabelText(/^email$/i), 'founder@acme.example');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i);
    expect(sessionStorage.getItem('helixid.account.session')).toBeNull();
  });

  it('links back to registration', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /create an account/i })).toBeInTheDocument();
  });
});
