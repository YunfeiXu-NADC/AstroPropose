'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  listFormTemplates,
  listExternalTools,
  listAdminRoles,
  getExternalTool,
  getFormTemplate,
} from '@/lib/api';
import { createExampleWorkflowPreset } from '@/lib/workflowPreset.mjs';
import { translatePhase, translateRole } from '@/lib/locale.mjs';

// Custom state node component
const StateNode = ({ data, selected }) => {
  return (
    <div className={`px-4 py-3 rounded-lg border-2 min-w-[140px] ${
      selected ? 'border-indigo-500 shadow-lg' : 'border-gray-300'
    } bg-white`}>
      {/* Source handle (right side) - for outgoing connections */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#6366f1',
          width: '10px',
          height: '10px',
          border: '2px solid white',
        }}
      />
      
      {/* Target handle (left side) - for incoming connections */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#6366f1',
          width: '10px',
          height: '10px',
          border: '2px solid white',
        }}
      />
      
      <div className="font-semibold text-gray-800">{data.label}</div>
      {data.formTemplateName && (
        <div className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
          <span>📋</span>
          <span>{data.formTemplateName}</span>
          {data.formRequired && <span className="text-red-500">*</span>}
        </div>
      )}
      {data.externalTools && data.externalTools.length > 0 && (
        <div className="text-xs text-blue-600 mt-1 flex items-center gap-1 flex-wrap">
          <span>🔧</span>
          {data.externalTools.map((tool, idx) => (
            <span key={idx} className="bg-blue-50 px-1 rounded">{tool}</span>
          ))}
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  stateNode: StateNode,
};

const WorkflowEditor = ({ initialDefinition, onSave }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [initialState, setInitialState] = useState('草稿');
  const [transitionsDraft, setTransitionsDraft] = useState('[]');
  const [error, setError] = useState('');
  
  // Form template related state
  const [formTemplates, setFormTemplates] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showNodeEditor, setShowNodeEditor] = useState(false);

  // Admin roles used for workflow transition candidates
  const [adminRoles, setAdminRoles] = useState([]);
  const [externalToolOperations, setExternalToolOperations] = useState([]);
  
  // Edge/Transition editor state
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [showEdgeEditor, setShowEdgeEditor] = useState(false);
  const [editingTransition, setEditingTransition] = useState(null);

  // Load form templates and external tools
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [templates, tools, roles] = await Promise.all([
          listFormTemplates(),
          listExternalTools(),
          listAdminRoles(),
        ]);
        setAdminRoles(Array.isArray(roles) ? roles : roles?.roles || []);
        
        // Load full form template definitions (including fields)
        const templatesWithDefinitions = await Promise.all(
          templates.map(async (template) => {
            try {
              const fullTemplate = await getFormTemplate(template.id);
              return fullTemplate;
            } catch (err) {
              console.error(`Failed to load template ${template.id}:`, err);
              return template; // Fallback to basic template
            }
          })
        );
        setFormTemplates(templatesWithDefinitions);
        
        // Flatten all operations from all tools
        const allOperations = [];
        for (const tool of tools) {
          try {
            const toolDetail = await getExternalTool(tool.id);
            if (toolDetail.operations) {
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
        setExternalToolOperations(allOperations);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      }
    };
    fetchData();
  }, []);

  // Initialize from definition
  useEffect(() => {
    if (!initialDefinition) {
      // Default nodes if no definition
      setNodes([
        { id: '1', type: 'stateNode', data: { label: '草稿' }, position: { x: 100, y: 100 } },
        { id: '2', type: 'stateNode', data: { label: '已提交' }, position: { x: 300, y: 100 } },
      ]);
      return;
    }
    
    if (initialDefinition.nodes && initialDefinition.nodes.length > 0) {
      const enhancedNodes = initialDefinition.nodes.map((node) => {
        const formTemplate = formTemplates.find(t => t.id === node.data?.formTemplateId);
        // Find external tools used in form fields
        const formExternalTools = [];
        if (formTemplate && formTemplate.definition && externalToolOperations.length > 0) {
          const findToolsInFields = (fields) => {
            if (!fields || !Array.isArray(fields)) return;
            fields.forEach(field => {
              if (field.external_tool_operation_id) {
                const op = externalToolOperations.find(o => o.id === field.external_tool_operation_id);
                if (op) {
                  formExternalTools.push(op.name || op.operation_id);
                }
              }
              if (field.sub_fields && Array.isArray(field.sub_fields)) {
                findToolsInFields(field.sub_fields);
              }
            });
          };
          findToolsInFields(formTemplate.definition.fields || []);
        }
        
        return {
          ...node,
          type: 'stateNode',
          data: {
            ...node.data,
            formTemplateName: formTemplate?.name || null,
            externalTools: formExternalTools.length > 0 ? [...new Set(formExternalTools)] : null,
          },
        };
      });
      setNodes(enhancedNodes);
    }
    if (initialDefinition.edges) {
      setEdges(initialDefinition.edges);
    }
    setInitialState(initialDefinition.initial_state || '草稿');
    setTransitionsDraft(JSON.stringify(initialDefinition.transitions || [], null, 2));
  }, [initialDefinition, setNodes, setEdges, formTemplates, externalToolOperations]);

  // Update nodes when formTemplates or externalToolOperations change (to show external tools)
  useEffect(() => {
    if (!initialDefinition || !initialDefinition.nodes || formTemplates.length === 0 || externalToolOperations.length === 0) {
      return;
    }
    
    setNodes((currentNodes) => {
      if (currentNodes.length === 0) return currentNodes;
      
      return currentNodes.map((node) => {
        const formTemplate = formTemplates.find(t => t.id === node.data?.formTemplateId);
        // Find external tools used in form fields
        const formExternalTools = [];
        if (formTemplate && formTemplate.definition) {
          const findToolsInFields = (fields) => {
            if (!fields || !Array.isArray(fields)) return;
            fields.forEach(field => {
              if (field.external_tool_operation_id) {
                const op = externalToolOperations.find(o => o.id === field.external_tool_operation_id);
                if (op) {
                  formExternalTools.push(op.name || op.operation_id);
                }
              }
              // Check both sub_fields and subFields (for compatibility)
              const subFields = field.sub_fields || field.subFields;
              if (subFields && Array.isArray(subFields)) {
                findToolsInFields(subFields);
              }
            });
          };
          findToolsInFields(formTemplate.definition.fields || []);
        }
        
        return {
          ...node,
          data: {
            ...node.data,
            formTemplateName: formTemplate?.name || node.data?.formTemplateName || null,
            externalTools: formExternalTools.length > 0 ? [...new Set(formExternalTools)] : null,
          },
        };
      });
    });
  }, [formTemplates, externalToolOperations, initialDefinition?.nodes]);

  const onConnect = useCallback(
    (params) => {
      // Prevent self-connections
      if (params.source === params.target) {
        return;
      }
      // Prevent duplicate connections
      setEdges((eds) => {
        const existing = eds.find(
          (e) => e.source === params.source && e.target === params.target
        );
        if (existing) {
          return eds;
        }
        const newEdge = addEdge(
          {
            ...params,
            id: `edge-${params.source}-${params.target}`,
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
          },
          eds
        );
        
        // Auto-create transition for new edge if nodes exist
        const sourceNode = nodes.find(n => n.id === params.source);
        const targetNode = nodes.find(n => n.id === params.target);
        
        if (sourceNode && targetNode) {
          let transitions = [];
          try {
            transitions = JSON.parse(transitionsDraft || '[]');
          } catch (e) {
            transitions = [];
          }
          
          // Check if transition already exists
          const exists = transitions.find(
            t => t.from === sourceNode.data.label && t.to === targetNode.data.label
          );
          
          if (!exists) {
            // Create a new transition
            const newTransition = {
              name: `${sourceNode.data.label.toLowerCase()}_to_${targetNode.data.label.toLowerCase()}`.replace(/\s+/g, '_'),
              label: `${sourceNode.data.label} → ${targetNode.data.label}`,
              from: sourceNode.data.label,
              to: targetNode.data.label,
              roles: [],
              conditions: {},
              effects: {},
            };
            transitions.push(newTransition);
            setTransitionsDraft(JSON.stringify(transitions, null, 2));
          }
        }
        
        return newEdge;
      });
    },
    [setEdges, nodes, transitionsDraft],
  );

  // Node click event
  const onNodeClick = useCallback((event, node) => {
    setSelectedNodeId(node.id);
    setShowNodeEditor(true);
    // Close edge editor if open
    setShowEdgeEditor(false);
    setSelectedEdgeId(null);
  }, []);

  // Edge click event
  const onEdgeClick = useCallback((event, edge) => {
    event.stopPropagation();
    setSelectedEdgeId(edge.id);
    
    // Find source and target nodes
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    
    if (!sourceNode || !targetNode) {
      return;
    }
    
    // Find existing transition for this edge
    let transitions = [];
    try {
      transitions = JSON.parse(transitionsDraft || '[]');
    } catch (e) {
      transitions = [];
    }
    
    const existingTransition = transitions.find(
      t => t.from === sourceNode.data.label && t.to === targetNode.data.label
    );
    
    // If transition exists, load it; otherwise create a new one
    if (existingTransition) {
      setEditingTransition(existingTransition);
    } else {
      // Create a new transition template
      setEditingTransition({
        name: `${sourceNode.data.label.toLowerCase()}_to_${targetNode.data.label.toLowerCase()}`.replace(/\s+/g, '_'),
        label: `${sourceNode.data.label} → ${targetNode.data.label}`,
        from: sourceNode.data.label,
        to: targetNode.data.label,
        roles: [],
        conditions: {},
        effects: {},
      });
    }
    
    setShowEdgeEditor(true);
    // Close node editor if open
    setShowNodeEditor(false);
    setSelectedNodeId(null);
  }, [nodes, transitionsDraft]);

  // Get currently selected node
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const roleOptions = [
    ...new Set([
      ...adminRoles.map((role) => role.name),
      ...(editingTransition?.roles || []),
    ]),
  ];

  // Update node data
  const updateNodeData = (nodeId, updates) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updates,
            },
          };
        }
        return node;
      })
    );
  };

  // Update transition and sync with transitionsDraft
  const updateTransition = (updatedTransition) => {
    setEditingTransition(updatedTransition);
    
    // Update transitions array
    let transitions = [];
    try {
      transitions = JSON.parse(transitionsDraft || '[]');
    } catch (e) {
      transitions = [];
    }
    
    // Find and update existing transition, or add new one
    const index = transitions.findIndex(
      t => t.from === updatedTransition.from && t.to === updatedTransition.to
    );
    
    if (index >= 0) {
      transitions[index] = updatedTransition;
    } else {
      transitions.push(updatedTransition);
    }
    
    setTransitionsDraft(JSON.stringify(transitions, null, 2));
  };

  // Delete transition for selected edge
  const deleteTransition = () => {
    if (!selectedEdgeId || !editingTransition) return;
    
    // Confirm deletion
    if (!confirm(`确定删除流转规则“${editingTransition.label || editingTransition.name}”吗？`)) {
      return;
    }
    
    // Remove transition from transitions array
    let transitions = [];
    try {
      transitions = JSON.parse(transitionsDraft || '[]');
    } catch (e) {
      transitions = [];
    }
    
    transitions = transitions.filter(
      t => !(t.from === editingTransition.from && t.to === editingTransition.to)
    );
    
    setTransitionsDraft(JSON.stringify(transitions, null, 2));
    
    // Remove the edge from the graph
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
    
    // Close editor
    setShowEdgeEditor(false);
    setSelectedEdgeId(null);
    setEditingTransition(null);
  };

  // Add new node - position it below existing nodes
  const addNewState = () => {
    const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) : 0;
    const newId = `state_${Date.now()}`;
    const newNode = {
      id: newId,
      type: 'stateNode',
      data: { label: '新节点', formTemplateId: null, formRequired: false },
      position: { x: 200, y: maxY + 120 },
    };
    setNodes((nds) => [...nds, newNode]);
    // Auto-select the new node
    setSelectedNodeId(newId);
    setShowNodeEditor(true);
  };

  // Delete selected node
  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    setShowNodeEditor(false);
  };

  const handleSave = () => {
    try {
      const parsed = JSON.parse(transitionsDraft || '[]');
      const definition = {
        nodes,
        edges,
        initial_state: initialState,
        transitions: parsed,
      };
      setError('');
      onSave(definition);
    } catch (err) {
      console.error(err);
      setError('流转规则 JSON 解析失败，请检查格式。');
    }
  };

  const insertPreset = () => {
    const preset = createExampleWorkflowPreset();
    setNodes(preset.nodes);
    setEdges(preset.edges);
    setInitialState(preset.initial_state);
    setTransitionsDraft(JSON.stringify(preset.transitions, null, 2));
  };

  return (
    <div className="space-y-6">
      {/* Help section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">📖 流程编辑器使用说明</h3>
        <div className="text-sm text-blue-700 space-y-2">
          <p><strong>1. 流程节点：</strong> 每个方框代表一个流程状态，例如草稿、已提交、已通过。点击节点可编辑属性。</p>
          <p><strong>2. 流转连线：</strong> 箭头表示提案如何从一个状态进入下一个状态。点击箭头可配置执行角色、条件和效果。</p>
          <p><strong>3. 初始节点：</strong> 新提案创建后的起始状态，通常为“草稿”。</p>
          <p><strong>4. 表单模板：</strong> 点击节点可关联该阶段需要填写的表单。</p>
          <p><strong>5. 流转规则 JSON：</strong> 下方显示全部流转规则，可直接编辑，也可点击连线进行可视化配置。</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={addNewState}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          + 添加节点
        </button>
        <button
          type="button"
          onClick={insertPreset}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          载入示例流程
        </button>
        {selectedNodeId && (
          <button
            type="button"
            onClick={deleteSelectedNode}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            删除选中节点
          </button>
        )}
      </div>

      <div className="flex gap-4">
        {/* Workflow canvas */}
        <div className="flex-1 h-[1000px] rounded-lg border-2 border-gray-300 bg-gray-50">
          <ReactFlow
            nodes={nodes}
            edges={edges.map(edge => {
              // Find transition for this edge to check for external tools
              let hasExternalTools = false;
              let toolNames = [];
              try {
                const transitions = JSON.parse(transitionsDraft || '[]');
                const sourceNode = nodes.find(n => n.id === edge.source);
                const targetNode = nodes.find(n => n.id === edge.target);
                if (sourceNode && targetNode) {
                  const transition = transitions.find(
                    t => t.from === sourceNode.data.label && t.to === targetNode.data.label
                  );
                  if (transition?.effects?.external_tools?.length > 0) {
                    hasExternalTools = true;
                    transition.effects.external_tools.forEach(tool => {
                      const op = externalToolOperations.find(o => o.id === tool.operation_id);
                      if (op) {
                        toolNames.push(op.name || op.operation_id);
                      }
                    });
                  }
                }
              } catch (e) {}
              
              return {
                ...edge,
                selected: edge.id === selectedEdgeId,
                style: {
                  ...edge.style,
                  stroke: edge.id === selectedEdgeId ? '#f59e0b' : (hasExternalTools ? '#10b981' : (edge.style?.stroke || '#6366f1')),
                  strokeWidth: edge.id === selectedEdgeId ? 3 : (hasExternalTools ? 2.5 : (edge.style?.strokeWidth || 2)),
                },
                label: hasExternalTools ? (
                  <div className="flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm border border-green-300">
                    <span className="text-xs">🔧</span>
                    <span className="text-xs text-green-700 font-medium">{toolNames.length > 0 ? toolNames.join(', ') : '外部工具'}</span>
                  </div>
                ) : edge.label,
              };
            })}
            onNodesChange={onNodesChange}
            onEdgesChange={(changes) => {
              // Handle edge deletion via keyboard (Delete/Backspace)
              changes.forEach((change) => {
                if (change.type === 'remove' && change.id) {
                  // Find the edge being deleted
                  const edgeToDelete = edges.find(e => e.id === change.id);
                  if (edgeToDelete) {
                    // Find source and target nodes
                    const sourceNode = nodes.find(n => n.id === edgeToDelete.source);
                    const targetNode = nodes.find(n => n.id === edgeToDelete.target);
                    
                    if (sourceNode && targetNode) {
                      // Remove corresponding transition
                      let transitions = [];
                      try {
                        transitions = JSON.parse(transitionsDraft || '[]');
                      } catch (e) {
                        transitions = [];
                      }
                      
                      transitions = transitions.filter(
                        t => !(t.from === sourceNode.data.label && t.to === targetNode.data.label)
                      );
                      
                      setTransitionsDraft(JSON.stringify(transitions, null, 2));
                      
                      // Close edge editor if it's open for this edge
                      if (selectedEdgeId === change.id) {
                        setShowEdgeEditor(false);
                        setSelectedEdgeId(null);
                        setEditingTransition(null);
                      }
                    }
                  }
                }
              });
              // Apply the changes to edges
              onEdgesChange(changes);
            }}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            ariaLabelConfig={{
              'node.a11yDescription.default': '按回车或空格选择节点，按删除键移除，按退出键取消。',
              'node.a11yDescription.keyboardDisabled': '按回车或空格选择节点，再使用方向键移动，按删除键移除。',
              'node.a11yDescription.ariaLiveMessage': ({ x, y }) => `节点已移动到横坐标 ${x}、纵坐标 ${y}`,
              'edge.a11yDescription.default': '按回车或空格选择连线，按删除键移除，按退出键取消。',
              'controls.ariaLabel': '流程图控制面板',
              'controls.zoomIn.ariaLabel': '放大',
              'controls.zoomOut.ariaLabel': '缩小',
              'controls.fitView.ariaLabel': '适应画布',
              'controls.interactive.ariaLabel': '切换交互模式',
              'minimap.ariaLabel': '流程缩略图',
              'handle.ariaLabel': '连接点',
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background color="#ddd" gap={16} />
            <Controls />
            <MiniMap nodeColor="#6366f1" />
          </ReactFlow>
        </div>

        {/* Edge/Transition editor panel */}
        {showEdgeEditor && editingTransition && (
          <div className="w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800">编辑流转规则</h3>
              <button
                type="button"
                onClick={() => {
                  setShowEdgeEditor(false);
                  setSelectedEdgeId(null);
                  setEditingTransition(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* Source and Target (read-only) */}
              <div className="p-2 bg-gray-50 rounded text-sm">
                <div className="font-medium text-gray-700">
                  {editingTransition.from} → {editingTransition.to}
                </div>
                <div className="text-xs text-gray-500 mt-1">起始节点 → 目标节点</div>
              </div>

              {/* Transition Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">规则标识 *</label>
                <input
                  type="text"
                  required
                  value={editingTransition.name || ''}
                  onChange={(e) => updateTransition({ ...editingTransition, name: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="例如：submit_proposal"
                />
                <p className="mt-1 text-xs text-gray-500">供系统内部唯一识别该规则</p>
              </div>

              {/* Transition Label */}
              <div>
                <label className="block text-sm font-medium text-gray-700">显示名称 *</label>
                <input
                  type="text"
                  required
                  value={editingTransition.label || ''}
                  onChange={(e) => updateTransition({ ...editingTransition, label: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="例如：提交申请"
                />
                <p className="mt-1 text-xs text-gray-500">作为用户看到的按钮或操作名称</p>
              </div>

              {/* Roles */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">可执行角色 *</label>
                <div className="space-y-2">
                  {roleOptions.map((role) => (
                    <label key={role} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(editingTransition.roles || []).includes(role)}
                        onChange={(e) => {
                          const roles = editingTransition.roles || [];
                          const newRoles = e.target.checked
                            ? [...roles, role]
                            : roles.filter(r => r !== role);
                          updateTransition({ ...editingTransition, roles: newRoles });
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700">{translateRole(role)}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">选择可执行该流转操作的角色</p>
              </div>

              {/* Conditions (JSON) */}
              <div>
                <label className="block text-sm font-medium text-gray-700">执行条件（JSON，可选）</label>
                <textarea
                  value={JSON.stringify(editingTransition.conditions || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const conditions = JSON.parse(e.target.value);
                      updateTransition({ ...editingTransition, conditions });
                    } catch {}
                  }}
                  rows={4}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 font-mono text-xs"
                  placeholder='{"phase_status": {"phase": "phase1", "status": "draft"}}'
                />
                <p className="mt-1 text-xs text-gray-500">流程流转前必须满足的条件</p>
              </div>

              {/* External Tools */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">外部工具</label>
                <div className="space-y-2 mb-2">
                  {(editingTransition.effects?.external_tools || []).map((tool, index) => {
                    const op = externalToolOperations.find(o => o.id === tool.operation_id);
                    return (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm">
                        <span className="flex-1">
                          {op ? `${op.toolName} - ${op.name}` : `操作编号：${tool.operation_id}`}
                        </span>
                        <select
                          value={tool.on_failure || 'continue'}
                          onChange={(e) => {
                            const tools = [...(editingTransition.effects?.external_tools || [])];
                            tools[index] = { ...tools[index], on_failure: e.target.value };
                            updateTransition({
                              ...editingTransition,
                              effects: {
                                ...editingTransition.effects,
                                external_tools: tools,
                              },
                            });
                          }}
                          className="text-xs px-2 py-1 border border-gray-300 rounded"
                        >
                          <option value="continue">失败后继续</option>
                          <option value="abort">失败后终止</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const tools = (editingTransition.effects?.external_tools || []).filter((_, i) => i !== index);
                            updateTransition({
                              ...editingTransition,
                              effects: {
                                ...editingTransition.effects,
                                external_tools: tools.length > 0 ? tools : undefined,
                              },
                            });
                          }}
                          className="text-red-600 hover:text-red-800 text-xs"
                        >
                          移除
                        </button>
                      </div>
                    );
                  })}
                </div>
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const opId = parseInt(e.target.value);
                    const tools = editingTransition.effects?.external_tools || [];
                    if (!tools.find(t => t.operation_id === opId)) {
                      updateTransition({
                        ...editingTransition,
                        effects: {
                          ...editingTransition.effects,
                          external_tools: [...tools, { operation_id: opId, on_failure: 'continue' }],
                        },
                      });
                    }
                    e.target.value = '';
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                >
                  <option value="">+ 添加外部工具</option>
                  {externalToolOperations.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.toolName} - {op.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">流程流转时需要调用的工具</p>
              </div>

              {/* Other Effects (JSON) */}
              <div>
                <label className="block text-sm font-medium text-gray-700">其他执行效果（JSON，可选）</label>
                <textarea
                  value={JSON.stringify(
                    Object.fromEntries(
                      Object.entries(editingTransition.effects || {}).filter(([key]) => key !== 'external_tools')
                    ),
                    null,
                    2
                  )}
                  onChange={(e) => {
                    try {
                      const otherEffects = JSON.parse(e.target.value);
                      updateTransition({
                        ...editingTransition,
                        effects: {
                          ...otherEffects,
                          external_tools: editingTransition.effects?.external_tools,
                        },
                      });
                    } catch {}
                  }}
                  rows={4}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 font-mono text-xs"
                  placeholder='{"phase": "phase1", "set_phase_status": "submitted"}'
                />
                <p className="mt-1 text-xs text-gray-500">其他动作，例如阶段变更、状态更新等</p>
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={deleteTransition}
                className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
              >
                删除流转规则
              </button>
            </div>
          </div>
        )}

        {/* Node editor panel */}
        {showNodeEditor && selectedNode && (
          <div className="w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800">编辑节点</h3>
              <button
                type="button"
                onClick={() => setShowNodeEditor(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* Node name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">节点名称 *</label>
                <input
                  type="text"
                  value={selectedNode.data.label || ''}
                  onChange={(e) => updateNodeData(selectedNodeId, { label: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="例如：草稿、已提交、已通过"
                />
                <p className="mt-1 text-xs text-gray-500">流转规则会引用该名称，必须保持完全一致</p>
              </div>

              {/* Associated form */}
              <div>
                <label className="block text-sm font-medium text-gray-700">关联表单模板</label>
                <select
                  value={selectedNode.data.formTemplateId || ''}
                  onChange={(e) => {
                    const templateId = e.target.value ? parseInt(e.target.value) : null;
                    const template = formTemplates.find((t) => t.id === templateId);
                    updateNodeData(selectedNodeId, {
                      formTemplateId: templateId,
                      formTemplateName: template?.name || null,
                    });
                  }}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">-- 无需填写表单 --</option>
                  {formTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}（版本 {template.version}）- {translatePhase(template.phase)}
                      {template.instrument && ` [${template.instrument}]`}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  提案到达该节点时，用户需要填写此表单
                </p>
              </div>

              {/* Form required checkbox */}
              {selectedNode.data.formTemplateId && (
                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedNode.data.formRequired || false}
                      onChange={(e) => updateNodeData(selectedNodeId, { formRequired: e.target.checked })}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-gray-700">完成表单后才可离开该节点</span>
                  </label>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700">节点说明（可选）</label>
                <textarea
                  value={selectedNode.data.description || ''}
                  onChange={(e) => updateNodeData(selectedNodeId, { description: e.target.value })}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  placeholder="说明此节点需要完成的工作"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Configuration section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Initial Node */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">初始节点</label>
          <input
            type="text"
            value={initialState}
            onChange={(e) => setInitialState(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            placeholder="草稿"
          />
          <p className="mt-2 text-xs text-gray-500">
            新提案创建后将从此节点开始，名称必须与流程图中的某个节点完全一致。
          </p>
        </div>

        {/* Quick reference */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-medium text-gray-700 mb-2">快捷说明</h4>
          <div className="text-xs text-gray-600 space-y-1">
            <p>• 拖动节点可调整位置</p>
            <p>• 从节点边缘拖动可建立连线</p>
            <p>• 点击节点可编辑属性</p>
            <p>• 点击箭头可配置流转规则</p>
            <p>• 点击“载入示例流程”可查看示例</p>
          </div>
        </div>
      </div>

      {/* Transitions JSON */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">流转规则配置（JSON）</label>
            <p className="text-xs text-gray-500 mt-1">
              定义状态流转规则，包括执行角色、允许条件和执行效果。
            </p>
          </div>
        </div>
        <textarea
          value={transitionsDraft}
          onChange={(e) => setTransitionsDraft(e.target.value)}
          rows={12}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
          placeholder='[\n  {\n    "name": "submit_proposal",\n    "label": "提交申请",\n    "from": "草稿",\n    "to": "已提交",\n    "roles": ["Proposer"],\n    "conditions": {},\n    "effects": {}\n  }\n]'
        />
        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs font-semibold text-blue-900 mb-2">📖 这是什么？</p>
          <p className="text-xs text-blue-800 mb-2">
            上方流程图展示流程结构（节点和连线），流转规则配置用于定义具体业务规则：
          </p>
          <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside mb-2">
            <li>谁可以执行每条流转规则（角色）</li>
            <li>什么条件下允许流转（条件）</li>
            <li>流转发生后执行什么动作（效果）</li>
          </ul>
          <p className="text-xs text-blue-700 font-medium">每条规则包含：</p>
          <ul className="text-xs text-blue-700 list-disc list-inside space-y-0.5 mt-1">
            <li><code>name</code>：唯一标识，例如“submit_proposal”</li>
            <li><code>label</code>：向用户显示的名称</li>
            <li><code>from</code>：起始节点，必须与节点名称一致</li>
            <li><code>to</code>：目标节点，必须与节点名称一致</li>
            <li><code>roles</code>：可执行角色，例如 ["Proposer", "Admin"]</li>
            <li><code>conditions</code>：可选，流转前需满足的条件</li>
            <li><code>effects</code>：可选，流转时执行的动作</li>
          </ul>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="rounded-md bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          保存流程
        </button>
      </div>
    </div>
  );
};

export default WorkflowEditor;
