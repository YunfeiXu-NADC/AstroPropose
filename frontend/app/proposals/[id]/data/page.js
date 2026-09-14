'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  CircleStackIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

import { getProposal } from '@/lib/api';

export default function ProposalDataPage() {
  const { id } = useParams();
  const router = useRouter();
  const [proposal, setProposal] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    getProposal(id)
      .then(setProposal)
      .catch((requestError) => setError(requestError.info?.message || '数据包加载失败。'));
  }, [id, router]);

  const packages = useMemo(() => (proposal?.instruments || [])
    .map((entry) => ({ instrument: entry.instrument, feedback: entry.scheduling_feedback || {} }))
    .filter((entry) => entry.feedback.status === 'data_ready' || entry.feedback.data_products?.length), [proposal]);

  if (error) return <div className="mx-auto max-w-5xl py-16 text-sm text-rose-700">{error}</div>;
  if (!proposal) return <div className="mx-auto max-w-5xl py-16 text-sm text-slate-500">正在加载观测数据…</div>;

  return (
    <div className="rps-enter mx-auto max-w-5xl">
      <Link href={`/proposals/${proposal.id}#observation-feedback`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#3347b8]"><ArrowLeftIcon className="h-4 w-4" /> 返回观测反馈</Link>
      <header className="mt-5 border-b border-slate-200 pb-7">
        <p className="font-mono text-xs text-slate-400">RPS-{String(proposal.id).padStart(5, '0')} · 观测数据访问</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{proposal.title}</h1>
        <p className="mt-3 text-sm text-slate-600">仅展示已向当前提案开放的数据产品。</p>
      </header>

      <main className="mt-7 bg-white px-6 py-7 shadow-[0_18px_60px_rgba(28,41,73,0.05)] sm:px-9">
        {packages.map(({ instrument, feedback }) => (
          <section key={instrument.code} className="border-t border-slate-200 py-7 first:border-t-0 first:pt-0">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div><p className="rps-eyebrow">{instrument.code} 数据包</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{feedback.observation_id}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{feedback.summary}</p></div>
              <span className="w-fit rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700">已开放访问</span>
            </div>
            <div className="mt-6 divide-y divide-slate-100 border-y border-slate-100">
              {(feedback.data_products || []).map((product) => (
                <article key={product.name} className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 gap-3">
                    <DocumentTextIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#7899a7]" />
                    <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900">{product.name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{product.description} · {product.format} · {product.size}</p></div>
                  </div>
                  {product.data_url && <a href={product.data_url} download={product.name} className="rps-button-secondary shrink-0"><ArrowDownTrayIcon className="h-4 w-4" /> 下载</a>}
                </article>
              ))}
            </div>
          </section>
        ))}

        {!packages.length && <div className="flex min-h-64 flex-col items-center justify-center text-center"><CircleStackIcon className="h-9 w-9 text-slate-300" /><h2 className="mt-4 text-base font-semibold text-slate-900">数据尚未开放</h2><p className="mt-1 text-sm text-slate-500">观测数据完成校验和授权后会显示在这里。</p></div>}
      </main>
    </div>
  );
}
