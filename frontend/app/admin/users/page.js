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
            {role.name}
            {role.is_system ? ' (system)' : ''}
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
      setError(err.info?.message || 'Failed to load users and roles');
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
      setError('Username, email, and password are required');
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
      setSuccess(`User "${newUsername.trim()}" created successfully`);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewIsActive(true);
      setNewRoleIds([]);
      setShowCreateForm(false);
      await fetchData();
    } catch (err) {
      console.error(err);
      setError(err.info?.message || 'Failed to create user');
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
      setSuccess(`User "${selectedUser.username}" updated successfully`);
      await fetchData(selectedUser.id);
    } catch (err) {
      console.error(err);
      setError(err.info?.message || 'Failed to update user');
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
      setError('Please enter a new password before resetting');
      return;
    }

    try {
      await resetAdminUserPassword(selectedUser.id, {
        new_password: resetPassword,
      });
      setSuccess(`Password reset for "${selectedUser.username}" completed`);
      setResetPassword('');
    } catch (err) {
      console.error(err);
      setError(err.info?.message || 'Failed to reset password');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-sm text-gray-600">
            Create users, assign roles, disable accounts, and reset passwords.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((value) => !value)}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          {showCreateForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {error && <p className="text-red-500 bg-red-100 p-3 rounded">{error}</p>}
      {success && <p className="text-green-600 bg-green-100 p-3 rounded">{success}</p>}

      {showCreateForm && (
        <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold">Create User</h2>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Username *</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(event) => setNewUsername(event.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email *</label>
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
                <label className="block text-sm font-medium text-gray-700">Temporary Password *</label>
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
                Active account
              </label>
            </div>

            <div>
              <p className="block text-sm font-medium text-gray-700 mb-2">Roles</p>
              <RoleChecklist
                roles={roles}
                selectedRoleIds={newRoleIds}
                onToggle={(roleId) => toggleRole(newRoleIds, roleId, setNewRoleIds)}
              />
              <p className="mt-2 text-xs text-gray-500">
                If you leave this empty, the backend will assign the default proposer role when available.
              </p>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Create User
            </button>
          </form>
        </section>
      )}

      <section className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Users</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Username
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Roles
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
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
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No users found.
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
                      <span className="ml-2 text-xs text-indigo-600">(you)</span>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{user.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{user.roles.join(', ') || 'No roles'}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs rounded-full ${
                        user.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => startEditingUser(user)}
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

      {selectedUser && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <form onSubmit={handleUpdateUser} className="xl:col-span-2 bg-white shadow-md rounded-lg p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Edit User</h2>
                <p className="text-sm text-gray-500">
                  Username is fixed after creation. Email, roles, and status can be updated here.
                </p>
              </div>
              <span className="text-sm font-medium text-gray-500">{selectedUser.username}</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
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
              Active account
              {selectedUser.id === currentUserId ? (
                <span className="text-xs text-gray-500">You cannot disable your own account.</span>
              ) : null}
            </label>

            <div>
              <p className="block text-sm font-medium text-gray-700 mb-2">Roles</p>
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
              Save Changes
            </button>
          </form>

          <form onSubmit={handleResetPassword} className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Reset Password</h2>
              <p className="text-sm text-gray-500">
                Set a new password for {selectedUser.username}. The old password will stop working immediately.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">New Password</label>
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
              Reset Password
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
