'use client';

import React, { useEffect, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { Loader2 } from 'lucide-react';

export function AuthLoadingScreen() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-gray-50"
      role="status"
      aria-label="Loading authentication state"
    >
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      <p className="mt-3 text-sm text-gray-500">Loading your workspace...</p>
    </div>
  );
}

export interface ProtectedRouteProps {
  children: React.ReactNode;
  requireVerified?: boolean;
}

function ProtectedRouteInternal({ children, requireVerified = false }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const fullPath = searchParams?.toString()
        ? `${pathname}?${searchParams.toString()}`
        : pathname;
      const redirectUrl = `/login?redirect=${encodeURIComponent(fullPath)}`;
      router.replace(redirectUrl);
    }
  }, [isLoading, isAuthenticated, router, pathname, searchParams]);

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <AuthLoadingScreen />;
  }

  if (requireVerified && user && !user.emailVerified) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-sm border border-amber-200">
          <h2 className="text-xl font-bold text-amber-800">Email Verification Required</h2>
          <p className="mt-2 text-sm text-gray-600">
            Please verify your email address to access this area. Check your inbox for the
            verification link.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function ProtectedRoute(props: ProtectedRouteProps) {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <ProtectedRouteInternal {...props} />
    </Suspense>
  );
}

function GuestOnlyRouteInternal({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const redirect = searchParams?.get('redirect') || '/dashboard';
      router.replace(redirect);
    }
  }, [isLoading, isAuthenticated, router, searchParams]);

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (isAuthenticated) {
    return <AuthLoadingScreen />;
  }

  return <>{children}</>;
}

export function GuestOnlyRoute(props: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <GuestOnlyRouteInternal {...props} />
    </Suspense>
  );
}
