'use client';

import { useEffect, useState } from 'react';
import {
  listFormTemplates,
  getFormTemplate,
  createFormTemplate,
  updateFormTemplate,
  listInstruments,
  listExternalTools,
  getExternalTool,
} from '@/lib/api';
import { translatePhase } from '@/lib/locale.mjs';

// Field type options
const FIELD_TYPES = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '下拉选择' },
  { value: 'checkbox', label: '复选框' },
  { value: 'file', label: '文件上传' },
  { value: 'repeatable', label: '可重复分组（多个目标）' },
];

// Phase options
const PHASE_OPTIONS = [
  { value: 'phase1', label: '申请阶段' },
  { value: 'phase2', label: '补充材料阶段' },
];

export default function FormManagementPage() {
  const [templates, setTemplates] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [externalTools, setExternalTools] = useState([]);
  const [externalToolOperations, setExternalToolOperations] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [currentTemplate, setCurrentTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create new form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [newFormPhase, setNewFormPhase] = useState('phase1');
  const [newFormInstrument, setNewFormInstrument] = useState('');
  const [fields, setFields] = useState([]);

  // Editing field state
  const [editingFieldIndex, setEditingFieldIndex] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [templatesData, instrumentsData, toolsData] = await Promise.all([
          listFormTemplates(),
          listInstruments(),
          listExternalTools(),
        ]);
        setTemplates(templatesData);
        setInstruments(instrumentsData);
        setExternalTools(toolsData);
        
        // Load all external tool operations
        const allOperations = [];
        for (const tool of toolsData) {
          try {
            const toolDetail = await getExternalTool(tool.id);
            if (toolDetail.operations && Array.isArray(toolDetail.operations)) {
              toolDetail.operations.forEach(op => {
                allOperations.push({
                  ...op,
                  toolName: tool.name,
                  toolId: tool.id,
                });
              });
            }
          } catch (err) {
            console.error(`Failed to load operations for tool ${tool.id}:`, err);
          }
        }
        console.log('Loaded external tool operations:', allOperations);
        setExternalToolOperations(allOperations);
      } catch (err) {
        setError('表单配置数据加载失败');
        console.error(err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) {
      setCurrentTemplate(null);
      return;
    }
    
    const fetchTemplate = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await getFormTemplate(selectedTemplateId);
        setCurrentTemplate(data);
        setFields(data.definition?.fields || []);
      } catch (err) {
        setError('表单模板加载失败');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTemplate();
  }, [selectedTemplateId]);

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    setSuccess('');
    setError('');

    if (!newFormName.trim()) {
      setError('表单名称不能为空');
      return;
    }

    if (fields.length === 0) {
      setError('至少需要添加一个字段');
      return;
    }

    try {
      // Convert subFields to sub_fields for backend compatibility
      const fieldsToSave = fields.map(field => {
        if (field.subFields) {
          const { subFields, ...rest } = field;
          return { ...rest, sub_fields: subFields };
        }
        return field;
      });
      
      const templateData = {
        name: newFormName,
        phase: newFormPhase,
        instrument_code: newFormInstrument || null,
        definition: { fields: fieldsToSave },
      };

      const result = await createFormTemplate(templateData);
      setSuccess(`表单模板“${newFormName}”创建成功（版本 ${result.version}）`);
      setNewFormName('');
      setNewFormPhase('phase1');
      setNewFormInstrument('');
      setFields([]);
      setShowCreateForm(false);

      // Refresh template list
      const templatesData = await listFormTemplates();
      setTemplates(templatesData);
      if (result.id) {
        setSelectedTemplateId(result.id);
      }
    } catch (err) {
      setError(err.info?.message || '表单模板创建失败');
      console.error(err);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!currentTemplate) return;
    
    setSuccess('');
    setError('');

    try {
      // Convert subFields to sub_fields for backend compatibility
      const fieldsToSave = fields.map(field => {
        if (field.subFields) {
          const { subFields, ...rest } = field;
          return { ...rest, sub_fields: subFields };
        }
        return field;
      });
      
      await updateFormTemplate(currentTemplate.id, {
        definition: { fields: fieldsToSave },
      });
      setSuccess('表单模板更新成功');
    } catch (err) {
      setError(err.info?.message || '表单模板更新失败');
      console.error(err);
    }
  };

  const addField = () => {
    const newField = {
      name: `field_${Date.now()}`,
      label: '新字段',
      type: 'text',
      required: false,
    };
    setFields([...fields, newField]);
    setEditingFieldIndex(fields.length);
  };

  const updateField = (index, updates) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  const deleteField = (index) => {
    const newFields = fields.filter((_, i) => i !== index);
    setFields(newFields);
    if (editingFieldIndex === index) {
      setEditingFieldIndex(null);
    }
  };

  const moveField = (index, direction) => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === fields.length - 1)
    ) {
      return;
    }
    
    const newFields = [...fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    setFields(newFields);
  };

  const addSelectOption = (fieldIndex) => {
    const newFields = [...fields];
    if (!newFields[fieldIndex].options) {
      newFields[fieldIndex].options = [];
    }
    newFields[fieldIndex].options.push({
      value: `option_${Date.now()}`,
      label: '新选项',
    });
    setFields(newFields);
  };

  const updateSelectOption = (fieldIndex, optionIndex, updates) => {
    const newFields = [...fields];
    newFields[fieldIndex].options[optionIndex] = {
      ...newFields[fieldIndex].options[optionIndex],
      ...updates,
    };
    setFields(newFields);
  };

  const deleteSelectOption = (fieldIndex, optionIndex) => {
    const newFields = [...fields];
    newFields[fieldIndex].options = newFields[fieldIndex].options.filter(
      (_, i) => i !== optionIndex
    );
    setFields(newFields);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">表单模板管理</h1>

      {/* Create new form section */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">创建表单模板</h2>
          <button
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              if (!showCreateForm) {
                setFields([]);
                setEditingFieldIndex(null);
              }
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            {showCreateForm ? '取消' : '+ 新建表单'}
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateTemplate} className="space-y-6">
            {/* Basic info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  表单名称 *
                </label>
                <input
                  type="text"
                  required
                  value={newFormName}
                  onChange={(e) => setNewFormName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="例如：低频成像观测表单"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  阶段 *
                </label>
                <select
                  value={newFormPhase}
                  onChange={(e) => setNewFormPhase(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {PHASE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  关联仪器（可选）
                </label>
                <select
                  value={newFormInstrument}
                  onChange={(e) => setNewFormInstrument(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">通用表单</option>
                  {instruments.map((inst) => (
                    <option key={inst.code} value={inst.code}>
                      {inst.code} - {inst.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Field editor */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-medium">表单字段</h3>
                <button
                  type="button"
                  onClick={addField}
                  className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                >
                  + 添加字段
                </button>
              </div>

              {fields.length === 0 ? (
                <p className="text-gray-500 text-sm">暂无字段，请点击“添加字段”。</p>
              ) : (
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <FieldEditor
                      key={index}
                      field={field}
                      index={index}
                      isEditing={editingFieldIndex === index}
                      onEdit={() => setEditingFieldIndex(index)}
                      onCollapse={() => setEditingFieldIndex(null)}
                      onUpdate={(updates) => updateField(index, updates)}
                      onDelete={() => deleteField(index)}
                      onMoveUp={() => moveField(index, 'up')}
                      onMoveDown={() => moveField(index, 'down')}
                      canMoveUp={index > 0}
                      canMoveDown={index < fields.length - 1}
                      onAddOption={() => addSelectOption(index)}
                      onUpdateOption={(optIdx, updates) =>
                        updateSelectOption(index, optIdx, updates)
                      }
                      onDeleteOption={(optIdx) => deleteSelectOption(index, optIdx)}
                      externalToolOperations={externalToolOperations}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              创建表单模板
            </button>
          </form>
        )}
      </div>

      {/* Edit existing form section */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">编辑表单模板</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            选择要编辑的表单模板：
          </label>
          <select
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
          >
            <option value="">请选择表单模板</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（版本 {t.version}）- {translatePhase(t.phase)}
                {t.instrument && ` - ${t.instrument}`}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-red-500 bg-red-100 p-3 rounded mb-4">{error}</p>}
        {success && <p className="text-green-500 bg-green-100 p-3 rounded mb-4">{success}</p>}

        {isLoading ? (
          <p>正在加载…</p>
        ) : currentTemplate ? (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded">
              <h3 className="font-medium mb-2">模板信息</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="font-medium">名称：</span>{currentTemplate.name}</div>
                <div><span className="font-medium">版本：</span>{currentTemplate.version}</div>
                <div><span className="font-medium">阶段：</span>{translatePhase(currentTemplate.phase)}</div>
                <div><span className="font-medium">仪器：</span>{currentTemplate.instrument || '通用'}</div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-medium">表单字段</h3>
                <button
                  type="button"
                  onClick={addField}
                  className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                >
                  + 添加字段
                </button>
              </div>

              {fields.length === 0 ? (
                <p className="text-gray-500 text-sm">暂无字段</p>
              ) : (
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <FieldEditor
                      key={index}
                      field={field}
                      index={index}
                      isEditing={editingFieldIndex === index}
                      onEdit={() => setEditingFieldIndex(index)}
                      onCollapse={() => setEditingFieldIndex(null)}
                      onUpdate={(updates) => updateField(index, updates)}
                      onDelete={() => deleteField(index)}
                      onMoveUp={() => moveField(index, 'up')}
                      onMoveDown={() => moveField(index, 'down')}
                      canMoveUp={index > 0}
                      canMoveDown={index < fields.length - 1}
                      onAddOption={() => addSelectOption(index)}
                      onUpdateOption={(optIdx, updates) =>
                        updateSelectOption(index, optIdx, updates)
                      }
                      onDeleteOption={(optIdx) => deleteSelectOption(index, optIdx)}
                      externalToolOperations={externalToolOperations}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleUpdateTemplate}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              保存修改
            </button>
          </div>
        ) : (
          <p className="text-gray-500">请选择一个表单模板开始编辑。</p>
        )}
      </div>
    </div>
  );
}

// Field editor component
function FieldEditor({
  field,
  index,
  isEditing,
  onEdit,
  onCollapse,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onAddOption,
  onUpdateOption,
  onDeleteOption,
  externalToolOperations = [],
}) {
  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      {!isEditing ? (
        // Preview mode
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="font-medium">{field.label}</div>
            <div className="text-sm text-gray-600">
              类型：{FIELD_TYPES.find(t => t.value === field.type)?.label || field.type} ｜
              字段名称：{field.name} ｜
              {field.required ? '必填' : '选填'}
            </div>
            {field.placeholder && (
              <div className="text-sm text-gray-500">占位提示：{field.placeholder}</div>
            )}
            {field.type === 'select' && field.options && (
              <div className="text-sm text-gray-600 mt-1">
                选项：{field.options.map(o => o.label).join('、')}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {canMoveUp && (
              <button
                type="button"
                onClick={onMoveUp}
                className="px-2 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
                title="上移"
              >
                ↑
              </button>
            )}
            {canMoveDown && (
              <button
                type="button"
                onClick={onMoveDown}
                className="px-2 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
                title="下移"
              >
                ↓
              </button>
            )}
            <button
              type="button"
              onClick={onEdit}
              className="px-2 py-1 text-sm bg-blue-100 hover:bg-blue-200 rounded"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="px-2 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded"
            >
              删除
            </button>
          </div>
        </div>
      ) : (
        // Edit mode
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">字段名称</label>
              <input
                type="text"
                value={field.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                className="mt-1 block w-full px-2 py-1 text-sm border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">显示标签</label>
              <input
                type="text"
                value={field.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
                className="mt-1 block w-full px-2 py-1 text-sm border border-gray-300 rounded"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">字段类型</label>
              <select
                value={field.type}
                onChange={(e) => onUpdate({ type: e.target.value })}
                className="mt-1 block w-full px-2 py-1 text-sm border border-gray-300 rounded"
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={field.required || false}
                  onChange={(e) => onUpdate({ required: e.target.checked })}
                  className="mr-2"
                />
                必填字段
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">占位提示</label>
            <input
              type="text"
              value={field.placeholder || ''}
              onChange={(e) => onUpdate({ placeholder: e.target.value })}
              className="mt-1 block w-full px-2 py-1 text-sm border border-gray-300 rounded"
            />
          </div>

          {/* External Tool Association */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">外部工具（可选）</label>
            <select
              value={field.external_tool_operation_id || ''}
              onChange={(e) => {
                const opId = e.target.value ? parseInt(e.target.value) : null;
                onUpdate({ external_tool_operation_id: opId });
              }}
              className="mt-1 block w-full px-2 py-1 text-sm border border-gray-300 rounded"
            >
              <option value="">不关联外部工具</option>
              {externalToolOperations.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.toolName} - {op.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              可将外部工具（如可见性计算器）关联到此字段，用户填写表单时可直接调用。
            </p>
            {field.external_tool_operation_id && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                <span className="text-blue-700">已关联工具：</span>
                {externalToolOperations.find(o => o.id === field.external_tool_operation_id)?.name || '未知工具'}
              </div>
            )}
          </div>

          {field.type === 'textarea' && (
            <div>
              <label className="block text-xs font-medium text-gray-700">行数</label>
              <input
                type="number"
                value={field.rows || 4}
                onChange={(e) => onUpdate({ rows: parseInt(e.target.value) })}
                className="mt-1 block w-full px-2 py-1 text-sm border border-gray-300 rounded"
                min="1"
                max="20"
              />
            </div>
          )}

          {field.type === 'select' && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-medium text-gray-700">选项</label>
                <button
                  type="button"
                  onClick={onAddOption}
                  className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 rounded"
                >
                  + 添加选项
                </button>
              </div>
              {field.options && field.options.length > 0 ? (
                <div className="space-y-2">
                  {field.options.map((option, optIdx) => (
                    <div key={optIdx} className="flex gap-2">
                      <input
                        type="text"
                        value={option.value}
                        onChange={(e) =>
                          onUpdateOption(optIdx, { value: e.target.value })
                        }
                        placeholder="选项值"
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                      />
                      <input
                        type="text"
                        value={option.label}
                        onChange={(e) =>
                          onUpdateOption(optIdx, { label: e.target.value })
                        }
                        placeholder="显示文字"
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                      />
                      <button
                        type="button"
                        onClick={() => onDeleteOption(optIdx)}
                        className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">暂无选项</p>
              )}
            </div>
          )}

          {field.type === 'repeatable' && (
            <div className="border-t pt-3 mt-3">
              <div className="bg-purple-50 p-3 rounded mb-3">
                <p className="text-xs text-purple-700">
                  <strong>可重复分组：</strong>用户可以添加多个观测目标。例如先定义一个目标的字段，再按需添加多个目标。
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">最少条目数</label>
                <input
                  type="number"
                  value={field.minEntries || 1}
                  onChange={(e) => onUpdate({ minEntries: parseInt(e.target.value) || 1 })}
                  className="mt-1 block w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  min="0"
                  max="100"
                />
              </div>
              <div className="mt-2">
                <label className="block text-xs font-medium text-gray-700">最多条目数（0 表示不限）</label>
                <input
                  type="number"
                  value={field.maxEntries || 0}
                  onChange={(e) => onUpdate({ maxEntries: parseInt(e.target.value) || 0 })}
                  className="mt-1 block w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  min="0"
                  max="1000"
                />
              </div>
              <div className="mt-3">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-medium text-gray-700">每个条目包含的子字段</label>
                  <button
                    type="button"
                    onClick={() => {
                      const subFields = field.subFields || [];
                      onUpdate({
                        subFields: [
                          ...subFields,
                          { name: `subfield_${Date.now()}`, label: '新子字段', type: 'text', required: false }
                        ]
                      });
                    }}
                    className="px-2 py-1 text-xs bg-purple-100 hover:bg-purple-200 rounded"
                  >
                    + 添加子字段
                  </button>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 p-2 rounded mb-2">
                  <p className="text-xs text-yellow-700">
                    <strong>提示：</strong>使用“仪器参数”类型可嵌入仪器专用观测参数表单，系统会自动加载提案所选仪器关联的模板。
                  </p>
                </div>
                {(field.subFields || field.sub_fields) && (field.subFields || field.sub_fields).length > 0 ? (
                  <div className="space-y-2">
                    {(field.subFields || field.sub_fields).map((subField, subIdx) => (
                      <div key={subIdx}>
                        <div className={`flex gap-2 items-center p-2 rounded ${subField.type === 'instrument_params' ? 'bg-indigo-100 border border-indigo-300' : 'bg-gray-100'}`}>
                          <input
                            type="text"
                            value={subField.name}
                            onChange={(e) => {
                              const currentSubFields = field.subFields || field.sub_fields || [];
                              const newSubFields = [...currentSubFields];
                              newSubFields[subIdx] = { ...newSubFields[subIdx], name: e.target.value };
                              onUpdate({ subFields: newSubFields });
                            }}
                            placeholder="字段名称"
                            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                          <input
                            type="text"
                            value={subField.label}
                            onChange={(e) => {
                              const currentSubFields = field.subFields || field.sub_fields || [];
                              const newSubFields = [...currentSubFields];
                              newSubFields[subIdx] = { ...newSubFields[subIdx], label: e.target.value };
                              onUpdate({ subFields: newSubFields });
                            }}
                            placeholder="显示标签"
                            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                          <select
                            value={subField.type}
                            onChange={(e) => {
                              const currentSubFields = field.subFields || field.sub_fields || [];
                              const newSubFields = [...currentSubFields];
                              newSubFields[subIdx] = { ...newSubFields[subIdx], type: e.target.value };
                              onUpdate({ subFields: newSubFields });
                            }}
                            className="px-2 py-1 text-xs border border-gray-300 rounded"
                          >
                            <option value="text">文本</option>
                            <option value="number">数字</option>
                            <option value="textarea">多行文本</option>
                            <option value="select">下拉选择</option>
                            <option value="instrument_params">仪器参数</option>
                          </select>
                          <label className="flex items-center text-xs">
                            <input
                              type="checkbox"
                              checked={subField.required || false}
                              onChange={(e) => {
                                const currentSubFields = field.subFields || field.sub_fields || [];
                                const newSubFields = [...currentSubFields];
                                newSubFields[subIdx] = { ...newSubFields[subIdx], required: e.target.checked };
                                onUpdate({ subFields: newSubFields });
                              }}
                              className="mr-1"
                            />
                            必填
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const currentSubFields = field.subFields || field.sub_fields || [];
                              const newSubFields = currentSubFields.filter((_, i) => i !== subIdx);
                              onUpdate({ subFields: newSubFields });
                            }}
                            className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded"
                          >
                            ×
                          </button>
                        </div>
                        {/* Sub-field external tool association */}
                        <div className="mt-1 ml-2 p-2 bg-gray-50 rounded border border-gray-200">
                          <label className="block text-xs text-gray-600 mb-1">外部工具：</label>
                          <select
                            value={subField.external_tool_operation_id || ''}
                            onChange={(e) => {
                              const currentSubFields = field.subFields || field.sub_fields || [];
                              const newSubFields = [...currentSubFields];
                              const opId = e.target.value ? parseInt(e.target.value) : null;
                              newSubFields[subIdx] = { ...newSubFields[subIdx], external_tool_operation_id: opId };
                              onUpdate({ subFields: newSubFields });
                            }}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          >
                            <option value="">不关联工具</option>
                            {externalToolOperations.map((op) => (
                              <option key={op.id} value={op.id}>
                                {op.toolName} - {op.name}
                              </option>
                            ))}
                          </select>
                          {subField.external_tool_operation_id && (
                            <div className="mt-1 text-xs text-blue-600">
                              {externalToolOperations.find(o => o.id === subField.external_tool_operation_id)?.name || '未知工具'}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">暂无子字段，可添加目标名称、赤经、赤纬和观测时间等字段。</p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCollapse}
              className="px-3 py-1 text-sm bg-indigo-600 text-white hover:bg-indigo-700 rounded"
            >
              完成编辑
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
