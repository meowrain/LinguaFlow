import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import { ThemeProvider } from '@/components/ThemeProvider';
import NavigationProgress from '@/components/NavigationProgress';

export const metadata: Metadata = {
  title: 'LinguaFlow - 英语学习平台',
  description: '通过阅读优质英文资讯学习英语，支持划词翻译、生词本等功能',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var theme = localStorage.getItem('linguaflow-theme') || 'system';
                  var resolved = theme;
                  if (theme === 'system') {
                    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  var dark = resolved === 'dark' || resolved === 'ocean';
                  var root = document.documentElement;
                  root.classList.toggle('dark', dark);
                  root.dataset.theme = resolved;
                  root.style.colorScheme = dark ? 'dark' : 'light';
                } catch (_) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <NavigationProgress />
        <ThemeProvider>
          <Header />
          <main className="min-h-screen">{children}</main>
          <footer
            className="mt-16 border-t py-8"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="text-center text-sm" style={{ color: 'var(--muted)' }}>
                © 2024 LinguaFlow. All rights reserved.
              </div>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
