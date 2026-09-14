'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
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
  assignProposalReviewer,
  getCurrentUser,
  getProposal,
  listAdminUsers,
  listProposalTransitions,
  submitProposalReview,
  triggerProposalTransition,
  updateProposal,
} from '@/lib/api';
import { translateTransition } from '@/lib/locale.mjs';
import WorkflowProgress from '@/components/WorkflowProgress';
import { getWorkflowDisplayStage, getWorkflowStages } from '@/lib/workflowDisplay.mjs';

const REVIEW_LABELS = {
  technical: '技术评审',
  scientific: '科学评审',
  committee: '委员会决策',
};

const REQUIRED_ROLES = {
  technical: 'Technical Expert',
  scientific: 'Reviewer',
  committee: 'Panel Chair',
};

const RECOMMENDATIONS = [
  { value: 'pass', label: '建议通过' },
  { value: 'revise', label: '退回修改' },
  { value: 'reject', label: '建议驳回' },
];

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

function ReadonlyForm({ template, values = {} }) {
  const fields = template?.definition?.fields || [];
  if (!fields.length) return <p className="text-sm text-slate-500">当前部分尚未配置展示字段。</p>;

  return (
    <dl className="divide-y divide-slate-100">
      {fields.filter((field) => field.type !== 'file').map((field) => {
        const value = values[field.name];
        if (field.type === 'repeatable') {
          const entries = Array.isArray(value) ? value : [];
          return (
            <div key={field.name} className="py-5 first:pt-0 last:pb-0">
              <dt className="text-xs font-semibold text-slate-500">{field.label}</dt>
              <dd className="mt-3 space-y-3">
                {entries.length ? entries.map((entry, index) => (
                  <article key={index} className="border-l-2 border-[#7899a7] bg-slate-50/70 px-4 py-4">
                    <p className="mb-3 text-xs font-semibold text-[#3347b8]">{field.label} {index + 1}</p>
                    <div className="grid gap-x-7 gap-y-4 sm:grid-cols-2">
                      {(field.sub_fields || field.subFields || []).map((subField) => (
                        <div key={subField.name} className={subField.type === 'textarea' ? 'sm:col-span-2' : ''}>
                          <p className="text-[11px] text-slate-400">{subField.label}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{displayValue(subField, entry?.[subField.name])}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                )) : <p className="text-sm text-slate-400">未填写</p>}
              </dd>
            </div>
          );
        }
        return (
          <div key={field.name} className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
            <dt className="text-xs font-semibold text-slate-500">{field.label}</dt>
            <dd className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{displayValue(field, value)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function FieldControl({ field, value, onChange }) {
  if (field.type === 'textarea') return <textarea rows={field.rows || 4} required={field.required} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="rps-field resize-y" />;
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
  const fields = template?.definition?.fields || [];
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
        return <label key={field.name} className={field.type === 'textarea' ? 'md:col-span-2' : ''}><span className="mb-1.5 block text-sm font-semibold text-slate-700">{field.label}{field.required && <span className="ml-1 text-rose-600">*</span>}</span><FieldControl field={field} value={values[field.name]} onChange={(value) => setField(field.name, value)} /></label>;
      })}
    </div>
  );
}

function Attachments({ sources }) {
  const files = sources.flatMap(({ label, values }) => Object.values(values?.__attachments__ || {}).filter(Boolean).map((file) => ({ ...file, section: label })));
  if (!files.length) return <p className="text-sm text-slate-500">没有已提交附件。</p>;
  return (
    <div className="divide-y divide-slate-100 border-y border-slate-100">
      {files.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{file.name}</p><p className="mt-0.5 text-xs text-slate-400">{file.section} · {file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : '大小未知'}</p></div>{file.data_url ? <a href={file.data_url} download={file.name} className="rps-button-secondary shrink-0"><ArrowDownTrayIcon className="h-4 w-4" /> 下载</a> : <span className="text-xs text-slate-400">原文件未入库</span>}</div>)}
    </div>
  );
}

function Section({ id, eyebrow, title, children }) {
  return <section id={id} className="scroll-mt-8 grid gap-4 border-t border-slate-200 py-8 first:border-t-0 first:pt-0 md:grid-cols-[150px_minmax(0,1fr)] md:gap-8"><header>{eyebrow && <p className="rps-eyebrow">{eyebrow}</p>}<h2 className="mt-1 text-base font-semibold text-slate-950">{title}</h2></header><div className="min-w-0">{children}</div></section>;
}

function ObservationFeedback({ proposal }) {
  const feedbacks = (proposal.instruments || [])
    .map((entry) => ({ instrument: entry.instrument, feedback: entry.scheduling_feedback || {} }))
    .filter((entry) => Object.keys(entry.feedback).length);

  if (!feedbacks.length) return null;
  const dataReady = feedbacks.some((entry) => entry.feedback.status === 'data_ready' || entry.feedback.data_products?.length);

  return (
    <Section id="observation-feedback" eyebrow="观测反馈" title={dataReady ? '数据已开放' : '执行进展'}>
      <div className="space-y-5">
        {feedbacks.map(({ instrument, feedback }) => (
          <article key={instrument.code} className="border-l-2 border-emerald-500 bg-emerald-50/40 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">{instrument.name}（{instrument.code}）</p>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">{feedback.status === 'data_ready' ? '数据已开放' : '已反馈'}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{feedback.summary || '观测执行信息已更新。'}</p>
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
              <div><dt className="text-slate-400">数据编号</dt><dd className="mt-1 font-medium text-slate-700">{feedback.observation_id || '—'}</dd></div>
              <div><dt className="text-slate-400">观测窗口</dt><dd className="mt-1 font-medium text-slate-700">{feedback.visibility_window || '—'}</dd></div>
              <div><dt className="text-slate-400">完成时间</dt><dd className="mt-1 font-medium text-slate-700">{feedback.completed_at || '—'}</dd></div>
            </dl>
          </article>
        ))}
        {dataReady && <Link href={`/proposals/${proposal.id}/data`} className="rps-button-primary"><ArrowTopRightOnSquareIcon className="h-4 w-4" /> 访问观测数据</Link>}
      </div>
    </Section>
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
  const [comments, setComments] = useState('');
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

  const isAdminMode = requestedMode === 'admin' && proposal?.permissions?.can_manage;
  const isReviewMode = requestedMode === 'review' && proposal?.permissions?.can_review;
  const isOwnerMode = proposal?.permissions?.is_owner && !isAdminMode && !isReviewMode;
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
  }, [ownReview]);

  const attachmentSources = useMemo(() => proposal ? [
    ...(proposal.phases || []).map((phase) => ({ label: phase.phase === 'phase1' ? '申请材料' : phase.phase, values: phase.payload })),
    ...(proposal.instruments || []).map((entry) => ({ label: `${entry.instrument.name}参数`, values: entry.form_data })),
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

  const assignReviewer = async (event) => {
    event.preventDefault();
    if (!selectedReviewer) return;
    setSaving(true);
    setError('');
    try {
      await assignProposalReviewer(id, { reviewer_id: Number(selectedReviewer) });
      await refresh();
      setSelectedReviewer('');
      setMessage('评审专家已分配。');
    } catch (requestError) {
      setError(requestError.info?.message || '评审专家分配失败。');
    } finally {
      setSaving(false);
    }
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

  const downloadSummary = () => {
    const body = [`提案编号：RPS-${String(proposal.id).padStart(5, '0')}`, `提案名称：${proposal.title}`, `提案类型：${proposal.proposal_type?.name}`, `申请人：${proposal.author?.username}`, `当前状态：${proposal.status}`, '', '摘要：', proposal.abstract || ''].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    link.download = `RPS-${String(proposal.id).padStart(5, '0')}-提案摘要.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (loading) return <div className="mx-auto max-w-[1450px] py-16 text-sm text-slate-500">正在加载提案详情…</div>;
  if (!proposal) return <div className="mx-auto max-w-[1450px] py-16 text-sm text-rose-700">{error || '无法查看此提案。'}</div>;

  const backHref = isAdminMode ? '/admin/proposals' : isReviewMode ? '/dashboard/panel' : proposal.proposal_type?.name?.includes('机遇') ? '/dashboard/opportunity' : '/dashboard/research';
  const backLabel = isAdminMode ? '返回全部提案' : isReviewMode ? '返回评审任务' : '返回我的提案';
  const showAside = isAdminMode || isReviewMode;
  const stages = getWorkflowStages(proposal.workflow?.definition);
  const currentStage = getWorkflowDisplayStage(proposal.workflow?.definition, proposal.status);
  const actionsUnlocked = !isReviewMode || Boolean(ownReview);

  return (
    <div className="rps-enter mx-auto max-w-[1450px]">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#3347b8]"><ArrowLeftIcon className="h-4 w-4" /> {backLabel}</Link>

      <header className="mt-5 border-b border-slate-200 pb-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><span className="font-mono">RPS-{String(proposal.id).padStart(5, '0')}</span><span>·</span><span>{proposal.proposal_type?.name}</span></div>
            {editing ? <input required value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="rps-field mt-3 max-w-4xl text-lg font-semibold" /> : <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{proposal.title}</h1>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#3347b8]/10 px-3 py-1.5 text-xs font-semibold text-[#3347b8]">{proposal.status}</span>
            {isOwnerMode && proposal.permissions?.can_edit && !editing && <button type="button" onClick={() => setEditing(true)} className="rps-button-primary"><PencilSquareIcon className="h-4 w-4" /> 编辑提案</button>}
            {editing && <button type="button" onClick={() => { hydrateEditor(proposal); setEditing(false); }} className="rps-button-secondary"><XMarkIcon className="h-4 w-4" /> 取消</button>}
            <button type="button" onClick={downloadSummary} className="rps-button-secondary"><ArrowDownTrayIcon className="h-4 w-4" /> 下载摘要</button>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-400">申请人</dt><dd className="mt-1 font-medium text-slate-800">{proposal.author?.username}</dd></div>
          <div><dt className="text-xs text-slate-400">提交时间</dt><dd className="mt-1 font-medium text-slate-800">{formatDate(proposal.submitted_at)}</dd></div>
          <div><dt className="text-xs text-slate-400">查看身份</dt><dd className="mt-1 font-medium text-slate-800">{isAdminMode ? '系统管理员' : isReviewMode ? REVIEW_LABELS[proposal.permissions.review_type] : '提案申请人'}</dd></div>
        </dl>
        <div className="mt-5 max-w-5xl"><WorkflowProgress stages={stages} currentStage={currentStage} /></div>
      </header>

      {error && <p className="mt-5 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p className="mt-5 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

      <form onSubmit={saveDraft} className={`grid gap-10 pt-8 ${showAside ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
        <main className="min-w-0 bg-white px-6 py-7 shadow-[0_18px_60px_rgba(28,41,73,0.05)] sm:px-9">
          <Section eyebrow="提案正文" title="研究摘要">{editing ? <textarea rows={6} required value={editAbstract} onChange={(event) => setEditAbstract(event.target.value)} className="rps-field resize-y" /> : <p className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700">{proposal.abstract || '未填写提案摘要。'}</p>}</Section>
          <Section eyebrow="申请信息" title={proposal.forms?.application?.name || '提案申请表'}>{editing ? <EditableForm template={proposal.forms?.application} values={editPhaseValues} onChange={setEditPhaseValues} /> : <ReadonlyForm template={proposal.forms?.application} values={proposal.phases?.[0]?.payload || {}} />}</Section>
          {(proposal.instruments || []).map((entry) => <Section key={entry.id} eyebrow="仪器参数" title={`${entry.instrument.name}（${entry.instrument.code}）`}>{editing ? <EditableForm template={proposal.forms?.instruments?.[entry.instrument.code]} values={editInstrumentValues[entry.instrument.code] || {}} onChange={(values) => setEditInstrumentValues((previous) => ({ ...previous, [entry.instrument.code]: values }))} /> : <ReadonlyForm template={proposal.forms?.instruments?.[entry.instrument.code]} values={entry.form_data || {}} />}</Section>)}
          {!editing && <ObservationFeedback proposal={proposal} />}
          {!editing && <Section eyebrow="申请材料" title="附件"><Attachments sources={attachmentSources} /></Section>}
          {!editing && proposal.reviews?.length > 0 && <Section eyebrow="评审记录" title="已提交意见"><div className="space-y-4">{proposal.reviews.map((review) => <article key={review.id} className="border-l-2 border-[#3347b8] bg-slate-50 px-4 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-900">{REVIEW_LABELS[review.review_type]} · {review.reviewer?.username}</p><time className="text-xs text-slate-400">{formatDate(review.submitted_at)}</time></div><p className="mt-3 text-sm leading-6 text-slate-700">{review.comments}</p><p className="mt-2 text-xs text-slate-500">评分：{Object.values(review.scores || {}).join(' / ')} · {RECOMMENDATIONS.find((item) => item.value === review.recommendation)?.label}</p></article>)}</div></Section>}
          {!editing && <Section eyebrow="流程记录" title="状态历史">{proposal.history?.length ? <ol className="space-y-4">{proposal.history.map((item) => <li key={item.id} className="flex gap-3 text-sm"><CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#3347b8]" /><div><p className="font-medium text-slate-800">{item.from_state || '创建'} → {item.to_state}</p><p className="mt-1 text-xs text-slate-400">{item.acted_by || '系统'} · {formatDate(item.acted_at)}</p></div></li>)}</ol> : <p className="text-sm text-slate-500">暂无状态变更记录。</p>}</Section>}
          {editing && <div className="flex justify-end border-t border-slate-200 pt-6"><button type="submit" disabled={saving} className="rps-button-primary min-w-32">{saving ? '正在保存…' : '保存草稿'}</button></div>}
        </main>

        {showAside && <aside className="space-y-5 lg:sticky lg:top-8 lg:self-start">
          {isReviewMode && <div className="border border-slate-200 bg-white p-5 shadow-sm">
            <p className="rps-eyebrow">我的评审任务</p><h2 className="mt-2 text-lg font-semibold text-slate-950">{reviewTemplate?.name || REVIEW_LABELS[proposal.permissions.review_type]}</h2><p className="mt-2 text-xs leading-5 text-slate-500">评分和评语仅在提交后计入本阶段评审结果。</p>
            <div className="mt-5 space-y-4">{scoreFields.map((field) => <label key={field.name} className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">{field.label}</span><select required value={scores[field.name] || ''} onChange={(event) => setScores((previous) => ({ ...previous, [field.name]: event.target.value }))} className="rps-field"><option value="">请选择</option>{(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}<label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">评审建议</span><select required value={recommendation} onChange={(event) => setRecommendation(event.target.value)} className="rps-field"><option value="">请选择</option>{RECOMMENDATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">{commentField?.label || '评审意见'}</span><textarea required rows={6} value={comments} onChange={(event) => setComments(event.target.value)} className="rps-field resize-y" /></label></div>
            <button type="button" onClick={submitReview} disabled={saving} className="rps-button-primary mt-5 w-full">{saving ? '正在保存…' : ownReview ? '更新评审意见' : '提交评审意见'}</button>
          </div>}

          {isAdminMode && <div className="border border-slate-200 bg-white p-5 shadow-sm">
            <p className="rps-eyebrow">评审分配</p><h2 className="mt-2 text-lg font-semibold text-slate-950">{proposal.permissions.review_type ? `分配${REVIEW_LABELS[proposal.permissions.review_type]}专家` : '当前无需分配专家'}</h2>
            {proposal.permissions.review_type && <><div className="mt-4 space-y-2">{proposal.assignments?.length ? proposal.assignments.map((assignment) => <div key={assignment.id} className="flex items-center justify-between bg-slate-50 px-3 py-2.5 text-sm"><span>{assignment.reviewer.username}</span><span className="text-xs text-slate-500">{assignment.status === 'submitted' ? '已提交' : '待评审'}</span></div>) : <p className="text-sm text-amber-700">尚未分配评审专家。</p>}</div><div className="mt-4 space-y-2"><select value={selectedReviewer} onChange={(event) => setSelectedReviewer(event.target.value)} className="rps-field"><option value="">选择符合角色的用户</option>{eligibleReviewers.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}</select><button type="button" onClick={assignReviewer} disabled={!selectedReviewer || saving} className="rps-button-primary w-full"><UserPlusIcon className="h-4 w-4" /> 分配评审任务</button></div></>}
          </div>}

          <div className="border border-slate-200 bg-white p-5"><p className="rps-eyebrow">流程操作</p><h2 className="mt-2 text-base font-semibold text-slate-950">当前可执行操作</h2>{!actionsUnlocked && <p className="mt-3 flex gap-2 text-xs leading-5 text-amber-700"><ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />请先提交本人的评审表。</p>}<div className="mt-4 space-y-2">{transitions.length ? transitions.map((action) => <button key={action.name} type="button" disabled={saving || !actionsUnlocked} onClick={() => executeTransition(action.name)} className="rps-button-secondary w-full justify-between">{translateTransition(action)} <ClockIcon className="h-4 w-4" /></button>) : <p className="text-sm text-slate-500">当前身份没有可执行操作。</p>}</div></div>
          <div className="border border-slate-200 bg-white p-5"><DocumentTextIcon className="h-6 w-6 text-[#3347b8]" /><h2 className="mt-3 text-base font-semibold text-slate-950">权限说明</h2><p className="mt-2 text-xs leading-5 text-slate-500">{isAdminMode ? '管理员可查看全部提案、分配评审人并处理流程；管理员不代替专家填写评分。' : '这里只显示分配给你的当前阶段评审任务，其他提案不会出现在任务列表中。'}</p></div>
        </aside>}
      </form>
    </div>
  );
}
