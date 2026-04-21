'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getCurrentUser } from '@/lib/api';

export default function AdminLayout({ children }) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.push('/login');
      return;
    }

    const verifyAdminAccess = async () => {
      try {
        const me = await getCurrentUser();
        if (!me.roles.includes('Admin')) {
          router.push('/dashboard');
          return;
        }
      } catch (err) {
        console.error(err);
        setError('Unable to verify administrator access. Please log in again.');
        if (err.status === 401) {
          localStorage.removeItem('token');
          window.dispatchEvent(new Event('auth-change'));
          router.push('/login');
        }
        setIsChecking(false);
        return;
      }

      setIsChecking(false);
    };

    verifyAdminAccess();
  }, [router]);

  if (isChecking) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <p className="text-red-500 bg-red-100 p-3 rounded">{error}</p>;
  }

  return children;
}
