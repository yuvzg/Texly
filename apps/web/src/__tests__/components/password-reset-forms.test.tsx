import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgotPasswordPage from '@/app/(auth)/forgot-password/page';
import ResetPasswordPage from '@/app/(auth)/reset-password/page';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { ErrorCodeEnum } from '@texly/shared';

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/reset-password',
  useSearchParams: () => mockSearchParams,
}));

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
    register: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
    updateProfile: vi.fn(),
    updateUserSettings: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
      public details?: unknown,
    ) {
      super(message);
      this.name = 'ApiClientError';
    }
  },
}));

describe('ForgotPasswordPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email input and sends reset link', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValueOnce({ message: 'Reset email sent' });

    render(<ForgotPasswordPage />);

    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'someone@texly.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/auth/forgot-password', {
        email: 'someone@texly.app',
      });
      expect(screen.getByText(/if an account exists for this email address/i)).toBeInTheDocument();
    });
  });

  it('validates invalid email format', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'invalid-email');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams('token=valid-reset-token-123');
  });

  it('shows missing token error if no token is provided in URL', () => {
    mockSearchParams = new URLSearchParams();
    render(<ResetPasswordPage />);

    expect(screen.getByText(/no password reset token was found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request new reset link/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('enforces matching passwords', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/^new password/i), 'NewPassword123!');
    await user.type(screen.getByLabelText(/confirm new password/i), 'DifferentPassword456!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('resets password successfully and displays success screen', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValueOnce({ message: 'Password updated' });

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/^new password/i), 'NewBrandPassword123!');
    await user.type(screen.getByLabelText(/confirm new password/i), 'NewBrandPassword123!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/auth/reset-password', {
        token: 'valid-reset-token-123',
        password: 'NewBrandPassword123!',
      });
      expect(screen.getByText(/password reset successful/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /sign in with new password/i })).toHaveAttribute(
        'href',
        '/login',
      );
    });
  });

  it('handles expired or invalid reset token error', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockRejectedValueOnce(
      new ApiClientError(400, ErrorCodeEnum.TOKEN_EXPIRED, 'Reset token has expired.'),
    );

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/^new password/i), 'NewBrandPassword123!');
    await user.type(screen.getByLabelText(/confirm new password/i), 'NewBrandPassword123!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid or has expired/i);
    });
  });
});
