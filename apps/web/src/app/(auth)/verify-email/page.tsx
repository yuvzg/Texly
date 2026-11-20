'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AuthAlert, FormField } from '@/components/auth/auth-ui';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { ErrorCodeEnum, VerifyEmailRequestSchema } from '@texly/shared';
import { CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';

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
    <div className="space-y-5">
      <div className="space-y-1 text-center sm:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-white">Email Verification</h2>
        <p className="text-sm text-[#94A3B8]">Confirm your email address to secure your account</p>
      </div>

      {status === 'verifying' && (
        <div className="py-8 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#00D69A]" />
          <p className="text-sm text-[#94A3B8]">Verifying your email address...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-4 py-2">
          <AuthAlert
            variant="success"
            title="Email verified!"
            message="Your email address has been successfully verified. You can now access all Texly features."
          />
          <div className="pt-2">
            <Link href="/dashboard" className="block w-full">
              <Button className="w-full flex items-center justify-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Go to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-4">
          <AuthAlert
            variant="error"
            title="Verification Failed"
            message={errorMessage || 'Failed to verify email.'}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerify(token);
            }}
            className="space-y-3"
          >
            <FormField id="manualToken" label="Enter Verification Token">
              <input
                id="manualToken"
                type="text"
                placeholder="Paste your verification token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-[#050807] border-[#00D69A]/20 text-[#ECFDF5] placeholder:text-[#94A3B8]/40 focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A]"
              />
            </FormField>
            <Button className="w-full" type="submit" disabled={!token.trim()}>
              Try Verification Again
            </Button>
          </form>
        </div>
      )}

      {status === 'idle' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleVerify(token);
          }}
          className="space-y-4"
        >
          <FormField id="token" label="Verification Token">
            <input
              id="token"
              type="text"
              placeholder="Paste the token from your email"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-[#050807] border-[#00D69A]/20 text-[#ECFDF5] placeholder:text-[#94A3B8]/40 focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A]"
            />
          </FormField>
          <Button className="w-full" type="submit" disabled={!token.trim()}>
            Verify Email
          </Button>
        </form>
      )}

      <div className="text-center pt-2 border-t border-[#00D69A]/10">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-[#00D69A] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-[#94A3B8]">
          <Loader2 className="h-6 w-6 animate-spin text-[#00D69A] mx-auto mb-2" />
          Loading...
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
