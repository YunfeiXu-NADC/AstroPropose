'use client';

import { useEffect, useState } from 'react';

import {
  createAdminUser,
  getCurrentUser,
  listAdminRoles,
  listAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
} from '@/lib/api';
import { formatRoles, translateRole } from '@/lib/locale.mjs';

function RoleChecklist({ roles, selectedRoleIds, onToggle, disabled = false }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {roles.map((role) => (
        <label
          key={role.id}
          className={`flex items-center gap-2 rounded border px-3 py-2 ${
            disabled ? 'bg-gray-50 text-gray-400' : 'bg-white'
          }`}
        >
          <input
            type="checkbox"
            checked={selectedRoleIds.includes(role.id)}
            onChange={() => onToggle(role.id)}
            disabled={disabled}
          />
          <span className="text-sm">
            {translateRole(role.name)}
            {role.is_system ? '（系统内置）' : ''}
          </span>
        </label>
      ))}
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsActive, setNewIsActive] = useState(true);
  const [newRoleIds, setNewRoleIds] = useState([]);

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [editEmail, setEditEmail] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editRoleIds, setEditRoleIds] = useState([]);
  const [resetPassword, setResetPassword] = useState('');

  const selectedUser = users.find((user) => user.id === selectedUserId) || null;

  const toggleRole = (roleIds, roleId, setter) => {
    setter(
      roleIds.includes(roleId)
        ? roleIds.filter((id) => id !== roleId)
        : [...roleIds, roleId]
    );
  };

  const startEditingUser = (user, availableRoles = roles) => {
    setSelectedUserId(user.id);
    setEditEmail(user.email);
    setEditIsActive(user.is_active);
    setEditRoleIds(
      availableRoles
        .filter((role) => user.roles.includes(role.name))
        .map((role) => role.id)
    );
    setResetPassword('');
  };

  const fetchData = async (preferredUserId = selectedUserId) => {
    setIsLoading(true);
    try {
      const [me, usersData, rolesData] = await Promise.all([
        getCurrentUser(),
        listAdminUsers(),
        listAdminRoles(),
      ]);
      setCurrentUserId(me.id);
      setUsers(usersData);
      setRoles(rolesData);

      const userToResume =
        usersData.find((user) => user.id === preferredUserId) || usersData[0] || null;
      if (userToResume) {
        startEditingUser(userToResume, rolesData);
      } else {
        setSelectedUserId(null);
        setEditEmail('');
        setEditIsActive(true);
        setEditRoleIds([]);
        setResetPassword('');
      }
    } catch (err) {
      console.error(err);
      setError(err.info?.message || '用户与角色加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData(null);
  }, []);

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!newUsername.trim() || !newEmail.trim() || !newPassword.trim()) {
      setError('用户名、邮箱和密码均为必填项');
      return;
    }

    try {
      await createAdminUser({
        username: newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role_ids: newRoleIds,
        is_active: newIsActive,
      });
      setSuccess(`用户“${newUsername.trim()}”创建成功`);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewIsActive(true);
      setNewRoleIds([]);
      setShowCreateForm(false);
      await fetchData();
    } catch (err) {
      console.error(err);
      setError(err.info?.message || '用户创建失败');
    }
  };

  const handleUpdateUser = async (event) => {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      await updateAdminUser(selectedUser.id, {
        email: editEmail.trim(),
        role_ids: editRoleIds,
        is_active: editIsActive,
      });
      setSuccess(`用户“${selectedUser.username}”更新成功`);
      await fetchData(selectedUser.id);
    } catch (err) {
      console.error(err);
      setError(err.info?.message || '用户更新失败');
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }

    setError('');
    setSuccess('');

    if (!resetPassword.trim()) {
      setError('请输入新密码后再重置');
      return;
    }

    try {
      await resetAdminUserPassword(selectedUser.id, {
        new_password: resetPassword,
      });
      setSuccess(`用户“${selectedUser.username}”的密码已重置`);
      setResetPassword('');
    } catch (err) {
      console.error(err);
      setError(err.info?.message || '密码重置失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">用户管理</h1>
          <p className="text-sm text-gray-600">创建用户、分配角色、停用账户和重置密码。</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((value) => !value)}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          {showCreateForm ? '取消' : '+ 添加用户'}
        </button>
      </div>

      <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        用户密码采用不可逆加密保存，管理员无法查看原密码；忘记密码时只能为用户设置新密码。
      </p>

      {error && <p className="text-red-500 bg-red-100 p-3 rounded">{error}</p>}
      {success && <p className="text-green-600 bg-green-100 p-3 rounded">{success}</p>}

      {showCreateForm && (
        <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold">创建用户</h2>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">用户名 *</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(event) => setNewUsername(event.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">邮箱 *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">临时密码 *</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 pt-7">
                <input
                  type="checkbox"
                  checked={newIsActive}
                  onChange={(event) => setNewIsActive(event.target.checked)}
                />
                启用账户
              </label>
            </div>

            <div>
              <p className="block text-sm font-medium text-gray-700 mb-2">角色</p>
              <RoleChecklist
                roles={roles}
                selectedRoleIds={newRoleIds}
                onToggle={(roleId) => toggleRole(newRoleIds, roleId, setNewRoleIds)}
              />
              <p className="mt-2 text-xs text-gray-500">
                若不选择角色，系统将在可用时自动分配默认提案者角色。
              </p>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              创建用户
            </button>
          </form>
        </section>
      )}

      <section className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">用户列表</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                用户名
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                邮箱
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                角色
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                状态
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  正在加载…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  暂无用户。
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className={selectedUserId === user.id ? 'bg-indigo-50' : undefined}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {user.username}
                    {currentUserId === user.id ? (
                      <span className="ml-2 text-xs text-indigo-600">（当前用户）</span>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{user.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{formatRoles(user.roles) || '未分配角色'}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs rounded-full ${
                        user.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {user.is_active ? '已启用' : '已停用'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => startEditingUser(user)}
                      className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      管理
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {selectedUser && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <form onSubmit={handleUpdateUser} className="xl:col-span-2 bg-white shadow-md rounded-lg p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">编辑用户</h2>
                <p className="text-sm text-gray-500">
                  用户名创建后不可修改，可在此更新邮箱、角色和状态。
                </p>
              </div>
              <span className="text-sm font-medium text-gray-500">{selectedUser.username}</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">邮箱</label>
              <input
                type="email"
                required
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={editIsActive}
                disabled={selectedUser.id === currentUserId}
                onChange={(event) => setEditIsActive(event.target.checked)}
              />
              启用账户
              {selectedUser.id === currentUserId ? (
                <span className="text-xs text-gray-500">不能停用当前登录账户。</span>
              ) : null}
            </label>

            <div>
              <p className="block text-sm font-medium text-gray-700 mb-2">角色</p>
              <RoleChecklist
                roles={roles}
                selectedRoleIds={editRoleIds}
                onToggle={(roleId) => toggleRole(editRoleIds, roleId, setEditRoleIds)}
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              保存修改
            </button>
          </form>

          <form onSubmit={handleResetPassword} className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">重置密码</h2>
              <p className="text-sm text-gray-500">
                为 {selectedUser.username} 设置新密码，原密码将立即失效。
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">新密码</label>
              <input
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700"
            >
              重置密码
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
