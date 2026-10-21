'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRightIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';

import { getCurrentUser, getProposals } from '@/lib/api';
import ListSearchField from '@/components/ListSearchField';
import ListPageHeader from '@/components/ListPageHeader';
import ListPageToolbar from '@/components/ListPageToolbar';
import { getProposalKind, getProposalRowStyle, getProposalStatusPresentation } from '@/lib/workflowDisplay.mjs';

const TYPE_LABEL_TONES = {
  research: 'bg-[#f2f0f7] text-[#655b7b]',
  opportunity: 'bg-[#edf4f3] text-[#476e70]',
};

const TYPE_FILTER_TONES = {
  all: { selected: 'bg-[#3347b8] text-white', idle: 'text-slate-600 hover:bg-slate-100 hover:text-slate-950' },
  research: { selected: 'bg-[#f2f0f7] text-[#655b7b] ring-1 ring-inset ring-[#ded8e8]', idle: 'text-[#655b7b] hover:bg-[#f2f0f7]' },
  opportunity: { selected: 'bg-[#edf4f3] text-[#476e70] ring-1 ring-inset ring-[#d7e7e5]', idle: 'text-[#476e70] hover:bg-[#edf4f3]' },
};

const STATUS_TEXT_TONES = {
  draft: 'text-slate-600',
  active: 'text-[#304aa2]',
  revision: 'text-[#995b14]',
  rejected: 'text-[#a52d42]',
  closed: 'text-[#17603d]',
};

const TABLE_COLUMNS = 'min-[1050px]:grid-cols-[minmax(220px,1.4fr)_95px_minmax(100px,0.65fr)_minmax(150px,0.9fr)_minmax(150px,0.9fr)]';

function actionLabel(proposal) {
  if (/技术评审|technical/i.test(proposal.status || '')) return '进入技术评审';
  if (/科学评审|science/i.test(proposal.status || '')) return '进入科学评审';
  if (/最终决策|committee|decision/i.test(proposal.status || '')) return '提交最终决策';
  return '查看提案';
}

export default function ReviewTaskPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const refresh = async () => {
    const items = await getProposals({ scope: 'review_tasks' });
    setProposals(items);
  };

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    async function init() {
      try {
        const me = await getCurrentUser();
        setUser(me);
        if (!me.roles.some((role) => ['Technical Expert', 'Reviewer', 'Panel Chair', 'Admin'].includes(role))) {
          router.push('/');
          return;
        }
        await refresh();
      } catch (requestError) {
        console.error(requestError);
        setError(requestError.info?.message || '评审任务加载失败。');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  const normalizedQuery = query.trim().toLowerCase();
  const researchCount = proposals.filter((proposal) => getProposalKind(proposal.proposal_type?.name) === 'research').length;
  const opportunityCount = proposals.filter((proposal) => getProposalKind(proposal.proposal_type?.name) === 'opportunity').length;
  const reviewTasks = [...proposals]
    .filter((proposal) => typeFilter === 'all' || getProposalKind(proposal.proposal_type?.name) === typeFilter)
    .filter((proposal) => !normalizedQuery || [
      proposal.title,
      proposal.status,
      proposal.author?.username,
      proposal.proposal_type?.name,
      `RPS-${String(proposal.id).padStart(5, '0')}`,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)))
    .sort((left, right) => Number(right.id) - Number(left.id));
  const isAdminOverview = user?.roles?.includes('Admin')
    && !user.roles.some((role) => ['Technical Expert', 'Reviewer', 'Panel Chair'].includes(role));

  if (loading) return <div className="mx-auto max-w-[1450px] py-16 text-sm text-slate-500">正在加载评审任务…</div>;

  return (
    <div className="rps-enter mx-auto max-w-[1450px]">
      <ListPageHeader title={isAdminOverview ? '评审任务' : '我的评审任务'} />

      {error && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <ListPageToolbar filters={
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
      }>
        <ListSearchField value={query} onChange={setQuery} label="搜索评审任务" placeholder="搜索编号、名称、申请人或阶段" />
      </ListPageToolbar>

      <section className="mt-5 overflow-hidden border-y border-slate-200 bg-white" aria-label="评审任务列表">
        <div className={`hidden gap-3 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 min-[1050px]:grid ${TABLE_COLUMNS}`}>
          <span>提案</span><span>类型</span><span>申请人</span><span>状态</span><span>评审操作</span>
        </div>
        {reviewTasks.map((proposal) => {
          const kind = getProposalKind(proposal.proposal_type?.name);
          const statusPresentation = getProposalStatusPresentation(proposal.status);
          const label = isAdminOverview ? '查看评审进度' : actionLabel(proposal);
          return (
            <article key={proposal.id} className="border-t border-slate-100 first:border-t-0" style={getProposalRowStyle(proposal.workflow?.definition, proposal.status)}>
              <Link href={`/proposals/${proposal.id}?mode=${isAdminOverview ? 'admin' : 'review'}`} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-slate-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3347b8] ${TABLE_COLUMNS}`} aria-label={`${label}：${proposal.title}`}>
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-slate-400">RPS-{String(proposal.id).padStart(5, '0')}</p>
                  <h2 className="mt-0.5 truncate text-sm font-semibold text-slate-950" title={proposal.title}>{proposal.title}</h2>
                </div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_LABEL_TONES[kind]}`}>
                    {kind === 'opportunity' ? '机遇观测' : '研究提案'}
                  </span>
                </div>
                <p className="min-w-0 truncate text-xs leading-5 text-slate-600"><span className="text-slate-400 min-[1050px]:hidden">申请人：</span>{proposal.author?.username || '—'}</p>
                <p className={`min-w-0 text-xs font-semibold leading-5 ${STATUS_TEXT_TONES[statusPresentation.tone]}`}><span className="font-normal text-slate-400 min-[1050px]:hidden">状态：</span>{statusPresentation.label}</p>
                <span className="col-span-2 inline-flex items-center gap-1 text-xs font-semibold text-[#3347b8] min-[1050px]:col-span-1">{label}<ArrowRightIcon className="h-3.5 w-3.5" /></span>
              </Link>
            </article>
          );
        })}

        {!reviewTasks.length && (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <ClipboardDocumentCheckIcon className="h-9 w-9 text-[#7899a7]" />
            <h2 className="mt-4 text-base font-semibold text-slate-900">{normalizedQuery || typeFilter !== 'all' ? '没有匹配的评审任务' : '暂无评审任务'}</h2>
            {!normalizedQuery && typeFilter === 'all' && <p className="mt-1 text-sm text-slate-500">符合角色权限并进入评审环节的提案会显示在这里。</p>}
          </div>
        )}
      </section>
    </div>
  );
}
