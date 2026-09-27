import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Titife Records Access',
  description: 'Scoped Records and Access Slice reference implementation',
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
