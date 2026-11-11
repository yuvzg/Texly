'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function RegisterPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Create an account</h2>
        <p className="text-sm text-gray-500">Sign up to start drafting LaTeX documents</p>
      </div>

      <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="name">
            Full Name
          </label>
          <input
            id="name"
            type="text"
            placeholder="Ada Lovelace"
            className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
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
          <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            className="w-full px-3 py-2 text-sm border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button className="w-full mt-2" type="submit">
          Create Account
        </Button>
      </form>

      <p className="text-center text-xs text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
