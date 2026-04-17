'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  createProposal,
  getFormTemplate,
  getProposalTypes,
  getWorkflow,
  listProposalTransitions,
  listFormTemplates,
  listInstruments,
  triggerProposalTransition,
  executeToolOperationFromForm,
} from '@/lib/api';
import { resolvePhase1TemplateId } from '@/lib/proposalFormConfig.mjs';
import { buildProposalCreatePayload } from '@/lib/proposalSubmission.mjs';

// Simple field renderers (non-repeatable)
const SIMPLE_FIELD_RENDERERS = {
  text: ({ field, value, onChange }) => (
    <input
      type="text"
      id={field.name}
      name={field.name}
      required={field.required}
      value={value ?? ''}
      onChange={onChange}
      className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
    />
  ),
  number: ({ field, value, onChange }) => (
    <input
      type="number"
      id={field.name}
      name={field.name}
      required={field.required}
      value={value ?? ''}
      onChange={onChange}
      className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
    />
  ),
  textarea: ({ field, value, onChange }) => (
    <textarea
      id={field.name}
      name={field.name}
      rows={field.rows || 4}
      required={field.required}
      value={value ?? ''}
      onChange={onChange}
      className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
    />
  ),
  select: ({ field, value, onChange }) => (
    <select
      id={field.name}
      name={field.name}
      required={field.required}
      value={value ?? ''}
      onChange={onChange}
      className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
    >
          <option value="">Select...</option>
      {field.options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
            </option>
          ))}
        </select>
  ),
  checkbox: ({ field, value, onChange }) => (
        <input
          type="checkbox"
          id={field.name}
          name={field.name}
          checked={Boolean(value)}
      onChange={(event) =>
        onChange({
          target: {
            name: field.name,
            value: event.target.checked,
            type: 'checkbox',
          },
        })
      }
      className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
  ),
  file: ({ field, onFileChange }) => (
    <input
      type="file"
      id={field.name}
      name={field.name}
      required={field.required}
      onChange={(event) => onFileChange(field.name, event.target.files?.[0] || null)}
      className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-700"
    />
  ),
};

// Repeatable field group component
// instrumentTemplates: { [instrumentCode]: templateDefinition }
// selectedInstruments: array of instrument codes
function RepeatableFieldGroup({ 
  field, 
  value, 
  onChange, 
  instrumentTemplates = {}, 
  selectedInstruments = [],
  toolLoading = {},
  toolResult = {},
  setToolLoading,
  setToolResult,
  executeToolOperationFromForm
}) {
  // value is an array of entry objects
  const entries = Array.isArray(value) ? value : [];
  const minEntries = field.minEntries || field.min_entries || 1;
  const maxEntries = field.maxEntries || field.max_entries || 0; // 0 means unlimited
  // Support both camelCase and snake_case for sub-fields
  const subFields = field.subFields || field.sub_fields || [];
  
  // Debug: log if subFields is empty
  if (subFields.length === 0 && field.type === 'repeatable') {
    console.warn('RepeatableFieldGroup: No sub-fields found for field', field.name, 'Field object:', field);
  }
  
  // Check if any subfield is of type instrument_params
  const hasInstrumentParams = subFields.some(sf => sf.type === 'instrument_params');

  const addEntry = () => {
    if (maxEntries > 0 && entries.length >= maxEntries) return;
    const newEntry = {};
    subFields.forEach(sf => { 
      if (sf.type === 'instrument_params') {
        newEntry[sf.name] = {}; // Object to store instrument params
      } else {
        newEntry[sf.name] = ''; 
      }
    });
    onChange({
      target: {
        name: field.name,
        value: [...entries, newEntry],
        type: 'repeatable',
      },
    });
  };

  const removeEntry = (index) => {
    if (entries.length <= minEntries) return;
    const newEntries = entries.filter((_, i) => i !== index);
    onChange({
      target: {
        name: field.name,
        value: newEntries,
        type: 'repeatable',
      },
    });
  };

  const updateEntryField = (entryIndex, subFieldName, newValue) => {
    const newEntries = entries.map((entry, i) => {
      if (i === entryIndex) {
        return { ...entry, [subFieldName]: newValue };
      }
      return entry;
    });
    onChange({
      target: {
        name: field.name,
        value: newEntries,
        type: 'repeatable',
      },
    });
  };

  // Update instrument params within an entry
  const updateInstrumentParam = (entryIndex, subFieldName, instrumentCode, paramName, paramValue) => {
    const newEntries = entries.map((entry, i) => {
      if (i === entryIndex) {
        const existingParams = entry[subFieldName] || {};
        const instrumentParams = existingParams[instrumentCode] || {};
        return {
          ...entry,
          [subFieldName]: {
            ...existingParams,
            [instrumentCode]: {
              ...instrumentParams,
              [paramName]: paramValue,
            },
          },
        };
      }
      return entry;
    });
    onChange({
      target: {
        name: field.name,
        value: newEntries,
        type: 'repeatable',
      },
    });
  };

  // Initialize with minimum entries if empty
  if (entries.length === 0 && minEntries > 0) {
    const initialEntries = [];
    for (let i = 0; i < minEntries; i++) {
      const newEntry = {};
      subFields.forEach(sf => { 
        if (sf.type === 'instrument_params') {
          newEntry[sf.name] = {};
        } else {
          newEntry[sf.name] = ''; 
        }
      });
      initialEntries.push(newEntry);
    }
    setTimeout(() => {
      onChange({
        target: {
          name: field.name,
          value: initialEntries,
          type: 'repeatable',
        },
      });
    }, 0);
  }

  const canRemove = entries.length > minEntries;
  const canAdd = maxEntries === 0 || entries.length < maxEntries;

  // Render a single sub-field
  const renderSubField = (subField, entry, entryIndex) => {
    if (subField.type === 'instrument_params') {
      // Render instrument-specific parameters
      if (selectedInstruments.length === 0) {
        return (
          <div className="col-span-full bg-yellow-50 border border-yellow-200 rounded p-3">
            <p className="text-xs text-yellow-700">
              ⚠️ Please select at least one instrument first to see observation parameters.
            </p>
          </div>
        );
      }

      return (
        <div className="col-span-full">
          <label className="block text-xs font-medium text-indigo-700 mb-2">
            📋 {subField.label || 'Instrument Observation Parameters'}
          </label>
          <div className="space-y-3">
            {selectedInstruments.map((instrumentCode) => {
              const template = instrumentTemplates[instrumentCode];
              const instrumentParams = entry[subField.name]?.[instrumentCode] || {};

              return (
                <div key={instrumentCode} className="border border-indigo-200 rounded-lg p-3 bg-indigo-50">
                  <h5 className="text-xs font-semibold text-indigo-800 mb-2">
                    {instrumentCode} Parameters
                  </h5>
                  {template && template.fields ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {template.fields.map((paramField) => (
                        <div key={paramField.name}>
                          <label className="block text-xs text-gray-600">
                            {paramField.label}
                            {paramField.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          {paramField.type === 'select' ? (
                            <select
                              value={instrumentParams[paramField.name] ?? ''}
                              onChange={(e) => updateInstrumentParam(entryIndex, subField.name, instrumentCode, paramField.name, e.target.value)}
                              className="mt-1 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                            >
                              <option value="">Select...</option>
                              {paramField.options?.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          ) : paramField.type === 'number' ? (
                            <input
                              type="number"
                              value={instrumentParams[paramField.name] ?? ''}
                              onChange={(e) => updateInstrumentParam(entryIndex, subField.name, instrumentCode, paramField.name, e.target.value)}
                              className="mt-1 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          ) : paramField.type === 'textarea' ? (
                            <textarea
                              value={instrumentParams[paramField.name] ?? ''}
                              onChange={(e) => updateInstrumentParam(entryIndex, subField.name, instrumentCode, paramField.name, e.target.value)}
                              rows={2}
                              className="mt-1 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          ) : (
                            <input
                              type="text"
                              value={instrumentParams[paramField.name] ?? ''}
                              onChange={(e) => updateInstrumentParam(entryIndex, subField.name, instrumentCode, paramField.name, e.target.value)}
                              className="mt-1 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">
                      No parameter form defined for this instrument. Contact admin to create one.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // Regular sub-fields with optional external tool support
    const handleToolCall = async (operationId, fieldName, entryData) => {
      if (!entryData.ra || !entryData.dec) {
        alert('Please enter both RA and Dec before checking visibility');
        return;
      }
      
      if (!setToolLoading || !setToolResult || !executeToolOperationFromForm) {
        console.error('Tool execution functions not provided to RepeatableFieldGroup');
        return;
      }
      
      const toolKey = `${entryIndex}_${fieldName}`;
      setToolLoading(prev => ({ ...prev, [toolKey]: true }));
      try {
        const context = {
          field_data: entryData,
          ra: entryData.ra,
          dec: entryData.dec,
          target_name: entryData.target_name,
        };
        const result = await executeToolOperationFromForm(operationId, context);
        setToolResult(prev => ({ ...prev, [toolKey]: result }));
      } catch (err) {
        setToolResult(prev => ({ 
          ...prev, 
          [toolKey]: { success: false, error: err.message || 'Tool execution failed' }
        }));
      } finally {
        setToolLoading(prev => ({ ...prev, [toolKey]: false }));
      }
    };
    
    return (
      <div key={subField.name}>
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-gray-600">
            {subField.label}
            {subField.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {subField.external_tool_operation_id && (
            <button
              type="button"
              onClick={() => handleToolCall(subField.external_tool_operation_id, subField.name, entry)}
              disabled={toolLoading[`${entryIndex}_${subField.name}`]}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {toolLoading[`${entryIndex}_${subField.name}`] ? 'Checking...' : 'Check Visibility'}
            </button>
          )}
        </div>
        {subField.type === 'textarea' ? (
          <textarea
            value={entry[subField.name] ?? ''}
            onChange={(e) => updateEntryField(entryIndex, subField.name, e.target.value)}
            required={subField.required}
            rows={2}
            className="mt-1 w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
          />
        ) : subField.type === 'number' ? (
          <input
            type="number"
            value={entry[subField.name] ?? ''}
            onChange={(e) => updateEntryField(entryIndex, subField.name, e.target.value)}
            required={subField.required}
            className="mt-1 w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
          />
        ) : subField.type === 'select' ? (
          <select
            value={entry[subField.name] ?? ''}
            onChange={(e) => updateEntryField(entryIndex, subField.name, e.target.value)}
            required={subField.required}
            className="mt-1 w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Select...</option>
            {subField.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={entry[subField.name] ?? ''}
            onChange={(e) => updateEntryField(entryIndex, subField.name, e.target.value)}
            required={subField.required}
            className="mt-1 w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
          />
        )}
        {toolResult[`${entryIndex}_${subField.name}`] && (
          <div className={`mt-2 p-2 rounded text-xs ${
            toolResult[`${entryIndex}_${subField.name}`].success 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {toolResult[`${entryIndex}_${subField.name}`].success ? (
              <div>
                <strong>✓ Visibility Check Result:</strong>
                {toolResult[`${entryIndex}_${subField.name}`].response?.visible !== undefined && (
                  <div className="mt-1">
                    {toolResult[`${entryIndex}_${subField.name}`].response.visible ? (
                      <span className="text-green-600">Target is visible</span>
                    ) : (
                      <span className="text-red-600">
                        Target is not visible: {toolResult[`${entryIndex}_${subField.name}`].response.reason || 'Unknown reason'}
                      </span>
                    )}
                    {toolResult[`${entryIndex}_${subField.name}`].response.observation_window && (
                      <div className="mt-1 text-gray-600">
                        Observation window: {toolResult[`${entryIndex}_${subField.name}`].response.observation_window}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <strong>✕ Error:</strong> {toolResult[`${entryIndex}_${subField.name}`].error || 'Unknown error'}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {entries.map((entry, entryIndex) => (
        <div key={entryIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-gray-700">
              {field.label} #{entryIndex + 1}
            </span>
            {canRemove && (
              <button
                type="button"
                onClick={() => removeEntry(entryIndex)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Remove
              </button>
            )}
          </div>
          {subFields.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {subFields.map((subField) => renderSubField(subField, entry, entryIndex))}
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <p className="text-xs text-yellow-700">
                ⚠️ No sub-fields defined for this repeatable group. Please check the form template configuration.
              </p>
            </div>
          )}
        </div>
      ))}
      {canAdd && (
        <button
          type="button"
          onClick={addEntry}
          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-500 hover:text-indigo-500 transition"
        >
          + Add {field.label}
        </button>
      )}
      {maxEntries > 0 && (
        <p className="text-xs text-gray-500">
          {entries.length} / {maxEntries} entries (min: {minEntries})
        </p>
      )}
    </div>
  );
}

function DynamicField({ 
  field, 
  value, 
  onChange, 
  onFileChange, 
  instrumentTemplates, 
  selectedInstruments,
  toolLoading,
  toolResult,
  setToolLoading,
  setToolResult,
  executeToolOperationFromForm
}) {
  // Handle repeatable fields specially
  if (field.type === 'repeatable') {
    return (
      <div key={field.name} className="col-span-full">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {field.label}
          {field.required && <span className="ml-1 text-red-500">*</span>}
        </label>
        <RepeatableFieldGroup 
          field={field} 
          value={value} 
          onChange={onChange}
          instrumentTemplates={instrumentTemplates}
          selectedInstruments={selectedInstruments}
          toolLoading={toolLoading}
          toolResult={toolResult}
          setToolLoading={setToolLoading}
          setToolResult={setToolResult}
          executeToolOperationFromForm={executeToolOperationFromForm}
        />
        {field.helpText && <p className="mt-1 text-xs text-gray-500">{field.helpText}</p>}
      </div>
    );
  }

  const Renderer = SIMPLE_FIELD_RENDERERS[field.type] || SIMPLE_FIELD_RENDERERS.text;
  return (
    <div key={field.name}>
      <label htmlFor={field.name} className="block text-sm font-medium text-gray-700">
        {field.label}
        {field.required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <Renderer field={field} value={value} onChange={onChange} onFileChange={onFileChange} />
      {field.helpText && <p className="mt-1 text-xs text-gray-500">{field.helpText}</p>}
    </div>
  );
  }

const emptyPhaseState = () => ({
  meta: {},
  attachments: {},
});

export default function NewProposalPage() {
  const router = useRouter();

  const [proposalTypes, setProposalTypes] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [generalTemplate, setGeneralTemplate] = useState(null);
  const [instrumentTemplates, setInstrumentTemplates] = useState({});

  const [selectedProposalType, setSelectedProposalType] = useState('');
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const [phaseState, setPhaseState] = useState({ phase1: emptyPhaseState() });
  const [instrumentState, setInstrumentState] = useState({});

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  // External tool execution state (for form fields)
  const [toolLoading, setToolLoading] = useState({});
  const [toolResult, setToolResult] = useState({});

  useEffect(() => {
    async function bootstrap() {
      setError('');
      try {
        const [types, instrumentList] = await Promise.all([
          getProposalTypes(),
          listInstruments(),
        ]);
        setProposalTypes(types);
        setInstruments(instrumentList);
      } catch (err) {
        console.error(err);
        setError(err.info?.message || 'Initialization failed. Please try again later.');
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    async function loadPhase1Template() {
      if (!selectedProposalType) {
        setGeneralTemplate(null);
        return;
      }

      try {
        const proposalType = proposalTypes.find(
          (item) => String(item.id) === String(selectedProposalType)
        );
        if (!proposalType) {
          setGeneralTemplate(null);
          return;
        }

        const workflow = await getWorkflow(proposalType.workflow_id);
        const initialTemplateId = resolvePhase1TemplateId(workflow.definition);
        if (initialTemplateId) {
          const detail = await getFormTemplate(initialTemplateId);
          setGeneralTemplate(detail.definition);
          return;
        }

        const templates = await listFormTemplates({ phase: 'phase1' });
        const fallback = templates.find((tpl) => !tpl.instrument);
        if (!fallback) {
          setGeneralTemplate(null);
          return;
        }
        const detail = await getFormTemplate(fallback.id);
        setGeneralTemplate(detail.definition);
      } catch (err) {
        console.error(err);
        setError(err.info?.message || 'Failed to load the proposal form for the selected workflow.');
      }
    }

    loadPhase1Template();
  }, [proposalTypes, selectedProposalType]);

  useEffect(() => {
    async function ensureInstrumentTemplate(code) {
      if (instrumentTemplates[code]) {
        return;
      }
      try {
        const list = await listFormTemplates({ instrument_code: code, phase: 'phase1' });
        if (!list.length) {
          setInstrumentTemplates((prev) => ({ ...prev, [code]: null }));
          return;
        }
        const detail = await getFormTemplate(list[0].id);
        setInstrumentTemplates((prev) => ({ ...prev, [code]: detail.definition }));
      } catch (err) {
        console.error(err);
        setInstrumentTemplates((prev) => ({ ...prev, [code]: null }));
      }
    }

    selectedInstruments.forEach((code) => {
      ensureInstrumentTemplate(code);
    });
  }, [selectedInstruments, instrumentTemplates]);

  const instrumentOptions = useMemo(
    () =>
      instruments.map((instrument) => ({
        code: instrument.code,
        name: instrument.name,
        description: instrument.description,
      })),
    [instruments],
  );

  const handlePhaseFieldChange = (phaseName, event) => {
    const { name, value, type, checked } = event.target;
    setPhaseState((prev) => {
      const phase = prev[phaseName] || emptyPhaseState();
      return {
        ...prev,
        [phaseName]: {
          ...phase,
          meta: {
            ...phase.meta,
            [name]: type === 'checkbox' ? checked : value,
          },
        },
      };
    });
  };

  const handlePhaseFileChange = (phaseName, fieldName, file) => {
    setPhaseState((prev) => {
      const phase = prev[phaseName] || emptyPhaseState();
      return {
        ...prev,
        [phaseName]: {
          ...phase,
          attachments: {
            ...phase.attachments,
            [fieldName]: file
              ? { name: file.name, size: file.size, type: file.type }
              : null,
          },
        },
      };
    });
  };

  const toggleInstrument = (code) => {
    setSelectedInstruments((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
    );
    setInstrumentState((prev) => {
      if (prev[code]) {
        const clone = { ...prev };
        delete clone[code];
        return clone;
      }
      return { ...prev, [code]: { form: {}, attachments: {} } };
    });
  };

  const handleInstrumentFieldChange = (instrumentCode, event) => {
    const { name, value, type, checked } = event.target;
    setInstrumentState((prev) => {
      const entry = prev[instrumentCode] || { form: {}, attachments: {} };
      return {
      ...prev,
      [instrumentCode]: {
          ...entry,
          form: {
            ...entry.form,
            [name]: type === 'checkbox' ? checked : value,
      },
        },
      };
    });
  };

  const handleInstrumentFileChange = (instrumentCode, fieldName, file) => {
    setInstrumentState((prev) => {
      const entry = prev[instrumentCode] || { form: {}, attachments: {} };
      return {
        ...prev,
        [instrumentCode]: {
          ...entry,
          attachments: {
            ...entry.attachments,
            [fieldName]: file ? { name: file.name, size: file.size, type: file.type } : null,
          },
        },
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedProposalType) {
      setError('Please select a proposal type.');
      return;
    }
    if (!selectedInstruments.length) {
      setError('Please select at least one instrument.');
      return;
    }

    const payload = buildProposalCreatePayload({
      selectedProposalType,
      selectedInstruments,
      phaseState,
      instrumentState,
    });

    setLoading(true);
    try {
      const result = await createProposal(payload);
      const transitions = await listProposalTransitions(result.id);
      const submitPhase1 = (transitions.transitions || []).find(
        (transition) => transition.name === 'submit_phase1'
      );

      let successMessage = `Proposal created successfully (ID: ${result.id}).`;
      if (submitPhase1) {
        const transitionResult = await triggerProposalTransition(result.id, {
          transition: submitPhase1.name,
        });
        successMessage = `Proposal submitted successfully (ID: ${result.id}, state: ${transitionResult.new_state}).`;
      }

      setSuccess(successMessage);
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (err) {
      console.error(err);
      setError(err.info?.message || 'Proposal submission failed. Please check your input.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl py-10">
      <h1 className="text-3xl font-bold text-gray-900">Submit Phase-1 Proposal</h1>
      <p className="mt-2 text-sm text-gray-500">
        Phase-1 focuses on science goals and observation requirements. Select instruments and fill out their forms. After submission, the system will distribute the proposal to instrument teams for scheduling.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-10">
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-800">1. Basic Information</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <label htmlFor="proposal_type" className="block text-sm font-medium text-gray-700">
                Proposal Type
              </label>
              <select
                id="proposal_type"
                required
                value={selectedProposalType}
                onChange={(event) => setSelectedProposalType(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
              >
                <option value="">Select proposal type</option>
                {proposalTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Proposal Title
            </label>
            <input
              id="title"
              name="title"
              required
                value={phaseState.phase1?.meta?.title || ''}
                onChange={(event) => handlePhaseFieldChange('phase1', event)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            />
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="abstract" className="block text-sm font-medium text-gray-700">
              Abstract
            </label>
            <textarea
              id="abstract"
              name="abstract"
              rows={4}
              value={phaseState.phase1?.meta?.abstract || ''}
              onChange={(event) => handlePhaseFieldChange('phase1', event)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            />
          </div>

          {generalTemplate && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {generalTemplate.fields
                .filter((field) => !['title', 'abstract'].includes(field.name))
                .map((field) => (
                  <DynamicField
                    key={field.name}
                    field={field}
                    value={phaseState.phase1?.meta?.[field.name]}
                    onChange={(event) => handlePhaseFieldChange('phase1', event)}
                    onFileChange={(fieldName, file) => handlePhaseFileChange('phase1', fieldName, file)}
                    instrumentTemplates={instrumentTemplates}
                    selectedInstruments={selectedInstruments}
                    toolLoading={toolLoading}
                    toolResult={toolResult}
                    setToolLoading={setToolLoading}
                    setToolResult={setToolResult}
                    executeToolOperationFromForm={executeToolOperationFromForm}
                  />
                ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-800">2. Select Instruments & Fill Observation Requirements</h2>
          <p className="mt-2 text-sm text-gray-500">
            Multi-instrument joint proposals are supported. Each instrument uses a custom form for observation parameters. Attachments are currently stored as metadata; file upload service will be integrated in future versions.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            {instrumentOptions.map((instrument) => {
              const selected = selectedInstruments.includes(instrument.code);
              return (
                <button
                  key={instrument.code}
                  type="button"
                  onClick={() => toggleInstrument(instrument.code)}
                  className={`rounded-md border px-3 py-2 text-left shadow-sm transition ${
                    selected
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-gray-300 hover:border-indigo-300'
                  }`}
                >
                  <span className="font-medium">{instrument.name}</span>
                  <span className="ml-2 text-xs text-gray-500">{instrument.code}</span>
                  {instrument.description && (
                    <span className="mt-1 block text-xs text-gray-400">{instrument.description}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 space-y-6">
          {selectedInstruments.map((code) => {
              const template = instrumentTemplates[code];
              const instrument = instrumentOptions.find((item) => item.code === code);
              const entry = instrumentState[code] || { form: {}, attachments: {} };
            return (
                <div key={code} className="rounded-md border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800">
                    {instrument?.name || code} — Phase-1 Form
                  </h3>
                  {template ? (
                    <div className="mt-4 space-y-4">
                      {template.fields.map((field) => (
                        <DynamicField
                          key={field.name}
                          field={field}
                          value={entry.form[field.name]}
                          onChange={(event) => handleInstrumentFieldChange(code, event)}
                          onFileChange={(fieldName, file) => handleInstrumentFileChange(code, fieldName, file)}
                          instrumentTemplates={instrumentTemplates}
                          selectedInstruments={selectedInstruments}
                          toolLoading={toolLoading}
                          toolResult={toolResult}
                          setToolLoading={setToolLoading}
                          setToolResult={setToolResult}
                          executeToolOperationFromForm={executeToolOperationFromForm}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-gray-500">
                      No template defined for this instrument. Please contact the administrator to add a form in the workflow configuration.
                    </p>
                  )}
              </div>
            );
          })}
          </div>
        </section>

        {error && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {success && (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-700">{success}</div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-indigo-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-indigo-300"
          >
            {loading ? 'Submitting...' : 'Submit Phase-1'}
          </button>
        </div>
      </form>
    </div>
  );
}
