import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerifyEmailPage from '@/app/(auth)/verify-email/page';
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
  usePathname: () => '/verify-email',
  useSearchParams: () => mockSearchParams,
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
    ) {
      super(message);
      this.name = 'ApiClientError';
    }
  },
}));

describe('VerifyEmailPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('automatically verifies email when token is in URL query', async () => {
    mockSearchParams = new URLSearchParams('token=verify-token-xyz');
    vi.mocked(apiClient.post).mockResolvedValueOnce({ verified: true });

    render(<VerifyEmailPage />);

    expect(screen.getByText(/verifying your email address/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/auth/verify-email', {
        token: 'verify-token-xyz',
      });
      expect(screen.getByText(/email verified!/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /go to dashboard/i })).toHaveAttribute(
        'href',
        '/dashboard',
      );
    });
  });

  it('shows error state when verification token is invalid or expired', async () => {
    mockSearchParams = new URLSearchParams('token=expired-token-xyz');
    vi.mocked(apiClient.post).mockRejectedValueOnce(
      new ApiClientError(400, ErrorCodeEnum.TOKEN_INVALID, 'Token is invalid.'),
    );

    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid or has expired/i);
      expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute(
        'href',
        '/login',
      );
    });
  });

  it('allows manual token submission when visited without query parameter', async () => {
    mockSearchParams = new URLSearchParams();
    vi.mocked(apiClient.post).mockResolvedValueOnce({ verified: true });

    const user = userEvent.setup();
    render(<VerifyEmailPage />);

    expect(screen.getByLabelText(/verification token/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/verification token/i), 'manual-token-123');
    await user.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/auth/verify-email', {
        token: 'manual-token-123',
      });
      expect(screen.getByText(/email verified!/i)).toBeInTheDocument();
    });
  });
});
