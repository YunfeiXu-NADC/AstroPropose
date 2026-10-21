'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PaperClipIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';

import {
  allocateProposalData,
  assignProposalReviewer,
  copyProposalAsDraft,
  downloadProposalDocument,
  getCurrentUser,
  getProposal,
  listAdminUsers,
  listProposalTransitions,
  revokeProposalData,
  setProposalReviewVisibility,
  submitInstrumentFeedbackAPI,
  submitProposalReview,
  triggerProposalTransition,
  updateProposal,
} from '@/lib/api';
import { getActionButtonLabel, getActionPanelCopy } from '@/lib/proposalActionCopy.mjs';
import WorkflowProgress from '@/components/WorkflowProgress';
import { getFinalDecisionLabel, getProposalKind, getProposalStatusPresentation, getWorkflowDisplayStage, getWorkflowStages, isProposalClosed } from '@/lib/workflowDisplay.mjs';
import { hasFinalObservationFeedback, hasObservationFeedback, observationFeedbackLabel } from '@/lib/observationFeedback.mjs';

const REVIEW_LABELS = {
  technical: '技术评审',
  scientific: '科学评审',
  committee: '最终决策',
};

const REVIEW_SCORE_LABELS = {
  technical_feasibility: '技术可行性',
  instrument_match: '仪器与参数匹配度',
  scientific_merit: '科学价值',
  urgency: '时效必要性',
  priority: '观测优先级',
  overall_priority: '综合优先级',
  overall: '综合评分',
};

const REQUIRED_ROLES = {
  technical: 'Technical Expert',
  scientific: 'Reviewer',
  committee: 'Panel Chair',
};

const DELEGATED_ACTION_ROLES = {
  technical_revision: 'Technical Expert',
  committee_approve: 'Panel Chair',
  committee_reject: 'Panel Chair',
  committee_revision: 'Panel Chair',
  decision_approve: 'Panel Chair',
  decision_reject: 'Panel Chair',
  decision_revision: 'Panel Chair',
  start_observation: 'Instrument Scheduler',
  finish_observation: 'Instrument Scheduler',
  record_feedback: 'Instrument Scheduler',
  grant_data: 'Proposal Manager',
  manual_binding: 'Proposal Manager',
  finish_binding: 'Proposal Manager',
};

const RECOMMENDATIONS = [
  { value: 'pass', label: '建议通过' },
  { value: 'revise', label: '退回修改' },
  { value: 'reject', label: '建议驳回' },
];

const FINAL_DECISIONS = {
  research: [
    { value: 'committee_approve', label: '通过', detail: '进入数据分配' },
    { value: 'committee_reject', label: '驳回', detail: '结束申请' },
  ],
  opportunity: [
    { value: 'decision_approve', label: '通过', detail: '进入观测编排与执行' },
    { value: 'decision_reject', label: '驳回', detail: '结束申请' },
  ],
};

const HEADER_TONES = {
  draft: {
    surface: 'border-[#dce3eb] bg-[#f2f5f8]',
    badge: 'border-[#c9d3df] bg-white/85 text-[#526174]',
    title: 'text-[#263648]',
  },
  active: {
    surface: 'border-[#cad6ee] bg-[#eff3fc]',
    badge: 'border-[#b9c9e9] bg-white/85 text-[#304aa2]',
    title: 'text-[#1d356b]',
  },
  revision: {
    surface: 'border-[#eedbb7] bg-[#fff8eb]',
    badge: 'border-[#ebd099] bg-white/85 text-[#995b14]',
    title: 'text-[#754618]',
  },
  rejected: {
    surface: 'border-[#efcbd0] bg-[#fff2f2]',
    badge: 'border-[#e7b9c2] bg-white/85 text-[#a52d42]',
    title: 'text-[#7f2b3b]',
  },
  closed: {
    surface: 'border-[#c3decc] bg-[#edf7f0]',
    badge: 'border-[#afd5ba] bg-white/85 text-[#17603d]',
    title: 'text-[#174a35]',
  },
};

function formatDate(value) {
  if (!value) return '尚未提交';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function displayValue(field, value) {
  if (value === undefined || value === null || value === '') return '未填写';
  if (field?.type === 'select') {
    return field.options?.find((option) => String(option.value) === String(value))?.label || String(value);
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function reviewScoreDetails(review, fields) {
  const configured = fields
    .filter((field) => review.scores?.[field.name] !== undefined && review.scores?.[field.name] !== '')
    .map((field) => `${field.label} ${review.scores[field.name]} 分`);
  return configured.length ? configured : Object.entries(review.scores || {}).map(([name, score]) => `${name} ${score} 分`);
}

function reviewScoreSummary(review) {
  return Object.entries(review.scores || {})
    .map(([name, score]) => `${REVIEW_SCORE_LABELS[name] || name} ${score}/5`)
    .join(' · ');
}

const countCharacters = (value) => Array.from(String(value || '').replace(/\s/g, '')).length;

function ReadonlyForm({ template, values = {}, compact = false }) {
  const fields = (template?.definition?.fields || []).filter((field) => field.name !== 'rapid_plan');
  if (!fields.length) return <p className="text-sm text-slate-500">当前部分尚未配置展示字段。</p>;

  return (
    <dl className={`grid gap-x-8 sm:grid-cols-2 ${compact ? 'gap-y-1' : 'gap-y-5'}`}>
      {fields.filter((field) => field.type !== 'file').map((field) => {
        const value = values[field.name];
        if (field.type === 'repeatable') {
          const entries = Array.isArray(value) ? value : [];
          return (
            <div key={field.name} className="sm:col-span-2">
              <dt className="text-sm font-medium text-slate-500">{field.label}</dt>
              <dd className="mt-1.5">
                {entries.length ? entries.map((entry, index) => (
                  <article key={index} className="border-l-2 border-[#7899a7] bg-slate-50/70 px-4 py-3 first:mt-0 [&+&]:mt-3">
                    <p className="text-base font-semibold text-slate-900">目标 {index + 1}{entry?.target_name ? ` · ${entry.target_name}` : ''}</p>
                    <dl className="mt-2 grid gap-x-7 gap-y-2 sm:grid-cols-2">
                      {(field.sub_fields || field.subFields || []).filter((subField) => subField.name !== 'target_name').map((subField) => (
                        <div key={subField.name} className={subField.type === 'textarea' ? 'sm:col-span-2' : ''}>
                          <dt className="text-sm text-slate-500">{subField.label}</dt>
                          <dd className="mt-0.5 whitespace-pre-wrap break-words text-base leading-7 text-slate-800">{displayValue(subField, entry?.[subField.name])}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                )) : <p className="text-sm text-slate-400">未填写</p>}
              </dd>
            </div>
          );
        }
        return (
          <div key={field.name} className={`min-w-0 ${field.type === 'textarea' ? 'sm:col-span-2' : ''} ${compact && field.type !== 'textarea' ? 'flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1' : ''}`}>
            <dt className="text-sm font-medium text-slate-500">{field.label}</dt>
            <dd className={`${compact && field.type !== 'textarea' ? 'text-sm leading-6' : 'mt-0.5 text-base leading-7'} max-w-[80ch] whitespace-pre-wrap break-words text-slate-800`}>{displayValue(field, value)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function FieldControl({ field, value, onChange }) {
  if (field.type === 'textarea') return <textarea rows={Math.max(field.rows || 4, 7)} required={field.required} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="rps-field resize-y leading-7" />;
  if (field.type === 'select') {
    return (
      <select required={field.required} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="rps-field">
        <option value="">请选择</option>
        {(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  if (field.type === 'checkbox') {
    return <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#3347b8]" />{field.checkboxLabel || '确认此项'}</label>;
  }
  return <input type={field.type === 'number' ? 'number' : 'text'} required={field.required} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="rps-field" />;
}

function EditableForm({ template, values = {}, onChange }) {
  const fields = (template?.definition?.fields || []).filter((field) => field.name !== 'rapid_plan');
  const setField = (name, value) => onChange({ ...values, [name]: value });
  const setAttachment = (name, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setField('__attachments__', {
      ...(values.__attachments__ || {}),
      [name]: { name: file.name, size: file.size, type: file.type || 'application/octet-stream', data_url: reader.result },
    });
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {fields.map((field) => {
        if (field.type === 'file') {
          const attached = values.__attachments__?.[field.name];
          return (
            <label key={field.name} className="md:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">{field.label}</span>
              <span className="flex cursor-pointer items-center justify-between border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 hover:border-[#3347b8]">
                <span className="flex items-center gap-2"><PaperClipIcon className="h-5 w-5 text-[#3347b8]" />{attached?.name || '选择附件'}</span>
                <span className="font-semibold text-[#3347b8]">浏览</span>
                <input type="file" onChange={(event) => setAttachment(field.name, event.target.files?.[0])} className="sr-only" />
              </span>
            </label>
          );
        }
        if (field.type === 'repeatable') {
          const subFields = field.sub_fields || field.subFields || [];
          const entries = Array.isArray(values[field.name]) ? values[field.name] : [];
          const blank = Object.fromEntries(subFields.map((subField) => [subField.name, '']));
          const updateEntry = (index, name, value) => setField(field.name, entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, [name]: value } : entry));
          return (
            <div key={field.name} className="md:col-span-2">
              <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">{field.label}</p><button type="button" onClick={() => setField(field.name, [...entries, blank])} className="rps-button-quiet text-[#3347b8]"><PlusIcon className="h-4 w-4" /> 添加</button></div>
              <div className="space-y-3">
                {entries.map((entry, index) => (
                  <div key={index} className="border-l-2 border-[#7899a7] bg-slate-50 p-4">
                    <div className="mb-4 flex items-center justify-between"><p className="text-xs font-semibold text-[#3347b8]">{field.label} {index + 1}</p><button type="button" onClick={() => setField(field.name, entries.filter((_, entryIndex) => entryIndex !== index))} className="rps-button-quiet text-rose-600"><TrashIcon className="h-4 w-4" /> 删除</button></div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {subFields.map((subField) => <label key={subField.name} className={subField.type === 'textarea' ? 'sm:col-span-2' : ''}><span className="mb-1.5 block text-xs font-semibold text-slate-600">{subField.label}</span><FieldControl field={subField} value={entry[subField.name]} onChange={(value) => updateEntry(index, subField.name, value)} /></label>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return <label key={field.name} className={field.type === 'textarea' ? 'md:col-span-2' : ''}><span className="mb-1.5 block text-sm font-semibold text-slate-700">{field.label}{field.required && <span className="ml-1 text-rose-600">*</span>}</span><FieldControl field={field} value={values[field.name]} onChange={(value) => setField(field.name, value)} />{field.type === 'textarea' && <span className="mt-1 block text-xs text-slate-500">已写 {countCharacters(values[field.name])} 字{field.recommended_length ? ` · 建议 ${field.recommended_length} 字` : ''}</span>}</label>;
      })}
    </div>
  );
}

function UploadedMaterials({ sources }) {
  const files = sources.flatMap(({ values }) => Object.values(values?.__attachments__ || {}).filter(Boolean));
  if (!files.length) return null;
  return (
    <div className="space-y-1">
      {files.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 py-2.5"><p className="min-w-0 truncate text-base text-slate-800" title={file.name}>{file.name}</p>{file.data_url ? <a href={file.data_url} download={file.name} className="shrink-0 text-sm font-semibold text-[#3347b8] hover:underline" aria-label={`下载附件：${file.name}`}>下载</a> : <span className="shrink-0 text-sm text-slate-400">无法下载</span>}</div>)}
    </div>
  );
}

function MaterialsDownload({ sources, onDownload }) {
  return (
    <section className="py-5">
      <h2 className="flex items-center gap-2.5 text-lg font-semibold text-[#293d9f]"><span className="h-5 w-1 rounded-full bg-[#5369cf]" aria-hidden="true" />附件</h2>
      <div className="mt-2 space-y-1">
        <UploadedMaterials sources={sources} />
        <div className="flex items-center justify-between gap-3 py-2.5">
          <p className="min-w-0 text-base text-slate-800">完整提案 PDF</p>
          <button type="button" onClick={onDownload} className="shrink-0 text-sm font-semibold text-[#3347b8] hover:underline" aria-label="下载完整提案 PDF">下载</button>
        </div>
      </div>
    </section>
  );
}

function Section({ id, eyebrow, title, children }) {
  return <section id={id} className="scroll-mt-8 py-5 first:pt-0"><header>{eyebrow && <p className="rps-eyebrow">{eyebrow}</p>}<h2 className="flex items-center gap-2.5 text-lg font-semibold text-[#293d9f]"><span className="h-5 w-1 rounded-full bg-[#5369cf]" aria-hidden="true" />{title}</h2></header><div className="mt-3 min-w-0">{children}</div></section>;
}

function ObservationFeedback({ proposal, canAllocateData, onAddData, onRevokeData, saving }) {
  const [pendingRevoke, setPendingRevoke] = useState(null);
  const feedbacks = (proposal.instruments || [])
    .map((entry) => ({ instrument: entry.instrument, feedback: entry.scheduling_feedback || {} }))
    .filter((entry) => hasObservationFeedback(entry.feedback));

  if (getProposalKind(proposal.proposal_type?.name) === 'research') {
    const products = (proposal.instruments || []).flatMap((entry) =>
      (entry.scheduling_feedback?.data_products || []).map((product, index) => ({
        ...product, instrument: entry.instrument, anchor: `data-product-${entry.id}-${index}`,
        observationId: product.observation_id || entry.scheduling_feedback?.observation_id,
      }))
    );
    if (!products.length && !canAllocateData) return null;
    return <Section id="data-allocation" title="观测数据">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
        <p className="text-sm text-slate-600">{products.length ? `已开放 ${products.length} 个数据产品` : '尚未分配数据产品'}</p>
        {canAllocateData && <button type="button" onClick={onAddData} className="rps-button-secondary text-sm"><PlusIcon className="h-4 w-4" /> {products.length ? '追加数据' : '分配数据'}</button>}
      </div>
      {products.length > 0 && <div className="divide-y divide-slate-100 border-t border-slate-200">
        {products.map((product) => {
          const inlineData = product.data_url?.startsWith('data:');
          const confirming = pendingRevoke?.instrument === product.instrument.code && pendingRevoke?.name === product.name;
          return <article id={product.anchor} key={product.anchor} className="-mx-2 scroll-mt-24 rounded-md px-2 py-4 transition-colors target:bg-indigo-50/70">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><h3 className="break-words text-sm font-semibold text-slate-900">{product.name}</h3><p className="mt-1 text-xs text-slate-500">{product.instrument.name}（{product.instrument.code}）{product.observationId ? ` · ${product.observationId}` : ''}{product.format ? ` · ${product.format}` : ''}{product.size ? ` · ${product.size}` : ''}</p>{product.description && <p className="mt-1 text-xs leading-5 text-slate-500">{product.description}</p>}</div>
              <div className="flex shrink-0 items-center gap-4 text-sm font-semibold">
                {product.data_url ? <a href={product.data_url} download={inlineData ? product.name : undefined} target={inlineData ? undefined : '_blank'} rel={inlineData ? undefined : 'noopener noreferrer'} className="text-[#3347b8] hover:underline">{inlineData ? '下载数据' : '打开数据'} <ArrowTopRightOnSquareIcon className="inline h-4 w-4" /></a> : <span className="text-slate-400">暂无访问链接</span>}
                {canAllocateData && <button type="button" disabled={saving} onClick={() => setPendingRevoke({ instrument: product.instrument.code, name: product.name })} className="text-rose-700 hover:underline disabled:opacity-50">取消分配</button>}
              </div>
            </div>
            {confirming && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800"><span>确认取消「{product.name}」的访问授权？{products.length === 1 ? '提案将返回待分配状态。' : ''}</span><span className="flex gap-3 font-semibold"><button type="button" disabled={saving} onClick={() => setPendingRevoke(null)}>保留</button><button type="button" disabled={saving} onClick={async () => { if (await onRevokeData(product.instrument.code, product.name)) setPendingRevoke(null); }}>确认取消</button></span></div>}
          </article>;
        })}
      </div>}
    </Section>;
  }

  if (!feedbacks.length) return null;
  const dataReady = feedbacks.some((entry) => entry.feedback.status === 'data_ready' || entry.feedback.data_products?.length);

  return (
    <Section id="observation-feedback" title={dataReady ? '已开放数据' : '观测结果'}>
      <div className="space-y-5">
        {feedbacks.map(({ instrument, feedback }) => (
          <article key={instrument.code} className="border-l-2 border-emerald-500 bg-emerald-50/40 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">{instrument.name}（{instrument.code}）</p>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">{observationFeedbackLabel(feedback)}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{feedback.summary || '观测执行信息已更新。'}</p>
            {(feedback.observation_id || feedback.visibility_window || feedback.completed_at) && <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
              {feedback.observation_id && <div><dt className="text-slate-400">{dataReady ? '数据编号' : '观测编号'}</dt><dd className="mt-1 font-medium text-slate-700">{feedback.observation_id}</dd></div>}
              {feedback.visibility_window && <div><dt className="text-slate-400">观测窗口</dt><dd className="mt-1 font-medium text-slate-700">{feedback.visibility_window}</dd></div>}
              {feedback.completed_at && <div><dt className="text-slate-400">完成时间</dt><dd className="mt-1 font-medium text-slate-700">{feedback.completed_at}</dd></div>}
            </dl>}
          </article>
        ))}
      </div>
    </Section>
  );
}

function temporaryDataCatalog(proposal) {
  return (proposal.instruments || []).flatMap((entry) => {
    const code = entry.instrument.code;
    const observationId = `DSL-OBS-TEMP-${String(proposal.id).padStart(4, '0')}-${code}`;
    return [
      {
        id: `${code}-manifest`, instrument_code: code, observation_id: observationId,
        product_name: `${observationId}-观测清单.csv`, format: 'CSV', size: '86 KB',
        description: `${entry.instrument.name}的观测时间、频段、积分时长与质量标记。`,
        summary: `${entry.instrument.name}临时测试数据已关联，可供原型确认下载。`, data_url: '',
      },
      {
        id: `${code}-quality`, instrument_code: code, observation_id: observationId,
        product_name: `${observationId}-质量报告.txt`, format: 'TXT', size: '18 KB',
        description: `${entry.instrument.name}的数据版本、标定状态和质量检查说明。`,
        summary: `${entry.instrument.name}质量报告已关联，可供提案者查看。`, data_url: '',
      },
    ];
  });
}

function DataAllocationPanel({ proposal, values, onSelect, onSubmit, onClose, saving, error }) {
  const candidates = temporaryDataCatalog(proposal);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="data-allocation-title">
      <button type="button" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} aria-label="关闭数据分配" />
      <section className="relative max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0"><p className="rps-eyebrow">观测数据分配</p><h2 id="data-allocation-title" className="mt-1 text-lg font-semibold text-slate-950 sm:text-xl">选择要授权的数据产品</h2></div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label="关闭"><XMarkIcon className="h-5 w-5" /></button>
        </header>
        <div className="max-h-[calc(86vh-150px)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          <p className="mb-2 text-xs font-semibold text-slate-500">可分配的临时测试数据</p>
          <div className="divide-y divide-slate-100 border-y border-slate-200">
            {candidates.map((candidate) => {
              const selected = values.instrument_code === candidate.instrument_code && values.product_name === candidate.product_name;
              const metadata = `${candidate.instrument_code} · ${candidate.format} · ${candidate.size}`;
              return <button key={candidate.id} type="button" onClick={() => onSelect(candidate)} className={`grid w-full grid-cols-[24px_minmax(0,1fr)] items-start gap-3 px-3 py-4 text-left transition-colors sm:grid-cols-[24px_minmax(0,1fr)_auto] sm:items-center ${selected ? 'bg-[#3347b8]/5' : 'hover:bg-slate-50'}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-[#3347b8] bg-[#3347b8] text-white' : 'border-slate-300'}`}>{selected ? <CheckCircleIcon className="h-4 w-4" /> : null}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900" title={candidate.product_name}>{candidate.product_name}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{candidate.description}</span><span className="mt-1 block text-xs text-slate-400 sm:hidden">{metadata}</span></span><span className="hidden whitespace-nowrap text-xs text-slate-400 sm:block">{metadata}</span></button>;
            })}
          </div>
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6"><button type="button" onClick={onClose} className="rps-button-secondary justify-center">取消</button><button type="button" onClick={onSubmit} disabled={saving || !values.observation_id || !values.product_name} className="rps-button-primary justify-center">{saving ? '正在分配…' : '确认分配并开放访问'}</button></footer>
      </section>
    </div>,
    document.body
  );
}

function ReviewerAssignmentDialog({ reviewType, reviewers, selectedReviewer, onSelect, onConfirm, onClose, saving }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="reviewer-dialog-title"><button type="button" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} aria-label="关闭评审分配" /><section className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><div><p className="rps-eyebrow">评审分配</p><h2 id="reviewer-dialog-title" className="mt-1 text-xl font-semibold text-slate-950">选择{REVIEW_LABELS[reviewType]}专家</h2></div><button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="关闭"><XMarkIcon className="h-5 w-5" /></button></header><div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto px-6 py-2">{reviewers.length ? reviewers.map((reviewer) => <button key={reviewer.id} type="button" onClick={() => onSelect(String(reviewer.id))} className={`flex w-full items-center justify-between gap-4 py-4 text-left ${String(selectedReviewer) === String(reviewer.id) ? 'text-[#3347b8]' : 'text-slate-800'}`}><span><span className="block text-sm font-semibold">{reviewer.username}</span><span className="mt-1 block text-xs text-slate-400">{reviewer.email}</span></span><span className={`h-5 w-5 rounded-full border ${String(selectedReviewer) === String(reviewer.id) ? 'border-[6px] border-[#3347b8]' : 'border-slate-300'}`} /></button>) : <p className="py-8 text-center text-sm text-slate-500">暂无符合该角色的可选专家。</p>}</div><footer className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4"><button type="button" onClick={onClose} className="rps-button-secondary">取消</button><button type="button" onClick={onConfirm} disabled={!selectedReviewer || saving} className="rps-button-primary">{saving ? '正在分配…' : '确认分配'}</button></footer></section></div>;
}

function SchedulingFeedbackDialog({ proposal, values, onChange, onSubmit, onClose, saving }) {
  const isArrangement = values.status === 'scheduled';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="scheduling-feedback-title">
      <button type="button" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} aria-label="关闭观测反馈表" />
      <section className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 id="scheduling-feedback-title" className="text-xl font-semibold text-slate-950">记录观测安排与执行结果</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">保存观测安排不会结束本阶段；提交全部仪器的最终结果后提案办结。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="关闭"><XMarkIcon className="h-5 w-5" /></button>
        </header>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">申请仪器</span><select value={values.instrument_code} onChange={(event) => {
            const entry = proposal.instruments?.find((item) => item.instrument.code === event.target.value);
            const feedback = entry?.scheduling_feedback || {};
            onChange({ instrument_code: event.target.value, status: ['completed', 'unable'].includes(feedback.status) ? feedback.status : 'scheduled', visibility_window: feedback.visibility_window || '', summary: feedback.summary === '已推送观测编排负责人' ? '' : feedback.summary || '' });
          }} className="rps-field">{(proposal.instruments || []).map((entry) => <option key={entry.instrument.code} value={entry.instrument.code}>{entry.instrument.name}（{entry.instrument.code}）</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">观测状态</span><select value={values.status} onChange={(event) => onChange({ ...values, status: event.target.value, summary: values.status === 'scheduled' ? '' : values.summary })} className="rps-field"><option value="scheduled">已安排观测</option><option value="completed">观测已完成</option><option value="unable">当前无法执行</option></select></label>
          <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold text-slate-700">观测窗口</span><input value={values.visibility_window} onChange={(event) => onChange({ ...values, visibility_window: event.target.value })} className="rps-field" placeholder="例如：2026-11-12 至 2026-11-18" /></label>
          <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold text-slate-700">{isArrangement ? '观测安排说明' : '执行结果或无法执行原因'}</span><textarea rows={4} value={values.summary} onChange={(event) => onChange({ ...values, summary: event.target.value })} className="rps-field resize-y" placeholder={isArrangement ? '说明已安排的观测计划' : '说明执行结果或无法执行的原因'} /></label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4"><button type="button" onClick={onClose} className="rps-button-secondary">取消</button><button type="button" onClick={onSubmit} disabled={saving || !values.instrument_code || !values.summary.trim()} className="rps-button-primary">{saving ? '正在保存…' : isArrangement ? '保存观测安排' : '提交最终执行结果'}</button></footer>
      </section>
    </div>
  );
}

export default function ProposalDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get('mode') || 'owner';
  const [proposal, setProposal] = useState(null);
  const [user, setUser] = useState(null);
  const [transitions, setTransitions] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [selectedReviewer, setSelectedReviewer] = useState('');
  const [scores, setScores] = useState({});
  const [recommendation, setRecommendation] = useState('');
  const [decisionChoice, setDecisionChoice] = useState('');
  const [comments, setComments] = useState('');
  const [allocationValues, setAllocationValues] = useState({
    instrument_code: '', observation_id: '', product_name: '', format: 'CSV', size: '演示数据', summary: '观测数据已完成关联，并向提案者开放访问。', data_url: '',
  });
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [reviewerDialogOpen, setReviewerDialogOpen] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackValues, setFeedbackValues] = useState({ instrument_code: '', status: 'scheduled', visibility_window: '', summary: '' });
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editAbstract, setEditAbstract] = useState('');
  const [editPhaseValues, setEditPhaseValues] = useState({});
  const [editInstrumentValues, setEditInstrumentValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const hydrateEditor = (detail) => {
    setEditTitle(detail.title || '');
    setEditAbstract(detail.abstract || '');
    setEditPhaseValues(detail.phases?.find((phase) => phase.phase === 'phase1')?.payload || {});
    setEditInstrumentValues(Object.fromEntries((detail.instruments || []).map((entry) => [entry.instrument.code, entry.form_data || {}])));
    const firstInstrument = detail.instruments?.[0];
    const existing = firstInstrument?.scheduling_feedback || {};
    setAllocationValues({
      instrument_code: firstInstrument?.instrument.code || '',
      observation_id: existing.observation_id || `DSL-OBS-TEMP-${String(detail.id).padStart(4, '0')}`,
      product_name: existing.data_products?.[0]?.name || `${firstInstrument?.instrument.code || 'DSL'}-观测清单.csv`,
      format: existing.data_products?.[0]?.format || 'CSV',
      size: existing.data_products?.[0]?.size || '演示数据',
      summary: existing.summary || '观测数据已完成关联，并向提案者开放访问。',
      data_url: existing.data_products?.[0]?.data_url || '',
    });
  };

  const refresh = async () => {
    const [detail, actions] = await Promise.all([getProposal(id, { mode: requestedMode }), listProposalTransitions(id)]);
    setProposal(detail);
    setTransitions(actions.transitions || []);
    hydrateEditor(detail);
    return detail;
  };

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    Promise.all([getCurrentUser(), getProposal(id, { mode: requestedMode }), listProposalTransitions(id)])
      .then(async ([me, detail, actions]) => {
        setUser(me);
        setProposal(detail);
        setTransitions(actions.transitions || []);
        hydrateEditor(detail);
        if (requestedMode === 'admin' && detail.permissions?.can_manage) setAdminUsers(await listAdminUsers());
      })
      .catch((requestError) => setError(requestError.info?.message || '提案详情加载失败。'))
      .finally(() => setLoading(false));
  }, [id, requestedMode, router]);

  const isAdminMode = Boolean(proposal?.permissions?.can_manage && (
    requestedMode === 'admin' || (requestedMode === 'owner' && !proposal.permissions.is_owner)
  ));
  const isReviewMode = !isAdminMode && Boolean(proposal?.permissions?.can_review);
  const isResearchDataQueue = getProposalKind(proposal?.proposal_type?.name) === 'research'
    && ['待分配观测数据', '数据已授权', '已完成'].includes(proposal?.status);
  const canManageData = proposal?.permissions?.can_manage_data ?? Boolean(
    isResearchDataQueue && user?.roles?.some((role) => ['Admin', 'Proposal Manager'].includes(role)),
  );
  const canAllocateData = proposal?.permissions?.can_allocate_data;
  const isAllocationMode = requestedMode === 'allocation' && canManageData;
  const isSchedulingMode = requestedMode === 'scheduling' && user?.roles?.includes('Instrument Scheduler') && getProposalKind(proposal?.proposal_type?.name) === 'opportunity';
  const isOwnerMode = proposal?.permissions?.is_owner && !isAdminMode && !isReviewMode && !isAllocationMode && !isSchedulingMode;
  const reviewTemplate = proposal?.forms?.current_state;
  const reviewFields = reviewTemplate?.definition?.fields || [];
  const scoreFields = reviewFields.filter((field) => field.type === 'select' && field.name !== 'recommendation');
  const commentField = reviewFields.find((field) => field.type === 'textarea');
  const ownReview = proposal?.reviews?.find((review) => review.reviewer?.id === user?.id && review.review_type === proposal?.permissions?.review_type);

  useEffect(() => {
    if (!ownReview) return;
    setScores(ownReview.scores || {});
    setRecommendation(ownReview.recommendation || '');
    setComments(ownReview.comments || '');
    if (ownReview.review_type === 'committee') {
      const choices = FINAL_DECISIONS[getProposalKind(proposal?.proposal_type?.name)];
      const outcome = { pass: 'approve', reject: 'reject' }[ownReview.recommendation];
      setDecisionChoice(choices.find((choice) => choice.value.endsWith(outcome))?.value || '');
    }
  }, [ownReview]);

  const attachmentSources = useMemo(() => proposal ? [
    ...(proposal.phases || []).map((phase) => ({ category: '申请表', fields: proposal.forms?.application?.definition?.fields || [], values: phase.payload })),
    ...(proposal.instruments || []).map((entry) => ({ category: `${entry.instrument.name}参数`, fields: proposal.forms?.instruments?.[entry.instrument.code]?.definition?.fields || [], values: entry.form_data })),
  ] : [], [proposal]);

  const eligibleReviewers = useMemo(() => {
    const role = REQUIRED_ROLES[proposal?.permissions?.review_type];
    return adminUsers.filter((item) => item.id !== proposal?.author?.id && item.roles?.includes(role));
  }, [adminUsers, proposal]);

  const saveDraft = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await updateProposal(id, {
        title: editTitle,
        abstract: editAbstract,
        phase_payload: editPhaseValues,
        instruments: (proposal.instruments || []).map((entry) => ({ instrument_code: entry.instrument.code, form_data: editInstrumentValues[entry.instrument.code] || {} })),
      });
      await refresh();
      setEditing(false);
      setMessage('提案草稿已保存。');
    } catch (requestError) {
      setError(requestError.info?.message || '提案保存失败。');
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await submitProposalReview(id, { scores, recommendation, comments });
      await refresh();
      setMessage('评审意见已保存。');
    } catch (requestError) {
      setError(requestError.info?.message || '评审意见提交失败。');
    } finally {
      setSaving(false);
    }
  };

  const changeReviewVisibility = async () => {
    setSaving(true);
    setError('');
    try {
      const makeVisible = proposal.review_visibility !== 'visible';
      await setProposalReviewVisibility(id, makeVisible);
      await refresh();
      setMessage(makeVisible ? '评审意见已向申请者公开。' : '评审意见已对申请者隐藏。');
    } catch (requestError) {
      setError(requestError.info?.message || '评审意见可见范围更新失败。');
    } finally {
      setSaving(false);
    }
  };

  const submitDecision = async () => {
    if (!decisionChoice || !scores.overall_priority || !comments.trim()) return;
    setSaving(true);
    setError('');
    try {
      await triggerProposalTransition(id, {
        transition: decisionChoice,
        context: { decision: { priority: scores.overall_priority, comments } },
      });
      router.push('/dashboard/panel');
    } catch (requestError) {
      setError(requestError.info?.message || '最终决策提交失败。');
      setSaving(false);
    }
  };

  const assignReviewer = async () => {
    if (!selectedReviewer) return;
    setSaving(true);
    setError('');
    try {
      await assignProposalReviewer(id, { reviewer_id: Number(selectedReviewer) });
      await refresh();
      setSelectedReviewer('');
      setReviewerDialogOpen(false);
      setMessage('评审专家已分配。');
    } catch (requestError) {
      setError(requestError.info?.message || '评审专家分配失败。');
    } finally {
      setSaving(false);
    }
  };

  const allocateData = async () => {
    setSaving(true);
    setError('');
    try {
      await allocateProposalData(id, allocationValues.instrument_code, allocationValues);
      await refresh();
      setAllocationOpen(false);
      setMessage('观测数据已分配，提案者现在可以访问该数据产品。');
    } catch (requestError) {
      setError(requestError.info?.message || '观测数据分配失败。');
    } finally {
      setSaving(false);
    }
  };

  const revokeData = async (instrumentCode, productName) => {
    setSaving(true);
    setError('');
    try {
      const result = await revokeProposalData(id, instrumentCode, productName);
      await refresh();
      setMessage(result.proposal_state === '待分配观测数据' ? '数据授权已撤销，提案已回到待分配状态。' : '该数据产品的授权已撤销。');
      return true;
    } catch (requestError) {
      setError(requestError.info?.message || '取消数据分配失败。');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openAllocationDialog = () => {
    const firstCandidate = temporaryDataCatalog(proposal)[0];
    if (firstCandidate) setAllocationValues(firstCandidate);
    setAllocationOpen(true);
  };

  const executeTransition = async (name) => {
    setSaving(true);
    setError('');
    try {
      await triggerProposalTransition(id, { transition: name });
      await refresh();
      setMessage('提案流程状态已更新。');
    } catch (requestError) {
      setError(requestError.info?.message || '流程操作执行失败。');
    } finally {
      setSaving(false);
    }
  };

  const openSchedulingFeedback = () => {
    const firstInstrument = proposal.instruments?.[0];
    const existing = firstInstrument?.scheduling_feedback || {};
    setFeedbackValues({
      instrument_code: firstInstrument?.instrument.code || '',
      status: ['completed', 'unable'].includes(existing.status) ? existing.status : 'scheduled',
      visibility_window: existing.visibility_window || '',
      summary: existing.summary === '已推送观测编排负责人' ? '' : existing.summary || '',
    });
    setFeedbackDialogOpen(true);
  };

  const submitSchedulingFeedback = async () => {
    setSaving(true);
    setError('');
    try {
      await submitInstrumentFeedbackAPI(id, feedbackValues.instrument_code, {
        status: feedbackValues.status,
        comment: feedbackValues.summary,
        payload: {
          status: feedbackValues.status,
          visibility_window: feedbackValues.visibility_window,
          summary: feedbackValues.summary,
        },
      });
      const updated = await refresh();
      const allFinal = Boolean(updated.instruments?.length)
        && updated.instruments.every((entry) => hasFinalObservationFeedback(entry.scheduling_feedback));
      if (feedbackValues.status !== 'scheduled' && allFinal) {
        await triggerProposalTransition(id, { transition: 'record_feedback' });
        await refresh();
      }
      setFeedbackDialogOpen(false);
      setMessage(feedbackValues.status === 'scheduled'
        ? '观测安排已保存；执行结束后请继续提交最终结果。'
        : allFinal ? '最终执行结果已提交，提案已办结。' : '该仪器结果已保存；请继续填写其他仪器的最终结果。');
    } catch (requestError) {
      setError(requestError.info?.message || '执行反馈提交失败。');
    } finally {
      setSaving(false);
    }
  };

  const downloadSummary = async () => {
    try {
      await downloadProposalDocument(proposal.id);
    } catch (downloadError) {
      setError(downloadError.message || '提案 PDF 下载失败。');
    }
  };

  const copyAsNewDraft = async () => {
    setSaving(true);
    setError('');
    try {
      const draft = await copyProposalAsDraft(id);
      router.push(`/proposals/new?draft=${draft.id}`);
    } catch (requestError) {
      setError(requestError.info?.message || '创建新草稿失败。');
      setSaving(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-[1450px] py-16 text-sm text-slate-500">正在加载提案详情…</div>;
  if (!proposal) return <div className="mx-auto max-w-[1450px] py-16 text-sm text-rose-700">{error || '无法查看此提案。'}</div>;

  const backHref = isAdminMode ? '/admin/proposals' : isReviewMode ? '/dashboard/panel' : isAllocationMode ? '/dashboard/data-allocation' : isSchedulingMode ? '/dashboard/feedback' : `/dashboard/proposals?type=${getProposalKind(proposal.proposal_type?.name)}`;
  const backLabel = isAdminMode ? '返回全部提案' : isReviewMode ? '返回评审任务' : isAllocationMode ? '返回数据分配' : isSchedulingMode ? '返回观测编排' : '返回我的提案申请';
  const proposalKind = getProposalKind(proposal.proposal_type?.name);
  const actionPanel = getActionPanelCopy(proposal.status);
  const hasFinalFeedback = Boolean(proposal.instruments?.length)
    && proposal.instruments.every((entry) => hasFinalObservationFeedback(entry.scheduling_feedback));
  const stages = getWorkflowStages(proposal.workflow?.definition);
  const currentStage = getWorkflowDisplayStage(proposal.workflow?.definition, proposal.status);
  const decisionLabel = getFinalDecisionLabel(proposal);
  const actionsUnlocked = !isReviewMode || Boolean(ownReview);
  const allocatedProductCount = (proposal.instruments || []).reduce(
    (total, entry) => total + (entry.scheduling_feedback?.data_products?.length || 0),
    0,
  );
  const allocatedProducts = (proposal.instruments || []).flatMap((entry) =>
    (entry.scheduling_feedback?.data_products || []).map((product, index) => ({
      name: product.name, instrument: entry.instrument.code, anchor: `data-product-${entry.id}-${index}`,
    }))
  );
  const currentReviewAssignments = (proposal.assignments || []).filter(
    (assignment) => assignment.review_type === proposal.permissions?.review_type,
  );
  const reviewAdvanceName = proposal.status === '待技术评审' ? 'technical_pass' : proposal.status === '待科学评审' ? 'science_complete' : null;
  const reviewAdvanceAction = reviewAdvanceName ? transitions.find((action) => action.name === reviewAdvanceName) : null;
  const reviewAdvanceReady = Boolean(proposal.review_progress?.ready_to_advance && reviewAdvanceAction);
  const reviewNextStage = proposal.status === '待技术评审' ? '科学评审' : '最终决策';
  const reviewsInAssignmentPanel = isAdminMode && Boolean(reviewAdvanceName);
  const detailReviews = (reviewsInAssignmentPanel
    ? (proposal.reviews || []).filter((review) => review.review_type !== proposal.permissions.review_type)
    : proposal.reviews || []).filter((review) => proposal.status !== '已驳回' || review.review_type !== 'committee');
  const delegatedRoleForAction = (action) => DELEGATED_ACTION_ROLES[action.name];
  const visibleTransitions = isAdminMode
    ? transitions.filter((action) => !delegatedRoleForAction(action) && action.name !== reviewAdvanceName)
    : transitions.filter((action) => !(isReviewMode && proposal.permissions?.review_type === 'committee' && FINAL_DECISIONS[proposalKind].some((choice) => choice.value === action.name)));
  const showReviewAssignment = isAdminMode && Boolean(proposal.permissions?.review_type);
  const showDataAllocation = (isAdminMode || isAllocationMode) && canManageData && allocatedProductCount > 0;
  const showFlowActions = !isAllocationMode && visibleTransitions.length > 0;
  const showAside = isReviewMode || showReviewAssignment || showDataAllocation || showFlowActions;
  const statusPresentation = getProposalStatusPresentation(proposal.status);
  const headerTone = HEADER_TONES[statusPresentation.tone];

  return (
    <div className="rps-enter mx-auto max-w-[1450px]">
      <div className={`-mx-4 -mt-20 border-b px-4 pt-20 sm:-mx-6 sm:px-6 lg:-mx-8 lg:-mt-6 lg:px-8 lg:pt-6 ${headerTone.surface}`}>
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#3347b8]"><ArrowLeftIcon className="h-4 w-4" /> {backLabel}</Link>

      <header className="mt-4 pb-5">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><span className="font-mono">{['草稿', 'Draft'].includes(proposal.status) ? '未生成编号' : `RPS-${String(proposal.id).padStart(5, '0')}`}</span><span>·</span><span>{proposal.proposal_type?.name}</span><span className={`ml-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold ${headerTone.badge}`}>{statusPresentation.tone === 'closed' && <CheckCircleIcon className="h-3.5 w-3.5" />}{statusPresentation.label}</span></div>
            {editing ? <input required value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="rps-field mt-3 max-w-4xl text-lg font-semibold" /> : <h1 className={`mt-2 text-2xl font-semibold tracking-tight sm:text-3xl ${headerTone.title}`}>{proposal.title}</h1>}
          </div>
          <div className="flex flex-col items-start gap-3 lg:shrink-0 lg:items-end">
            <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <div className="flex items-baseline gap-1.5 whitespace-nowrap"><dt className="text-slate-500">申请人</dt><dd className="font-medium text-slate-800">{proposal.author?.username}</dd></div>
              <div className="flex items-baseline gap-1.5 whitespace-nowrap"><dt className="text-slate-500">提交时间</dt><dd className="font-medium text-slate-800">{formatDate(proposal.submitted_at)}</dd></div>
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              {isOwnerMode && proposal.permissions?.can_edit && !editing && <button type="button" onClick={() => setEditing(true)} className="rps-button-primary"><PencilSquareIcon className="h-4 w-4" /> 编辑提案</button>}
              {isOwnerMode && proposal.status === '已驳回' && <button type="button" onClick={copyAsNewDraft} disabled={saving} className="rps-button-primary"><PlusIcon className="h-4 w-4" /> {saving ? '正在创建…' : '以此新建申请'}</button>}
              {editing && <button type="button" onClick={() => { hydrateEditor(proposal); setEditing(false); }} className="rps-button-secondary"><XMarkIcon className="h-4 w-4" /> 取消</button>}
            </div>
          </div>
        </div>
        <div className="mt-4"><WorkflowProgress stages={stages} currentStage={currentStage} completed={isProposalClosed(proposal.status)} rejected={proposal.status === '已驳回'} tone={statusPresentation.tone} stageOwners={proposal.workflow?.definition?.stage_owners || {}} stageDetails={{ 最终决策: decisionLabel }} /></div>
      </header>
      </div>

      {proposal.final_decision?.outcome === 'reject' && <section className="mt-2 border-l-4 border-rose-600 bg-rose-50 px-5 py-4" aria-label="最终决策结果">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 className="text-base font-semibold text-rose-900">驳回理由</h2><span className="text-xs text-rose-700">{proposal.final_decision.decided_by}{proposal.final_decision.decided_at ? ` · ${formatDate(proposal.final_decision.decided_at)}` : ''}{proposal.final_decision.priority != null ? ` · 综合优先级 ${proposal.final_decision.priority}/5` : ''}</span></div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{proposal.final_decision.reason || '未记录决策理由。'}</p>
      </section>}

      {error && <p className="mt-5 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p className="mt-5 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

      <form onSubmit={saveDraft} className={`grid gap-6 pt-5 ${showAside ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
        <main className="min-w-0 bg-white px-4 py-5 shadow-[0_18px_60px_rgba(28,41,73,0.05)] sm:px-6">
          <Section title="摘要">{editing ? <div><textarea rows={10} required value={editAbstract} onChange={(event) => setEditAbstract(event.target.value)} className="rps-field resize-y leading-7" /><p className="mt-1 text-xs text-slate-500">建议 400–600 字 · 已写 {countCharacters(editAbstract)} 字</p></div> : <p className="max-w-[80ch] whitespace-pre-wrap break-words text-base leading-7 text-slate-700">{proposal.abstract || '未填写摘要。'}</p>}</Section>
          <Section title="申请内容">{editing ? <EditableForm template={proposal.forms?.application} values={editPhaseValues} onChange={setEditPhaseValues} /> : <ReadonlyForm template={proposal.forms?.application} values={proposal.phases?.[0]?.payload || {}} />}</Section>
          {(proposal.instruments || []).map((entry) => <Section key={entry.id} title={`所选仪器：${entry.instrument.name}（${entry.instrument.code}）`}>{editing ? <EditableForm template={proposal.forms?.instruments?.[entry.instrument.code]} values={editInstrumentValues[entry.instrument.code] || {}} onChange={(values) => setEditInstrumentValues((previous) => ({ ...previous, [entry.instrument.code]: values }))} /> : <ReadonlyForm compact template={proposal.forms?.instruments?.[entry.instrument.code]} values={entry.form_data || {}} />}</Section>)}
          {!editing && <ObservationFeedback proposal={proposal} canAllocateData={canAllocateData && (isAdminMode || isAllocationMode)} onAddData={openAllocationDialog} onRevokeData={revokeData} saving={saving} />}
          {!editing && <MaterialsDownload sources={attachmentSources} onDownload={downloadSummary} />}
          {!editing && detailReviews.length > 0 && <Section title="评审与决策记录">{isAdminMode && !reviewsInAssignmentPanel && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#3347b8]/5 px-4 py-3"><p className="text-sm text-slate-700">申请者可见：<strong className={proposal.review_visibility === 'visible' ? 'text-emerald-700' : 'text-slate-900'}>{proposal.review_visibility === 'visible' ? '已公开' : '未公开'}</strong></p><button type="button" onClick={changeReviewVisibility} disabled={saving} className="rps-button-secondary">{proposal.review_visibility === 'visible' ? '对申请者隐藏' : '向申请者公开'}</button></div>}<div className="space-y-4">{detailReviews.map((review) => <article key={review.id} className="border-l-2 border-[#3347b8] bg-slate-50 px-4 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-900">{review.review_type === 'committee' ? '决策理由' : REVIEW_LABELS[review.review_type]} · {review.reviewer?.username}</p><time className="text-xs text-slate-400">{formatDate(review.submitted_at)}</time></div><p className="mt-3 text-sm leading-6 text-slate-700">{review.comments}</p><p className="mt-2 text-xs text-slate-500">{reviewScoreSummary(review)}{review.review_type !== 'committee' ? ` · ${RECOMMENDATIONS.find((item) => item.value === review.recommendation)?.label || ''}` : ''}</p></article>)}</div></Section>}
          {!editing && proposal.history?.length > 0 && <details className="py-5"><summary className="cursor-pointer text-sm font-semibold text-[#293d9f]">查看流程记录（{proposal.history.length}）</summary><ol className="mt-4 space-y-4">{proposal.history.map((item) => <li key={item.id} className="flex gap-3 text-sm"><CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#3347b8]" /><div><p className="font-medium text-slate-800">{item.from_state || '创建'} → {item.to_state}</p><p className="mt-1 text-xs text-slate-400">{item.acted_by || '系统'} · {formatDate(item.acted_at)}</p></div></li>)}</ol></details>}
          {editing && <div className="flex justify-end border-t border-slate-200 pt-6"><button type="submit" disabled={saving} className="rps-button-primary min-w-32">{saving ? '正在保存…' : '保存草稿'}</button></div>}
        </main>

        {showAside && <aside className="space-y-5 lg:sticky lg:top-8 lg:self-start">
          {isReviewMode && proposal.permissions?.review_type === 'committee' && <div className="border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">最终决策</h2>
            <fieldset className="mt-4"><legend className="text-sm font-semibold text-slate-700">决策结论</legend><div className="mt-2 grid gap-2">{FINAL_DECISIONS[proposalKind].map((choice) => <label key={choice.value} className={`flex cursor-pointer items-center gap-3 border px-3 py-3 text-sm ${decisionChoice === choice.value ? 'border-[#3347b8] bg-[#3347b8]/5' : 'border-slate-200'}`}><input type="radio" name="final-decision" value={choice.value} checked={decisionChoice === choice.value} onChange={() => setDecisionChoice(choice.value)} className="accent-[#3347b8]" /><span className="font-semibold text-slate-900">{choice.label}</span><span className="ml-auto text-xs text-slate-500">{choice.detail}</span></label>)}</div></fieldset>
            <label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">综合优先级</span><select value={scores.overall_priority || ''} onChange={(event) => setScores((previous) => ({ ...previous, overall_priority: event.target.value }))} className="rps-field"><option value="">请选择</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score} 分</option>)}</select></label>
            <label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">决策理由</span><textarea rows={5} value={comments} onChange={(event) => setComments(event.target.value)} className="rps-field resize-y" placeholder="说明通过或驳回的依据" /></label>
            <button type="button" onClick={submitDecision} disabled={saving || !decisionChoice || !scores.overall_priority || !comments.trim()} className="rps-button-primary mt-5 w-full">{saving ? '正在提交…' : `确认${FINAL_DECISIONS[proposalKind].find((choice) => choice.value === decisionChoice)?.label || '决策'}并提交`}</button>
          </div>}

          {isReviewMode && proposal.permissions?.review_type !== 'committee' && <div className="border border-slate-200 bg-white p-5 shadow-sm">
            <p className="rps-eyebrow">我的评审任务</p><h2 className="mt-2 text-lg font-semibold text-slate-950">{reviewTemplate?.name || REVIEW_LABELS[proposal.permissions.review_type]}</h2><p className="mt-2 text-xs leading-5 text-slate-500">评分和评语仅在提交后计入本阶段评审结果。</p>
            <div className="mt-5 space-y-4">{scoreFields.map((field) => <label key={field.name} className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">{field.label}</span><select required value={scores[field.name] || ''} onChange={(event) => setScores((previous) => ({ ...previous, [field.name]: event.target.value }))} className="rps-field"><option value="">请选择</option>{(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}<label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">评审建议</span><select required value={recommendation === 'revise' ? '' : recommendation} onChange={(event) => setRecommendation(event.target.value)} className="rps-field"><option value="">请选择</option>{RECOMMENDATIONS.filter((item) => item.value !== 'revise').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">{commentField?.label || '评审意见'}</span><textarea required rows={6} value={comments} onChange={(event) => setComments(event.target.value)} className="rps-field resize-y" /></label></div>
            <button type="button" onClick={submitReview} disabled={saving} className="rps-button-primary mt-5 w-full">{saving ? '正在保存…' : ownReview ? '更新评审意见' : '提交评审意见'}</button>
          </div>}

          {showReviewAssignment && <div className="border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">{REVIEW_LABELS[proposal.permissions.review_type]}</h2>
            {proposal.review_progress && <p className="mt-3 text-sm font-medium text-slate-600">已提交 {proposal.review_progress.submitted}/{proposal.review_progress.assigned} 份评审意见</p>}
            {currentReviewAssignments.length > 0 && <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">{currentReviewAssignments.map((assignment) => {
              const review = proposal.reviews?.find((item) => item.reviewer?.id === assignment.reviewer.id && item.review_type === assignment.review_type && item.status === 'submitted');
              const scores = review ? reviewScoreDetails(review, scoreFields) : [];
              return <div key={assignment.id} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block font-semibold text-slate-800">{assignment.reviewer.username}</span><span className="mt-0.5 block truncate text-xs text-slate-400">{assignment.reviewer.email}</span></span><span className={`shrink-0 text-xs font-semibold ${review ? 'text-emerald-700' : 'text-amber-700'}`}>{review ? '已提交' : '待提交'}</span></div>
                {review && <div className="mt-2 rounded-md bg-slate-50 p-3"><p className="text-xs font-semibold text-[#293d9f]">{RECOMMENDATIONS.find((item) => item.value === review.recommendation)?.label || '已提交意见'}{scores.length > 0 ? ` · ${scores.join(' · ')}` : ''}</p><p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{review.comments || '未填写评语'}</p></div>}
              </div>;
            })}</div>}
            {reviewsInAssignmentPanel && proposal.reviews?.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-slate-500">申请者可见：<strong className="text-slate-700">{proposal.review_visibility === 'visible' ? '已公开' : '未公开'}</strong></span><button type="button" onClick={changeReviewVisibility} disabled={saving} className="font-semibold text-[#3347b8] hover:underline disabled:opacity-50">{proposal.review_visibility === 'visible' ? '隐藏评审意见' : '公开评审意见'}</button></div>}
            {proposal.permissions.review_type && <button type="button" onClick={() => { setSelectedReviewer(''); setReviewerDialogOpen(true); }} className="rps-button-primary mt-4 w-full"><UserPlusIcon className="h-4 w-4" /> {currentReviewAssignments.length ? '调整' : '选择'}{REVIEW_LABELS[proposal.permissions.review_type]}专家</button>}
            {reviewAdvanceName && <button type="button" disabled={saving || !reviewAdvanceReady} onClick={() => executeTransition(reviewAdvanceName)} className="rps-button-primary mt-2 w-full justify-center disabled:cursor-not-allowed disabled:opacity-45">{proposal.review_progress?.assigned === 0 ? '请先分配评审专家' : !reviewAdvanceReady ? '等待全部专家提交' : `进入${reviewNextStage}`}</button>}
            {proposal.permissions.review_type === 'committee' && <p className="mt-3 text-xs leading-5 text-slate-500">获分配的委员将选择通过或驳回，并填写决策理由。</p>}
          </div>}

          {showDataAllocation && <div className="hidden border border-slate-200 bg-white p-5 shadow-sm lg:block">
            <h2 className="text-base font-semibold text-slate-950">已开放数据 <span className="ml-1 text-sm font-medium text-slate-500">{allocatedProductCount}</span></h2>
            <nav aria-label="定位到已开放数据" className="mt-3 divide-y divide-slate-100 border-t border-slate-100">{allocatedProducts.map((product) => <a key={product.anchor} href={`#${product.anchor}`} className="flex items-center justify-between gap-3 py-3 text-sm text-[#3347b8] hover:underline"><span className="min-w-0 truncate">{product.name}</span><span className="shrink-0 text-xs text-slate-400">{product.instrument} ↗</span></a>)}</nav>
          </div>}

          {showFlowActions && (
            <div className="border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-950">{actionPanel.title}</h2>
              {actionPanel.description && <p className="mt-2 text-xs leading-5 text-slate-500">{actionPanel.description}</p>}
              {!actionsUnlocked && <p className="mt-3 flex gap-2 text-xs leading-5 text-amber-700"><ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />请先提交本人的评审意见。</p>}
              {proposal.status === '执行反馈' && hasFinalFeedback && <a href="#observation-feedback" className="mt-3 inline-block text-xs font-semibold text-[#3347b8] hover:underline">查看执行结果</a>}
              {showFlowActions && <div className="mt-4 space-y-2">{visibleTransitions.map((action) => (
                <button
                  key={action.name}
                  type="button"
                  disabled={saving || !actionsUnlocked}
                  onClick={() => action.name === 'record_feedback' ? openSchedulingFeedback() : action.name === 'grant_data' ? openAllocationDialog() : executeTransition(action.name)}
                  className={`${/revision|reject/.test(action.name) ? 'rps-button-secondary' : 'rps-button-primary'} w-full justify-center`}
                >
                  {getActionButtonLabel(action, proposalKind)}
                </button>
              ))}</div>}
            </div>
          )}
        </aside>}
      </form>
      {allocationOpen && <DataAllocationPanel proposal={proposal} values={allocationValues} onSelect={setAllocationValues} onSubmit={allocateData} onClose={() => setAllocationOpen(false)} saving={saving} error={error} />}
      {reviewerDialogOpen && <ReviewerAssignmentDialog reviewType={proposal.permissions.review_type} reviewers={eligibleReviewers} selectedReviewer={selectedReviewer} onSelect={setSelectedReviewer} onConfirm={assignReviewer} onClose={() => setReviewerDialogOpen(false)} saving={saving} />}
      {feedbackDialogOpen && <SchedulingFeedbackDialog proposal={proposal} values={feedbackValues} onChange={setFeedbackValues} onSubmit={submitSchedulingFeedback} onClose={() => setFeedbackDialogOpen(false)} saving={saving} />}
    </div>
  );
}
