'use client';

import { useEffect, useState } from 'react';
import { listInstruments, createInstrument, updateInstrument } from '@/lib/api';

export default function InstrumentsPage() {
  const [instruments, setInstruments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create new instrument
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // Edit instrument
  const [editingCode, setEditingCode] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    fetchInstruments();
  }, []);

  const fetchInstruments = async () => {
    setIsLoading(true);
    try {
      const data = await listInstruments();
      setInstruments(data);
    } catch (err) {
      setError('仪器加载失败');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newCode.trim() || !newName.trim()) {
      setError('仪器编码和名称不能为空');
      return;
    }

    try {
      await createInstrument({
        code: newCode.toUpperCase(),
        name: newName,
        description: newDescription,
        is_active: true,
      });
      setSuccess(`仪器“${newCode.toUpperCase()}”创建成功`);
      setNewCode('');
      setNewName('');
      setNewDescription('');
      setShowCreateForm(false);
      fetchInstruments();
    } catch (err) {
      setError(err.info?.message || '仪器创建失败');
      console.error(err);
    }
  };

  const handleUpdate = async (code) => {
    setError('');
    setSuccess('');

    try {
      await updateInstrument(code, {
        name: editName,
        description: editDescription,
      });
      setSuccess(`仪器“${code}”更新成功`);
      setEditingCode(null);
      fetchInstruments();
    } catch (err) {
      setError(err.info?.message || '仪器更新失败');
      console.error(err);
    }
  };

  const handleToggleActive = async (instrument) => {
    setError('');
    setSuccess('');

    try {
      await updateInstrument(instrument.code, {
        is_active: !instrument.is_active,
      });
      setSuccess(`仪器“${instrument.code}”状态已更新`);
      fetchInstruments();
    } catch (err) {
      setError(err.info?.message || '仪器状态更新失败');
      console.error(err);
    }
  };

  const startEdit = (instrument) => {
    setEditingCode(instrument.code);
    setEditName(instrument.name);
    setEditDescription(instrument.description || '');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">仪器管理</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          {showCreateForm ? '取消' : '+ 添加仪器'}
        </button>
      </div>

      <p className="text-gray-600">
        管理鸿蒙计划的仪器列表。仪器可关联表单模板，用于收集对应的观测参数。
      </p>

      {error && <p className="text-red-500 bg-red-100 p-3 rounded">{error}</p>}
      {success && <p className="text-green-500 bg-green-100 p-3 rounded">{success}</p>}

      {/* Create new instrument form */}
      {showCreateForm && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">添加仪器</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  仪器编码 * <span className="text-gray-400">（唯一标识）</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 uppercase"
                  placeholder="例如：LF、HF"
                />
                <p className="mt-1 text-xs text-gray-500">
                  建议使用简短的大写字母缩写
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  仪器名称 *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="例如：低频成像阵列"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                说明
              </label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="简要说明仪器用途和频段"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              创建仪器
            </button>
          </form>
        </div>
      )}

      {/* Instrument list */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                编码
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                名称
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                说明
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
            ) : instruments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  暂未配置仪器，请点击“添加仪器”。
                </td>
              </tr>
            ) : (
              instruments.map((instrument) => (
                <tr key={instrument.code}>
                  {editingCode === instrument.code ? (
                    // Edit mode
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {instrument.code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            instrument.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {instrument.is_active ? '已启用' : '已停用'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleUpdate(instrument.code)}
                          className="text-green-600 hover:text-green-900"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingCode(null)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          取消
                        </button>
                      </td>
                    </>
                  ) : (
                    // Display mode
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {instrument.code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {instrument.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {instrument.description || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            instrument.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {instrument.is_active ? '已启用' : '已停用'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => startEdit(instrument)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleToggleActive(instrument)}
                          className={
                            instrument.is_active
                              ? 'text-red-600 hover:text-red-900'
                              : 'text-green-600 hover:text-green-900'
                          }
                        >
                          {instrument.is_active ? '停用' : '启用'}
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

      {/* Usage instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">使用说明</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>仪器编码：</strong>创建后不可修改，建议使用简短的大写字母缩写。</li>
          <li>• <strong>关联表单：</strong>创建表单模板时可关联指定仪器，以收集仪器专用参数。</li>
          <li>• <strong>通用表单：</strong>未关联仪器的表单适用于所有提案。</li>
          <li>• <strong>停用仪器：</strong>停用后不会出现在新建提案的仪器选择列表中。</li>
        </ul>
      </div>
    </div>
  );
}
