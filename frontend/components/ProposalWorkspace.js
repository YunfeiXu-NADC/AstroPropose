'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRightIcon,
  BeakerIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

import { getCurrentUser, getProposals } from '@/lib/api';
import WorkflowProgress from '@/components/WorkflowProgress';
import {
  getProposalKind,
  getWorkflowDisplayStage,
  getWorkflowStages,
} from '@/lib/workflowDisplay.mjs';

const PAGE_COPY = {
  all: ['提案工作台', '在同一列表中查看不同类型提案及其当前进度。'],
  research: ['研究提案', '查看长期科学研究申请、评审进度、观测编排与数据授权状态。'],
  opportunity: ['机遇观测', '查看突发或时效性目标的快速评审、编排推送与执行反馈。'],
  feedback: ['观测反馈', '申请人查看已授权结果；技术专家、观测编排负责人维护执行状态；管理员查看全局反馈。'],
  admin: ['全部提案', '查看所有用户已经提交的提案、当前进度与评审分配情况。未提交草稿仅申请人本人可见。'],
};

function scopeText(user, view) {
  if (view === 'admin') return '所有用户已经提交的提案';
  if (view === 'feedback') {
    if (user?.roles?.includes('Admin')) return '系统管理员 · 查看全部已提交提案的反馈进展';
    if (user?.roles?.includes('Instrument Scheduler')) return '观测编排负责人 · 维护观测窗口、执行状态与数据分配';
    if (user?.roles?.includes('Technical Expert')) return '技术评审专家 · 跟踪仪器执行与观测反馈';
    return '提案申请人 · 查看本人已授权的观测结果';
  }
  return '本人提交的提案';
}

function feedbackSummary(proposal) {
  const feedbacks = (proposal.instruments || [])
    .filter((instrument) => Object.keys(instrument.scheduling_feedback || {}).length)
    .map((instrument) => `${instrument.instrument}：已反馈`);
  return feedbacks.length ? feedbacks.join(' · ') : '暂未生成观测反馈';
}

export default function ProposalWorkspace({ view = 'all' }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    const params = view === 'admin' ? { scope: 'admin' } : view === 'feedback' ? { scope: 'feedback' } : {};
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

  const filteredProposals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...proposals]
      .filter((proposal) => {
        if (view === 'research' || view === 'opportunity') {
          return getProposalKind(proposal.proposal_type?.name) === view;
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
  }, [proposals, query, view]);

  const researchCount = proposals.filter((item) => getProposalKind(item.proposal_type?.name) === 'research').length;
  const opportunityCount = proposals.filter((item) => getProposalKind(item.proposal_type?.name) === 'opportunity').length;
  const reviewCount = proposals.filter((item) => /评审|review/i.test(item.status || '')).length;
  const canCreate = !['admin', 'feedback'].includes(view) && user?.roles?.some((role) => ['Proposer', 'Admin'].includes(role));
  const [title, description] = PAGE_COPY[view] || PAGE_COPY.all;

  if (loading) {
    return <div className="mx-auto max-w-[1450px] py-16 text-sm text-slate-500">正在加载提案列表…</div>;
  }

  return (
    <div className="rps-enter mx-auto max-w-[1450px]">
      <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="rps-eyebrow">提案工作区</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">{description}</p>
          <p className="mt-2 text-xs text-slate-400">当前范围：{scopeText(user, view)}</p>
        </div>
        {canCreate && (
          <Link href="/proposals/new" className="rps-button-primary shrink-0">
            <PlusIcon className="h-4 w-4" /> 创建新提案
          </Link>
        )}
      </header>

      {error && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <section className="flex flex-col gap-5 border-b border-slate-200 py-5 lg:flex-row lg:items-center lg:justify-between" aria-label="列表摘要与搜索">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <div><dt className="inline text-slate-500">可访问</dt><dd className="ml-2 inline font-semibold text-slate-950">{proposals.length}</dd></div>
          <div className="hidden h-4 w-px bg-slate-200 sm:block" />
          <div><dt className="inline text-slate-500">研究提案</dt><dd className="ml-2 inline font-semibold text-slate-950">{researchCount}</dd></div>
          <div className="hidden h-4 w-px bg-slate-200 sm:block" />
          <div><dt className="inline text-slate-500">机遇观测</dt><dd className="ml-2 inline font-semibold text-slate-950">{opportunityCount}</dd></div>
          <div className="hidden h-4 w-px bg-slate-200 sm:block" />
          <div><dt className="inline text-slate-500">评审中</dt><dd className="ml-2 inline font-semibold text-slate-950">{reviewCount}</dd></div>
        </dl>
        <label className="relative block w-full lg:w-80">
          <span className="sr-only">搜索提案</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索编号、名称、申请人或状态"
            className="rps-field pl-9"
          />
        </label>
      </section>

      <section className="mt-5 overflow-hidden border-y border-slate-200 bg-white" aria-label="提案列表">
        <div className="hidden grid-cols-[minmax(210px,1.15fr)_100px_90px_120px_minmax(450px,1.4fr)] gap-4 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 xl:grid">
          <span>提案</span><span>类型</span><span>申请人</span><span>当前状态</span><span>{view === 'feedback' ? '观测反馈' : '流程进度'}</span>
        </div>

        {filteredProposals.map((proposal) => {
          const stages = getWorkflowStages(proposal.workflow?.definition);
          const displayStage = getWorkflowDisplayStage(proposal.workflow?.definition, proposal.status);
          const kind = getProposalKind(proposal.proposal_type?.name);
          return (
            <article key={proposal.id} className="border-t border-slate-100 first:border-t-0">
              <Link href={view === 'admin' ? `/proposals/${proposal.id}?mode=admin` : view === 'feedback' ? `/proposals/${proposal.id}?from=feedback#observation-feedback` : `/proposals/${proposal.id}`} className="grid gap-4 px-5 py-5 transition-colors hover:bg-slate-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3347b8] xl:grid-cols-[minmax(210px,1.15fr)_100px_90px_120px_minmax(450px,1.4fr)] xl:items-center" aria-label={`查看提案：${proposal.title}`}>
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-slate-400">RPS-{String(proposal.id).padStart(5, '0')}</p>
                  <h2 className="mt-1 truncate text-sm font-semibold text-slate-950" title={proposal.title}>{proposal.title}</h2>
                </div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${kind === 'opportunity' ? 'bg-amber-50 text-amber-700' : 'bg-[#3347b8]/10 text-[#3347b8]'}`}>
                    {kind === 'opportunity' ? '机遇观测' : '研究提案'}
                  </span>
                </div>
                <p className="text-xs text-slate-600"><span className="text-slate-400 xl:hidden">申请人：</span>{proposal.author?.username || '—'}</p>
                <p className="text-xs font-medium text-slate-700"><span className="text-slate-400 xl:hidden">状态：</span>{proposal.status}</p>
                <div className="min-w-0">
                  {view === 'feedback' ? (
                    <p className="text-xs leading-5 text-slate-600">{feedbackSummary(proposal)}</p>
                  ) : (
                    <WorkflowProgress stages={stages} currentStage={displayStage} compact />
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
            <p className="mt-1 text-sm text-slate-500">当前角色的数据范围内暂无记录。</p>
            {canCreate && <Link href="/proposals/new" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3347b8]">创建新提案 <ArrowRightIcon className="h-4 w-4" /></Link>}
          </div>
        )}
      </section>
    </div>
  );
}
