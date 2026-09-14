'use client';

import { useEffect, useState } from 'react';

import {
  createAdminRole,
  deleteAdminRole,
  listAdminRoles,
  updateAdminRole,
} from '@/lib/api';
import { translateRole, translateRoleType } from '@/lib/locale.mjs';

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newRoleName, setNewRoleName] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [editRoleName, setEditRoleName] = useState('');

  const selectedRole = roles.find((role) => role.id === selectedRoleId) || null;

  const fetchRoles = async (preferredRoleId = selectedRoleId) => {
    setIsLoading(true);
    try {
      const data = await listAdminRoles();
      setRoles(data);

      const roleToResume = data.find((role) => role.id === preferredRoleId) || data[0] || null;
      if (roleToResume) {
        setSelectedRoleId(roleToResume.id);
        setEditRoleName(roleToResume.name);
      } else {
        setSelectedRoleId(null);
        setEditRoleName('');
      }
    } catch (err) {
      console.error(err);
      setError(err.info?.message || '角色加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles(null);
  }, []);

  const handleCreateRole = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!newRoleName.trim()) {
      setError('角色名称不能为空');
      return;
    }

    try {
      await createAdminRole({ name: newRoleName.trim() });
      setSuccess(`角色“${newRoleName.trim()}”创建成功`);
      setNewRoleName('');
      await fetchRoles();
    } catch (err) {
      console.error(err);
      setError(err.info?.message || '角色创建失败');
    }
  };

  const handleRenameRole = async (event) => {
    event.preventDefault();
    if (!selectedRole) {
      return;
    }

    setError('');
    setSuccess('');

    if (!editRoleName.trim()) {
      setError('角色名称不能为空');
      return;
    }

    try {
      await updateAdminRole(selectedRole.id, { name: editRoleName.trim() });
      setSuccess(`角色“${translateRole(selectedRole.name)}”更新成功`);
      await fetchRoles(selectedRole.id);
    } catch (err) {
      console.error(err);
      setError(err.info?.message || '角色更新失败');
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRole) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      await deleteAdminRole(selectedRole.id);
      setSuccess(`角色“${translateRole(selectedRole.name)}”已删除`);
      await fetchRoles(null);
    } catch (err) {
      console.error(err);
      setError(err.info?.message || '角色删除失败');
    }
  };

  const deleteBlocked =
    !selectedRole ||
    selectedRole.is_system ||
    selectedRole.user_count > 0 ||
    selectedRole.workflow_reference_count > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">角色管理</h1>
        <p className="text-sm text-gray-600">
          管理系统内置与自定义角色，并将角色分配给用户和流程操作。
        </p>
      </div>

      {error && <p className="text-red-500 bg-red-100 p-3 rounded">{error}</p>}
      {success && <p className="text-green-600 bg-green-100 p-3 rounded">{success}</p>}

      <section className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">创建角色</h2>
        <form onSubmit={handleCreateRole} className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">角色名称</label>
            <input
              type="text"
              value={newRoleName}
              onChange={(event) => setNewRoleName(event.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="例如：科学委员会"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            创建角色
          </button>
        </form>
      </section>

      <section className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">角色列表</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                名称
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                类型
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                用户数
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                流程引用数
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
            ) : roles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  暂未配置角色。
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr
                  key={role.id}
                  className={selectedRoleId === role.id ? 'bg-indigo-50' : undefined}
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{translateRole(role.name)}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {translateRoleType(role.is_system)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{role.user_count}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{role.workflow_reference_count}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRoleId(role.id);
                        setEditRoleName(role.name);
                      }}
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

      {selectedRole && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <form onSubmit={handleRenameRole} className="xl:col-span-2 bg-white shadow-md rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">角色详情</h2>
              <p className="text-sm text-gray-500">
                系统内置角色用于保证权限稳定；未被流程引用的自定义角色可以重命名。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="rounded border p-4">
                <p className="text-gray-500">类型</p>
                <p className="font-semibold">{translateRoleType(selectedRole.is_system)}</p>
              </div>
              <div className="rounded border p-4">
                <p className="text-gray-500">已分配用户</p>
                <p className="font-semibold">{selectedRole.user_count}</p>
              </div>
              <div className="rounded border p-4">
                <p className="text-gray-500">流程引用</p>
                <p className="font-semibold">{selectedRole.workflow_reference_count}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">角色名称</label>
              <input
                type="text"
                value={selectedRole.is_system ? translateRole(editRoleName) : editRoleName}
                disabled={selectedRole.is_system}
                onChange={(event) => setEditRoleName(event.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>

            <button
              type="submit"
              disabled={selectedRole.is_system}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-300"
            >
              保存名称
            </button>
          </form>

          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">删除角色</h2>
              <p className="text-sm text-gray-500">
                仅允许删除未分配给用户、且未被流程引用的自定义角色。
              </p>
            </div>

            {deleteBlocked ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {selectedRole.is_system
                  ? '系统内置角色不能删除。'
                  : '请先移除用户分配和流程引用后再删除。'}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleDeleteRole}
              disabled={deleteBlocked}
              className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300"
            >
              删除角色
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
