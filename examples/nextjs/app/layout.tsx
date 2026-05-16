import type { ReactNode } from 'react';

export const metadata = {
  title: 'PDF Search — Next.js example',
  description: 'Search PDFs at build time, surface them in a static React page.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          font: '16px/1.5 system-ui, sans-serif',
          maxWidth: 720,
          margin: '2rem auto',
          padding: '0 1rem',
        }}
      >
        {children}
      </body>
    </html>
  );
}
