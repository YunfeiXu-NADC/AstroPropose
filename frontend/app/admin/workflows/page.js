'use client';

import { useEffect, useState } from 'react';
import {
  createProposalType,
  createFormTemplate,
  createWorkflow,
  getProposalTypes,
  getWorkflow,
  getWorkflows,
  listFormTemplates,
  saveWorkflow,
  updateFormTemplate,
  updateProposalType,
} from '@/lib/api';
import WorkflowEditor from '@/components/WorkflowEditor';
import { bindDslForms, DSL_FORM_PRESETS, DSL_WORKFLOW_PRESETS } from '@/lib/dslWorkflowPresets.mjs';

export default function WorkflowPage() {
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [currentWorkflow, setCurrentWorkflow] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // 新建工作流的状态
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
  const [installingPresets, setInstallingPresets] = useState(false);

  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const data = await getWorkflows();
        setWorkflows(data);
        if (data.length > 0) {
          setSelectedWorkflowId(data[0].id);
        }
      } catch (err) {
        setError('流程列表加载失败。');
        console.error(err);
      }
    };
    fetchWorkflows();
  }, []);

  useEffect(() => {
    if (!selectedWorkflowId) return;
    const fetchWorkflowDef = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await getWorkflow(selectedWorkflowId);
        setCurrentWorkflow(data);
      } catch (err) {
        setError(`Failed to load workflow ${selectedWorkflowId}.`);
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchWorkflowDef();
  }, [selectedWorkflowId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSuccess('');
    setError('');
    
    if (!newWorkflowName.trim()) {
      setError('流程名称不能为空。');
      return;
    }
    
    try {
      const result = await createWorkflow({
        name: newWorkflowName,
        description: newWorkflowDescription,
      });
      setSuccess(`流程“${newWorkflowName}”创建成功`);
      setNewWorkflowName('');
      setNewWorkflowDescription('');
      setShowCreateForm(false);
      
      // 刷新工作流列表
      const data = await getWorkflows();
      setWorkflows(data);
      if (result.id) {
        setSelectedWorkflowId(result.id);
      }
    } catch (err) {
      setError(err.info?.message || '流程创建失败。');
      console.error(err);
    }
  };

  const handleSave = async (definition) => {
    setSuccess('');
    setError('');
    try {
      await saveWorkflow(selectedWorkflowId, { ...currentWorkflow, definition });
      setSuccess('流程保存成功。');
    } catch (err) {
      setError('流程保存失败。');
      console.error(err);
    }
  };

  const installDslPresets = async () => {
    setInstallingPresets(true);
    setSuccess('');
    setError('');
    try {
      const formIds = {};
      let templates = await listFormTemplates();
      for (const preset of DSL_FORM_PRESETS) {
        const existing = templates.find((item) => item.name === preset.name);
        if (existing) {
          await updateFormTemplate(existing.id, { definition: preset.definition });
          formIds[preset.key] = existing.id;
        } else {
          const created = await createFormTemplate({
            name: preset.name,
            phase: preset.phase,
            instrument_code: preset.instrument_code || null,
            definition: preset.definition,
          });
          formIds[preset.key] = created.id;
          templates = await listFormTemplates();
        }
      }

      let workflowList = await getWorkflows();
      let proposalTypes = await getProposalTypes();
      let firstWorkflowId = null;

      for (const preset of DSL_WORKFLOW_PRESETS) {
        const definition = bindDslForms(preset.definition, formIds);
        const existingWorkflow = workflowList.find((item) => item.name === preset.workflowName);
        let workflowId = existingWorkflow?.id;
        if (workflowId) {
          await saveWorkflow(workflowId, {
            name: preset.workflowName,
            description: preset.description,
            definition,
          });
        } else {
          const created = await createWorkflow({
            name: preset.workflowName,
            description: preset.description,
            definition,
          });
          workflowId = created.id;
        }
        firstWorkflowId ||= workflowId;

        const existingType = proposalTypes.find((item) => item.name === preset.proposalTypeName);
        if (existingType) {
          await updateProposalType(existingType.id, {
            description: preset.description,
            workflow_id: workflowId,
          });
        } else {
          await createProposalType({
            name: preset.proposalTypeName,
            description: preset.description,
            workflow_id: workflowId,
          });
        }
        workflowList = await getWorkflows();
        proposalTypes = await getProposalTypes();
      }

      setWorkflows(workflowList);
      setSelectedWorkflowId(firstWorkflowId || '');
      setSuccess('DSL 双流程、节点表单及 LF / HF 参数表已安装并完成关联。');
    } catch (err) {
      console.error(err);
      setError(err.info?.message || 'DSL 流程安装失败。');
    } finally {
      setInstallingPresets(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="rps-eyebrow">系统配置</p>
          <h1 className="mt-2 text-3xl font-bold">流程管理</h1>
          <p className="mt-2 text-sm text-slate-600">配置提案状态、角色权限、表单与流转操作。</p>
        </div>
        <button
          type="button"
          onClick={installDslPresets}
          disabled={installingPresets}
          className="rps-button-primary disabled:cursor-wait disabled:opacity-60"
        >
          {installingPresets ? '正在安装…' : '安装 / 更新 DSL 双流程'}
        </button>
      </div>
      
      {/* Create new workflow section */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">创建新流程</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            {showCreateForm ? '取消' : '+ 新建流程'}
          </button>
        </div>
        
        {showCreateForm && (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="workflow-name" className="block text-sm font-medium text-gray-700">
                流程名称 *
              </label>
              <input
                id="workflow-name"
                type="text"
                required
                value={newWorkflowName}
                onChange={(e) => setNewWorkflowName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="例如：鸿蒙研究提案流程"
              />
            </div>
            <div>
              <label htmlFor="workflow-description" className="block text-sm font-medium text-gray-700">
                说明
              </label>
              <textarea
                id="workflow-description"
                rows={3}
                value={newWorkflowDescription}
                onChange={(e) => setNewWorkflowDescription(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="说明该流程的用途"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              创建流程
            </button>
          </form>
        )}
      </div>

      {/* Edit existing workflow section */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">编辑流程</h2>
        <div className="mb-4">
          <label htmlFor="workflow-select" className="block text-sm font-medium text-gray-700 mb-1">
            选择要编辑的流程：
          </label>
          <select
            id="workflow-select"
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            value={selectedWorkflowId}
            onChange={(e) => setSelectedWorkflowId(e.target.value)}
          >
            <option value="">请选择流程</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-red-500 bg-red-100 p-3 rounded mb-4">{error}</p>}
        {success && <p className="text-green-500 bg-green-100 p-3 rounded mb-4">{success}</p>}

        {isLoading ? (
          <p>正在加载…</p>
        ) : currentWorkflow ? (
          <WorkflowEditor
            initialDefinition={currentWorkflow.definition}
            onSave={handleSave}
          />
        ) : (
          <p className="text-gray-500">请选择一个流程开始编辑。</p>
        )}
      </div>
    </div>
  );
}
