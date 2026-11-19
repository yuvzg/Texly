import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/providers/auth-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Texly — Modern Collaborative LaTeX Editor',
  description: 'Production-grade, web-based LaTeX editor with user-controlled AI modification workflow',
  icons: {
    icon: [
      { url: '/icon.jpg', sizes: '1024x1024', type: 'image/jpeg' },
      { url: '/favicon.ico' },
    ],
    shortcut: '/favicon.ico',
    apple: '/icon.jpg',
  },
};

export const viewport: Viewport = {
  themeColor: '#050807',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.jpg" sizes="1024x1024" type="image/jpeg" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon.jpg" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                document.documentElement.classList.add('dark');
                document.documentElement.setAttribute('data-theme', 'dark');
                document.documentElement.style.colorScheme = 'dark';
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-[#050807] text-[#ECFDF5] antialiased selection:bg-[#00D69A]/30 selection:text-white">
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
