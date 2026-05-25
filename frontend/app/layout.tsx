import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'TaskFlow',
  description: 'Real-time task and team management platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        {children}
        {/* Toaster renders toast notifications triggered by toast() anywhere in the app.
            position="top-right" keeps them visible without blocking main content. */}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
