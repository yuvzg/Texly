'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AuthAlert, FormField } from '@/components/auth/auth-ui';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { ErrorCodeEnum, VerifyEmailRequestSchema } from '@texly/shared';
import { CheckCircle2, Loader2 } from 'lucide-react';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams?.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>(
    tokenFromUrl ? 'verifying' : 'idle',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleVerify = useCallback(async (tokenToVerify: string) => {
    setStatus('verifying');
    setErrorMessage(null);

    const validation = VerifyEmailRequestSchema.safeParse({ token: tokenToVerify });
    if (!validation.success) {
      setStatus('error');
      setErrorMessage('Please provide a valid verification token.');
      return;
    }

    try {
      await apiClient.post<{ verified: boolean }>('/auth/verify-email', validation.data);
      setStatus('success');
    } catch (err: unknown) {
      setStatus('error');
      if (err instanceof ApiClientError) {
        if (err.code === ErrorCodeEnum.TOKEN_INVALID || err.code === ErrorCodeEnum.TOKEN_EXPIRED) {
          setErrorMessage('This verification link is invalid or has expired.');
        } else {
          setErrorMessage(err.message || 'Failed to verify email address.');
        }
      } else {
        setErrorMessage('A network error occurred while verifying your email.');
      }
    }
  }, []);

  useEffect(() => {
    if (tokenFromUrl) {
      handleVerify(tokenFromUrl);
    }
  }, [tokenFromUrl, handleVerify]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Email Verification</h2>
        <p className="text-sm text-gray-500">Confirm your email address to secure your account</p>
      </div>

      {status === 'verifying' && (
        <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-600">Verifying your email address...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-4 py-2">
          <AuthAlert
            variant="success"
            title="Email verified!"
            message="Your email address has been successfully verified. You can now access all features of Texly."
          />
          <Link href="/dashboard" className="block w-full">
            <Button className="w-full flex items-center justify-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Go to Dashboard
            </Button>
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-4">
          <AuthAlert
            variant="error"
            title="Verification Failed"
            message={errorMessage || 'Unable to verify email address.'}
          />
          <div className="space-y-3 pt-2">
            <p className="text-xs text-gray-600">
              Need a new link? Sign in to your account to request another verification email.
            </p>
            <Link href="/login" className="block w-full">
              <Button variant="outline" className="w-full">
                Back to Sign In
              </Button>
            </Link>
          </div>
        </div>
      )}

      {status === 'idle' && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleVerify(token);
          }}
        >
          <FormField
            id="token"
            label="Verification Token"
            hint="Paste the verification token from your email"
          >
            <input
              id="token"
              type="text"
              placeholder="Paste token here"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <Button className="w-full mt-2" type="submit" disabled={!token.trim()}>
            Verify Email
          </Button>

          <p className="text-center text-xs text-gray-500 pt-2">
            <Link href="/login" className="text-blue-600 hover:underline">
              Back to Sign In
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
