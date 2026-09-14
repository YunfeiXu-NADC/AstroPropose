'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { changePassword, getCurrentUser } from '@/lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.push('/login');
      return;
    }

    const loadUser = async () => {
      try {
        const me = await getCurrentUser();
        setUser(me);
      } catch (err) {
        console.error(err);
        setError('无法验证登录状态，请重新登录。');
        if (err.status === 401) {
          localStorage.removeItem('token');
          window.dispatchEvent(new Event('auth-change'));
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!oldPassword || !newPassword) {
      setError('请输入当前密码和新密码');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    try {
      await changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      setSuccess('密码更新成功，请重新登录。');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');

      localStorage.removeItem('token');
      window.dispatchEvent(new Event('auth-change'));
      window.setTimeout(() => {
        router.push('/login');
      }, 1200);
    } catch (err) {
      console.error(err);
      setError(err.info?.message || '密码更新失败');
    }
  };

  if (loading) {
    return <div>正在加载…</div>;
  }

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-xl bg-white shadow-md rounded-lg p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">修改密码</h1>
          <p className="text-sm text-gray-600">
            为账户 {user?.username || '当前账户'} 更新登录密码。
          </p>
        </div>

        {error && <p className="text-red-500 bg-red-100 p-3 rounded">{error}</p>}
        {success && <p className="text-green-600 bg-green-100 p-3 rounded">{success}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">当前密码</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">新密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            更新密码
          </button>
        </form>
      </div>
    </div>
  );
}
