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
import { TexlyLogo } from '@/components/common/texly-logo';
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
  const [sidebarWidth, setSidebarWidth] = useState<number>(settings?.layout?.sidebarWidth || 280);
  const [pdfWidth, setPdfWidth] = useState<number>(settings?.layout?.pdfWidth || 500);

  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Logout state
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  useEffect(() => {
    if (settings) {
      setTheme((settings.theme as 'system' | 'light' | 'dark') || 'system');
      setEditorFontSize(settings.editorFontSize || 14);
      setKeymap((settings.keymap as 'default' | 'vim' | 'emacs') || 'default');
      setDefaultModelId(settings.defaultModelId || 'openai:gpt-4o');
      setAutoCompile(settings.autoCompile ?? false);
      if (settings.layout) {
        setSidebarWidth(settings.layout.sidebarWidth || 280);
        setPdfWidth(settings.layout.pdfWidth || 500);
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
        setSettingsError('Failed to update settings.');
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
      <div className="min-h-screen bg-[#050807] bg-texly-glow text-[#ECFDF5] flex flex-col">
        {/* Navigation Header */}
        <header className="h-16 border-b border-[#00D69A]/15 px-6 sm:px-8 flex items-center justify-between backdrop-blur-md bg-[#050807]/70 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 text-[#94A3B8] hover:text-white rounded-lg hover:bg-[#003D30]/40 transition-colors"
              title="Return to Dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <TexlyLogo size="sm" subtitle="Settings" />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-[#003D30] text-[#00D69A] border border-[#00D69A]/30 font-semibold flex items-center gap-1.5 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00D69A] animate-pulse" />
              Active
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-4xl mx-auto w-full space-y-8">
          {/* Profile Section */}
          <section className="bg-[#0A1310] rounded-2xl border border-[#00D69A]/20 p-6 sm:p-8 shadow-[0_0_30px_rgba(0,61,48,0.25)] space-y-6">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#00D69A]/15">
              <User className="h-5 w-5 text-[#00D69A]" />
              <h2 className="text-base font-bold text-white">Personal Information</h2>
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
                    className="w-full h-10 px-3 rounded-lg border border-[#00D69A]/20 bg-[#050807] text-[#ECFDF5] text-sm focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A]"
                  />
                </FormField>

                <FormField id="email" label="Email Address" hint="Email cannot be changed directly">
                  <input
                    id="email"
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full h-10 px-3 rounded-lg border border-[#00D69A]/10 bg-[#050807]/50 text-[#94A3B8] cursor-not-allowed text-sm"
                  />
                </FormField>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[#94A3B8]">Verification:</span>
                  {user?.emailVerified ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[#00D69A] bg-[#003D30]/60 px-2.5 py-0.5 rounded-full border border-[#00D69A]/30 font-medium">
                      <ShieldCheck className="h-3.5 w-3.5" /> Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-300 bg-amber-950/60 px-2.5 py-0.5 rounded-full border border-amber-800/60 font-medium">
                      <AlertCircle className="h-3.5 w-3.5" /> Unverified
                    </span>
                  )}
                </div>

                <Button type="submit" disabled={profileSaving} className="flex items-center gap-2">
                  {profileSaving && <Loader2 className="h-4 w-4 animate-spin text-[#050807]" />}
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </Button>
              </div>
            </form>
          </section>

          {/* Editor & Preferences Section */}
          <section className="bg-[#0A1310] rounded-2xl border border-[#00D69A]/20 p-6 sm:p-8 shadow-[0_0_30px_rgba(0,61,48,0.25)] space-y-6">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#00D69A]/15">
              <Sliders className="h-5 w-5 text-[#00D69A]" />
              <h2 className="text-base font-bold text-white">Editor & Interface Preferences</h2>
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
                    className="block text-xs font-medium text-white flex items-center gap-1.5"
                  >
                    <Palette className="h-3.5 w-3.5 text-[#00D69A]" /> Interface Theme
                  </label>
                  <select
                    id="theme"
                    value={theme}
                    onChange={(e) => {
                      const newT = e.target.value as 'system' | 'light' | 'dark';
                      setTheme(newT);
                      setGlobalTheme(newT);
                    }}
                    className="w-full h-10 px-3 rounded-lg border border-[#00D69A]/20 bg-[#050807] text-[#ECFDF5] text-sm focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A]"
                  >
                    <option value="dark">Texly Dark Emerald (Signature)</option>
                    <option value="system">System Default</option>
                    <option value="light">Light Theme</option>
                  </select>
                </div>

                {/* Editor Font Size */}
                <div className="space-y-1.5">
                  <label htmlFor="fontSize" className="block text-xs font-medium text-white">
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
                    className="w-full h-2 bg-[#003D30] rounded-lg appearance-none cursor-pointer accent-[#00D69A] mt-2"
                  />
                  <div className="flex justify-between text-[10px] text-[#94A3B8]">
                    <span>10px</span>
                    <span>14px (default)</span>
                    <span>32px</span>
                  </div>
                </div>

                {/* Keymap */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="keymap"
                    className="block text-xs font-medium text-white flex items-center gap-1.5"
                  >
                    <Terminal className="h-3.5 w-3.5 text-[#00D69A]" /> Keybinding Profile
                  </label>
                  <select
                    id="keymap"
                    value={keymap}
                    onChange={(e) => setKeymap(e.target.value as 'default' | 'vim' | 'emacs')}
                    className="w-full h-10 px-3 rounded-lg border border-[#00D69A]/20 bg-[#050807] text-[#ECFDF5] text-sm focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A]"
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
                    className="block text-xs font-medium text-white flex items-center gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[#00D69A]" /> Default AI Model
                  </label>
                  <select
                    id="model"
                    value={defaultModelId}
                    onChange={(e) => setDefaultModelId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[#00D69A]/20 bg-[#050807] text-[#ECFDF5] text-sm focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A]"
                  >
                    <option value="openai:gpt-4o">OpenAI GPT-4o (Default)</option>
                    <option value="anthropic:claude-3-5-sonnet">Anthropic Claude 3.5 Sonnet</option>
                    <option value="google:gemini-1.5-pro">Google Gemini 1.5 Pro</option>
                  </select>
                </div>
              </div>

              {/* Auto Compile Toggle */}
              <div className="flex items-center justify-between p-4 bg-[#08120F] rounded-xl border border-[#00D69A]/20">
                <div>
                  <h4 className="text-xs font-semibold text-white">Auto-compile on save</h4>
                  <p className="text-[11px] text-[#94A3B8]">
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
                  <div className="w-11 h-6 bg-[#003D30] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#00D69A] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-[#050807] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#003D30] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00D69A]"></div>
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
                    className="w-full h-10 px-3 rounded-lg border border-[#00D69A]/20 bg-[#050807] text-[#ECFDF5] text-sm focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A]"
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
                    className="w-full h-10 px-3 rounded-lg border border-[#00D69A]/20 bg-[#050807] text-[#ECFDF5] text-sm focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A]"
                  />
                </FormField>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={settingsSaving} className="flex items-center gap-2">
                  {settingsSaving && <Loader2 className="h-4 w-4 animate-spin text-[#050807]" />}
                  {settingsSaving ? 'Saving Preferences...' : 'Save Preferences'}
                </Button>
              </div>
            </form>
          </section>

          {/* Sessions & Security */}
          <section className="bg-[#0A1310] rounded-2xl border border-rose-900/30 p-6 sm:p-8 shadow-[0_0_30px_rgba(50,10,10,0.3)] space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-rose-900/20">
              <LogOut className="h-5 w-5 text-rose-400" />
              <h2 className="text-base font-bold text-white">Session Management</h2>
            </div>

            <p className="text-xs text-[#94A3B8] leading-relaxed">
              If you suspect unapproved access to your account or are on a public computer, you can
              log out from your current session or terminate all active sessions across all your
              devices.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => handleLogout(false)}
                disabled={loggingOut}
                className="flex items-center gap-2"
              >
                {loggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#00D69A]" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Log Out Current Session
              </Button>

              <Button
                variant="destructive"
                onClick={() => handleLogout(true)}
                disabled={loggingOut}
                className="flex items-center gap-2"
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
