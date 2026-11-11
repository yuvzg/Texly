'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { PasswordInput, AuthAlert, FormField } from '@/components/auth/auth-ui';
import { GuestOnlyRoute, AuthLoadingScreen } from '@/components/auth/route-guards';
import { LoginRequestSchema, ErrorCodeEnum } from '@texly/shared';
import { ApiClientError } from '@/lib/api-client';
import { Loader2 } from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams?.get('redirect') || '/dashboard';
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setErrors({});

    const result = LoginRequestSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0] === 'email') fieldErrors.email = issue.message;
        if (issue.path[0] === 'password') fieldErrors.password = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await login(result.data);
      router.replace(redirectUrl);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === ErrorCodeEnum.INVALID_CREDENTIALS) {
          setApiError('Invalid email address or password.');
        } else if (err.code === ErrorCodeEnum.RATE_LIMITED) {
          setApiError('Too many failed attempts. Please wait a few minutes before trying again.');
        } else if (err.code === ErrorCodeEnum.ACCOUNT_DISABLED) {
          setApiError('Your account has been disabled. Please contact support.');
        } else {
          setApiError(err.message || 'Unable to sign in. Please try again.');
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
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            Sign in to your account
          </h2>
          <p className="text-sm text-gray-500">Enter your email and password below</p>
        </div>

        {apiError && <AuthAlert variant="error" message={apiError} />}

        <form className="space-y-3" onSubmit={handleSubmit} noValidate>
          <FormField id="email" label="Email" error={errors.email}>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              disabled={isSubmitting}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            />
          </FormField>

          <FormField id="password" label="Password" error={errors.password}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-transparent">P</span>
              <Link
                href="/forgot-password"
                className="text-xs text-blue-600 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              disabled={isSubmitting}
              onChange={(e) => setPassword(e.target.value)}
              error={!!errors.password}
            />
          </FormField>

          <Button
            className="w-full mt-4 flex items-center justify-center gap-2"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-blue-600 font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </GuestOnlyRoute>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <LoginContent />
    </Suspense>
  );
}
