'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/api';

const Navbar = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [roles, setRoles] = useState([]);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      if (typeof window === 'undefined') {
        return;
      }
      const token = localStorage.getItem('token');
      const loggedIn = !!token;
      setIsLoggedIn(loggedIn);
      if (loggedIn) {
        try {
          const me = await getCurrentUser();
          setRoles(me.roles || []);
        } catch (err) {
          console.error('Failed to get user data:', err);
          setRoles([]);
          setIsLoggedIn(false);
          localStorage.removeItem('token');
        }
      } else {
        setRoles([]);
      }
    };

    checkAuth();

    // 监听自定义登录事件
    const handleAuthChange = () => {
      checkAuth();
    };
    
    window.addEventListener('auth-change', handleAuthChange);
    
    return () => {
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setRoles([]);
    window.dispatchEvent(new Event('auth-change'));
    router.push('/login');
  };

  return (
    <nav className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-xl font-bold">
          AstroPropose
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="px-3 py-2 rounded hover:bg-gray-700">
            Dashboard
          </Link>
          {(roles.includes('Instrument Scheduler') || roles.includes('Admin')) && (
            <Link href="/dashboard" className="px-3 py-2 rounded hover:bg-gray-700">
              Scheduler
            </Link>
          )}
          {(roles.includes('Panel Chair') || roles.includes('Admin')) && (
            <Link href="/dashboard/panel" className="px-3 py-2 rounded hover:bg-gray-700">
              Panel
            </Link>
          )}
          {(roles.includes('Admin')) && (
            <>
              <Link href="/admin/users" className="px-3 py-2 rounded hover:bg-gray-700">
                Users
              </Link>
              <Link href="/admin/roles" className="px-3 py-2 rounded hover:bg-gray-700">
                Roles
              </Link>
              <Link href="/admin/instruments" className="px-3 py-2 rounded hover:bg-gray-700">
                Instruments
              </Link>
              <Link href="/admin/workflows" className="px-3 py-2 rounded hover:bg-gray-700">
                Workflows
              </Link>
              <Link href="/admin/forms" className="px-3 py-2 rounded hover:bg-gray-700">
                Forms
              </Link>
              <Link href="/admin/proposal-types" className="px-3 py-2 rounded hover:bg-gray-700">
                Publish
              </Link>
              <Link href="/admin/external-tools" className="px-3 py-2 rounded hover:bg-gray-700">
                🔌 Tools
              </Link>
            </>
          )}
          {isLoggedIn ? (
            <>
              <Link href="/change-password" className="px-3 py-2 rounded hover:bg-gray-700">
                Password
              </Link>
              <button
                onClick={handleLogout}
                className="px-3 py-2 rounded hover:bg-gray-700 bg-red-600 hover:bg-red-700"
                title="Click to logout"
              >
                Logout
              </button>
            </>
          ) : (
            <Link href="/login" className="px-3 py-2 rounded hover:bg-gray-700">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
