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
import { listFormTemplates, listExternalTools, getExternalTool, getFormTemplate } from '@/lib/api';
import { createExampleWorkflowPreset } from '@/lib/workflowPreset.mjs';

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
  const [initialState, setInitialState] = useState('Draft');
  const [transitionsDraft, setTransitionsDraft] = useState('[]');
  const [error, setError] = useState('');
  
  // Form template related state
  const [formTemplates, setFormTemplates] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showNodeEditor, setShowNodeEditor] = useState(false);
  
  // External tools state
  const [externalTools, setExternalTools] = useState([]);
  const [externalToolOperations, setExternalToolOperations] = useState([]);
  
  // Edge/Transition editor state
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [showEdgeEditor, setShowEdgeEditor] = useState(false);
  const [editingTransition, setEditingTransition] = useState(null);

  // Load form templates and external tools
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [templates, tools] = await Promise.all([
          listFormTemplates(),
          listExternalTools(),
        ]);
        setExternalTools(tools);
        
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
        { id: '1', type: 'stateNode', data: { label: 'Draft' }, position: { x: 100, y: 100 } },
        { id: '2', type: 'stateNode', data: { label: 'Submitted' }, position: { x: 300, y: 100 } },
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
    setInitialState(initialDefinition.initial_state || 'Draft');
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
    if (!confirm(`Are you sure you want to delete the transition "${editingTransition.label || editingTransition.name}"?`)) {
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
      data: { label: 'New Node', formTemplateId: null, formRequired: false },
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
      setError('Failed to parse Transitions JSON. Please check the format.');
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
        <h3 className="font-semibold text-blue-800 mb-2">📖 How to Use the Workflow Editor</h3>
        <div className="text-sm text-blue-700 space-y-2">
          <p><strong>1. Nodes:</strong> Each box represents a workflow node (e.g., Draft, Submitted, Approved). <strong>Click a node</strong> to edit its properties.</p>
          <p><strong>2. Transitions (Edges):</strong> Arrows between nodes show how proposals can move from one node to another. <strong>Click an arrow</strong> to configure the transition rules (who can trigger it, conditions, effects).</p>
          <p><strong>3. Initial Node:</strong> The starting node for new proposals (usually "Draft").</p>
          <p><strong>4. Form Templates:</strong> Click a node to associate a form that must be filled at that node.</p>
          <p><strong>5. Transitions JSON:</strong> The JSON below shows all transitions. You can edit them directly here, or click edges above for a visual editor.</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={addNewState}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          + Add Node
        </button>
        <button
          type="button"
          onClick={insertPreset}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          Load Example Workflow
        </button>
        {selectedNodeId && (
          <button
            type="button"
            onClick={deleteSelectedNode}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Delete Selected Node
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
                    <span className="text-xs text-green-700 font-medium">{toolNames.length > 0 ? toolNames.join(', ') : 'External Tool'}</span>
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
              <h3 className="font-semibold text-gray-800">Edit Transition</h3>
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
                <div className="text-xs text-gray-500 mt-1">Source → Target</div>
              </div>

              {/* Transition Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Transition Name *</label>
                <input
                  type="text"
                  required
                  value={editingTransition.name || ''}
                  onChange={(e) => updateTransition({ ...editingTransition, name: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., submit_phase1"
                />
                <p className="mt-1 text-xs text-gray-500">Unique identifier (used in code)</p>
              </div>

              {/* Transition Label */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Display Label *</label>
                <input
                  type="text"
                  required
                  value={editingTransition.label || ''}
                  onChange={(e) => updateTransition({ ...editingTransition, label: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., Submit Phase-1"
                />
                <p className="mt-1 text-xs text-gray-500">Shown to users as button/action name</p>
              </div>

              {/* Roles */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Allowed Roles *</label>
                <div className="space-y-2">
                  {['Admin', 'Proposer', 'Instrument Scheduler', 'Panel Chair', 'Reviewer'].map((role) => (
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
                      <span className="text-gray-700">{role}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">Who can trigger this transition</p>
              </div>

              {/* Conditions (JSON) */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Conditions (JSON, optional)</label>
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
                <p className="mt-1 text-xs text-gray-500">Requirements before transition can occur</p>
              </div>

              {/* External Tools */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">External Tools</label>
                <div className="space-y-2 mb-2">
                  {(editingTransition.effects?.external_tools || []).map((tool, index) => {
                    const op = externalToolOperations.find(o => o.id === tool.operation_id);
                    return (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm">
                        <span className="flex-1">
                          {op ? `${op.toolName} - ${op.name}` : `Operation ID: ${tool.operation_id}`}
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
                          <option value="continue">Continue on failure</option>
                          <option value="abort">Abort on failure</option>
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
                          Remove
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
                  <option value="">+ Add External Tool</option>
                  {externalToolOperations.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.toolName} - {op.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Tools to call when this transition occurs</p>
              </div>

              {/* Other Effects (JSON) */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Other Effects (JSON, optional)</label>
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
                <p className="mt-1 text-xs text-gray-500">Other actions (phase changes, status updates, etc.)</p>
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={deleteTransition}
                className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
              >
                Delete Transition
              </button>
            </div>
          </div>
        )}

        {/* Node editor panel */}
        {showNodeEditor && selectedNode && (
          <div className="w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800">Edit Node</h3>
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
                <label className="block text-sm font-medium text-gray-700">Node Name *</label>
                <input
                  type="text"
                  value={selectedNode.data.label || ''}
                  onChange={(e) => updateNodeData(selectedNodeId, { label: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., Draft, Submitted, Approved"
                />
                <p className="mt-1 text-xs text-gray-500">This name is used in transitions (must match exactly)</p>
              </div>

              {/* Associated form */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Associated Form Template</label>
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
                  <option value="">-- No form required --</option>
                  {formTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} (v{template.version}) - {template.phase}
                      {template.instrument && ` [${template.instrument}]`}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Users must fill this form when proposal is at this node
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
                    <span className="text-gray-700">Form must be completed to leave this node</span>
                  </label>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Description (optional)</label>
                <textarea
                  value={selectedNode.data.description || ''}
                  onChange={(e) => updateNodeData(selectedNodeId, { description: e.target.value })}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  placeholder="What happens at this node?"
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
          <label className="block text-sm font-medium text-gray-700 mb-2">Initial Node</label>
          <input
            type="text"
            value={initialState}
            onChange={(e) => setInitialState(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            placeholder="Draft"
          />
          <p className="mt-2 text-xs text-gray-500">
            When a new proposal is created, it starts at this node. 
            Must match one of your node names exactly (case-sensitive).
          </p>
        </div>

        {/* Quick reference */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Quick Reference</h4>
          <div className="text-xs text-gray-600 space-y-1">
            <p>• <strong>Drag nodes</strong> to reposition them</p>
            <p>• <strong>Drag from node edge</strong> to create a connection</p>
            <p>• <strong>Click a node</strong> to edit its properties</p>
            <p>• <strong>Click an arrow (edge)</strong> to configure transition rules</p>
            <p>• <strong>Click "Load Example"</strong> to see a sample workflow</p>
          </div>
        </div>
      </div>

      {/* Transitions JSON */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Transitions Configuration (JSON)</label>
            <p className="text-xs text-gray-500 mt-1">
              Define the <strong>rules</strong> for state transitions: who can trigger them, when they're allowed, and what happens.
            </p>
          </div>
        </div>
        <textarea
          value={transitionsDraft}
          onChange={(e) => setTransitionsDraft(e.target.value)}
          rows={12}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
          placeholder='[\n  {\n    "name": "submit_phase1",\n    "label": "Submit Phase-1",\n    "from": "Draft",\n    "to": "Submitted",\n    "roles": ["Proposer"],\n    "conditions": {},\n    "effects": {}\n  }\n]'
        />
        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs font-semibold text-blue-900 mb-2">📖 What is this?</p>
          <p className="text-xs text-blue-800 mb-2">
            The <strong>graph above</strong> shows the workflow structure (nodes and connections). 
            The <strong>Transitions Configuration</strong> defines the <strong>business rules</strong>:
          </p>
          <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside mb-2">
            <li><strong>Who</strong> can trigger each transition (roles)</li>
            <li><strong>When</strong> transitions are allowed (conditions)</li>
            <li><strong>What happens</strong> when a transition occurs (effects)</li>
          </ul>
          <p className="text-xs text-blue-700 font-medium">Each transition must have:</p>
          <ul className="text-xs text-blue-700 list-disc list-inside space-y-0.5 mt-1">
            <li><code>name</code>: Unique identifier (e.g., "submit_phase1")</li>
            <li><code>label</code>: Display name shown to users</li>
            <li><code>from</code>: Source node (must match a node's label exactly)</li>
            <li><code>to</code>: Target node (must match a node's label exactly)</li>
            <li><code>roles</code>: Who can trigger this (e.g., ["Proposer", "Admin"])</li>
            <li><code>conditions</code>: (optional) Requirements before transition</li>
            <li><code>effects</code>: (optional) Actions to perform (e.g., update phase status, call external tools)</li>
          </ul>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="rounded-md bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Save Workflow
        </button>
      </div>
    </div>
  );
};

export default WorkflowEditor;
