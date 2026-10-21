'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRightIcon,
  BeakerIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

import { getCurrentUser, getProposals } from '@/lib/api';
import WorkflowProgress from '@/components/WorkflowProgress';
import ListSearchField from '@/components/ListSearchField';
import ListPageHeader from '@/components/ListPageHeader';
import ListPageToolbar from '@/components/ListPageToolbar';
import { hasObservationFeedback, observationFeedbackLabel } from '@/lib/observationFeedback.mjs';
import {
  getProposalKind,
  getProposalRowStyle,
  getProposalStatusPresentation,
  getWorkflowDisplayStage,
  getWorkflowStages,
  isProposalClosed,
} from '@/lib/workflowDisplay.mjs';

const PAGE_COPY = {
  all: '我的提案申请',
  feedback: '观测编排及反馈',
  allocation: '数据分配',
  admin: '全部提案',
};

const STATUS_TEXT_TONES = {
  draft: 'text-slate-600',
  active: 'text-[#304aa2]',
  revision: 'text-[#995b14]',
  rejected: 'text-[#a52d42]',
  closed: 'text-[#17603d]',
};

const TYPE_LABEL_TONES = {
  research: 'bg-[#f2f0f7] text-[#655b7b]',
  opportunity: 'bg-[#edf4f3] text-[#476e70]',
};

const TYPE_FILTER_TONES = {
  all: { selected: 'bg-[#3347b8] text-white', idle: 'text-slate-600 hover:bg-slate-100 hover:text-slate-950' },
  research: { selected: 'bg-[#f2f0f7] text-[#655b7b] ring-1 ring-inset ring-[#ded8e8]', idle: 'text-[#655b7b] hover:bg-[#f2f0f7]' },
  opportunity: { selected: 'bg-[#edf4f3] text-[#476e70] ring-1 ring-inset ring-[#d7e7e5]', idle: 'text-[#476e70] hover:bg-[#edf4f3]' },
};

function feedbackSummary(proposal) {
  const feedbacks = (proposal.instruments || [])
    .filter((instrument) => hasObservationFeedback(instrument.scheduling_feedback))
    .map((instrument) => `${instrument.instrument}：${observationFeedbackLabel(instrument.scheduling_feedback)}`);
  return feedbacks.length ? feedbacks.join(' · ') : '暂未生成观测反馈';
}

function allocationSummary(proposal) {
  const products = (proposal.instruments || []).flatMap(
    (instrument) => instrument.scheduling_feedback?.data_products || []
  );
  if (products.length) return `已开放 ${products.length} 个数据产品`;
  return '尚无已授权数据';
}

export default function ProposalWorkspace({ view = 'all', personalType = 'all' }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    const params = view === 'admin'
      ? { scope: 'admin' }
      : view === 'feedback'
        ? { scope: 'feedback' }
        : view === 'allocation'
          ? { scope: 'data_allocation' }
          : {};
    Promise.all([getCurrentUser(), getProposals(params)])
      .then(([me, items]) => {
        setUser(me);
        setProposals(items || []);
      })
      .catch((requestError) => {
        console.error(requestError);
        setError(requestError.info?.message || '提案数据加载失败。');
        if (requestError.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
        }
      })
      .finally(() => setLoading(false));
  }, [router, view]);

  const statusOptions = useMemo(
    () => [...new Set(proposals.map((proposal) => getProposalStatusPresentation(proposal.status).label))]
      .sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [proposals]
  );

  const filteredProposals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...proposals]
      .filter((proposal) => {
        if (view === 'admin' && typeFilter !== 'all' && getProposalKind(proposal.proposal_type?.name) !== typeFilter) {
          return false;
        }
        if (view === 'admin' && statusFilter !== 'all' && getProposalStatusPresentation(proposal.status).label !== statusFilter) {
          return false;
        }
        if (view === 'all' && personalType !== 'all') {
          return getProposalKind(proposal.proposal_type?.name) === personalType;
        }
        if (view === 'feedback' && user?.roles?.includes('Instrument Scheduler') && !user?.roles?.includes('Admin')) {
          return getProposalKind(proposal.proposal_type?.name) === 'opportunity';
        }
        return true;
      })
      .filter((proposal) => {
        if (!normalizedQuery) return true;
        return [
          proposal.title,
          proposal.status,
          proposal.author?.username,
          proposal.proposal_type?.name,
          `RPS-${String(proposal.id).padStart(5, '0')}`,
        ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => Number(right.id) - Number(left.id));
  }, [personalType, proposals, query, statusFilter, typeFilter, user, view]);

  const researchCount = proposals.filter((item) => getProposalKind(item.proposal_type?.name) === 'research').length;
  const opportunityCount = proposals.filter((item) => getProposalKind(item.proposal_type?.name) === 'opportunity').length;
  const canCreate = view === 'all' && Boolean(user);
  const title = PAGE_COPY[view] || PAGE_COPY.all;
  const isAdminList = view === 'admin';
  const isAllocationList = view === 'allocation';
  const isFeedbackList = view === 'feedback';
  const isPersonalProposalList = view === 'all';
  const tableColumns = isAllocationList
    ? 'min-[840px]:grid-cols-[minmax(220px,1.25fr)_minmax(190px,0.9fr)_minmax(180px,1fr)]'
    : isFeedbackList
      ? 'min-[1050px]:grid-cols-[minmax(220px,1.4fr)_95px_minmax(100px,0.65fr)_minmax(150px,0.9fr)_minmax(220px,1.4fr)]'
      : 'min-[840px]:grid-cols-[minmax(165px,1fr)_80px_145px_minmax(280px,1.55fr)]';

  if (loading) {
    return <div className="mx-auto max-w-[1450px] py-16 text-sm text-slate-500">正在加载提案列表…</div>;
  }

  return (
    <div className="rps-enter mx-auto max-w-[1450px]">
      <ListPageHeader title={title} />

      {error && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <ListPageToolbar filters={isAdminList ? (
          <div className="inline-flex w-full self-start items-center rounded-lg border border-slate-200 bg-white p-1 sm:w-auto" role="group" aria-label="按提案类型筛选">
            {[
              ['all', '全部', proposals.length],
              ['research', '研究提案', researchCount],
              ['opportunity', '机遇观测', opportunityCount],
            ].map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTypeFilter(value)}
                aria-pressed={typeFilter === value}
                className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors sm:flex-none sm:text-sm ${typeFilter === value ? TYPE_FILTER_TONES[value].selected : TYPE_FILTER_TONES[value].idle}`}
              >
                {label} <span className="tabular-nums opacity-70">{count}</span>
              </button>
            ))}
          </div>
        ) : isPersonalProposalList ? (
          <nav className="inline-flex w-full self-start items-center rounded-lg border border-slate-200 bg-white p-1 sm:w-auto" aria-label="切换提案类型">
            {[
              ['all', '全部', proposals.length, '/dashboard/proposals'],
              ['research', '研究提案', researchCount, '/dashboard/proposals?type=research'],
              ['opportunity', '机遇观测', opportunityCount, '/dashboard/proposals?type=opportunity'],
            ].map(([kind, label, count, href]) => (
              <Link
                key={kind}
                href={href}
                aria-current={personalType === kind ? 'page' : undefined}
                className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors sm:flex-none sm:text-sm ${personalType === kind ? TYPE_FILTER_TONES[kind].selected : TYPE_FILTER_TONES[kind].idle}`}
              >
                {label} <span className="tabular-nums opacity-70">{count}</span>
              </Link>
            ))}
          </nav>
        ) : null}>
          {canCreate && (
            <Link href="/proposals/new" className="rps-button-primary shrink-0 whitespace-nowrap">
              <PlusIcon className="h-4 w-4" /> 创建新提案
            </Link>
          )}
          {isAdminList && (
            <label className="block w-40 shrink-0">
              <span className="sr-only">按状态筛选</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rps-field h-full min-h-10 bg-white text-sm" aria-label="按状态筛选">
                <option value="all">全部状态</option>
                {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
          )}
          <ListSearchField value={query} onChange={setQuery} />
      </ListPageToolbar>

      <section className="mt-5 overflow-hidden border-y border-slate-200 bg-white" aria-label="提案列表">
        <div className={`hidden gap-3 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 ${isFeedbackList ? 'min-[1050px]:grid' : 'min-[840px]:grid'} ${tableColumns}`}>
          {isFeedbackList ? (
            <><span>提案</span><span>类型</span><span>申请人</span><span>状态</span><span>观测反馈</span></>
          ) : (
            <><span>提案</span>{!isAllocationList && <span>类型</span>}<span>申请人 · 状态</span><span>{isAllocationList ? '数据授权状态' : '流程进度'}</span></>
          )}
        </div>

        {filteredProposals.map((proposal) => {
          const stages = getWorkflowStages(proposal.workflow?.definition);
          const displayStage = getWorkflowDisplayStage(proposal.workflow?.definition, proposal.status);
          const kind = getProposalKind(proposal.proposal_type?.name);
          const statusPresentation = getProposalStatusPresentation(proposal.status);
          return (
            <article key={proposal.id} className="border-t border-slate-100 first:border-t-0" style={getProposalRowStyle(proposal.workflow?.definition, proposal.status)}>
              <Link href={view === 'admin' ? `/proposals/${proposal.id}?mode=admin` : view === 'feedback' && user?.roles?.includes('Instrument Scheduler') ? `/proposals/${proposal.id}?mode=scheduling#observation-feedback` : view === 'feedback' ? `/proposals/${proposal.id}?from=feedback#observation-feedback` : view === 'allocation' ? `/proposals/${proposal.id}?mode=allocation#data-allocation` : ['草稿', 'Draft'].includes(proposal.status) ? `/proposals/new?draft=${proposal.id}` : `/proposals/${proposal.id}`} className={`grid items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-slate-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3347b8] ${isAllocationList ? `grid-cols-1 ${tableColumns}` : `grid-cols-[minmax(0,1fr)_auto] ${tableColumns}`}`} aria-label={`查看提案：${proposal.title}`}>
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-slate-400">{['草稿', 'Draft'].includes(proposal.status) ? '未生成编号' : `RPS-${String(proposal.id).padStart(5, '0')}`}</p>
                  <h2 className="mt-0.5 truncate text-sm font-semibold text-slate-950" title={proposal.title}>{proposal.title}</h2>
                </div>
                {!isAllocationList && <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_LABEL_TONES[kind]}`}>
                    {kind === 'opportunity' ? '机遇观测' : '研究提案'}
                  </span>
                </div>}
                {isFeedbackList ? (
                  <>
                    <p className="min-w-0 truncate text-xs leading-5 text-slate-600"><span className="text-slate-400 min-[1050px]:hidden">申请人：</span>{proposal.author?.username || '—'}</p>
                    <p className={`min-w-0 text-xs font-semibold leading-5 ${STATUS_TEXT_TONES[statusPresentation.tone]}`}><span className="font-normal text-slate-400 min-[1050px]:hidden">状态：</span>{statusPresentation.label}</p>
                  </>
                ) : (
                  <p className={`${isAllocationList ? '' : 'col-span-2 min-[840px]:col-span-1'} min-w-0 text-xs leading-5 text-slate-600`}><span className="text-slate-400 min-[840px]:hidden">申请人：</span>{proposal.author?.username || '—'}<span className="mx-1.5 text-slate-300">·</span><span className={`font-semibold ${STATUS_TEXT_TONES[statusPresentation.tone]}`}>{statusPresentation.label}</span></p>
                )}
                <div className={`${isAllocationList ? '' : isFeedbackList ? 'col-span-2 min-[1050px]:col-span-1' : 'col-span-2 min-[840px]:col-span-1'} min-w-0`}>
                  {view === 'feedback' ? (
                    <p className="text-xs leading-5 text-slate-600">{feedbackSummary(proposal)}</p>
                  ) : view === 'allocation' ? (
                    <p className="text-xs font-medium leading-5 text-slate-700">{allocationSummary(proposal)}</p>
                  ) : (
                    <WorkflowProgress stages={stages} currentStage={displayStage} completed={isProposalClosed(proposal.status)} rejected={proposal.status === '已驳回'} tone={statusPresentation.tone} compact nearby />
                  )}
                </div>
              </Link>
            </article>
          );
        })}

        {!filteredProposals.length && (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <BeakerIcon className="h-9 w-9 text-[#7899a7]" />
            <h2 className="mt-4 text-base font-semibold text-slate-900">没有符合条件的提案</h2>
            <p className="mt-1 text-sm text-slate-500">{query.trim() ? '没有匹配搜索条件的提案。' : isAdminList && (typeFilter !== 'all' || statusFilter !== 'all') ? '没有符合当前类别和状态的提案。' : isPersonalProposalList ? personalType === 'all' ? '你还没有提交提案。' : `当前没有${personalType === 'research' ? '研究提案' : '机遇观测'}。` : '当前列表暂无记录。'}</p>
            {canCreate && !query.trim() && <Link href="/proposals/new" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3347b8]">创建新提案 <ArrowRightIcon className="h-4 w-4" /></Link>}
          </div>
        )}
      </section>
    </div>
  );
}
