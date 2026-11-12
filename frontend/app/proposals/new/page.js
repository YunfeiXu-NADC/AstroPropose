'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BoltIcon,
  CheckIcon,
  DocumentArrowUpIcon,
  EyeIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  PaperAirplaneIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

import {
  createProposal,
  deleteProposalDraft,
  executeToolOperationFromForm,
  getCurrentUser,
  getFormTemplate,
  getProposal,
  getProposalTypes,
  getWorkflow,
  listFormTemplates,
  listInstruments,
  listProposalTransitions,
  listProposalSeasons,
  triggerProposalTransition,
  updateProposal,
} from '@/lib/api';
import WorkflowProgress from '@/components/WorkflowProgress';
import { resolvePhase1TemplateId } from '@/lib/proposalFormConfig.mjs';
import { buildProposalCreatePayload } from '@/lib/proposalSubmission.mjs';
import {
  DEFAULT_PROPOSAL_TYPES,
  getProposalTypePresentation,
  getWorkflowStages,
} from '@/lib/workflowDisplay.mjs';

const CREATION_STEPS = ['批次与类型', '摘要与申请内容', '观测目标与仪器', '附件', '确认提交'];
const FALLBACK_INSTRUMENTS = [
  { code: 'LF', name: '低频阵列', description: '0.1–30 MHz 成像', previewOnly: true },
  { code: 'HF', name: '高频阵列', description: '0.1–120 MHz 频谱', previewOnly: true },
];

const countCharacters = (value) => Array.from(String(value || '').replace(/\s/g, '')).length;
const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';
const parseObservationWindow = (value) => {
  const text = String(value || '');
  const parts = text.includes(' 至 ') ? text.split(' 至 ') : null;
  if (parts?.length === 2) {
    const normalized = parts.map((part, index) => {
      if (!part) return '';
      const match = part.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?$/);
      return match ? `${match[1]}T${match[2] || (index === 0 ? '00:00' : '23:59')}` : null;
    });
    return normalized.every((part) => part !== null) ? normalized : null;
  }
  const matches = [...text.matchAll(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/g)];
  return matches.length === 2 ? matches.map((match, index) => `${match[1]}T${match[2] || (index === 0 ? '00:00' : '23:59')}`) : null;
};
const formatObservationWindow = (start, end) => `${start.replace('T', ' ')} 至 ${end.replace('T', ' ')}`;
const isMissingRequiredField = (field, value) => {
  if (field.type === 'file') return !value?.data_url;
  if (field.type === 'checkbox') return value !== true;
  if (field.type !== 'repeatable') return !hasValue(value);
  const entries = Array.isArray(value) ? value : [];
  const minimum = field.minEntries ?? field.min_entries ?? 1;
  return entries.length < minimum || entries.some((entry) => (field.subFields || field.sub_fields || []).some((subField) => {
    if (!subField.required) return false;
    if (subField.name === 'observation_window') {
      const window = parseObservationWindow(entry[subField.name]);
      return !window?.[0] || !window?.[1] || window[1] <= window[0];
    }
    return !hasValue(entry[subField.name]);
  }));
};

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
  if (field.name === 'technical_summary') return 2;
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
    control = <textarea id={field.name} name={field.name} rows={Math.min(field.rows || 5, 6)} required={field.required} value={value ?? ''} onChange={onChange} className="rps-field resize-y leading-7" />;
  } else if (field.type === 'select') {
    control = (
      <select id={field.name} name={field.name} required={field.required} value={value ?? ''} onChange={onChange} className="rps-field">
        <option value="">请选择</option>
        {(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  } else if (field.type === 'checkbox') {
    control = (
      <label className="flex min-h-11 items-center gap-2 rounded-[0.625rem] border border-slate-300 bg-[#fbfcfe] px-3.5 py-2.5 text-sm text-slate-700">
        <input type="checkbox" id={field.name} name={field.name} checked={Boolean(value)} onChange={(event) => onChange({ target: { name: field.name, value: event.target.checked, type: 'checkbox', checked: event.target.checked } })} className="h-4 w-4 rounded border-slate-300 text-[#3347b8]" />
        {field.checkboxLabel || '确认此项'}
      </label>
    );
  } else if (field.type === 'file') {
    control = (
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-[0.625rem] border border-slate-300 bg-[#fbfcfe] px-3.5 py-2.5 hover:border-[#3347b8] hover:bg-white">
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
      {field.type === 'textarea' && <p className="mt-1 text-xs text-slate-500">已写 {countCharacters(value)} 字{field.recommended_length ? ` · 建议 ${field.recommended_length} 字` : ''}，支持分段输入</p>}
    </div>
  );
}

function RepeatableField({ field, value, onChange, selectedInstruments, instrumentTemplates, toolLoading, toolResult, setToolLoading, setToolResult }) {
  const subFields = field.subFields || field.sub_fields || [];
  const minEntries = field.minEntries ?? field.min_entries ?? 1;
  const maxEntries = field.maxEntries ?? field.max_entries ?? 0;
  const isTargetList = field.name === 'targets';
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
      <div className={isTargetList ? 'space-y-5' : 'space-y-4'}>
        {entries.map((entry, entryIndex) => (
          <div key={entryIndex} className={isTargetList ? (entryIndex > 0 ? 'border-t border-slate-200 pt-4' : '') : 'rounded-xl border border-slate-200 bg-white p-3 sm:p-4'}>
            {(!isTargetList || entries.length > 1) && (
              <div className="mb-3 flex items-center justify-between">
                <span className={isTargetList ? 'text-sm font-medium text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'}>{isTargetList ? `目标 ${entryIndex + 1}` : `${field.label || '观测目标'} ${entryIndex + 1}`}</span>
                {entries.length > minEntries && (
                  <button type="button" onClick={() => emit(entries.filter((_, index) => index !== entryIndex))} className="rps-button-quiet text-rose-600 hover:text-rose-700">
                    <TrashIcon className="h-4 w-4" /> 删除
                  </button>
                )}
              </div>
            )}
            <div className={isTargetList ? 'space-y-3' : 'grid gap-x-4 gap-y-3 md:grid-cols-2'}>
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
                const isTargetName = subField.name === 'target_name';
                const isCoordinates = subField.name === 'coordinates';
                const isWindow = subField.name === 'observation_window';
                const windowValues = isWindow ? parseObservationWindow(entry[subField.name]) : null;
                const updateWindow = (index, nextValue) => {
                  const next = [...(windowValues || ['', ''])];
                  next[index] = nextValue;
                  update(entryIndex, subField.name, formatObservationWindow(next[0], next[1]));
                };
                if (isTargetList && (isTargetName || isCoordinates)) {
                  const inputId = `${field.name}-${entryIndex}-${subField.name}`;
                  return (
                    <div key={subField.name} className="grid gap-1.5 sm:grid-cols-[6.75rem_minmax(0,1fr)] sm:items-start sm:gap-3">
                      <label htmlFor={inputId} className="pt-2.5 text-sm font-medium text-slate-700">
                        {subField.label}{subField.required && <span className="ml-1 text-rose-600">*</span>}
                      </label>
                      <div className="min-w-0">
                        <input id={inputId} type="text" value={entry[subField.name] ?? ''} onChange={(event) => update(entryIndex, subField.name, event.target.value)} required={subField.required} placeholder={isCoordinates ? '如 RA 12h 30m、Dec +18° 20′' : '填写目标名称'} className="rps-field w-full" />
                        {isCoordinates && <p className="mt-1 text-xs leading-5 text-slate-500">点源：赤经（时分秒）、赤纬（度分秒）；天区：中心坐标及范围（°）。</p>}
                      </div>
                    </div>
                  );
                }
                if (isTargetList && isWindow) {
                  return (
                    <div key={subField.name} className="grid gap-1.5 sm:grid-cols-[6.75rem_minmax(0,1fr)] sm:items-center sm:gap-3">
                      <span className="text-sm font-medium text-slate-700">观测时段{subField.required && <span className="ml-1 text-rose-600">*</span>}</span>
                      {(windowValues || !hasValue(entry[subField.name])) ? (
                        <div className="grid min-w-0 grid-cols-1 items-center gap-2 sm:grid-cols-2">
                          <label className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
                            <span className="shrink-0">开始</span>
                            <input type="datetime-local" value={windowValues?.[0] || ''} onChange={(event) => updateWindow(0, event.target.value)} required={subField.required} className="rps-field min-w-0 w-full text-sm" />
                          </label>
                          <label className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
                            <span className="shrink-0">结束</span>
                            <input type="datetime-local" value={windowValues?.[1] || ''} onChange={(event) => updateWindow(1, event.target.value)} required={subField.required} className="rps-field min-w-0 w-full text-sm" />
                          </label>
                        </div>
                      ) : <input type="text" value={entry[subField.name]} onChange={(event) => update(entryIndex, subField.name, event.target.value)} required={subField.required} className="rps-field" aria-label={subField.label} />}
                    </div>
                  );
                }
                if (isTargetList && subField.name === 'visibility_note') {
                  return (
                    <details key={subField.name} className="group sm:pl-[7.5rem]">
                      <summary className="w-fit cursor-pointer text-sm font-medium text-[#3347b8] marker:text-[#3347b8]">可见性计算结果（选填）</summary>
                      <textarea value={entry[subField.name] ?? ''} onChange={(event) => update(entryIndex, subField.name, event.target.value)} rows={2} className="rps-field mt-2 resize-y leading-6" aria-label={subField.label} />
                    </details>
                  );
                }
                return (
                  <div key={subField.name} className={isWindow || subField.type === 'textarea' ? 'md:col-span-2' : ''}>
                    <div className={`flex gap-2 ${isTargetName || isCoordinates ? 'flex-col sm:flex-row sm:items-center' : 'items-center justify-between'}`}>
                      <FieldLabel field={subField} />
                      {subField.external_tool_operation_id && (
                        <button type="button" onClick={() => runTool(entryIndex, subField, entry)} disabled={toolLoading[toolKey]} className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#3347b8] disabled:opacity-50">
                          <EyeIcon className="h-4 w-4" /> {toolLoading[toolKey] ? '计算中' : '计算可见性'}
                        </button>
                      )}
                    {isTargetName || isCoordinates ? (
                      <input type="text" value={entry[subField.name] ?? ''} onChange={(event) => update(entryIndex, subField.name, event.target.value)} required={subField.required} placeholder={isCoordinates ? '如 RA 12h 30m、Dec +18° 20′' : '填写目标名称'} className="rps-field min-w-0 flex-1" aria-label={subField.label} />
                    ) : null}
                    </div>
                    {isCoordinates && <p className="mt-1 text-xs text-slate-500">点源填赤经（时分秒）、赤纬（度分秒）；天区填中心坐标和范围（度）。</p>}
                    {isWindow && (windowValues || !hasValue(entry[subField.name])) ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {['开始时间', '结束时间'].map((label, index) => (
                          <label key={label} className="block text-xs text-slate-500">
                            <span className="mb-1 block">{label}</span>
                            <input type="datetime-local" value={windowValues?.[index] || ''} onChange={(event) => {
                              const next = [...(windowValues || ['', ''])];
                              next[index] = event.target.value;
                              update(entryIndex, subField.name, formatObservationWindow(next[0], next[1]));
                            }} required={subField.required} className="rps-field" aria-label={`${subField.label}·${label}`} />
                          </label>
                        ))}
                      </div>
                    ) : isWindow ? (
                      <input type="text" value={entry[subField.name]} onChange={(event) => update(entryIndex, subField.name, event.target.value)} required={subField.required} className="rps-field" aria-label={subField.label} />
                    ) : isTargetName || isCoordinates ? null : subField.type === 'textarea' ? (
                      <textarea value={entry[subField.name] ?? ''} onChange={(event) => update(entryIndex, subField.name, event.target.value)} rows={2} required={subField.required} className="rps-field resize-y leading-6" />
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

function CreationSteps({ activeStep, maxUnlockedStep, onStepChange, disabled }) {
  return (
    <ol className="flex overflow-x-auto border-b border-slate-200" aria-label="新建提案步骤">
      {CREATION_STEPS.map((step, index) => (
        <li key={step} className="min-w-max flex-1">
          <button type="button" onClick={() => onStepChange(index)} disabled={disabled || index > maxUnlockedStep} aria-current={index === activeStep ? 'step' : undefined} className={`flex w-full items-center justify-center gap-2 border-b-2 px-3 py-4 text-sm font-medium transition-colors disabled:cursor-not-allowed sm:px-4 ${index === activeStep ? 'border-[#3347b8] text-[#3347b8]' : index > maxUnlockedStep ? 'border-transparent text-slate-400' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index === activeStep ? 'bg-[#3347b8] text-white' : index < activeStep ? 'bg-indigo-50 text-[#3347b8]' : 'bg-slate-100 text-slate-500'}`}>
              {index < activeStep ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span>{step}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export default function NewProposalPage() {
  const router = useRouter();
  const [proposalTypes, setProposalTypes] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [seasonsLoaded, setSeasonsLoaded] = useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [draftSeason, setDraftSeason] = useState(null);
  const [instruments, setInstruments] = useState([]);
  const [generalTemplate, setGeneralTemplate] = useState(null);
  const [instrumentTemplates, setInstrumentTemplates] = useState({});
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [selectedProposalType, setSelectedProposalType] = useState('');
  const [draftId, setDraftId] = useState(null);
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const [phaseState, setPhaseState] = useState({ phase1: emptyPhaseState() });
  const [instrumentState, setInstrumentState] = useState({});
  const [activeStep, setActiveStep] = useState(0);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolLoading, setToolLoading] = useState({});
  const [toolResult, setToolResult] = useState({});
  const editVersion = useRef(0);
  const saveInFlight = useRef(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        const requestedDraftId = new URLSearchParams(window.location.search).get('draft');
        const [, types, instrumentList, seasonList, savedDraft] = await Promise.all([
          getCurrentUser(), getProposalTypes(), listInstruments(), listProposalSeasons(),
          requestedDraftId ? getProposal(requestedDraftId) : Promise.resolve(null),
        ]);
        setSeasons(seasonList || []);
        const dslTypes = (types || []).filter((item) => item.name?.startsWith('DSL '));
        const availableTypes = dslTypes.length ? dslTypes : (types || []);
        setProposalTypes(availableTypes);
        setInstruments(instrumentList || []);
        if (savedDraft) {
          if (!savedDraft.permissions?.is_owner || !['草稿', 'Draft'].includes(savedDraft.status)) {
            throw new Error('此提案不是可继续编辑的本人草稿。');
          }
          setDraftId(savedDraft.id);
          setDraftSeason(savedDraft.season);
          if (savedDraft.season?.status === 'accepting') setSelectedSeasonId(String(savedDraft.season.id));
          setSelectedProposalType(String(savedDraft.proposal_type.id));
          const phase = savedDraft.phases?.find((item) => item.phase === 'phase1')?.payload || {};
          const { __attachments__: attachments = {}, ...meta } = phase;
          setPhaseState({ phase1: { meta: {
            ...meta,
            title: savedDraft.title === '未命名提案' ? '' : savedDraft.title,
            abstract: savedDraft.abstract || '',
          }, attachments } });
          setSelectedInstruments((savedDraft.instruments || []).map((item) => item.instrument.code));
          setInstrumentState(Object.fromEntries((savedDraft.instruments || []).map((item) => {
            const { __attachments__: files = {}, ...form } = item.form_data || {};
            return [item.instrument.code, { form, attachments: files }];
          })));
          setNotice(savedDraft.data?.copied_from_proposal_id
            ? `已从 RPS-${String(savedDraft.data.copied_from_proposal_id).padStart(5, '0')} 复制为新草稿；请核对内容并重新上传附件。`
            : savedDraft.season?.status === 'accepting' ? '' : '原申请批次已结束，请重新选择开放批次。');
        }
      } catch (bootstrapError) {
        setError(bootstrapError.info?.message || bootstrapError.message || '草稿或提案配置加载失败。');
      } finally {
        setSeasonsLoaded(true);
      }
    }
    bootstrap();
  }, []);

  const displayedTypes = proposalTypes.length ? proposalTypes : DEFAULT_PROPOSAL_TYPES;
  const displayedInstruments = instruments.length ? instruments : FALLBACK_INSTRUMENTS;
  const selectedType = displayedTypes.find((item) => String(item.id) === String(selectedProposalType));
  const acceptingSeasons = seasons.filter((season) => season.status === 'accepting');
  const selectedSeason = acceptingSeasons.find((season) => String(season.id) === selectedSeasonId);
  const batchLocked = Boolean(draftId && draftSeason?.status === 'accepting' && String(draftSeason.id) === selectedSeasonId);

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

  const workflowStages = useMemo(() => getWorkflowStages(selectedWorkflow?.definition), [selectedWorkflow]);
  const generalFields = (generalTemplate?.fields || []).filter((field) => field.name !== 'rapid_plan');
  const fieldsForStep = (step) => generalFields.filter((field) => !['title', 'abstract'].includes(field.name) && getFieldStep(field) === step);
  const stepError = (step) => {
    if (step === 0) {
      if (!selectedSeason) return acceptingSeasons.length ? '请先选择申请批次。' : '当前没有开放的提案批次。';
      if (!selectedType || selectedType.previewOnly) return '请选择提案类型。';
      return '';
    }
    if (!generalTemplate) return '表单尚未加载完成，请稍后再试。';
    if (step === 1) {
      if (!hasValue(phaseState.phase1?.meta?.title)) return '请填写提案名称。';
      if (!hasValue(phaseState.phase1?.meta?.abstract)) return '请填写摘要。';
    }
    if (step === 2) {
      if (!selectedInstruments.length) return '请至少选择一项仪器设备。';
      if (selectedInstruments.some((code) => instrumentTemplates[code] === undefined)) return '仪器表单尚未加载完成，请稍后再试。';
    }
    for (const field of fieldsForStep(step).filter((item) => item.required)) {
      const value = field.type === 'file' ? phaseState.phase1?.attachments?.[field.name] : phaseState.phase1?.meta?.[field.name];
      if (isMissingRequiredField(field, value)) return `请完整填写「${field.label || field.name}」。`;
    }
    if (step === 2 || step === 3) {
      for (const code of selectedInstruments) {
        for (const field of (instrumentTemplates[code]?.fields || []).filter((item) => item.required && (item.type === 'file' ? step === 3 : step === 2))) {
          const value = field.type === 'file' ? instrumentState[code]?.attachments?.[field.name] : instrumentState[code]?.form?.[field.name];
          if (isMissingRequiredField(field, value)) return `请完整填写「${field.label || field.name}」。`;
        }
      }
    }
    return '';
  };

  const markUnsaved = () => {
    editVersion.current += 1;
    setNotice('');
  };

  const handlePhaseFieldChange = (event) => {
    markUnsaved();
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
    markUnsaved();
    setPhaseState((previous) => ({
      ...previous,
      phase1: {
        ...(previous.phase1 || emptyPhaseState()),
        attachments: { ...(previous.phase1?.attachments || {}), [fieldName]: serialized },
      },
    }));
  };

  const toggleInstrument = (code) => {
    markUnsaved();
    setSelectedInstruments((previous) => previous.includes(code) ? previous.filter((item) => item !== code) : [...previous, code]);
    setInstrumentState((previous) => previous[code]
      ? Object.fromEntries(Object.entries(previous).filter(([key]) => key !== code))
      : { ...previous, [code]: { form: {}, attachments: {} } });
  };

  const handleInstrumentFieldChange = (code, event) => {
    markUnsaved();
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
    markUnsaved();
    setInstrumentState((previous) => ({
      ...previous,
      [code]: {
        ...(previous[code] || { form: {}, attachments: {} }),
        attachments: { ...(previous[code]?.attachments || {}), [fieldName]: serialized },
      },
    }));
  };

  const currentPayload = () => ({
    ...buildProposalCreatePayload({ selectedProposalType, selectedInstruments, phaseState, instrumentState }),
    season_id: selectedSeason?.id,
  });
  const draftUpdatePayload = () => ({
    season_id: selectedSeason?.id,
    title: phaseState.phase1?.meta?.title || '',
    abstract: phaseState.phase1?.meta?.abstract || '',
    phase_payload: {
      ...(phaseState.phase1?.meta || {}),
      __attachments__: phaseState.phase1?.attachments || {},
    },
    instruments: selectedInstruments.map((code) => ({
      instrument_code: code,
      form_data: {
        ...(instrumentState[code]?.form || {}),
        __attachments__: instrumentState[code]?.attachments || {},
      },
    })),
  });

  const saveDraft = async ({ showNotice = true } = {}) => {
    if (saveInFlight.current) return false;
    if (!selectedSeason) {
      setError(acceptingSeasons.length ? '请先选择申请批次。' : '当前没有开放的提案批次，暂不能填写或保存提案。');
      return false;
    }
    if (!selectedType || selectedType.previewOnly) {
      setError('请先选择有效的提案类型。');
      return false;
    }
    saveInFlight.current = true;
    const versionAtStart = editVersion.current;
    setLoading(true);
    setError('');
    try {
      let savedId = draftId;
      if (savedId) {
        await updateProposal(savedId, draftUpdatePayload());
        setDraftSeason(selectedSeason);
      } else {
        const payload = currentPayload();
        const created = await createProposal({
          ...payload,
          save_as_draft: true,
          instruments: payload.instruments.map((entry) => ({ ...entry, status: 'draft' })),
        });
        savedId = created.id;
        setDraftId(savedId);
        setDraftSeason(selectedSeason);
        window.history.replaceState({}, '', `/proposals/new?draft=${savedId}`);
      }
      if (editVersion.current !== versionAtStart) {
        setError('保存过程中内容发生变化，请再次保存后切换步骤。');
        return false;
      }
      setNotice(showNotice ? '已保存，可从“我的提案申请”继续填写。' : '');
      return true;
    } catch (saveError) {
      setError(saveError.info?.message || saveError.message || '草稿保存失败。');
      return false;
    } finally {
      saveInFlight.current = false;
      setLoading(false);
    }
  };

  const navigateToStep = async (step) => {
    if (loading || step === activeStep || step > maxUnlockedStep + 1) return;
    if (step > activeStep) {
      for (let index = 0; index < step; index += 1) {
        const validationError = stepError(index);
        if (validationError) {
          setError(validationError);
          setActiveStep(index);
          return;
        }
      }
    }
    const saved = await saveDraft({ showNotice: false });
    if (!saved) return;
    setMaxUnlockedStep((previous) => Math.max(previous, step));
    setError('');
    setActiveStep(step);
    document.getElementById('proposal-steps')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const deleteDraft = async () => {
    if (!draftId || loading || !window.confirm('确定删除这份草稿并退出吗？删除后无法恢复。')) return;
    setLoading(true);
    setError('');
    try {
      await deleteProposalDraft(draftId);
      router.push('/dashboard/proposals');
    } catch (deleteError) {
      setError(deleteError.info?.message || deleteError.message || '删除草稿失败。');
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (activeStep < CREATION_STEPS.length - 1) {
      await navigateToStep(activeStep + 1);
      return;
    }
    for (let index = 0; index < CREATION_STEPS.length - 1; index += 1) {
      const validationError = stepError(index);
      if (validationError) {
        setError(validationError);
        setActiveStep(index);
        return;
      }
    }

    setLoading(true);
    try {
      const proposalId = draftId || (await createProposal(currentPayload())).id;
      if (draftId) await updateProposal(draftId, draftUpdatePayload());
      const transitions = await listProposalTransitions(proposalId);
      const submitPhase1 = (transitions.transitions || []).find((transition) => ['submit_phase1', 'submit'].includes(transition.name));
      if (!submitPhase1) throw new Error('提案已保存为草稿，但尚未找到正式提交操作。');
      await triggerProposalTransition(proposalId, { transition: submitPhase1.name });
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
    <div className="proposal-editor rps-enter mx-auto max-w-[1050px] pb-12">
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-slate-500">提案申请 · 分步填写</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{draftId ? '继续填写提案' : '创建新提案'}</h1>
          <p className="mt-2 text-sm text-slate-500">依次完成批次、申请内容和附件，最后核对提交。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draftId && <button type="button" onClick={deleteDraft} disabled={loading} className="rps-button-secondary border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50"><TrashIcon className="h-4 w-4" /> 删除并退出</button>}
          <button type="button" onClick={() => saveDraft()} disabled={loading || !selectedSeason} className="rps-button-secondary">{loading ? '正在保存…' : draftId ? '保存草稿' : '保存为草稿'}</button>
        </div>
      </header>

      {notice && <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"><InformationCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />{notice}</div>}
      {seasonsLoaded && !acceptingSeasons.length && !error && <div role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前没有开放的提案批次，暂不能填写、保存或提交提案。请等待管理员开放申请批次。</div>}
      <form onSubmit={handleSubmit}>
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_36px_rgba(28,41,73,0.04)]">
          <div id="proposal-steps" className="scroll-mt-24 bg-slate-50/70 px-2 sm:px-5">
            <CreationSteps activeStep={activeStep} maxUnlockedStep={maxUnlockedStep} onStepChange={navigateToStep} disabled={loading} />
          </div>
            <div className="border-b border-slate-100 px-5 py-5 sm:px-9 sm:py-6">
              <p className="text-xs font-semibold text-[#3347b8]">第 {activeStep + 1} 步 / 共 {CREATION_STEPS.length} 步</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{CREATION_STEPS[activeStep]}</h2>
              <p className="mt-2 text-xs text-slate-500">进入下一步会检查必填项并保存；点击已解锁的步骤也会保存草稿。</p>
            </div>
            {error && <div role="alert" className="mx-5 mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-9">{error}</div>}

            <div key={activeStep} className="rps-enter px-5 py-7 sm:px-9 sm:py-9">
              {activeStep === 0 && (
                <div className="space-y-8">
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                      <label htmlFor="proposal-season" className="shrink-0 text-sm font-semibold text-slate-700 sm:w-24">申请批次 <span className="text-rose-600">*</span></label>
                      <select id="proposal-season" value={selectedSeasonId} onChange={(event) => { setSelectedSeasonId(event.target.value); setError(''); markUnsaved(); }} disabled={!acceptingSeasons.length || batchLocked} className="rps-field sm:max-w-lg" aria-required="true">
                        <option value="">{seasonsLoaded && !acceptingSeasons.length ? '暂无开放批次' : '请选择申请批次'}</option>
                        {acceptingSeasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
                      </select>
                    </div>
                    {selectedSeason && <p className="text-xs text-slate-500 sm:pl-28">申请截止：{selectedSeason.end_date?.slice(0, 16).replace('T', ' ')}（北京时间）</p>}
                    {batchLocked && <p className="text-xs text-slate-500 sm:pl-28">草稿已归入此批次，不能再切换批次或提案类型。</p>}
                    {draftSeason && selectedSeason && String(draftSeason.id) !== selectedSeasonId && <p className="text-xs text-amber-700 sm:pl-28">原草稿批次已结束，保存后归入所选批次。</p>}
                  </div>
                  {selectedSeason && <div className="border-t border-slate-100 pt-7">
                    <p className="mb-3 text-sm font-semibold text-slate-700">提案类型 <span className="text-rose-600">*</span></p>
                    <div className="grid gap-3 md:grid-cols-2">
                    {displayedTypes.map((type) => {
                      const presentation = getProposalTypePresentation(type);
                      const selected = String(type.id) === String(selectedProposalType);
                      const Icon = presentation.kind === 'opportunity' ? BoltIcon : GlobeAltIcon;
                      return (
                        <button key={type.id} type="button" onClick={() => { setSelectedProposalType(String(type.id)); setGeneralTemplate(null); setSelectedWorkflow(null); markUnsaved(); }} disabled={Boolean(draftId)} aria-pressed={selected} className={`group rounded-xl border p-5 text-left transition-colors disabled:cursor-not-allowed ${selected ? 'border-[#3347b8] bg-indigo-50/50' : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50/70'}`}>
                          <div className="flex items-start justify-between gap-4">
                            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${selected ? 'bg-[#3347b8] text-white' : 'bg-slate-100 text-slate-600'}`}><Icon className="h-5 w-5" /></span>
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-[#3347b8]' : 'border-slate-300'}`}>{selected && <span className="h-2.5 w-2.5 rounded-full bg-[#3347b8]" />}</span>
                          </div>
                          <h3 className="mt-4 text-base font-semibold text-slate-900">{type.name}</h3>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{presentation.description}</p>
                          <p className="mt-3 text-xs text-slate-500">{presentation.examples}</p>
                        </button>
                      );
                    })}
                    </div>
                  </div>
                  }
                </div>
              )}

              {activeStep === 1 && (
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label htmlFor="title" className="mb-1.5 block text-sm font-semibold text-slate-700">提案名称 <span className="text-rose-600">*</span></label>
                    <input id="title" name="title" required value={phaseState.phase1?.meta?.title || ''} onChange={handlePhaseFieldChange} placeholder="请输入清晰、可识别的研究题目" className="rps-field" />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="abstract" className="mb-1.5 block text-sm font-semibold text-slate-700">摘要 <span className="text-rose-600">*</span></label>
                    <textarea id="abstract" name="abstract" rows={7} required value={phaseState.phase1?.meta?.abstract || ''} onChange={handlePhaseFieldChange} placeholder="分段说明背景、科学目标、观测方法和预期成果" className="rps-field resize-y leading-7" />
                    <p className="mt-1.5 text-xs text-slate-500">建议 400–600 字 · 已写 {countCharacters(phaseState.phase1?.meta?.abstract)} 字；较长内容不会截断</p>
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
                          <button key={instrument.code} type="button" onClick={() => toggleInstrument(instrument.code)} aria-pressed={selected} className={`rounded-xl border px-4 py-3 text-left ${selected ? 'border-[#3347b8] bg-indigo-50/50' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50/70'}`}>
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
                  <p className="text-sm leading-6 text-slate-600">按表单要求上传附件。提交后仍可在提案详情下载原文件。</p>
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
                    <div><p className="text-xs text-slate-500">提交后状态</p><p className="mt-1 text-sm font-semibold text-slate-900">待形式审查</p></div>
                  </div>
                  <div className="border-t border-slate-200 pt-6">
                    <p className="text-xs text-slate-500">提案名称</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{phaseState.phase1?.meta?.title || '尚未填写'}</p>
                    <p className="mt-2 max-w-[80ch] whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{phaseState.phase1?.meta?.abstract || '尚未填写摘要。'}</p>
                  </div>
                  <details className="border-t border-slate-200 pt-5">
                    <summary className="cursor-pointer text-sm font-semibold text-[#3347b8]">核对申请内容与附件</summary>
                    <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
                      {generalFields.filter((field) => field.type !== 'file').map((field) => {
                        const value = phaseState.phase1?.meta?.[field.name];
                        const entries = field.type === 'repeatable' && Array.isArray(value) ? value : [];
                        const shown = field.type === 'select' ? field.options?.find((option) => option.value === value)?.label || value : value;
                        return <div key={field.name} className={`border-b border-slate-100 py-3 ${field.type === 'textarea' || field.type === 'repeatable' ? 'sm:col-span-2' : ''}`}><dt className="text-xs text-slate-500">{field.label}</dt><dd className="mt-1 max-w-[80ch] whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{field.type === 'repeatable' ? entries.map((entry, index) => <div key={index} className="mt-2 border-l-2 border-slate-200 pl-3">{field.label} {index + 1}：{(field.subFields || field.sub_fields || []).map((subField) => `${subField.label} ${entry[subField.name] || '未填写'}`).join(' · ')}</div>) : shown || '未填写'}</dd></div>;
                      })}
                      {generalFields.filter((field) => field.type === 'file').map((field) => <div key={field.name} className="border-b border-slate-100 py-3 sm:col-span-2"><dt className="text-xs text-slate-500">{field.label}</dt><dd className="mt-1 text-sm text-slate-800">{phaseState.phase1?.attachments?.[field.name]?.name || '未上传'}</dd></div>)}
                    </dl>
                    {selectedInstruments.map((code) => <div key={code} className="mt-5 border-t border-slate-200 pt-4"><p className="text-sm font-semibold text-slate-900">{displayedInstruments.find((item) => item.code === code)?.name || code}</p><dl className="mt-2 grid gap-x-8 sm:grid-cols-2">{(instrumentTemplates[code]?.fields || []).map((field) => { const value = field.type === 'file' ? instrumentState[code]?.attachments?.[field.name]?.name : instrumentState[code]?.form?.[field.name]; const shown = field.type === 'select' ? field.options?.find((option) => option.value === value)?.label || value : value; return <div key={field.name} className="border-b border-slate-100 py-2"><dt className="text-xs text-slate-500">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{shown || '未填写'}</dd></div>; })}</dl></div>)}
                  </details>
                  <div className="rounded-2xl bg-slate-50 p-5">
                    <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">提交后的评审进展</p>
                    <WorkflowProgress stages={workflowStages} currentStage={workflowStages[0]} compact />
                  </div>
                  <p className="border-l-2 border-[#3347b8] bg-indigo-50/70 px-4 py-3 text-sm leading-6 text-slate-700">后续成果义务：取得数据并办结后，请在“我的提案申请”中提交成果摘要和论文初稿。未经成果阶段的科学委员会认定，不应登记期刊投稿。</p>
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 text-slate-600">
                    <input type="checkbox" required className="mt-1 h-4 w-4 rounded border-slate-300 text-[#3347b8]" />
                    我确认以上信息真实完整，并同意按照提案征集要求提交评审。
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-5 sm:px-9">
              <button type="button" onClick={() => activeStep === 0 ? router.back() : navigateToStep(activeStep - 1)} disabled={loading} className="rps-button-secondary"><ArrowLeftIcon className="h-4 w-4" /> {activeStep === 0 ? '取消' : '上一步'}</button>
              <button type={activeStep === CREATION_STEPS.length - 1 ? 'submit' : 'button'} onClick={activeStep === CREATION_STEPS.length - 1 ? undefined : () => navigateToStep(activeStep + 1)} disabled={loading || !seasonsLoaded || !acceptingSeasons.length} className="rps-button-primary">
                {activeStep === CREATION_STEPS.length - 1 ? <PaperAirplaneIcon className="h-4 w-4" /> : null}
                {loading ? activeStep === CREATION_STEPS.length - 1 ? '提交中…' : '保存中…' : activeStep === CREATION_STEPS.length - 1 ? '提交提案' : '保存并进入下一步'}
                {activeStep < CREATION_STEPS.length - 1 && <ArrowRightIcon className="h-4 w-4" />}
              </button>
            </div>
        </section>
      </form>
    </div>
  );
}
