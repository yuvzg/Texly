'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, error, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="relative">
        <input
          ref={ref}
          type={showPassword ? 'text' : 'password'}
          className={cn(
            'w-full px-3 py-2 pr-10 text-sm border rounded-lg bg-[#0A1310] border-[#00D69A]/20 text-[#ECFDF5] placeholder:text-[#94A3B8]/40 transition-all focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A] focus:shadow-[0_0_12px_rgba(0,214,154,0.15)]',
            error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#94A3B8] hover:text-[#00D69A] focus:outline-none cursor-pointer"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          tabIndex={0}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export interface AuthAlertProps {
  variant: 'error' | 'success' | 'info';
  title?: string;
  message: string;
  className?: string;
}

export function AuthAlert({ variant, title, message, className }: AuthAlertProps) {
  const isError = variant === 'error';
  const isSuccess = variant === 'success';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={cn(
        'p-3.5 rounded-xl border text-sm flex items-start gap-2.5 backdrop-blur-sm',
        isError && 'bg-rose-950/40 border-rose-900/60 text-rose-200',
        isSuccess &&
          'bg-[#003D30]/60 border-[#00D69A]/40 text-[#ECFDF5] shadow-[0_0_15px_rgba(0,214,154,0.1)]',
        variant === 'info' && 'bg-[#0A1310] border-[#00D69A]/25 text-[#ECFDF5]',
        className,
      )}
    >
      {isError && <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />}
      {isSuccess && <CheckCircle2 className="h-5 w-5 text-[#00D69A] shrink-0 mt-0.5" />}
      {variant === 'info' && <Info className="h-5 w-5 text-[#00D69A] shrink-0 mt-0.5" />}
      <div className="space-y-0.5">
        {title && <h4 className="font-semibold text-xs leading-none text-white">{title}</h4>}
        <p className="text-xs leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

export interface FormFieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: React.ReactNode;
}

export function FormField({ id, label, error, hint, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-[#ECFDF5]">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-[#94A3B8]">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-xs text-rose-400 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
