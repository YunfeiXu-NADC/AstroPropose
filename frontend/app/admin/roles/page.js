'use client';

import { useEffect, useState } from 'react';

import {
  createAdminRole,
  deleteAdminRole,
  listAdminRoles,
  updateAdminRole,
} from '@/lib/api';

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
      setError(err.info?.message || 'Failed to load roles');
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
      setError('Role name is required');
      return;
    }

    try {
      await createAdminRole({ name: newRoleName.trim() });
      setSuccess(`Role "${newRoleName.trim()}" created successfully`);
      setNewRoleName('');
      await fetchRoles();
    } catch (err) {
      console.error(err);
      setError(err.info?.message || 'Failed to create role');
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
      setError('Role name is required');
      return;
    }

    try {
      await updateAdminRole(selectedRole.id, { name: editRoleName.trim() });
      setSuccess(`Role "${selectedRole.name}" updated successfully`);
      await fetchRoles(selectedRole.id);
    } catch (err) {
      console.error(err);
      setError(err.info?.message || 'Failed to update role');
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
      setSuccess(`Role "${selectedRole.name}" deleted successfully`);
      await fetchRoles(null);
    } catch (err) {
      console.error(err);
      setError(err.info?.message || 'Failed to delete role');
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
        <h1 className="text-3xl font-bold">Role Management</h1>
        <p className="text-sm text-gray-600">
          Manage built-in and custom roles. Custom roles can be assigned to users and workflow transitions.
        </p>
      </div>

      {error && <p className="text-red-500 bg-red-100 p-3 rounded">{error}</p>}
      {success && <p className="text-green-600 bg-green-100 p-3 rounded">{success}</p>}

      <section className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Create Role</h2>
        <form onSubmit={handleCreateRole} className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Role Name</label>
            <input
              type="text"
              value={newRoleName}
              onChange={(event) => setNewRoleName(event.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="e.g. Time Allocation Committee"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Create Role
          </button>
        </form>
      </section>

      <section className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Roles</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Users
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Workflow References
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : roles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No roles configured yet.
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr
                  key={role.id}
                  className={selectedRoleId === role.id ? 'bg-indigo-50' : undefined}
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{role.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {role.is_system ? 'System' : 'Custom'}
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
                      Manage
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
              <h2 className="text-xl font-semibold">Role Details</h2>
              <p className="text-sm text-gray-500">
                System roles keep platform permissions stable. Custom roles can be renamed unless they are already referenced by workflows.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="rounded border p-4">
                <p className="text-gray-500">Type</p>
                <p className="font-semibold">{selectedRole.is_system ? 'System' : 'Custom'}</p>
              </div>
              <div className="rounded border p-4">
                <p className="text-gray-500">Assigned Users</p>
                <p className="font-semibold">{selectedRole.user_count}</p>
              </div>
              <div className="rounded border p-4">
                <p className="text-gray-500">Workflow References</p>
                <p className="font-semibold">{selectedRole.workflow_reference_count}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Role Name</label>
              <input
                type="text"
                value={editRoleName}
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
              Save Name
            </button>
          </form>

          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Delete Role</h2>
              <p className="text-sm text-gray-500">
                Deletion is only allowed for custom roles that are not assigned to users and not used by workflow transitions.
              </p>
            </div>

            {deleteBlocked ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {selectedRole.is_system
                  ? 'System roles cannot be deleted.'
                  : 'Remove user assignments and workflow references before deleting this role.'}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleDeleteRole}
              disabled={deleteBlocked}
              className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300"
            >
              Delete Role
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
