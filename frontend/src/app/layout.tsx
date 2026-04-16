import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VoximplantBuild — Collections Dialer',
  description: 'AI-powered collections dialer built on Voximplant',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
