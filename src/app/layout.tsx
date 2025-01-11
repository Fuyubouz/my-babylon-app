import './globals.css';
import { ReactNode } from 'react';

export const metadata = {
  title: 'My Babylon App',
  description: 'A Next.js app integrated with Babylon.js',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
      </body>
    </html>
  );
}