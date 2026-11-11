'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PasswordInput, AuthAlert, FormField } from '@/components/auth/auth-ui';
import { GuestOnlyRoute } from '@/components/auth/route-guards';
import { ResetPasswordRequestSchema, ErrorCodeEnum } from '@texly/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setErrors({});

    if (!token) {
      setApiError('Missing reset token. Please use the link provided in your reset email.');
      return;
    }

    if (password !== confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }

    const validation = ResetPasswordRequestSchema.safeParse({ token, password });
    if (!validation.success) {
      const issue = validation.error.issues[0];
      setErrors({ password: issue?.message || 'Password must be at least 10 characters long.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/auth/reset-password', validation.data);
      setIsSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === ErrorCodeEnum.TOKEN_INVALID || err.code === ErrorCodeEnum.TOKEN_EXPIRED) {
          setApiError('This password reset link is invalid or has expired.');
        } else if (
          err.code === 'PASSWORD_BREACHED' ||
          err.message.toLowerCase().includes('breach')
        ) {
          setApiError(
            'This password was found in a public data breach. Please choose a different, more secure password.',
          );
        } else {
          setApiError(err.message || 'Failed to reset password.');
        }
      } else {
        setApiError('A network error occurred. Please check your connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token && !isSuccess) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Reset your password</h2>
          <p className="text-sm text-gray-500">A valid reset token is required</p>
        </div>
        <AuthAlert
          variant="error"
          title="Invalid or Missing Link"
          message="No password reset token was found in the link. Please request a new password reset link."
        />
        <div className="pt-2">
          <Link href="/forgot-password" className="block w-full">
            <Button className="w-full">Request New Reset Link</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <GuestOnlyRoute>
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Set new password</h2>
          <p className="text-sm text-gray-500">
            Create a secure new password for your Texly account
          </p>
        </div>

        {apiError && <AuthAlert variant="error" message={apiError} />}

        {isSuccess ? (
          <div className="space-y-4 py-2">
            <AuthAlert
              variant="success"
              title="Password reset successful!"
              message="Your password has been changed and all existing active sessions have been revoked. You can now sign in with your new password."
            />
            <div className="pt-2">
              <Link href="/login" className="block w-full">
                <Button className="w-full flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Sign In with New Password
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={handleSubmit} noValidate>
            <FormField
              id="password"
              label="New Password"
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

            <FormField
              id="confirmPassword"
              label="Confirm New Password"
              error={errors.confirmPassword}
            >
              <PasswordInput
                id="confirmPassword"
                autoComplete="new-password"
                placeholder="••••••••••••"
                value={confirmPassword}
                disabled={isSubmitting}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={!!errors.confirmPassword}
              />
            </FormField>

            <Button
              className="w-full mt-4 flex items-center justify-center gap-2"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Updating Password...' : 'Reset Password'}
            </Button>

            <p className="text-center text-xs text-gray-500 pt-1">
              <Link
                href="/login"
                className="text-blue-600 font-medium hover:underline inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" /> Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </GuestOnlyRoute>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
