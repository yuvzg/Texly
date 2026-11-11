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
            'w-full px-3 py-2 pr-10 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors',
            error && 'border-red-500 focus:ring-red-500',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
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
        'p-3 rounded-lg border text-sm flex items-start gap-2.5',
        isError && 'bg-red-50 border-red-200 text-red-800',
        isSuccess && 'bg-green-50 border-green-200 text-green-800',
        variant === 'info' && 'bg-blue-50 border-blue-200 text-blue-800',
        className,
      )}
    >
      {isError && <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />}
      {isSuccess && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />}
      {variant === 'info' && <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />}
      <div className="space-y-0.5">
        {title && <h4 className="font-semibold text-xs leading-none">{title}</h4>}
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
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-gray-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-gray-500">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
