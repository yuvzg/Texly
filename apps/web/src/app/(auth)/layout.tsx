import React from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="mb-6 flex items-center gap-2">
        <FileText className="h-6 w-6 text-blue-600" />
        <Link href="/" className="text-xl font-bold text-gray-900">
          Texly
        </Link>
      </div>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-sm border border-gray-200">
        {children}
      </div>
    </div>
  );
}
