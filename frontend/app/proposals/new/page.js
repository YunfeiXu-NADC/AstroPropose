'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BoltIcon,
  CheckIcon,
  ClockIcon,
  DocumentArrowUpIcon,
  DocumentTextIcon,
  EyeIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  PaperAirplaneIcon,
  PlusIcon,
  SignalIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

import {
  createProposal,
  executeToolOperationFromForm,
  getFormTemplate,
  getProposalTypes,
  getWorkflow,
  listFormTemplates,
  listInstruments,
  listProposalTransitions,
  triggerProposalTransition,
} from '@/lib/api';
import WorkflowProgress from '@/components/WorkflowProgress';
import { resolvePhase1TemplateId } from '@/lib/proposalFormConfig.mjs';
import { buildProposalCreatePayload } from '@/lib/proposalSubmission.mjs';
import {
  DEFAULT_PROPOSAL_TYPES,
  getProposalTypePresentation,
  getWorkflowStages,
} from '@/lib/workflowDisplay.mjs';

const CREATION_STEPS = ['选择类型', '基本信息', '观测目标', '申请材料', '确认提交'];
const FALLBACK_INSTRUMENTS = [
  { code: 'LF', name: '低频阵列', description: '0.1–30 MHz 成像', previewOnly: true },
  { code: 'HF', name: '高频阵列', description: '0.1–120 MHz 频谱', previewOnly: true },
];

const emptyPhaseState = () => ({ meta: {}, attachments: {} });

function serializeFile(file) {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      data_url: reader.result,
    });
    reader.onerror = () => reject(new Error('附件读取失败'));
    reader.readAsDataURL(file);
  });
}

function getFieldStep(field) {
  if (field.type === 'file') return 3;
  if (field.type === 'repeatable' || /target|目标|ra|dec|observation|观测|time|时间|window|窗口/i.test(field.name || field.label || '')) {
    return 2;
  }
  return 1;
}

function FieldLabel({ field }) {
  return (
    <label htmlFor={field.name} className="mb-1.5 block text-sm font-semibold text-slate-700">
      {field.label || field.name}
      {field.required && <span className="ml-1 text-rose-600">*</span>}
    </label>
  );
}

function SimpleField({ field, value, onChange, onFileChange }) {
  const helpText = field.helpText || field.help_text;
  let control;

  if (field.type === 'textarea') {
    control = <textarea id={field.name} name={field.name} rows={field.rows || 4} required={field.required} value={value ?? ''} onChange={onChange} className="rps-field resize-y" />;
  } else if (field.type === 'select') {
    control = (
      <select id={field.name} name={field.name} required={field.required} value={value ?? ''} onChange={onChange} className="rps-field">
        <option value="">请选择</option>
        {(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  } else if (field.type === 'checkbox') {
    control = (
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
        <input type="checkbox" id={field.name} name={field.name} checked={Boolean(value)} onChange={(event) => onChange({ target: { name: field.name, value: event.target.checked, type: 'checkbox', checked: event.target.checked } })} className="h-4 w-4 rounded border-slate-300 text-[#3347b8]" />
        {field.checkboxLabel || '确认此项'}
      </label>
    );
  } else if (field.type === 'file') {
    control = (
      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 hover:border-[#3347b8] hover:bg-[#3347b8]/[0.03]">
        <span className="flex items-center gap-3 text-sm text-slate-600">
          <DocumentArrowUpIcon className="h-5 w-5 text-[#3347b8]" />
          {value?.name || '选择文件'}
        </span>
        <span className="text-xs font-semibold text-[#3347b8]">浏览</span>
        <input type="file" id={field.name} name={field.name} required={field.required} onChange={(event) => onFileChange(field.name, event.target.files?.[0] || null)} className="sr-only" />
      </label>
    );
  } else {
    control = <input type={field.type === 'number' ? 'number' : 'text'} id={field.name} name={field.name} required={field.required} value={value ?? ''} onChange={onChange} className="rps-field" />;
  }

  return (
    <div className={field.type === 'textarea' || field.type === 'file' ? 'md:col-span-2' : ''}>
      <FieldLabel field={field} />
      {control}
      {helpText && <p className="mt-1.5 text-xs leading-5 text-slate-500">{helpText}</p>}
    </div>
  );
}

function RepeatableField({ field, value, onChange, selectedInstruments, instrumentTemplates, toolLoading, toolResult, setToolLoading, setToolResult }) {
  const subFields = field.subFields || field.sub_fields || [];
  const minEntries = field.minEntries ?? field.min_entries ?? 1;
  const maxEntries = field.maxEntries ?? field.max_entries ?? 0;
  const emptyEntry = Object.fromEntries(subFields.map((subField) => [subField.name, subField.type === 'instrument_params' ? {} : '']));
  const entries = Array.isArray(value) && value.length ? value : Array.from({ length: Math.max(1, minEntries) }, () => ({ ...emptyEntry }));

  const emit = (nextEntries) => onChange({ target: { name: field.name, value: nextEntries, type: 'repeatable' } });
  const update = (entryIndex, name, nextValue) => emit(entries.map((entry, index) => index === entryIndex ? { ...entry, [name]: nextValue } : entry));

  const runTool = async (entryIndex, subField, entry) => {
    const operationId = subField.external_tool_operation_id;
    if (!operationId) return;
    const key = `${field.name}-${entryIndex}-${subField.name}`;
    setToolLoading((previous) => ({ ...previous, [key]: true }));
    try {
      const response = await executeToolOperationFromForm(operationId, { field_data: entry, ...entry });
      setToolResult((previous) => ({ ...previous, [key]: response }));
    } catch (toolError) {
      setToolResult((previous) => ({ ...previous, [key]: { success: false, error: toolError.message || '计算失败' } }));
    } finally {
      setToolLoading((previous) => ({ ...previous, [key]: false }));
    }
  };

  return (
    <div className="md:col-span-2">
      <FieldLabel field={field} />
      <div className="space-y-4">
        {entries.map((entry, entryIndex) => (
          <div key={entryIndex} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{field.label || '观测目标'} {entryIndex + 1}</span>
              {entries.length > minEntries && (
                <button type="button" onClick={() => emit(entries.filter((_, index) => index !== entryIndex))} className="rps-button-quiet text-rose-600 hover:text-rose-700">
                  <TrashIcon className="h-4 w-4" /> 删除
                </button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {subFields.map((subField) => {
                if (subField.type === 'instrument_params') {
                  return (
                    <div key={subField.name} className="space-y-3 md:col-span-2">
                      <p className="text-sm font-semibold text-slate-700">{subField.label || '仪器观测参数'}</p>
                      {!selectedInstruments.length && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">请先选择申请仪器。</p>}
                      {selectedInstruments.map((code) => {
                        const template = instrumentTemplates[code];
                        const params = entry[subField.name]?.[code] || {};
                        return (
                          <div key={code} className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="mb-3 text-xs font-semibold text-[#3347b8]">{code} 参数</p>
                            <div className="grid gap-3 md:grid-cols-2">
                              {(template?.fields || []).map((paramField) => (
                                <SimpleField
                                  key={paramField.name}
                                  field={paramField}
                                  value={params[paramField.name]}
                                  onChange={(event) => update(entryIndex, subField.name, {
                                    ...(entry[subField.name] || {}),
                                    [code]: { ...params, [paramField.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value },
                                  })}
                                  onFileChange={async (name, file) => update(entryIndex, subField.name, {
                                    ...(entry[subField.name] || {}),
                                    [code]: { ...params, [name]: await serializeFile(file) },
                                  })}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                const toolKey = `${field.name}-${entryIndex}-${subField.name}`;
                return (
                  <div key={subField.name} className={subField.type === 'textarea' ? 'md:col-span-2' : ''}>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel field={subField} />
                      {subField.external_tool_operation_id && (
                        <button type="button" onClick={() => runTool(entryIndex, subField, entry)} disabled={toolLoading[toolKey]} className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#3347b8] disabled:opacity-50">
                          <EyeIcon className="h-4 w-4" /> {toolLoading[toolKey] ? '计算中' : '计算可见性'}
                        </button>
                      )}
                    </div>
                    {subField.type === 'textarea' ? (
                      <textarea value={entry[subField.name] ?? ''} onChange={(event) => update(entryIndex, subField.name, event.target.value)} rows={3} required={subField.required} className="rps-field" />
                    ) : subField.type === 'select' ? (
                      <select value={entry[subField.name] ?? ''} onChange={(event) => update(entryIndex, subField.name, event.target.value)} required={subField.required} className="rps-field">
                        <option value="">请选择</option>
                        {(subField.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : (
                      <input type={subField.type === 'number' ? 'number' : 'text'} value={entry[subField.name] ?? ''} onChange={(event) => update(entryIndex, subField.name, event.target.value)} required={subField.required} className="rps-field" />
                    )}
                    {toolResult[toolKey] && (
                      <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${toolResult[toolKey].success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {toolResult[toolKey].success ? '可见性分析已完成，结果已写入当前申请。' : toolResult[toolKey].error || '可见性分析失败。'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {(maxEntries === 0 || entries.length < maxEntries) && (
        <button type="button" onClick={() => emit([...entries, { ...emptyEntry }])} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#3347b8]">
          <PlusIcon className="h-4 w-4" /> 添加{field.label || '一项'}
        </button>
      )}
    </div>
  );
}

function DynamicField(props) {
  if (props.field.type === 'repeatable') return <RepeatableField {...props} />;
  return <SimpleField {...props} />;
}

function CreationSteps({ activeStep, onStepChange }) {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-0" aria-label="新建提案步骤">
      {CREATION_STEPS.map((step, index) => (
        <li key={step} className="relative">
          {index < CREATION_STEPS.length - 1 && <span className={`absolute left-[calc(50%+18px)] right-[-18px] top-3.5 hidden h-px sm:block ${index < activeStep ? 'bg-[#3347b8]' : 'bg-slate-200'}`} />}
          <button type="button" onClick={() => onStepChange(index)} className={`relative z-10 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left sm:justify-center ${index === activeStep ? 'text-slate-950' : 'text-slate-500 hover:text-slate-800'}`}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${index < activeStep ? 'border-[#3347b8] bg-[#3347b8] text-white' : index === activeStep ? 'border-[#3347b8] bg-[#3347b8] text-white ring-4 ring-[#3347b8]/10' : 'border-slate-300 bg-white text-slate-500'}`}>
              {index < activeStep ? <CheckIcon className="h-4 w-4" /> : index + 1}
            </span>
            <span><span className="block text-xs font-semibold sm:text-sm">{step}</span><span className="mt-0.5 hidden text-[10px] font-normal text-slate-400 lg:block">{index === activeStep ? '当前步骤' : index < activeStep ? '已完成' : '待填写'}</span></span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export default function NewProposalPage() {
  const router = useRouter();
  const [proposalTypes, setProposalTypes] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [generalTemplate, setGeneralTemplate] = useState(null);
  const [instrumentTemplates, setInstrumentTemplates] = useState({});
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [selectedProposalType, setSelectedProposalType] = useState('');
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const [phaseState, setPhaseState] = useState({ phase1: emptyPhaseState() });
  const [instrumentState, setInstrumentState] = useState({});
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolLoading, setToolLoading] = useState({});
  const [toolResult, setToolResult] = useState({});

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('focus') === 'visibility') {
      setActiveStep(2);
    }
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [types, instrumentList] = await Promise.all([getProposalTypes(), listInstruments()]);
        const dslTypes = (types || []).filter((item) => item.name?.startsWith('DSL '));
        const availableTypes = dslTypes.length ? dslTypes : (types || []);
        setProposalTypes(availableTypes);
        setInstruments(instrumentList || []);
        if (availableTypes.length) setSelectedProposalType(String(availableTypes[0].id));
      } catch (bootstrapError) {
        setSelectedProposalType(DEFAULT_PROPOSAL_TYPES[0].id);
        setNotice('当前为界面预览；登录并完成后台配置后，提案类型、仪器和流程将自动替换为真实内容。');
      }
    }
    bootstrap();
  }, []);

  const displayedTypes = proposalTypes.length ? proposalTypes : DEFAULT_PROPOSAL_TYPES;
  const displayedInstruments = instruments.length ? instruments : FALLBACK_INSTRUMENTS;
  const selectedType = displayedTypes.find((item) => String(item.id) === String(selectedProposalType));
  const selectedPresentation = getProposalTypePresentation(selectedType || {});

  useEffect(() => {
    async function loadConfiguration() {
      if (!selectedType || selectedType.previewOnly) {
        setSelectedWorkflow(null);
        setGeneralTemplate(null);
        return;
      }
      try {
        const workflow = await getWorkflow(selectedType.workflow_id);
        setSelectedWorkflow(workflow);
        const initialTemplateId = resolvePhase1TemplateId(workflow.definition);
        if (initialTemplateId) {
          const detail = await getFormTemplate(initialTemplateId);
          setGeneralTemplate(detail.definition);
          return;
        }
        const templates = await listFormTemplates({ phase: 'phase1' });
        const fallback = templates.find((template) => !template.instrument);
        setGeneralTemplate(fallback ? (await getFormTemplate(fallback.id)).definition : null);
      } catch (configurationError) {
        console.error(configurationError);
        setError(configurationError.info?.message || '未能加载此提案类型对应的流程和表单。');
      }
    }
    loadConfiguration();
  }, [selectedType?.id]);

  useEffect(() => {
    selectedInstruments.forEach(async (code) => {
      if (instrumentTemplates[code] !== undefined || displayedInstruments.find((item) => item.code === code)?.previewOnly) return;
      try {
        const templates = await listFormTemplates({ instrument_code: code, phase: 'phase1' });
        const definition = templates.length ? (await getFormTemplate(templates[0].id)).definition : null;
        setInstrumentTemplates((previous) => ({ ...previous, [code]: definition }));
      } catch (templateError) {
        console.error(templateError);
        setInstrumentTemplates((previous) => ({ ...previous, [code]: null }));
      }
    });
  }, [selectedInstruments, instrumentTemplates, displayedInstruments]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem('rps-proposal-draft', JSON.stringify({ selectedProposalType, selectedInstruments, phaseState, instrumentState }));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [selectedProposalType, selectedInstruments, phaseState, instrumentState]);

  const workflowStages = useMemo(() => getWorkflowStages(selectedWorkflow?.definition), [selectedWorkflow]);
  const generalFields = generalTemplate?.fields || [];
  const fieldsForStep = (step) => generalFields.filter((field) => !['title', 'abstract'].includes(field.name) && getFieldStep(field) === step);

  const handlePhaseFieldChange = (event) => {
    const { name, value, type, checked } = event.target;
    setPhaseState((previous) => ({
      ...previous,
      phase1: {
        ...(previous.phase1 || emptyPhaseState()),
        meta: { ...(previous.phase1?.meta || {}), [name]: type === 'checkbox' ? checked : value },
      },
    }));
  };

  const handlePhaseFileChange = async (fieldName, file) => {
    const serialized = await serializeFile(file);
    setPhaseState((previous) => ({
      ...previous,
      phase1: {
        ...(previous.phase1 || emptyPhaseState()),
        attachments: { ...(previous.phase1?.attachments || {}), [fieldName]: serialized },
      },
    }));
  };

  const toggleInstrument = (code) => {
    setSelectedInstruments((previous) => previous.includes(code) ? previous.filter((item) => item !== code) : [...previous, code]);
    setInstrumentState((previous) => previous[code]
      ? Object.fromEntries(Object.entries(previous).filter(([key]) => key !== code))
      : { ...previous, [code]: { form: {}, attachments: {} } });
  };

  const handleInstrumentFieldChange = (code, event) => {
    const { name, value, type, checked } = event.target;
    setInstrumentState((previous) => ({
      ...previous,
      [code]: {
        ...(previous[code] || { form: {}, attachments: {} }),
        form: { ...(previous[code]?.form || {}), [name]: type === 'checkbox' ? checked : value },
      },
    }));
  };

  const handleInstrumentFileChange = async (code, fieldName, file) => {
    const serialized = await serializeFile(file);
    setInstrumentState((previous) => ({
      ...previous,
      [code]: {
        ...(previous[code] || { form: {}, attachments: {} }),
        attachments: { ...(previous[code]?.attachments || {}), [fieldName]: serialized },
      },
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (activeStep < CREATION_STEPS.length - 1) {
      setActiveStep((step) => step + 1);
      return;
    }
    if (!selectedType || selectedType.previewOnly) {
      setError('当前使用的是预览类型。请先登录，并在后台配置真实的提案类型、工作流和仪器。');
      return;
    }
    if (!phaseState.phase1?.meta?.title) {
      setError('请填写提案名称。');
      setActiveStep(1);
      return;
    }
    if (!selectedInstruments.length) {
      setError('请至少选择一项仪器设备。');
      setActiveStep(2);
      return;
    }

    setLoading(true);
    try {
      const result = await createProposal(buildProposalCreatePayload({ selectedProposalType, selectedInstruments, phaseState, instrumentState }));
      const transitions = await listProposalTransitions(result.id);
      const submitPhase1 = (transitions.transitions || []).find((transition) => ['submit_phase1', 'submit'].includes(transition.name));
      if (submitPhase1) await triggerProposalTransition(result.id, { transition: submitPhase1.name });
      localStorage.removeItem('rps-proposal-draft');
      router.push('/dashboard');
    } catch (submitError) {
      console.error(submitError);
      setError(submitError.info?.message || '提案提交失败，请检查填写内容。');
    } finally {
      setLoading(false);
    }
  };

  const dynamicFieldProps = (field) => ({
    field,
    value: field.type === 'file' ? phaseState.phase1?.attachments?.[field.name] : phaseState.phase1?.meta?.[field.name],
    onChange: handlePhaseFieldChange,
    onFileChange: handlePhaseFileChange,
    selectedInstruments,
    instrumentTemplates,
    toolLoading,
    toolResult,
    setToolLoading,
    setToolResult,
  });

  return (
    <div className="mx-auto max-w-[1450px]">
      <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="rps-eyebrow">研究提案系统</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">创建新提案</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">提交内容由后台表单配置决定，审批进展将按照绑定的工作流自动展示。</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rps-status-dot" /> 本地草稿自动保存
        </div>
      </header>

      {notice && <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"><InformationCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />{notice}</div>}
      {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="mb-6 border-y border-slate-200 bg-white/60 px-2 py-3 sm:px-4">
          <CreationSteps activeStep={activeStep} onStepChange={setActiveStep} />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_285px]">
          <section className="rps-panel min-w-0 overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4 sm:px-7">
              <p className="text-xs font-semibold text-[#3347b8]">步骤 {activeStep + 1} / {CREATION_STEPS.length}</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">{CREATION_STEPS[activeStep]}</h2>
            </div>

            <div className="min-h-[530px] px-5 py-6 sm:px-7 sm:py-7">
              {activeStep === 0 && (
                <div>
                  <p className="mb-5 text-sm leading-6 text-slate-600">选择本次申请的提案类型。这里显示管理员配置并发布的全部类型。</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {displayedTypes.map((type) => {
                      const presentation = getProposalTypePresentation(type);
                      const selected = String(type.id) === String(selectedProposalType);
                      const Icon = presentation.kind === 'opportunity' ? BoltIcon : GlobeAltIcon;
                      return (
                        <button key={type.id} type="button" onClick={() => setSelectedProposalType(String(type.id))} className={`group min-h-44 rounded-2xl border p-5 text-left ${selected ? 'border-[#3347b8] bg-[#3347b8]/[0.035] shadow-[0_0_0_3px_rgba(51,71,184,0.08)]' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'}`}>
                          <div className="flex items-start justify-between gap-4">
                            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${selected ? 'bg-[#3347b8] text-white' : 'bg-slate-100 text-slate-600'}`}><Icon className="h-6 w-6" /></span>
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-[#3347b8]' : 'border-slate-300'}`}>{selected && <span className="h-2.5 w-2.5 rounded-full bg-[#3347b8]" />}</span>
                          </div>
                          <h3 className="mt-5 text-lg font-semibold text-slate-900">{type.name}</h3>
                          <p className="mt-1.5 text-sm leading-6 text-slate-600">{presentation.description}</p>
                          <p className="mt-4 text-xs font-medium text-slate-500">{presentation.examples}</p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-6 flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                    <SignalIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#7899a7]" />
                    研究提案通过后进入数据分配；机遇目标通过后将评审结果推送至观测编排负责人。
                  </div>
                  <div className="mt-7 border-t border-slate-200 pt-6">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <h3 className="text-sm font-semibold text-slate-900">基本信息</h3>
                      <span className="text-xs text-slate-400">可先填写，后续步骤仍可修改</span>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label htmlFor="title-preview" className="mb-1.5 block text-sm font-semibold text-slate-700">提案名称 <span className="text-rose-600">*</span></label>
                        <input id="title-preview" name="title" value={phaseState.phase1?.meta?.title || ''} onChange={handlePhaseFieldChange} placeholder="请输入提案名称" className="rps-field" />
                      </div>
                      <div className="md:col-span-2">
                        <p className="mb-2 text-sm font-semibold text-slate-700">申请仪器设备</p>
                        <div className="flex flex-wrap gap-2">
                          {displayedInstruments.map((instrument) => {
                            const selected = selectedInstruments.includes(instrument.code);
                            return (
                              <button key={instrument.code} type="button" onClick={() => toggleInstrument(instrument.code)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selected ? 'border-[#3347b8] bg-[#3347b8]/[0.04] text-[#3347b8]' : 'border-slate-200 bg-white text-slate-600'}`}>
                                {instrument.name} <span className="font-normal text-slate-400">{instrument.description}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label htmlFor="abstract-preview" className="mb-1.5 block text-sm font-semibold text-slate-700">概述</label>
                        <textarea id="abstract-preview" name="abstract" rows={3} value={phaseState.phase1?.meta?.abstract || ''} onChange={handlePhaseFieldChange} placeholder="简要说明科学目标和观测需求" className="rps-field resize-y" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 1 && (
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label htmlFor="title" className="mb-1.5 block text-sm font-semibold text-slate-700">提案名称 <span className="text-rose-600">*</span></label>
                    <input id="title" name="title" required value={phaseState.phase1?.meta?.title || ''} onChange={handlePhaseFieldChange} placeholder="请输入清晰、可识别的研究题目" className="rps-field" />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="abstract" className="mb-1.5 block text-sm font-semibold text-slate-700">提案概述</label>
                    <textarea id="abstract" name="abstract" rows={5} value={phaseState.phase1?.meta?.abstract || ''} onChange={handlePhaseFieldChange} placeholder="说明科学目标、研究价值和预期成果" className="rps-field resize-y" />
                  </div>
                  {fieldsForStep(1).map((field) => <DynamicField key={field.name} {...dynamicFieldProps(field)} />)}
                  {!fieldsForStep(1).length && !generalTemplate && <p className="md:col-span-2 text-sm text-slate-500">选择提案类型后，这里将加载已配置的第一阶段表单字段。</p>}
                </div>
              )}

              {activeStep === 2 && (
                <div className="space-y-7">
                  <div>
                    <p className="mb-3 text-sm font-semibold text-slate-700">申请仪器设备 <span className="text-rose-600">*</span></p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {displayedInstruments.map((instrument) => {
                        const selected = selectedInstruments.includes(instrument.code);
                        return (
                          <button key={instrument.code} type="button" onClick={() => toggleInstrument(instrument.code)} className={`rounded-xl border px-4 py-3 text-left ${selected ? 'border-[#3347b8] bg-[#3347b8]/[0.035]' : 'border-slate-200 hover:border-slate-300'}`}>
                            <span className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-900">{instrument.name}</span><span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{instrument.code}</span></span>
                            {instrument.description && <span className="mt-1 block text-xs text-slate-500">{instrument.description}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">{fieldsForStep(2).map((field) => <DynamicField key={field.name} {...dynamicFieldProps(field)} />)}</div>
                  {selectedInstruments.map((code) => {
                    const template = instrumentTemplates[code];
                    const instrument = displayedInstruments.find((item) => item.code === code);
                    if (!template) return <p key={code} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">{instrument?.name || code} 暂无独立参数表单；管理员配置后会自动显示在这里。</p>;
                    return (
                      <div key={code} className="border-t border-slate-200 pt-6">
                        <h3 className="mb-4 text-sm font-semibold text-slate-900">{instrument?.name || code} · 观测参数</h3>
                        <div className="grid gap-5 md:grid-cols-2">
                          {(template.fields || []).filter((field) => field.type !== 'file').map((field) => (
                            <DynamicField key={field.name} field={field} value={instrumentState[code]?.form?.[field.name]} onChange={(event) => handleInstrumentFieldChange(code, event)} onFileChange={(name, file) => handleInstrumentFileChange(code, name, file)} selectedInstruments={selectedInstruments} instrumentTemplates={instrumentTemplates} toolLoading={toolLoading} toolResult={toolResult} setToolLoading={setToolLoading} setToolResult={setToolResult} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeStep === 3 && (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
                    <DocumentTextIcon className="mx-auto h-9 w-9 text-[#7899a7]" />
                    <h3 className="mt-3 text-sm font-semibold text-slate-900">申请材料</h3>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">附件字段完全由表单模板决定。已上传文件会随提案保存，可在提案详情中下载。</p>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">{fieldsForStep(3).map((field) => <DynamicField key={field.name} {...dynamicFieldProps(field)} />)}</div>
                  {selectedInstruments.map((code) => (instrumentTemplates[code]?.fields || []).filter((field) => field.type === 'file').map((field) => (
                    <DynamicField key={`${code}-${field.name}`} field={{ ...field, label: `${displayedInstruments.find((item) => item.code === code)?.name || code} · ${field.label}` }} value={instrumentState[code]?.attachments?.[field.name]} onChange={(event) => handleInstrumentFieldChange(code, event)} onFileChange={(name, file) => handleInstrumentFileChange(code, name, file)} />
                  )))}
                  {!fieldsForStep(3).length && !selectedInstruments.some((code) => (instrumentTemplates[code]?.fields || []).some((field) => field.type === 'file')) && <p className="text-center text-sm text-slate-500">当前模板未配置附件字段，可直接进入下一步。</p>}
                </div>
              )}

              {activeStep === 4 && (
                <div className="space-y-7">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div><p className="text-xs text-slate-500">提案类型</p><p className="mt-1 text-sm font-semibold text-slate-900">{selectedType?.name || '未选择'}</p></div>
                    <div><p className="text-xs text-slate-500">申请仪器</p><p className="mt-1 text-sm font-semibold text-slate-900">{selectedInstruments.join('、') || '未选择'}</p></div>
                    <div><p className="text-xs text-slate-500">提交后状态</p><p className="mt-1 text-sm font-semibold text-slate-900">待技术评审</p></div>
                  </div>
                  <div className="border-t border-slate-200 pt-6">
                    <p className="text-xs text-slate-500">提案名称</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{phaseState.phase1?.meta?.title || '尚未填写'}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{phaseState.phase1?.meta?.abstract || '尚未填写提案概述。'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-5">
                    <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">提交后的评审进展</p>
                    <WorkflowProgress stages={workflowStages} currentStage={workflowStages[0]} compact />
                  </div>
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 text-slate-600">
                    <input type="checkbox" required className="mt-1 h-4 w-4 rounded border-slate-300 text-[#3347b8]" />
                    我确认以上信息真实完整，并同意按照提案征集要求提交评审。
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-7">
              <button type="button" onClick={() => activeStep === 0 ? router.back() : setActiveStep((step) => step - 1)} className="rps-button-secondary"><ArrowLeftIcon className="h-4 w-4" /> {activeStep === 0 ? '取消' : '上一步'}</button>
              <button type="submit" disabled={loading} className="rps-button-primary">
                {activeStep === CREATION_STEPS.length - 1 ? <PaperAirplaneIcon className="h-4 w-4" /> : null}
                {loading ? '提交中' : activeStep === CREATION_STEPS.length - 1 ? '提交提案' : '保存并继续'}
                {activeStep < CREATION_STEPS.length - 1 && <ArrowRightIcon className="h-4 w-4" />}
              </button>
            </div>
          </section>

          <aside className="space-y-5 xl:sticky xl:top-6">
            <div className="rps-panel p-5">
              <p className="rps-eyebrow">审批流程</p>
              <ol className="mt-5 space-y-0">
                {workflowStages.map((stage, index) => (
                  <li key={`${stage}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
                    {index < workflowStages.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" />}
                    <span className={`relative z-10 mt-1 h-4 w-4 shrink-0 rounded-full border-4 border-white ${index === 0 ? 'bg-[#3347b8] ring-1 ring-[#3347b8]' : 'bg-slate-300 ring-1 ring-slate-300'}`} />
                    <span><span className="block text-sm font-semibold text-slate-800">{stage}</span><span className="mt-0.5 block text-xs text-slate-500">{index === 0 ? '提交后自动进入' : '按流程配置推进'}</span></span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 border-t border-slate-200 pt-4">
                <p className="text-xs text-slate-500">通过后</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-800">{selectedPresentation.outcome}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-transparent p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ClockIcon className="h-5 w-5 text-[#7899a7]" /> 响应要求</div>
              <p className="mt-2 text-xs leading-5 text-slate-500">提交接口不大于 5 秒；页面与评审表单响应接口不大于 2 秒。</p>
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
}
