import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { apiClient, setAccessToken } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const mockUser = {
  id: '0194eb38-0000-7000-8000-000000000001',
  name: 'Ada Lovelace',
  email: 'ada@texly.app',
  avatarUrl: null,
  emailVerified: true,
};

const mockSettings = {
  userId: '0194eb38-0000-7000-8000-000000000001',
  theme: 'system' as const,
  editorFontSize: 14,
  keymap: 'default' as const,
  defaultModelId: 'openai:gpt-4o',
  autoCompile: false,
  layout: { sidebarWidth: 280, pdfWidth: 500 },
  updatedAt: new Date().toISOString(),
};

const mockWorkspaces = [
  {
    id: '0194eb38-0000-7000-8000-000000000002',
    name: 'Personal Workspace',
    slug: 'personal',
    role: 'OWNER' as const,
    isPersonal: true,
  },
];

describe('AuthProvider Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearSession();
    setAccessToken(null);
  });

  it('restores authenticated session on initial mount via silent refresh', async () => {
    vi.spyOn(apiClient, 'refresh').mockResolvedValueOnce('initial-access-token');
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      user: mockUser,
      workspaces: mockWorkspaces,
      settings: mockSettings,
      plan: 'FREE',
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe('authenticated');
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.email).toBe('ada@texly.app');
      expect(result.current.settings?.editorFontSize).toBe(14);
    });
  });

  it('handles login mutation and stores session in memory', async () => {
    vi.spyOn(apiClient, 'refresh').mockResolvedValueOnce(null);

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      accessToken: 'login-token-123',
      user: mockUser,
      expiresIn: 900,
    });

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      user: mockUser,
      workspaces: mockWorkspaces,
      settings: mockSettings,
      plan: 'FREE',
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
    });

    await act(async () => {
      await result.current.login({
        email: 'ada@texly.app',
        password: 'SuperPassword123!',
      });
    });

    expect(postSpy).toHaveBeenCalledWith('/auth/login', {
      email: 'ada@texly.app',
      password: 'SuperPassword123!',
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.name).toBe('Ada Lovelace');
  });

  it('handles logout and clears in-memory state', async () => {
    useAuthStore.getState().setSession({
      user: mockUser,
      workspaces: mockWorkspaces,
      settings: mockSettings,
    });
    setAccessToken('active-token');

    vi.spyOn(apiClient, 'refresh').mockResolvedValueOnce('active-token');
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      user: mockUser,
      workspaces: mockWorkspaces,
      settings: mockSettings,
      plan: 'FREE',
    });

    const logoutSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(undefined);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(logoutSpy).toHaveBeenCalledWith('/auth/logout', undefined);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(apiClient.getToken()).toBeNull();
  });

  it('updates profile and user settings through mutations', async () => {
    useAuthStore.getState().setSession({
      user: mockUser,
      workspaces: mockWorkspaces,
      settings: mockSettings,
    });

    vi.spyOn(apiClient, 'refresh').mockResolvedValueOnce('active-token');
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      user: mockUser,
      workspaces: mockWorkspaces,
      settings: mockSettings,
      plan: 'FREE',
    });

    vi.spyOn(apiClient, 'patch').mockImplementation(async (path, _data) => {
      if (path === '/users/me') {
        return {
          ...mockUser,
          name: 'Ada Lovelace King',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          plan: 'FREE',
        };
      }
      if (path === '/users/me/settings') {
        return {
          ...mockSettings,
          theme: 'dark',
          editorFontSize: 16,
        };
      }
      throw new Error(`Unexpected path ${path}`);
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    // Update profile
    await act(async () => {
      await result.current.updateProfile({ name: 'Ada Lovelace King' });
    });
    expect(result.current.user?.name).toBe('Ada Lovelace King');

    // Update settings
    await act(async () => {
      await result.current.updateUserSettings({ theme: 'dark', editorFontSize: 16 });
    });
    expect(result.current.settings?.theme).toBe('dark');
    expect(result.current.settings?.editorFontSize).toBe(16);
  });
});
