'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';

import { getCurrentUser, getProposals } from '@/lib/api';
import { formatRoles } from '@/lib/locale.mjs';

function actionLabel(proposal) {
  if (/技术评审|technical/i.test(proposal.status || '')) return '进入技术评审';
  if (/科学评审|science/i.test(proposal.status || '')) return '进入科学评审';
  return '查看决策资料';
}

export default function ReviewTaskPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const reviewTasks = useMemo(() => proposals, [proposals]);

  if (loading) return <div className="mx-auto max-w-[1450px] py-16 text-sm text-slate-500">正在加载评审任务…</div>;

  return (
    <div className="rps-enter mx-auto max-w-[1450px]">
      <header className="border-b border-slate-200 pb-6">
        <p className="rps-eyebrow">评审工作区</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">评审任务</h1>
        <p className="mt-2 text-sm text-slate-600">{user?.roles?.includes('Admin') ? '管理员查看所有正在评审或决策的提案，并跟踪专家分配与提交进度。' : '仅显示已分配给当前用户、且正处于对应评审环节的提案。'}</p>
        <p className="mt-2 text-xs text-slate-400">当前用户：{user?.username} · {formatRoles(user?.roles)}</p>
      </header>

      {error && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <section className="mt-5 overflow-hidden border-y border-slate-200 bg-white" aria-label="评审任务列表">
        <div className="hidden grid-cols-[minmax(280px,1fr)_140px_120px_minmax(250px,1fr)] gap-5 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid">
          <span>提案</span><span>申请人</span><span>当前状态</span><span>评审操作</span>
        </div>
        {reviewTasks.map((proposal) => (
            <article key={proposal.id} className="grid gap-4 border-t border-slate-100 px-5 py-5 first:border-t-0 md:grid-cols-[minmax(280px,1fr)_140px_120px_minmax(250px,1fr)] md:items-center md:gap-5">
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-slate-400">RPS-{String(proposal.id).padStart(5, '0')} · {proposal.proposal_type?.name}</p>
                <h2 className="mt-1 truncate text-sm font-semibold text-slate-950">{proposal.title}</h2>
              </div>
              <p className="text-xs text-slate-600">{proposal.author?.username || '—'}</p>
              <p className="text-xs font-medium text-slate-700">{proposal.status}</p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/proposals/${proposal.id}?mode=${user?.roles?.includes('Admin') ? 'admin' : 'review'}`} className="rps-button-primary">{user?.roles?.includes('Admin') ? '查看评审进度' : actionLabel(proposal)}</Link>
              </div>
            </article>
        ))}

        {!reviewTasks.length && (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <ClipboardDocumentCheckIcon className="h-9 w-9 text-[#7899a7]" />
            <h2 className="mt-4 text-base font-semibold text-slate-900">暂无评审任务</h2>
            <p className="mt-1 text-sm text-slate-500">符合角色权限并进入评审环节的提案会显示在这里。</p>
          </div>
        )}
      </section>
    </div>
  );
}
