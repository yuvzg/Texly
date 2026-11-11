import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/(auth)/login/page';
import { ApiClientError } from '@/lib/api-client';
import { ErrorCodeEnum } from '@texly/shared';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/login',
  useSearchParams: () => mockSearchParams,
}));

const mockLogin = vi.fn();

// Mock useAuth
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
    login: mockLogin,
    register: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
    updateProfile: vi.fn(),
    updateUserSettings: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('LoginPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('renders login form fields, labels and buttons', () => {
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: /sign in to your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/register');
  });

  it('validates required fields and email format', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitBtn);

    // Validation error messages should be displayed
    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    });
    expect(mockLogin).not.toHaveBeenCalled();

    // Type invalid email
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'not-an-email');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    });
  });

  it('toggles password visibility when eye icon is clicked', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const passwordInput = screen.getByPlaceholderText('••••••••');
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleBtn = screen.getByRole('button', { name: /show password/i });
    await user.click(toggleBtn);

    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('submits valid credentials and redirects to intended destination', async () => {
    const user = userEvent.setup();
    mockSearchParams = new URLSearchParams('redirect=/workspace');
    mockLogin.mockResolvedValueOnce(undefined);

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'alice@texly.app');
    await user.type(screen.getByPlaceholderText('••••••••'), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'alice@texly.app',
        password: 'Password123!',
      });
      expect(mockReplace).toHaveBeenCalledWith('/workspace');
    });
  });

  it('displays API error alert when credentials are invalid', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(
      new ApiClientError(
        401,
        ErrorCodeEnum.INVALID_CREDENTIALS,
        'Invalid email address or password.',
      ),
    );

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'wrong@texly.app');
    await user.type(screen.getByPlaceholderText('••••••••'), 'WrongPassword123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid email address or password/i);
    });
  });

  it('displays rate limiting error alert when rate limited', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(
      new ApiClientError(429, ErrorCodeEnum.RATE_LIMITED, 'Too many failed attempts.'),
    );

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'rate@texly.app');
    await user.type(screen.getByPlaceholderText('••••••••'), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/too many failed attempts/i);
    });
  });
});
