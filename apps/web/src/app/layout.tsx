import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/providers/auth-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Texly — Modern Collaborative LaTeX Editor',
  description: 'High-performance, collaborative web-based LaTeX editor with intuitive AI workflows',
  icons: {
    icon: [{ url: '/icon.jpg', sizes: '1024x1024', type: 'image/jpeg' }, { url: '/favicon.ico' }],
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
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
      <body className="min-h-screen font-sans bg-[#050807] text-[#ECFDF5] antialiased selection:bg-[#00D69A]/30 selection:text-white">
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
