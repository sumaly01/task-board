'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    // The API route clears both cookies and calls the gateway to blacklist the jti
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-60 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
    >
      {loading ? 'Logging out…' : 'Logout'}
    </button>
  );
}
