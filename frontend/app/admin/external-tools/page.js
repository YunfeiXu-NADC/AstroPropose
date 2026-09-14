'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  listExternalTools,
  getExternalTool,
  createExternalTool,
  updateExternalTool,
  refreshExternalToolSpec,
  createToolOperation,
  updateToolOperation,
  testToolOperation,
} from '@/lib/api';

const AUTH_TYPES = [
  { value: 'none', label: '无需认证' },
  { value: 'api_key', label: '接口密钥' },
  { value: 'bearer', label: '访问令牌' },
  { value: 'basic', label: '账号密码' },
];

const AUTH_TYPE_LABELS = Object.fromEntries(AUTH_TYPES.map(({ value, label }) => [value, label]));

export default function ExternalToolsPage() {
  const router = useRouter();
  const [tools, setTools] = useState([]);
  const [selectedTool, setSelectedTool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New tool form
  const [showNewToolForm, setShowNewToolForm] = useState(false);
  const [newTool, setNewTool] = useState({
    name: '',
    description: '',
    base_url: '',
    openapi_spec_url: '',
    auth_type: 'none',
    auth_config: {},
  });

  // Test operation form
  const [testingOperation, setTestingOperation] = useState(null);
  const [testParams, setTestParams] = useState({});
  const [testResult, setTestResult] = useState(null);

  // New operation form
  const [showNewOperationForm, setShowNewOperationForm] = useState(false);
  const [newOperation, setNewOperation] = useState({
    operation_id: '',
    name: '',
    description: '',
    method: 'POST',
    path: '',
    parameters: {},
    request_body: {},
    response_schema: {},
    input_mapping: {},
    output_mapping: {},
    timeout: 30,
    retry_config: {},
    tool_type: 'other',
    validation_config: {
      block_on_failure: true,
      block_on_service_error: false,
      failure_conditions: [],
      error_message_template: '校验失败',
    },
  });

  useEffect(() => {
    fetchTools();
  }, []);

  const fetchTools = async () => {
    try {
      setLoading(true);
      const data = await listExternalTools();
      setTools(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchToolDetails = async (toolId) => {
    try {
      const data = await getExternalTool(toolId);
      setSelectedTool(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateTool = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await createExternalTool(newTool);
      setSuccess('外部工具注册成功');
      setShowNewToolForm(false);
      setNewTool({
        name: '',
        description: '',
        base_url: '',
        openapi_spec_url: '',
        auth_type: 'none',
        auth_config: {},
      });
      fetchTools();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRefreshSpec = async (toolId) => {
    try {
      setError('');
      const result = await refreshExternalToolSpec(toolId);
      setSuccess(`规范已刷新，已导入 ${result.operations_imported} 个操作`);
      fetchToolDetails(toolId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTestOperation = async (operation) => {
    setTestingOperation(operation);
    setTestParams({});
    setTestResult(null);
  };

  const executeTest = async () => {
    try {
      setError('');
      const result = await testToolOperation(testingOperation.id, testParams);
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    }
  };

  const handleCreateOperation = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await createToolOperation(selectedTool.id, newOperation);
      setSuccess('操作创建成功');
      setShowNewOperationForm(false);
      setNewOperation({
        operation_id: '',
        name: '',
        description: '',
        method: 'POST',
        path: '',
        parameters: {},
        request_body: {},
        response_schema: {},
        input_mapping: {},
        output_mapping: {},
        timeout: 30,
        retry_config: {},
        tool_type: 'other',
        validation_config: {
          block_on_failure: true,
          block_on_service_error: false,
          failure_conditions: [],
          error_message_template: '校验失败',
        },
      });
      fetchToolDetails(selectedTool.id);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">正在加载外部工具…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">外部工具</h1>
            <p className="text-gray-600 mt-1">
              注册并管理流程自动化所需的外部接口
            </p>
          </div>
          <button
            onClick={() => setShowNewToolForm(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            + 注册外部工具
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
            {success}
          </div>
        )}

        {/* New Tool Form Modal */}
        {showNewToolForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">注册外部工具</h2>
              
              <form onSubmit={handleCreateTool} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">工具名称 *</label>
                  <input
                    type="text"
                    required
                    value={newTool.name}
                    onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="例如：提案通知服务"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">说明</label>
                  <textarea
                    value={newTool.description}
                    onChange={(e) => setNewTool({ ...newTool, description: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    rows={2}
                    placeholder="简要说明这个工具的用途"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">服务地址 *</label>
                  <input
                    type="url"
                    required
                    value={newTool.base_url}
                    onChange={(e) => setNewTool({ ...newTool, base_url: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="https://api.example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    OpenAPI 规范地址（可选）
                  </label>
                  <input
                    type="url"
                    value={newTool.openapi_spec_url}
                    onChange={(e) => setNewTool({ ...newTool, openapi_spec_url: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="https://api.example.com/openapi.json"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    填写后将自动从规范中导入操作；注册工具后也可手动添加。
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">认证方式</label>
                  <select
                    value={newTool.auth_type}
                    onChange={(e) => setNewTool({ ...newTool, auth_type: e.target.value, auth_config: {} })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {AUTH_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {newTool.auth_type === 'bearer' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">访问令牌</label>
                    <input
                      type="password"
                      value={newTool.auth_config.token || ''}
                      onChange={(e) =>
                        setNewTool({
                          ...newTool,
                          auth_config: { ...newTool.auth_config, token: e.target.value },
                        })
                      }
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="请输入访问令牌"
                    />
                  </div>
                )}

                {newTool.auth_type === 'api_key' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">请求头名称</label>
                      <input
                        type="text"
                        value={newTool.auth_config.key_name || 'X-API-Key'}
                        onChange={(e) =>
                          setNewTool({
                            ...newTool,
                            auth_config: { ...newTool.auth_config, key_name: e.target.value },
                          })
                        }
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">接口密钥</label>
                      <input
                        type="password"
                        value={newTool.auth_config.key_value || ''}
                        onChange={(e) =>
                          setNewTool({
                            ...newTool,
                            auth_config: { ...newTool.auth_config, key_value: e.target.value },
                          })
                        }
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </>
                )}

                {newTool.auth_type === 'basic' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">用户名</label>
                      <input
                        type="text"
                        value={newTool.auth_config.username || ''}
                        onChange={(e) =>
                          setNewTool({
                            ...newTool,
                            auth_config: { ...newTool.auth_config, username: e.target.value },
                          })
                        }
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">密码</label>
                      <input
                        type="password"
                        value={newTool.auth_config.password || ''}
                        onChange={(e) =>
                          setNewTool({
                            ...newTool,
                            auth_config: { ...newTool.auth_config, password: e.target.value },
                          })
                        }
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowNewToolForm(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    注册工具
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition cursor-pointer"
              onClick={() => fetchToolDetails(tool.id)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{tool.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{tool.description || '暂无说明'}</p>
                </div>
                <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 rounded">
                  {AUTH_TYPE_LABELS[tool.auth_type] || tool.auth_type}
                </span>
              </div>
              <div className="mt-4 text-sm text-gray-600">
                <p className="truncate">
                  <span className="font-medium">服务地址：</span> {tool.base_url}
                </p>
                <p className="mt-1">
                  <span className="font-medium">操作数：</span> {tool.operations_count}
                </p>
              </div>
            </div>
          ))}

          {tools.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              暂未注册外部工具，请点击“注册外部工具”添加。
            </div>
          )}
        </div>

        {/* Tool Details Modal */}
        {selectedTool && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedTool.name}</h2>
                  <p className="text-gray-600">{selectedTool.base_url}</p>
                </div>
                <button
                  onClick={() => setSelectedTool(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {selectedTool.openapi_spec_url && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-blue-800">OpenAPI 规范</p>
                      <p className="text-xs text-blue-600 truncate">{selectedTool.openapi_spec_url}</p>
                    </div>
                    <button
                      onClick={() => handleRefreshSpec(selectedTool.id)}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      刷新规范
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">操作（{selectedTool.operations?.length || 0}）</h3>
                <button
                  onClick={() => setShowNewOperationForm(true)}
                  className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                >
                  + 添加操作
                </button>
              </div>
              
              <div className="space-y-4">
                {selectedTool.operations?.map((op) => (
                  <div key={op.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs font-mono rounded ${
                            op.method === 'GET' ? 'bg-green-100 text-green-800' :
                            op.method === 'POST' ? 'bg-blue-100 text-blue-800' :
                            op.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
                            op.method === 'DELETE' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {op.method}
                          </span>
                          <span className="font-mono text-sm">{op.path}</span>
                        </div>
                        <p className="text-sm font-medium mt-1">{op.name}</p>
                        {op.description && (
                          <p className="text-xs text-gray-500 mt-1">{op.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleTestOperation(op)}
                          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        >
                          测试
                        </button>
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                          编号：{op.id}
                        </span>
                      </div>
                    </div>

                    {op.input_mapping && Object.keys(op.input_mapping).length > 0 && (
                      <div className="mt-3 p-2 bg-gray-50 rounded text-xs">
                        <span className="font-medium">输入映射：</span>
                        <pre className="mt-1 overflow-x-auto">
                          {JSON.stringify(op.input_mapping, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}

                {selectedTool.operations?.length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                    <p className="text-gray-500 mb-2">暂未定义操作。</p>
                    <p className="text-sm text-gray-400">
                      {selectedTool.openapi_spec_url
                        ? '点击“刷新规范”从 OpenAPI 导入，或点击“添加操作”手动创建。'
                        : '点击“添加操作”手动配置接口。'}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
                <h4 className="font-medium text-yellow-800">在流程中使用</h4>
                <p className="text-sm text-yellow-700 mt-1">
                  如需在流程流转时调用该操作，请将其添加到流转规则的“执行效果”配置中：
                </p>
                <pre className="mt-2 p-2 bg-white rounded text-xs overflow-x-auto">
{`"effects": {
  "external_tools": [
    {
      "operation_id": ${selectedTool.operations?.[0]?.id || 'OPERATION_ID'},
      "async": false,
      "on_failure": "continue"
    }
  ]
}`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Test Operation Modal */}
        {testingOperation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">测试操作：{testingOperation.name}</h2>
              <p className="text-sm text-gray-600 mb-4">
                <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                  {testingOperation.method} {testingOperation.path}
                </span>
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">测试参数（JSON）</label>
                  <textarea
                    value={JSON.stringify(testParams, null, 2)}
                    onChange={(e) => {
                      try {
                        setTestParams(JSON.parse(e.target.value));
                      } catch {}
                    }}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                    rows={8}
                    placeholder={`{
  "path": {},
  "query": {},
  "body": {}
}`}
                  />
                </div>

                {testResult && (
                  <div className={`p-4 rounded-lg ${testResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                    <h4 className={`font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                      {testResult.success ? '✓ 测试成功' : '✕ 测试失败'}
                    </h4>
                    {testResult.status_code && (
                      <p className="text-sm mt-1">状态码：{testResult.status_code}</p>
                    )}
                    {testResult.error && (
                      <p className="text-sm text-red-600 mt-1">{testResult.error}</p>
                    )}
                    {testResult.response && (
                      <pre className="mt-2 p-2 bg-white rounded text-xs overflow-x-auto max-h-60">
                        {JSON.stringify(testResult.response, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setTestingOperation(null);
                    setTestResult(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  关闭
                </button>
                <button
                  onClick={executeTest}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  执行测试
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Operation Form Modal */}
        {showNewOperationForm && selectedTool && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">添加操作</h2>
              
              <form onSubmit={handleCreateOperation} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">操作标识 *</label>
                    <input
                      type="text"
                      required
                      value={newOperation.operation_id}
                      onChange={(e) => setNewOperation({ ...newOperation, operation_id: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="例如：createNotification"
                    />
                    <p className="mt-1 text-xs text-gray-500">用于在流程中唯一识别该操作</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">名称 *</label>
                    <input
                      type="text"
                      required
                      value={newOperation.name}
                      onChange={(e) => setNewOperation({ ...newOperation, name: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="例如：创建通知"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">说明</label>
                  <textarea
                    value={newOperation.description}
                    onChange={(e) => setNewOperation({ ...newOperation, description: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    rows={2}
                    placeholder="简要说明该操作的用途"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">HTTP 方法 *</label>
                    <select
                      required
                      value={newOperation.method}
                      onChange={(e) => setNewOperation({ ...newOperation, method: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">接口路径 *</label>
                    <input
                      type="text"
                      required
                      value={newOperation.path}
                      onChange={(e) => setNewOperation({ ...newOperation, path: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                      placeholder="/api/notifications"
                    />
                    <p className="mt-1 text-xs text-gray-500">路径参数使用 {'{param}'}，例如 /api/users/{'{id}'}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">工具类型 *</label>
                  <select
                    required
                    value={newOperation.tool_type}
                    onChange={(e) => {
                      const toolType = e.target.value;
                      setNewOperation({
                        ...newOperation,
                        tool_type: toolType,
                        // 如果是验证类工具，初始化验证配置
                        validation_config: toolType === 'validation' ? {
                          block_on_failure: true,
                          block_on_service_error: false,
                          failure_conditions: [],
                          error_message_template: '校验失败',
                        } : newOperation.validation_config,
                      });
                    }}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="other">其他</option>
                    <option value="validation">校验（例如可见性检查）</option>
                    <option value="notification">通知</option>
                    <option value="data_processing">数据处理</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    校验不通过时可阻止流程继续流转，例如目标不可见。
                  </p>
                </div>

                {newOperation.tool_type === 'validation' && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="text-sm font-semibold text-blue-900 mb-3">校验配置</h4>
                    
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={newOperation.validation_config.block_on_failure}
                          onChange={(e) => setNewOperation({
                            ...newOperation,
                            validation_config: {
                              ...newOperation.validation_config,
                              block_on_failure: e.target.checked,
                            },
                          })}
                          className="mr-2"
                        />
                        <label className="text-sm text-gray-700">
                          校验失败时阻止流程流转
                        </label>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={newOperation.validation_config.block_on_service_error}
                          onChange={(e) => setNewOperation({
                            ...newOperation,
                            validation_config: {
                              ...newOperation.validation_config,
                              block_on_service_error: e.target.checked,
                            },
                          })}
                          className="mr-2"
                        />
                        <label className="text-sm text-gray-700">
                          服务不可用时阻止流程流转
                        </label>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          失败条件（JSON）
                        </label>
                        <p className="text-xs text-gray-500 mb-1">
                          定义判定校验失败的条件，例如：{'[{"path": "response.visible", "operator": "==", "value": false}]'}
                        </p>
                        <textarea
                          value={JSON.stringify(newOperation.validation_config.failure_conditions, null, 2)}
                          onChange={(e) => {
                            try {
                              const conditions = JSON.parse(e.target.value);
                              setNewOperation({
                                ...newOperation,
                                validation_config: {
                                  ...newOperation.validation_config,
                                  failure_conditions: conditions,
                                },
                              });
                            } catch {}
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                          rows={4}
                          placeholder='[{"path": "response.visible", "operator": "==", "value": false}]'
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          错误消息模板
                        </label>
                        <p className="text-xs text-gray-500 mb-1">
                          使用 {'{response.field}'} 引用响应字段
                        </p>
                        <input
                          type="text"
                          value={newOperation.validation_config.error_message_template}
                          onChange={(e) => setNewOperation({
                            ...newOperation,
                            validation_config: {
                              ...newOperation.validation_config,
                              error_message_template: e.target.value,
                            },
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="目标不可见：{response.reason}"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">请求参数（JSON）</label>
                  <p className="text-xs text-gray-500 mb-1">
                    定义查询、路径和请求头参数，格式：{'{"query": [{"name": "param", "required": true, "schema": {"type": "string"}}], "path": [], "header": []}'}
                  </p>
                  <textarea
                    value={JSON.stringify(newOperation.parameters, null, 2)}
                    onChange={(e) => {
                      try {
                        setNewOperation({ ...newOperation, parameters: JSON.parse(e.target.value) });
                      } catch {}
                    }}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                    rows={6}
                    placeholder='{"query": [], "path": [], "header": []}'
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">请求体结构（JSON）</label>
                  <p className="text-xs text-gray-500 mb-1">
                    请求体的 JSON 结构；GET/DELETE 请求可留空。
                  </p>
                  <textarea
                    value={JSON.stringify(newOperation.request_body, null, 2)}
                    onChange={(e) => {
                      try {
                        setNewOperation({ ...newOperation, request_body: JSON.parse(e.target.value) });
                      } catch {}
                    }}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                    rows={6}
                    placeholder='{"type": "object", "properties": {"message": {"type": "string"}}}'
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">输入映射（JSON，可选）</label>
                  <p className="text-xs text-gray-500 mb-1">
                    将提案或上下文数据映射到请求参数，格式：{'{"body.message": "context.notification_message", "query.proposal_id": "proposal.id"}'}
                  </p>
                  <textarea
                    value={JSON.stringify(newOperation.input_mapping, null, 2)}
                    onChange={(e) => {
                      try {
                        setNewOperation({ ...newOperation, input_mapping: JSON.parse(e.target.value) });
                      } catch {}
                    }}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                    rows={4}
                    placeholder='{"body.message": "context.notification_message"}'
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">输出映射（JSON，可选）</label>
                  <p className="text-xs text-gray-500 mb-1">
                    将响应数据写回提案上下文，格式：{'{"context.last_notification_id": "response.id"}'}
                  </p>
                  <textarea
                    value={JSON.stringify(newOperation.output_mapping, null, 2)}
                    onChange={(e) => {
                      try {
                        setNewOperation({ ...newOperation, output_mapping: JSON.parse(e.target.value) });
                      } catch {}
                    }}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                    rows={4}
                    placeholder='{"context.last_notification_id": "response.id"}'
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">超时时间（秒）</label>
                    <input
                      type="number"
                      min="1"
                      value={newOperation.timeout}
                      onChange={(e) => setNewOperation({ ...newOperation, timeout: parseInt(e.target.value) || 30 })}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">响应结构（JSON，可选）</label>
                    <textarea
                      value={JSON.stringify(newOperation.response_schema, null, 2)}
                      onChange={(e) => {
                        try {
                          setNewOperation({ ...newOperation, response_schema: JSON.parse(e.target.value) });
                        } catch {}
                      }}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                      rows={3}
                      placeholder='{"type": "object", "properties": {"id": {"type": "integer"}}}'
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewOperationForm(false);
                      setNewOperation({
                        operation_id: '',
                        name: '',
                        description: '',
                        method: 'POST',
                        path: '',
                        parameters: {},
                        request_body: {},
                        response_schema: {},
                        input_mapping: {},
                        output_mapping: {},
                        timeout: 30,
                        retry_config: {},
                        tool_type: 'other',
                        validation_config: {
                          block_on_failure: true,
                          block_on_service_error: false,
                          failure_conditions: [],
                          error_message_template: '校验失败',
                        },
                      });
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    创建操作
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
