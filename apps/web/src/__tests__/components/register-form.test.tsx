import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from '@/app/(auth)/register/page';
import { ApiClientError } from '@/lib/api-client';
import { ErrorCodeEnum } from '@texly/shared';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/register',
  useSearchParams: () => new URLSearchParams(),
}));

const mockRegister = vi.fn();

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    user: null,
    workspaces: [],
    settings: null,
    plan: 'FREE',
    status: 'unauthenticated',
    isAuthenticated: false,
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: mockRegister,
    logout: vi.fn(),
    refreshSession: vi.fn(),
    updateProfile: vi.fn(),
    updateUserSettings: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('RegisterPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders registration form fields and hints', () => {
    render(<RegisterPage />);

    expect(screen.getByRole('heading', { name: /create an account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByText(/must be at least 10 characters long/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  it('enforces validation for minimum password length', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/email/i), 'ada@texly.app');
    await user.type(screen.getByLabelText(/^password$/i), 'short99');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/10/i)).toBeInTheDocument();
    });
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('submits valid registration data and redirects', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValueOnce(undefined);

    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/email/i), 'ada@texly.app');
    await user.type(screen.getByLabelText(/^password$/i), 'SuperSecurePassword123!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        name: 'Ada Lovelace',
        email: 'ada@texly.app',
        password: 'SuperSecurePassword123!',
      });
      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('handles email already registered error', async () => {
    const user = userEvent.setup();
    mockRegister.mockRejectedValueOnce(
      new ApiClientError(
        409,
        ErrorCodeEnum.EMAIL_TAKEN,
        'An account with this email address already exists.',
      ),
    );

    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/email/i), 'taken@texly.app');
    await user.type(screen.getByLabelText(/^password$/i), 'SuperSecurePassword123!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
    });
  });

  it('handles breached password error alert', async () => {
    const user = userEvent.setup();
    mockRegister.mockRejectedValueOnce(
      new ApiClientError(
        422,
        'PASSWORD_BREACHED',
        'This password was found in a public data breach. Please choose a different, more secure password.',
      ),
    );

    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/email/i), 'ada@texly.app');
    await user.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/data breach/i);
    });
  });
});
