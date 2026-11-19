'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AuthAlert, FormField } from '@/components/auth/auth-ui';
import { GuestOnlyRoute } from '@/components/auth/route-guards';
import { ForgotPasswordRequestSchema, ErrorCodeEnum } from '@texly/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    setApiError(null);

    const validation = ForgotPasswordRequestSchema.safeParse({ email });
    if (!validation.success) {
      setFieldError(validation.error.issues[0]?.message || 'Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/auth/forgot-password', validation.data);
      setIsSubmitted(true);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === ErrorCodeEnum.RATE_LIMITED) {
          setApiError('Too many requests. Please wait a few minutes before trying again.');
        } else {
          setApiError(err.message || 'Failed to submit password reset request.');
        }
      } else {
        setApiError('A network error occurred. Please check your connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GuestOnlyRoute>
      <div className="space-y-5">
        <div className="space-y-1 text-center sm:text-left">
          <h2 className="text-2xl font-bold tracking-tight text-white">Reset your password</h2>
          <p className="text-sm text-[#94A3B8]">
            Enter your email address and we will send you a password reset link
          </p>
        </div>

        {apiError && <AuthAlert variant="error" message={apiError} />}

        {isSubmitted ? (
          <div className="space-y-4 py-2">
            <AuthAlert
              variant="success"
              title="Reset link sent"
              message="If an account exists for this email address, a password reset link has been sent. Please check your inbox and spam folder."
            />
            <div className="pt-2">
              <Link href="/login" className="block w-full">
                <Button variant="outline" className="w-full flex items-center justify-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Return to sign in
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <FormField id="email" label="Email Address" error={fieldError ?? undefined}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                disabled={isSubmitting}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-[#050807] border-[#00D69A]/20 text-[#ECFDF5] placeholder:text-[#94A3B8]/40 focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A] focus:shadow-[0_0_12px_rgba(0,214,154,0.15)] disabled:opacity-60 transition-all"
              />
            </FormField>

            <Button
              className="w-full mt-4 flex items-center justify-center gap-2"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin text-[#050807]" />}
              {isSubmitting ? 'Sending Link...' : 'Send Reset Link'}
            </Button>

            <div className="text-center pt-2 border-t border-[#00D69A]/10">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs text-[#00D69A] hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </GuestOnlyRoute>
  );
}
