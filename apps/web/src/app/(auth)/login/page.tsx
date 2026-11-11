'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Sign in to your account</h2>
        <p className="text-sm text-gray-500">Enter your email and password below</p>
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
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-medium text-gray-700" htmlFor="password">
              Password
            </label>
            <Link href="/reset-password" className="text-xs text-blue-600 hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button className="w-full mt-2" type="submit">
          Sign In
        </Button>
      </form>

      <p className="text-center text-xs text-gray-500">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-blue-600 hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
