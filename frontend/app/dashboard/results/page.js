'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { listResearchOutputs } from '@/lib/api';

const labels = {
  feedback_open: '公开征求意见', revision_pending: '待作者修改',
  committee_pending: '待科学委员会认定', changes_requested: '委员会要求修改',
  approved_to_submit: '同意投稿', journal_submitted: '已投稿',
  published: '已提交最终发表版', rejected: '未获发表认可',
};

export default function ResultsPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    listResearchOutputs().then(setData).catch((requestError) => {
      if (requestError.status === 401) router.push('/login');
      else setError(requestError.message);
    });
  }, [router]);

  const filtered = useMemo(() => (data?.results || []).filter((item) => {
    if (filter === 'open' && item.status !== 'feedback_open') return false;
    if (filter === 'committee' && item.status !== 'committee_pending') return false;
    const text = `${item.title} ${item.proposal_title} ${item.author} RPS-${String(item.proposal_id).padStart(5, '0')}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  }), [data, filter, query]);

  return <div className="rps-enter mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
    <header className="mb-7"><h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">科研成果公示</h1><p className="mt-2 text-sm text-slate-500">查看已提交成果，并在公示期内提出意见。</p></header>
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm">
        {[['all', '全部'], ['open', `征求意见 ${data?.open_feedback_count || 0}`], ['committee', '委员会待认定']].map(([key, label]) => <button type="button" key={key} onClick={() => setFilter(key)} className={`rounded-lg px-3 py-2 ${filter === key ? 'bg-[#3347b8] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
      </div>
      <input aria-label="搜索成果" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索成果、提案或作者" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#3347b8] sm:max-w-xs" />
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {!data && !error && <p className="py-12 text-center text-sm text-slate-500">正在加载…</p>}
    {data && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {filtered.length ? filtered.map((item) => <Link key={item.id} href={`/results/proposal/${item.proposal_id}`} className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 last:border-0 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0"><span className="block text-sm font-semibold text-slate-950">{item.title}</span><span className="mt-1 block text-xs text-slate-500">RPS-{String(item.proposal_id).padStart(5, '0')} · {item.proposal_title} · {item.author}</span></span>
        <span className="flex shrink-0 items-center gap-3 text-xs"><span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">{labels[item.status] || item.status}</span>{item.status === 'feedback_open' && <span className="text-slate-500">截止 {new Date(item.feedback_deadline).toLocaleString('zh-CN')}</span>}</span>
      </Link>) : <p className="px-5 py-14 text-center text-sm text-slate-500">暂无符合条件的成果</p>}
    </div>}
  </div>;
}
