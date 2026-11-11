'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ResetPasswordPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Reset your password</h2>
        <p className="text-sm text-gray-500">
          Enter your email address and we will send you a reset link
        </p>
      </div>

      <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="name@example.com"
            className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button className="w-full mt-2" type="submit">
          Send Reset Link
        </Button>
      </form>

      <p className="text-center text-xs text-gray-500">
        Remember your password?{' '}
        <Link href="/login" className="text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
