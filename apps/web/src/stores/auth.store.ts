import { create } from 'zustand';
import type {
  UserSummaryDTO,
  AuthWorkspaceSummaryDTO,
  UserSettingsDTO,
  SubscriptionPlan,
} from '@texly/shared';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  user: UserSummaryDTO | null;
  workspaces: AuthWorkspaceSummaryDTO[];
  settings: UserSettingsDTO | null;
  plan: SubscriptionPlan;
  status: AuthStatus;
  error: string | null;

  setSession: (params: {
    user: UserSummaryDTO;
    workspaces: AuthWorkspaceSummaryDTO[];
    settings: UserSettingsDTO;
    plan?: SubscriptionPlan;
  }) => void;
  updateUser: (partial: Partial<UserSummaryDTO>) => void;
  updateSettings: (partial: Partial<UserSettingsDTO>) => void;
  clearSession: () => void;
  setStatus: (status: AuthStatus) => void;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  workspaces: [],
  settings: null,
  plan: 'FREE',
  status: 'idle',
  error: null,

  setSession: ({ user, workspaces, settings, plan = 'FREE' }) =>
    set({
      user,
      workspaces,
      settings,
      plan,
      status: 'authenticated',
      error: null,
    }),

  updateUser: (partial) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...partial } : null,
    })),

  updateSettings: (partial) =>
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...partial } : null,
    })),

  clearSession: () =>
    set({
      user: null,
      workspaces: [],
      settings: null,
      plan: 'FREE',
      status: 'unauthenticated',
      error: null,
    }),

  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
}));
