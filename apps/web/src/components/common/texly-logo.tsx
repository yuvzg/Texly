'use client';

import React from 'react';

export interface TexlyLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  subtitle?: string;
  className?: string;
}

export function TexlyLogo({
  size = 'md',
  showText = true,
  subtitle,
  className = '',
}: TexlyLogoProps) {
  const dim = size === 'sm' ? 24 : size === 'lg' ? 42 : 32;
  const textSize = size === 'sm' ? 'text-sm font-semibold' : size === 'lg' ? 'text-2xl font-bold' : 'text-lg font-bold';

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <div
        className="relative overflow-hidden rounded-lg flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(0,214,154,0.25)] border border-[#00D69A]/30 bg-[#003D30]"
        style={{ width: dim, height: dim }}
      >
        <img
          src="/icon.jpg"
          alt="Texly Logo"
          className="w-full h-full object-cover"
          loading="eager"
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <div className={`text-[#ECFDF5] tracking-tight flex items-center ${textSize}`}>
            <span>Texly</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#00D69A] ml-1 shadow-[0_0_8px_#00D69A]" />
          </div>
          {subtitle && (
            <span className="text-[10px] text-[#00D69A]/80 font-medium tracking-wide mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

