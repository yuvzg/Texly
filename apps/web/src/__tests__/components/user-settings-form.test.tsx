import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserSettingsPage from '@/app/dashboard/settings/page';
import type { UserSummaryDTO, UserSettingsDTO } from '@texly/shared';

const mockPush = vi.fn();
const mockUpdateProfile = vi.fn();
const mockUpdateUserSettings = vi.fn();
const mockLogout = vi.fn();

const mockUser: UserSummaryDTO = {
  id: '0194eb38-0000-7000-8000-000000000001',
  name: 'Ada Lovelace',
  email: 'ada@texly.app',
  avatarUrl: null,
  emailVerified: true,
};

const mockSettings: UserSettingsDTO = {
  userId: '0194eb38-0000-7000-8000-000000000001',
  theme: 'system',
  editorFontSize: 14,
  keymap: 'default',
  defaultModelId: 'openai:gpt-4o',
  autoCompile: false,
  layout: {
    sidebarWidth: 280,
    pdfWidth: 500,
  },
  updatedAt: new Date().toISOString(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/dashboard/settings',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    user: mockUser,
    workspaces: [],
    settings: mockSettings,
    plan: 'FREE',
    status: 'authenticated',
    isAuthenticated: true,
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: mockLogout,
    refreshSession: vi.fn(),
    updateProfile: mockUpdateProfile,
    updateUserSettings: mockUpdateUserSettings,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('UserSettingsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user details and all settings controls', () => {
    render(<UserSettingsPage />);

    expect(screen.getByRole('heading', { name: /personal information/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ada@texly.app')).toBeDisabled();
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
    expect(screen.getByText(/plan: free/i)).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: /editor & interface preferences/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/interface theme/i)).toHaveValue('system');
    expect(screen.getByLabelText(/editor font size/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/keybinding profile/i)).toHaveValue('default');
    expect(screen.getByLabelText(/default ai model/i)).toHaveValue('openai:gpt-4o');
  });

  it('updates profile name and displays success feedback', async () => {
    const user = userEvent.setup();
    mockUpdateProfile.mockResolvedValueOnce({
      ...mockUser,
      name: 'Augusta Ada King',
    });

    render(<UserSettingsPage />);

    const nameInput = screen.getByLabelText(/full name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Augusta Ada King');
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ name: 'Augusta Ada King' });
      expect(screen.getByText(/profile information updated successfully/i)).toBeInTheDocument();
    });
  });

  it('updates preferences and triggers updateUserSettings', async () => {
    const user = userEvent.setup();
    mockUpdateUserSettings.mockResolvedValueOnce({
      ...mockSettings,
      theme: 'dark',
      keymap: 'vim',
      autoCompile: true,
    });

    render(<UserSettingsPage />);

    // Change theme to dark
    await user.selectOptions(screen.getByLabelText(/interface theme/i), 'dark');
    // Change keymap to vim
    await user.selectOptions(screen.getByLabelText(/keybinding profile/i), 'vim');
    // Toggle auto-compile
    const autoCompileToggle = screen.getByRole('checkbox', { hidden: true });
    await user.click(autoCompileToggle);

    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(mockUpdateUserSettings).toHaveBeenCalledWith({
        theme: 'dark',
        editorFontSize: 14,
        keymap: 'vim',
        defaultModelId: 'openai:gpt-4o',
        autoCompile: true,
        layout: {
          sidebarWidth: 280,
          pdfWidth: 500,
        },
      });
      expect(screen.getByText(/preferences saved successfully/i)).toBeInTheDocument();
    });
  });

  it('handles session logout from all devices', async () => {
    const user = userEvent.setup();
    mockLogout.mockResolvedValueOnce(undefined);

    render(<UserSettingsPage />);

    const logoutAllBtn = screen.getByRole('button', { name: /log out from all devices/i });
    await user.click(logoutAllBtn);

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledWith({ everywhere: true });
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });
});
