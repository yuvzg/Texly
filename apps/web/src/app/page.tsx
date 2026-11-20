'use client';

import React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Terminal,
  ShieldCheck,
  FileCode2,
  Cpu,
  Layers,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TexlyLogo } from '@/components/common/texly-logo';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#050807] bg-texly-glow text-[#ECFDF5] flex flex-col relative overflow-hidden">
      {/* Ambient background glow orbs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#003D30]/25 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[400px] h-[400px] bg-[#00D69A]/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="h-18 border-b border-[#00D69A]/15 px-6 sm:px-12 flex items-center justify-between z-20 backdrop-blur-md bg-[#050807]/70 sticky top-0">
        <TexlyLogo size="md" subtitle="LaTeX Editor" />

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#94A3B8]">
          <Link href="#features" className="hover:text-[#00D69A] transition-colors">
            Features
          </Link>
          <Link href="#architecture" className="hover:text-[#00D69A] transition-colors">
            Architecture
          </Link>
          <Link href="#security" className="hover:text-[#00D69A] transition-colors">
            Security
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm" className="text-xs sm:text-sm">
              Get Started <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 max-w-5xl mx-auto px-6 pt-16 sm:pt-24 pb-16 flex flex-col items-center text-center z-10">
        {/* Pill Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#003D30]/60 border border-[#00D69A]/30 text-[#00D69A] text-xs font-semibold mb-8 shadow-[0_0_15px_rgba(0,214,154,0.15)] animate-pulse">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Collaborative LaTeX Architecture</span>
        </div>

        {/* Hero Headline */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.18] font-display">
          Draft{' '}
          <span className="font-mono font-bold text-[#ECFDF5] tracking-normal px-2.5 py-1 rounded-xl bg-[#003D30]/70 border border-[#00D69A]/30 text-3xl sm:text-5xl mx-1 align-middle shadow-[0_0_15px_rgba(0,214,154,0.15)]">
            LaTeX
          </span>{' '}
          with{' '}
          <span className="font-heading italic text-transparent bg-clip-text bg-gradient-to-r from-[#00D69A] via-[#A7F3D0] to-[#00D69A]">
            Precision
          </span>{' '}
          & Controlled AI
        </h1>

        <p className="mt-6 text-base sm:text-xl text-[#94A3B8] max-w-2xl leading-relaxed">
          Texly brings isolated Docker sandboxing, deterministic TeX Live builds, and transparent AI
          proposals into a sleek, dark emerald workspace.
        </p>

        {/* Action Buttons */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 w-full sm:w-auto">
          <Link href="/register" className="w-full sm:w-auto">
            <Button
              size="lg"
              className="w-full sm:w-auto text-base flex items-center justify-center gap-2"
            >
              Start Writing <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto text-base">
              Open Dashboard
            </Button>
          </Link>
        </div>

        {/* Architecture & Feature Cards */}
        <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 w-full text-left">
          <div className="p-6 rounded-2xl bg-[#0A1310] border border-[#00D69A]/20 shadow-[0_0_20px_rgba(0,61,48,0.3)] hover:border-[#00D69A]/40 transition-all group">
            <div className="h-10 w-10 rounded-xl bg-[#003D30] text-[#00D69A] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Terminal className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Isolated Sandboxes</h3>
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              Every compile executes in a dedicated, hardened container with read-only rootfs,
              dropped capabilities, and strict CPU & memory caps.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0A1310] border border-[#00D69A]/20 shadow-[0_0_20px_rgba(0,61,48,0.3)] hover:border-[#00D69A]/40 transition-all group">
            <div className="h-10 w-10 rounded-xl bg-[#003D30] text-[#00D69A] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">AI Proposals</h3>
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              AI suggests targeted LaTeX edits with visual side-by-side diffs. You inspect, accept,
              or reject before anything touches your project.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0A1310] border border-[#00D69A]/20 shadow-[0_0_20px_rgba(0,61,48,0.3)] hover:border-[#00D69A]/40 transition-all group">
            <div className="h-10 w-10 rounded-xl bg-[#003D30] text-[#00D69A] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Multi-Tenant Isolation</h3>
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              True tenant isolation with distinct workspaces, row-level PostgreSQL security, and
              cryptographic SHA-256 asset tracking.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#00D69A]/15 py-8 px-6 sm:px-12 text-xs text-[#94A3B8] flex flex-col sm:flex-row items-center justify-between gap-4 z-10 bg-[#050807]/90">
        <div className="flex items-center gap-2">
          <TexlyLogo size="sm" showText={true} />
          <span className="text-[#94A3B8]/60">© {new Date().getFullYear()} Texly Inc.</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="hover:text-[#00D69A] transition-colors">
            Dashboard
          </Link>
          <Link href="/login" className="hover:text-[#00D69A] transition-colors">
            Sign In
          </Link>
          <Link href="/register" className="hover:text-[#00D69A] transition-colors">
            Register
          </Link>
        </div>
      </footer>
    </div>
  );
}
