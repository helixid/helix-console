// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AccountRegisterPage } from '../../../src/pages/account/AccountRegisterPage';
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
    <MemoryRouter initialEntries={['/account/register']}>
      <AuthProvider>
        <AccountRegisterPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AccountRegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('registers with only email/password (company fields are optional) and shows the issued DID', async () => {
    mocked.register.mockResolvedValueOnce({
      account: {
        id: 'acct:1',
        email: 'founder@acme.example',
        issuerDid: 'did:web:localhost%3A3000:accounts:acct:1',
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
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'correct-horse-battery');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(mocked.register).toHaveBeenCalledWith(
      'founder@acme.example',
      'correct-horse-battery',
      { companyName: undefined, fieldOfOperation: undefined },
    );
    expect(await screen.findByText(/did:web:localhost%3A3000:accounts:acct:1/i)).toBeInTheDocument();
    expect(
      JSON.parse(sessionStorage.getItem('helixid.account.session') ?? '{}').accessToken,
    ).toBe('at_1');
  });

  it('passes optional company details through when filled in', async () => {
    mocked.register.mockResolvedValueOnce({
      account: {
        id: 'acct:2',
        email: 'b@acme.example',
        issuerDid: 'did:web:x',
        hasPassword: true,
        hasGoogle: false,
        companyName: 'Acme Corp',
        fieldOfOperation: 'Logistics',
      },
      accessToken: 'at_2',
      refreshToken: 'rt_2',
      expiresIn: 900,
    });

    renderPage();
    await userEvent.type(screen.getByLabelText(/^email$/i), 'b@acme.example');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'correct-horse-battery');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'correct-horse-battery');
    await userEvent.type(screen.getByLabelText(/company name/i), 'Acme Corp');
    await userEvent.type(screen.getByLabelText(/field of operation/i), 'Logistics');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(mocked.register).toHaveBeenCalledWith(
      'b@acme.example',
      'correct-horse-battery',
      { companyName: 'Acme Corp', fieldOfOperation: 'Logistics' },
    );
  });

  it('rejects a password under 8 characters without calling the API', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/^email$/i), 'x@acme.example');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'short');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'short');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i);
    expect(mocked.register).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/^email$/i), 'x@acme.example');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'correct-horse-battery');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'something-else');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/don.t match/i);
    expect(mocked.register).not.toHaveBeenCalled();
  });

  it('surfaces a server error (e.g. duplicate email) without crashing', async () => {
    mocked.register.mockRejectedValueOnce(new Error('An account with this email already exists'));
    renderPage();
    await userEvent.type(screen.getByLabelText(/^email$/i), 'dupe@acme.example');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'correct-horse-battery');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'correct-horse-battery');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });
});
