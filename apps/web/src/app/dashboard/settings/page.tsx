'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  User,
  ShieldCheck,
  AlertCircle,
  Loader2,
  LogOut,
  Sliders,
  Sparkles,
  Palette,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthAlert, FormField } from '@/components/auth/auth-ui';
import { ProtectedRoute } from '@/components/auth/route-guards';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';
import { UpdateUserRequestSchema, UpdateUserSettingsRequestSchema } from '@texly/shared';
import { ApiClientError } from '@/lib/api-client';

export default function UserSettingsPage() {
  const router = useRouter();
  const { user, settings, plan, updateProfile, updateUserSettings, logout } = useAuth();
  const { setTheme: setGlobalTheme } = useTheme();

  // Profile Form state
  const [name, setName] = useState(user?.name || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Settings Form state
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(
    (settings?.theme as 'system' | 'light' | 'dark') || 'system',
  );
  const [editorFontSize, setEditorFontSize] = useState<number>(settings?.editorFontSize || 14);
  const [keymap, setKeymap] = useState<'default' | 'vim' | 'emacs'>(
    (settings?.keymap as 'default' | 'vim' | 'emacs') || 'default',
  );
  const [defaultModelId, setDefaultModelId] = useState<string>(
    settings?.defaultModelId || 'openai:gpt-4o',
  );
  const [autoCompile, setAutoCompile] = useState<boolean>(settings?.autoCompile ?? false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    (settings?.layout?.sidebarWidth as number) || 280,
  );
  const [pdfWidth, setPdfWidth] = useState<number>((settings?.layout?.pdfWidth as number) || 500);

  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [loggingOut, setLoggingOut] = useState(false);

  // Sync state if settings or user load asynchronously
  useEffect(() => {
    if (user) {
      setName(user.name);
    }
  }, [user]);

  useEffect(() => {
    if (settings) {
      setTheme((settings.theme as 'system' | 'light' | 'dark') || 'system');
      setEditorFontSize(settings.editorFontSize || 14);
      setKeymap((settings.keymap as 'default' | 'vim' | 'emacs') || 'default');
      setDefaultModelId(settings.defaultModelId || 'openai:gpt-4o');
      setAutoCompile(settings.autoCompile ?? false);
      if (settings.layout) {
        if (typeof settings.layout.sidebarWidth === 'number') {
          setSidebarWidth(settings.layout.sidebarWidth);
        }
        if (typeof settings.layout.pdfWidth === 'number') {
          setPdfWidth(settings.layout.pdfWidth);
        }
      }
    }
  }, [settings]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);

    const validation = UpdateUserRequestSchema.safeParse({ name });
    if (!validation.success) {
      setProfileError(validation.error.issues[0]?.message || 'Invalid name provided.');
      return;
    }

    setProfileSaving(true);
    try {
      await updateProfile(validation.data);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setProfileError(err.message);
      } else {
        setProfileError('Failed to update profile. Please try again.');
      }
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSuccess(false);

    const payload = {
      theme,
      editorFontSize: Number(editorFontSize),
      keymap,
      defaultModelId,
      autoCompile,
      layout: {
        sidebarWidth: Number(sidebarWidth),
        pdfWidth: Number(pdfWidth),
      },
    };

    const validation = UpdateUserSettingsRequestSchema.safeParse(payload);
    if (!validation.success) {
      setSettingsError(validation.error.issues[0]?.message || 'Invalid settings values.');
      return;
    }

    setSettingsSaving(true);
    try {
      await updateUserSettings(validation.data);
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setSettingsError(err.message);
      } else {
        setSettingsError('Failed to save settings.');
      }
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleLogout = async (everywhere = false) => {
    setLoggingOut(true);
    try {
      await logout({ everywhere });
      router.push('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="h-16 border-b border-gray-200 bg-white px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-none">Account Settings</h1>
              <span className="text-[11px] text-gray-500">
                Manage your profile and editor preferences
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-8">
          {/* Profile Section */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-5">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
              <User className="h-5 w-5 text-blue-600" />
              <h2 className="text-base font-bold text-gray-900">Personal Information</h2>
            </div>

            {profileError && <AuthAlert variant="error" message={profileError} />}
            {profileSuccess && (
              <AuthAlert variant="success" message="Profile information updated successfully." />
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField id="name" label="Full Name">
                  <input
                    id="name"
                    type="text"
                    value={name}
                    disabled={profileSaving}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </FormField>

                <FormField id="email" label="Email Address" hint="Email cannot be changed directly">
                  <input
                    id="email"
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-3 py-2 text-sm border rounded-md border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                </FormField>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Verification status:</span>
                  {user?.emailVerified ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200 font-medium">
                      <ShieldCheck className="h-3.5 w-3.5" /> Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                      <AlertCircle className="h-3.5 w-3.5" /> Unverified
                    </span>
                  )}
                  <span className="inline-flex items-center text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-medium">
                    Plan: {plan}
                  </span>
                </div>

                <Button type="submit" disabled={profileSaving} className="flex items-center gap-2">
                  {profileSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </Button>
              </div>
            </form>
          </section>

          {/* Editor & Preferences Section */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-6">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
              <Sliders className="h-5 w-5 text-blue-600" />
              <h2 className="text-base font-bold text-gray-900">Editor & Interface Preferences</h2>
            </div>

            {settingsError && <AuthAlert variant="error" message={settingsError} />}
            {settingsSuccess && (
              <AuthAlert variant="success" message="Preferences saved successfully." />
            )}

            <form onSubmit={handleSettingsSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Theme */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="theme"
                    className="block text-xs font-medium text-gray-700 flex items-center gap-1.5"
                  >
                    <Palette className="h-3.5 w-3.5 text-gray-400" /> Interface Theme
                  </label>
                  <select
                    id="theme"
                    value={theme}
                    onChange={(e) => {
                      const newT = e.target.value as 'system' | 'light' | 'dark';
                      setTheme(newT);
                      setGlobalTheme(newT);
                    }}
                    className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="system">System Default</option>
                    <option value="light">Light Theme</option>
                    <option value="dark">Dark Theme</option>
                  </select>
                </div>

                {/* Editor Font Size */}
                <div className="space-y-1.5">
                  <label htmlFor="fontSize" className="block text-xs font-medium text-gray-700">
                    Editor Font Size ({editorFontSize}px)
                  </label>
                  <input
                    id="fontSize"
                    type="range"
                    min="10"
                    max="32"
                    step="1"
                    value={editorFontSize}
                    onChange={(e) => setEditorFontSize(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-2"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>10px</span>
                    <span>14px (default)</span>
                    <span>32px</span>
                  </div>
                </div>

                {/* Keymap */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="keymap"
                    className="block text-xs font-medium text-gray-700 flex items-center gap-1.5"
                  >
                    <Terminal className="h-3.5 w-3.5 text-gray-400" /> Keybinding Profile
                  </label>
                  <select
                    id="keymap"
                    value={keymap}
                    onChange={(e) => setKeymap(e.target.value as 'default' | 'vim' | 'emacs')}
                    className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="default">Default (Standard)</option>
                    <option value="vim">Vim</option>
                    <option value="emacs">Emacs</option>
                  </select>
                </div>

                {/* Default AI Model */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="model"
                    className="block text-xs font-medium text-gray-700 flex items-center gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-gray-400" /> Default AI Model
                  </label>
                  <select
                    id="model"
                    value={defaultModelId}
                    onChange={(e) => setDefaultModelId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="openai:gpt-4o">OpenAI GPT-4o (Default)</option>
                    <option value="anthropic:claude-3-5-sonnet">Anthropic Claude 3.5 Sonnet</option>
                    <option value="google:gemini-1.5-pro">Google Gemini 1.5 Pro</option>
                  </select>
                </div>
              </div>

              {/* Auto Compile Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-lg border border-gray-200">
                <div>
                  <h4 className="text-xs font-semibold text-gray-900">Auto-compile on save</h4>
                  <p className="text-[11px] text-gray-500">
                    Automatically trigger LaTeX compilation when document changes are saved
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCompile}
                    onChange={(e) => setAutoCompile(e.target.checked)}
                    className="sr-only peer"
                    id="autoCompile"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Layout Dimensions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField id="sidebarWidth" label="Sidebar Width (px)" hint="Default: 280">
                  <input
                    id="sidebarWidth"
                    type="number"
                    min="150"
                    max="600"
                    value={sidebarWidth}
                    onChange={(e) => setSidebarWidth(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </FormField>

                <FormField id="pdfWidth" label="PDF Viewer Width (px)" hint="Default: 500">
                  <input
                    id="pdfWidth"
                    type="number"
                    min="250"
                    max="1200"
                    value={pdfWidth}
                    onChange={(e) => setPdfWidth(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </FormField>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={settingsSaving} className="flex items-center gap-2">
                  {settingsSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {settingsSaving ? 'Saving Preferences...' : 'Save Preferences'}
                </Button>
              </div>
            </form>
          </section>

          {/* Sessions & Security */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
              <LogOut className="h-5 w-5 text-red-600" />
              <h2 className="text-base font-bold text-gray-900">Session Management</h2>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              If you suspect unapproved access to your account or are on a public computer, you can
              log out from your current session or terminate all active sessions across all your
              devices.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => handleLogout(false)}
                disabled={loggingOut}
                className="flex items-center gap-2 text-gray-700"
              >
                {loggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Log Out Current Session
              </Button>

              <Button
                variant="destructive"
                onClick={() => handleLogout(true)}
                disabled={loggingOut}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white"
              >
                {loggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Log Out From All Devices
              </Button>
            </div>
          </section>
        </main>
      </div>
    </ProtectedRoute>
  );
}
