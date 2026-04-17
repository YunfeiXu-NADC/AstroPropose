'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createProposalType,
  getProposalTypes,
  getWorkflows,
  updateProposalType,
} from '@/lib/api';

export default function ProposalTypesPage() {
  const [proposalTypes, setProposalTypes] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newType, setNewType] = useState({
    name: '',
    description: '',
    workflow_id: '',
  });

  const [editingId, setEditingId] = useState(null);
  const [editingType, setEditingType] = useState({
    name: '',
    description: '',
    workflow_id: '',
  });

  const workflowNameMap = useMemo(
    () => Object.fromEntries(workflows.map((workflow) => [workflow.id, workflow.name])),
    [workflows]
  );

  async function refresh() {
    setLoading(true);
    try {
      const [types, workflowList] = await Promise.all([getProposalTypes(), getWorkflows()]);
      setProposalTypes(types);
      setWorkflows(workflowList);
    } catch (err) {
      console.error(err);
      setError(err.info?.message || 'Failed to load proposal types');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!newType.name.trim() || !newType.workflow_id) {
      setError('Proposal type name and workflow are required');
      return;
    }

    try {
      await createProposalType({
        name: newType.name.trim(),
        description: newType.description,
        workflow_id: Number(newType.workflow_id),
      });
      setSuccess(`Published proposal type "${newType.name.trim()}"`);
      setNewType({ name: '', description: '', workflow_id: '' });
      setShowCreateForm(false);
      await refresh();
    } catch (err) {
      console.error(err);
      setError(err.info?.message || 'Failed to publish proposal type');
    }
  };

  const startEdit = (proposalType) => {
    setEditingId(proposalType.id);
    setEditingType({
      name: proposalType.name,
      description: proposalType.description || '',
      workflow_id: String(proposalType.workflow_id || ''),
    });
    setError('');
    setSuccess('');
  };

  const handleUpdate = async (proposalTypeId) => {
    setError('');
    setSuccess('');

    if (!editingType.name.trim() || !editingType.workflow_id) {
      setError('Proposal type name and workflow are required');
      return;
    }

    try {
      await updateProposalType(proposalTypeId, {
        name: editingType.name.trim(),
        description: editingType.description,
        workflow_id: Number(editingType.workflow_id),
      });
      setSuccess(`Updated proposal type "${editingType.name.trim()}"`);
      setEditingId(null);
      await refresh();
    } catch (err) {
      console.error(err);
      setError(err.info?.message || 'Failed to update proposal type');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Proposal Type Publishing</h1>
          <p className="text-sm text-gray-500 mt-2">
            Publish a workflow by exposing it as a selectable proposal type for proposers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((value) => !value)}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          {showCreateForm ? 'Cancel' : '+ Publish Workflow'}
        </button>
      </div>

      {error && <p className="text-red-500 bg-red-100 p-3 rounded">{error}</p>}
      {success && <p className="text-green-500 bg-green-100 p-3 rounded">{success}</p>}

      {showCreateForm && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Publish New Proposal Type</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Proposal Type Name *</label>
                <input
                  type="text"
                  value={newType.name}
                  onChange={(event) => setNewType((prev) => ({ ...prev, name: event.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                  placeholder="e.g. CSST Cycle-1 Imaging"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Workflow *</label>
                <select
                  value={newType.workflow_id}
                  onChange={(event) => setNewType((prev) => ({ ...prev, workflow_id: event.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                >
                  <option value="">Select workflow</option>
                  {workflows.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                rows={3}
                value={newType.description}
                onChange={(event) => setNewType((prev) => ({ ...prev, description: event.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Publish
            </button>
          </form>
        </div>
      )}

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Published Workflow
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : proposalTypes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                  No proposal types published yet.
                </td>
              </tr>
            ) : (
              proposalTypes.map((proposalType) => (
                <tr key={proposalType.id}>
                  {editingId === proposalType.id ? (
                    <>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={editingType.name}
                          onChange={(event) => setEditingType((prev) => ({ ...prev, name: event.target.value }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={editingType.description}
                          onChange={(event) => setEditingType((prev) => ({ ...prev, description: event.target.value }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={editingType.workflow_id}
                          onChange={(event) => setEditingType((prev) => ({ ...prev, workflow_id: event.target.value }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value="">Select workflow</option>
                          {workflows.map((workflow) => (
                            <option key={workflow.id} value={workflow.id}>
                              {workflow.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 text-right text-sm space-x-2">
                        <button
                          type="button"
                          onClick={() => handleUpdate(proposalType.id)}
                          className="text-green-600 hover:text-green-900"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{proposalType.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{proposalType.description || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {workflowNameMap[proposalType.workflow_id] || `Workflow #${proposalType.workflow_id}`}
                      </td>
                      <td className="px-6 py-4 text-right text-sm">
                        <button
                          type="button"
                          onClick={() => startEdit(proposalType)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          Edit
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
