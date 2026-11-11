'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore, type AuthStatus } from '@/stores/auth.store';
import type {
  UserSummaryDTO,
  AuthWorkspaceSummaryDTO,
  UserSettingsDTO,
  SubscriptionPlan,
  LoginRequest,
  RegisterRequest,
  UpdateUserRequest,
  UpdateUserSettingsRequest,
  AuthMeResponseData,
  AuthTokenResponseData,
  UserDTO,
} from '@texly/shared';

export interface AuthContextType {
  user: UserSummaryDTO | null;
  workspaces: AuthWorkspaceSummaryDTO[];
  settings: UserSettingsDTO | null;
  plan: SubscriptionPlan;
  status: AuthStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: (options?: { everywhere?: boolean }) => Promise<void>;
  refreshSession: () => Promise<boolean>;
  updateProfile: (data: UpdateUserRequest) => Promise<UserDTO>;
  updateUserSettings: (data: UpdateUserSettingsRequest) => Promise<UserSettingsDTO>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function AuthProviderInternal({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const {
    user,
    workspaces,
    settings,
    plan,
    status,
    error,
    setSession,
    updateUser,
    updateSettings,
    clearSession,
    setStatus,
    setError,
  } = useAuthStore();

  const [hasInitialized, setHasInitialized] = useState(false);

  const fetchCurrentUser = useCallback(async (): Promise<AuthMeResponseData | null> => {
    try {
      const data = await apiClient.get<AuthMeResponseData>('/auth/me');
      setSession({
        user: data.user,
        workspaces: data.workspaces,
        settings: data.settings,
        plan: data.plan,
      });
      return data;
    } catch {
      clearSession();
      return null;
    }
  }, [setSession, clearSession]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const token = await apiClient.refresh();
      if (!token) {
        clearSession();
        return false;
      }
      const me = await fetchCurrentUser();
      return me !== null;
    } catch {
      clearSession();
      return false;
    }
  }, [fetchCurrentUser, clearSession]);

  // Initial silent refresh to restore session on page reload/start
  useEffect(() => {
    let isMounted = true;
    async function init() {
      setStatus('loading');
      try {
        await refreshSession();
      } finally {
        if (isMounted) {
          setHasInitialized(true);
        }
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [refreshSession, setStatus]);

  const login = useCallback(
    async (credentials: LoginRequest): Promise<void> => {
      setError(null);
      const res = await apiClient.post<AuthTokenResponseData>('/auth/login', credentials);
      apiClient.setToken(res.accessToken);
      await fetchCurrentUser();
    },
    [fetchCurrentUser, setError],
  );

  const register = useCallback(
    async (data: RegisterRequest): Promise<void> => {
      setError(null);
      const res = await apiClient.post<AuthTokenResponseData>('/auth/register', data);
      apiClient.setToken(res.accessToken);
      await fetchCurrentUser();
    },
    [fetchCurrentUser, setError],
  );

  const logout = useCallback(
    async (options?: { everywhere?: boolean }): Promise<void> => {
      try {
        await apiClient.post('/auth/logout', options);
      } catch {
        // Even if logout fails on network, clear local state
      } finally {
        apiClient.setToken(null);
        clearSession();
        queryClient.clear();
      }
    },
    [clearSession, queryClient],
  );

  const updateProfile = useCallback(
    async (data: UpdateUserRequest): Promise<UserDTO> => {
      const updated = await apiClient.patch<UserDTO>('/users/me', data);
      updateUser({
        name: updated.name,
        avatarUrl: updated.avatarUrl,
      });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      return updated;
    },
    [updateUser, queryClient],
  );

  const updateUserSettings = useCallback(
    async (data: UpdateUserSettingsRequest): Promise<UserSettingsDTO> => {
      const updated = await apiClient.patch<UserSettingsDTO>('/users/me/settings', data);
      updateSettings(updated);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      return updated;
    },
    [updateSettings, queryClient],
  );

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      workspaces,
      settings,
      plan,
      status: !hasInitialized ? 'loading' : status,
      isAuthenticated: status === 'authenticated' && user !== null,
      isLoading: !hasInitialized || status === 'loading',
      error,
      login,
      register,
      logout,
      refreshSession,
      updateProfile,
      updateUserSettings,
    }),
    [
      user,
      workspaces,
      settings,
      plan,
      status,
      hasInitialized,
      error,
      login,
      register,
      logout,
      refreshSession,
      updateProfile,
      updateUserSettings,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProviderInternal>{children}</AuthProviderInternal>
    </QueryClientProvider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
