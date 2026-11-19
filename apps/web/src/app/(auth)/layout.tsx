import React from 'react';
import Link from 'next/link';
import { TexlyLogo } from '@/components/common/texly-logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050807] bg-texly-glow p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient background glow orb */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#003D30]/30 rounded-full blur-3xl pointer-events-none" />

      <div className="mb-6 z-10">
        <Link href="/" className="inline-block transition-transform hover:scale-105">
          <TexlyLogo size="lg" subtitle="Collaborative LaTeX Editor" />
        </Link>
      </div>

      <div className="w-full max-w-md rounded-2xl bg-[#0A1310]/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl border border-[#00D69A]/20 shadow-[0_0_40px_rgba(0,61,48,0.4)] z-10 transition-all">
        {children}
      </div>

      <div className="mt-8 text-center text-xs text-[#94A3B8]/60 z-10">
        © {new Date().getFullYear()} Texly Inc. All rights reserved.
      </div>
    </div>
  );
}
