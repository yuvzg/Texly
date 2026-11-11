import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtectedRoute, GuestOnlyRoute } from '@/components/auth/route-guards';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/protected-page',
  useSearchParams: () => new URLSearchParams(),
}));

interface MockAuthContextState {
  user: { id: string; email: string; name: string; emailVerified: boolean } | null;
  workspaces?: unknown[];
  settings?: unknown;
  plan?: string;
  status: string;
  isAuthenticated: boolean;
  isLoading: boolean;
}

let mockAuthContext: MockAuthContextState = {
  user: null,
  workspaces: [],
  settings: null,
  plan: 'FREE',
  status: 'unauthenticated',
  isAuthenticated: false,
  isLoading: false,
};

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuthContext,
}));

describe('Route Guards (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ProtectedRoute', () => {
    it('redirects to login when user is unauthenticated', () => {
      mockAuthContext = {
        user: null,
        status: 'unauthenticated',
        isAuthenticated: false,
        isLoading: false,
      };

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      expect(mockReplace).toHaveBeenCalledWith('/login?redirect=%2Fprotected-page');
    });

    it('renders protected content when user is authenticated', () => {
      mockAuthContext = {
        user: { id: 'user-1', email: 'user@texly.app', name: 'User 1', emailVerified: true },
        status: 'authenticated',
        isAuthenticated: true,
        isLoading: false,
      };

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('renders email verification required screen when requireVerified is true and email is unverified', () => {
      mockAuthContext = {
        user: { id: 'user-1', email: 'user@texly.app', name: 'User 1', emailVerified: false },
        status: 'authenticated',
        isAuthenticated: true,
        isLoading: false,
      };

      render(
        <ProtectedRoute requireVerified={true}>
          <div>Verified-Only Secret</div>
        </ProtectedRoute>,
      );

      expect(screen.queryByText('Verified-Only Secret')).not.toBeInTheDocument();
      expect(screen.getByText(/email verification required/i)).toBeInTheDocument();
    });
  });

  describe('GuestOnlyRoute', () => {
    it('renders guest children when unauthenticated', () => {
      mockAuthContext = {
        user: null,
        status: 'unauthenticated',
        isAuthenticated: false,
        isLoading: false,
      };

      render(
        <GuestOnlyRoute>
          <div>Guest Login Form</div>
        </GuestOnlyRoute>,
      );

      expect(screen.getByText('Guest Login Form')).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('redirects to /dashboard when user is already authenticated', () => {
      mockAuthContext = {
        user: { id: 'user-1', email: 'user@texly.app', name: 'User 1', emailVerified: true },
        status: 'authenticated',
        isAuthenticated: true,
        isLoading: false,
      };

      render(
        <GuestOnlyRoute>
          <div>Guest Login Form</div>
        </GuestOnlyRoute>,
      );

      expect(screen.queryByText('Guest Login Form')).not.toBeInTheDocument();
      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    });
  });
});
