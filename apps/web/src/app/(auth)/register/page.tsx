'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { PasswordInput, AuthAlert, FormField } from '@/components/auth/auth-ui';
import { GuestOnlyRoute, AuthLoadingScreen } from '@/components/auth/route-guards';
import { RegisterRequestSchema, ErrorCodeEnum } from '@texly/shared';
import { ApiClientError } from '@/lib/api-client';
import { Loader2 } from 'lucide-react';

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams?.get('redirect') || '/dashboard';
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setErrors({});

    const result = RegisterRequestSchema.safeParse({ name, email, password });
    if (!result.success) {
      const fieldErrors: { name?: string; email?: string; password?: string } = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0] === 'name') fieldErrors.name = issue.message;
        if (issue.path[0] === 'email') fieldErrors.email = issue.message;
        if (issue.path[0] === 'password') fieldErrors.password = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await register(result.data);
      router.replace(redirectUrl);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === ErrorCodeEnum.EMAIL_TAKEN) {
          setApiError('An account with this email address already exists.');
        } else if (
          err.code === 'PASSWORD_BREACHED' ||
          err.message.toLowerCase().includes('breach')
        ) {
          setApiError(
            'This password was found in a public data breach. Please choose a different, more secure password.',
          );
        } else if (err.code === ErrorCodeEnum.RATE_LIMITED) {
          setApiError(
            'Too many registration attempts. Please wait a few minutes before trying again.',
          );
        } else if (err.fieldErrors) {
          const fieldMap: { name?: string; email?: string; password?: string } = {};
          if (err.fieldErrors['name']?.[0]) fieldMap.name = err.fieldErrors['name'][0];
          if (err.fieldErrors['email']?.[0]) fieldMap.email = err.fieldErrors['email'][0];
          if (err.fieldErrors['password']?.[0]) fieldMap.password = err.fieldErrors['password'][0];
          setErrors(fieldMap);
          setApiError(err.message || 'Please correct the highlighted fields.');
        } else {
          setApiError(err.message || 'Failed to create account. Please try again.');
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
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Create an account</h2>
          <p className="text-sm text-gray-500">Sign up to start drafting LaTeX documents</p>
        </div>

        {apiError && <AuthAlert variant="error" message={apiError} />}

        <form className="space-y-3" onSubmit={handleSubmit} noValidate>
          <FormField id="name" label="Full Name" error={errors.name}>
            <input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={name}
              disabled={isSubmitting}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            />
          </FormField>

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

          <FormField
            id="password"
            label="Password"
            error={errors.password}
            hint="Must be at least 10 characters long"
          >
            <PasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="••••••••••••"
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
            {isSubmitting ? 'Creating Account...' : 'Create Account'}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </GuestOnlyRoute>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <RegisterContent />
    </Suspense>
  );
}
