'use client';

import { useEffect, useState } from 'react';
import { QuestionMarkCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

import {
  createAdminRole,
  deleteAdminRole,
  listAdminRoles,
  updateAdminRole,
} from '@/lib/api';
import { translateRole, translateRoleType } from '@/lib/locale.mjs';
import { BUILT_IN_ROLE_ORDER, getRoleGuide } from '@/lib/roleGuide.mjs';
import ListPageHeader from '@/components/ListPageHeader';
import ListPageToolbar from '@/components/ListPageToolbar';
import ListSearchField from '@/components/ListSearchField';

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [query, setQuery] = useState('');

  const [newRoleName, setNewRoleName] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [editRoleName, setEditRoleName] = useState('');

  const selectedRole = roles.find((role) => role.id === selectedRoleId) || null;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRoles = roles.filter((role) => !normalizedQuery || [role.name, translateRole(role.name)]
    .some((value) => String(value || '').toLowerCase().includes(normalizedQuery)));

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
    <div className="rps-enter mx-auto max-w-[1450px] space-y-5">
      <ListPageHeader title="角色管理" action={(
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition-colors hover:border-[#3347b8] hover:text-[#3347b8]"
          aria-label="查看角色说明"
          title="角色说明"
        >
          <QuestionMarkCircleIcon className="h-5 w-5" />
        </button>
      )} />
      <ListPageToolbar>
        <ListSearchField value={query} onChange={setQuery} label="搜索角色名称" placeholder="搜索角色名称" />
      </ListPageToolbar>

      {error && <p className="text-red-500 bg-red-100 p-3 rounded">{error}</p>}
      {success && <p className="text-green-600 bg-green-100 p-3 rounded">{success}</p>}

      <section className="border-y border-slate-200 bg-white px-4 py-3">
        <form onSubmit={handleCreateRole} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <h2 className="shrink-0 text-sm font-semibold text-slate-900">创建角色</h2>
          <label className="min-w-0 flex-1">
            <span className="sr-only">角色名称</span>
            <input
              type="text"
              value={newRoleName}
              onChange={(event) => setNewRoleName(event.target.value)}
              className="rps-field"
              placeholder="输入角色名称，例如：值班科学家"
            />
          </label>
          <button
            type="submit"
            className="rps-button-primary shrink-0"
          >
            创建角色
          </button>
        </form>
      </section>

      <section className="overflow-x-auto border-y border-slate-200 bg-white" aria-label="角色列表">
        <table className="rps-list-table min-w-[680px]">
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
            ) : filteredRoles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  {normalizedQuery ? '没有匹配的角色。' : '暂未配置角色。'}
                </td>
              </tr>
            ) : (
              filteredRoles.map((role) => (
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

            <div className="border-l-2 border-[#3347b8] bg-slate-50 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">流程职责</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{getRoleGuide(selectedRole.name).responsibility}</p>
              <p className="mt-3 text-xs font-semibold text-slate-500">可执行操作</p>
              <p className="mt-1 text-sm text-slate-700">{getRoleGuide(selectedRole.name).capabilities.join('、')}</p>
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

      {guideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="role-guide-title">
          <button type="button" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={() => setGuideOpen(false)} aria-label="关闭角色说明" />
          <section className="relative max-h-[82vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 id="role-guide-title" className="text-xl font-semibold text-slate-950">角色说明</h2>
              <button type="button" onClick={() => setGuideOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="关闭">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </header>
            <div className="max-h-[calc(82vh-65px)] divide-y divide-slate-100 overflow-y-auto">
              {BUILT_IN_ROLE_ORDER.map((roleName) => {
                const guide = getRoleGuide(roleName);
                return (
                  <article key={roleName} className="grid gap-2 px-6 py-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-6">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{translateRole(roleName)}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">{roleName}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm leading-5 text-slate-700">{guide.responsibility}</p>
                      <p className="mt-1.5 text-xs leading-5 text-slate-500">{guide.capabilities.join(' · ')}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
