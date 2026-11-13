'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  commentResearchOutput, decideResearchOutput, downloadResearchOutputFile,
  getResearchOutput, publishResearchOutput, registerJournalSubmission,
  reviseResearchOutput, submitResearchOutput,
} from '@/lib/api';

const labels = {
  feedback_open: '公开征求意见', revision_pending: '待作者修改',
  committee_pending: '待科学委员会认定', changes_requested: '委员会要求修改',
  approved_to_submit: '同意投稿', journal_submitted: '已投稿',
  published: '已提交最终发表版', rejected: '未获发表认可',
};

function readFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('请选择文件'));
    if (!/\.(pdf|doc|docx)$/i.test(file.name)) return reject(new Error('仅支持 PDF、DOC、DOCX 文件'));
    if (file.size > 20 * 1024 * 1024) return reject(new Error('文件不能超过 20 MB'));
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data_url: reader.result });
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function Field({ label, children }) {
  return <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3347b8]';

function FileLink({ proposalId, kind, file, onError }) {
  if (!file) return null;
  return <button type="button" onClick={() => downloadResearchOutputFile(proposalId, kind, file.name).catch((error) => onError(error.message))} className="text-sm font-medium text-[#3347b8] hover:underline">下载{kind === 'draft' ? '论文初稿' : kind === 'revised' ? '修改稿' : '最终发表版'}：{file.name}</button>;
}

export default function ResearchOutputPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});

  const reload = useCallback(() => getResearchOutput(id).then(setData), [id]);
  useEffect(() => {
    reload().catch((requestError) => {
      if (requestError.status === 401) router.push('/login');
      else setError(requestError.message);
    });
  }, [reload, router]);

  const set = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  const act = async (operation, success) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await operation();
      await reload();
      setForm({});
      setMessage(success);
      window.dispatchEvent(new Event('auth-change'));
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  const output = data?.output;
  const fileInput = (key) => <input type="file" accept=".pdf,.doc,.docx" onChange={(event) => setForm((old) => ({ ...old, [key]: event.target.files?.[0] }))} className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-[#3347b8]`} />;

  return <div className="rps-enter mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
    <Link href="/dashboard/results" className="text-sm font-medium text-[#3347b8] hover:underline">← 返回科研成果公示</Link>
    <header className="mt-5 mb-7 border-b border-slate-200 pb-5"><h1 className="text-2xl font-semibold text-slate-950">{output?.title || '提交研究成果'}</h1><p className="mt-2 text-sm text-slate-500">RPS-{String(id).padStart(5, '0')} · {output?.proposal_title || data?.proposal?.title || ''}</p>{output && <p className="mt-3 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{labels[output.status] || output.status}</p>}</header>
    {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    {!data && !error && <p className="py-12 text-center text-sm text-slate-500">正在加载…</p>}
    {data && !output && (data.can_start ? <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-lg font-semibold">提交论文初稿并公示</h2><p className="mt-2 text-sm text-slate-500">提交后向所有已登录科学用户公示，征求意见期为 7 天。</p><div className="mt-5 space-y-4"><Field label="成果标题"><input className={inputClass} value={form.title || ''} onChange={set('title')} /></Field><Field label="成果摘要"><textarea className={inputClass} rows="5" value={form.summary || ''} onChange={set('summary')} /></Field><Field label="论文初稿（PDF、DOC、DOCX，最大 20 MB）">{fileInput('draft_file')}</Field><button type="button" disabled={busy} className="rps-button-primary" onClick={() => act(async () => submitResearchOutput(id, { title: form.title, summary: form.summary, draft_file: await readFile(form.draft_file) }), '论文初稿已公示，征求意见期已开始。')}>提交并公示</button></div></section> : <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">该提案尚未获得数据授权，暂不能提交研究成果。</p>)}
    {output && <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-lg font-semibold">成果内容</h2><span className="text-xs text-slate-500">{output.author} · {new Date(output.submitted_at).toLocaleString('zh-CN')}</span></div><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{output.summary}</p><div className="mt-5 flex flex-col items-start gap-2 border-t border-slate-100 pt-4"><FileLink proposalId={id} kind="draft" file={output.draft_file} onError={setError} /><FileLink proposalId={id} kind="revised" file={output.revised_file} onError={setError} /><FileLink proposalId={id} kind="final" file={output.final_file} onError={setError} /></div>{output.revision_note && <p className="mt-4 text-sm text-slate-600"><span className="font-medium">修改说明：</span>{output.revision_note}</p>}</section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">公开反馈 · {output.comment_count}</h2><span className="text-xs text-slate-500">征求意见截止：{new Date(output.feedback_deadline).toLocaleString('zh-CN')}</span></div><div className="mt-4 divide-y divide-slate-100">{output.comments.length ? output.comments.map((item) => <article className="py-3" key={item.id}><p className="text-xs text-slate-500">{item.author} · {new Date(item.created_at).toLocaleString('zh-CN')}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.body}</p></article>) : <p className="py-3 text-sm text-slate-500">暂无反馈意见</p>}</div>{output.can_comment && <div className="mt-4"><Field label="发表意见"><textarea className={inputClass} rows="4" value={form.comment || ''} onChange={set('comment')} /></Field><button type="button" disabled={busy} className="rps-button-primary mt-3" onClick={() => act(() => commentResearchOutput(id, form.comment), '意见已公开提交。')}>提交意见</button></div>}</section>
      {output.can_revise && <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-lg font-semibold">提交修改稿</h2><p className="mt-2 text-sm text-slate-500">回应公示意见后提交科学委员会认定。</p><div className="mt-4 space-y-4"><Field label="修改说明"><textarea className={inputClass} rows="4" value={form.revision_note || ''} onChange={set('revision_note')} /></Field><Field label="论文修改稿">{fileInput('revised_file')}</Field><button type="button" disabled={busy} className="rps-button-primary" onClick={() => act(async () => reviseResearchOutput(id, { revision_note: form.revision_note, revised_file: await readFile(form.revised_file) }), '修改稿已提交科学委员会认定。')}>提交修改稿</button></div></section>}
      {(output.can_decide || output.committee_note) && <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-lg font-semibold">科学委员会认定</h2>{output.committee_note && <p className="mt-3 text-sm leading-6 text-slate-700">{output.committee_decider}：{output.committee_note}</p>}{output.can_decide && <div className="mt-4 space-y-4"><Field label="认定意见"><textarea className={inputClass} rows="4" value={form.committee_note || ''} onChange={set('committee_note')} /></Field><div className="flex flex-wrap gap-2">{[['approve', '同意投稿'], ['revise', '退回修改'], ['reject', '不予认可']].map(([decision, label]) => <button key={decision} type="button" disabled={busy} className="rps-button-secondary" onClick={() => act(() => decideResearchOutput(id, { decision, note: form.committee_note }), `已作出认定：${label}`)}>{label}</button>)}</div></div>}</section>}
      {(output.can_submit_journal || output.journal_name) && <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-lg font-semibold">期刊投稿</h2>{output.journal_name && <p className="mt-3 text-sm text-slate-700">期刊：{output.journal_name} · 投稿时间：{new Date(output.journal_submitted_at).toLocaleString('zh-CN')}</p>}{output.can_submit_journal && <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input aria-label="期刊名称" placeholder="期刊名称" className={inputClass} value={form.journal_name || ''} onChange={set('journal_name')} /><button type="button" disabled={busy} className="rps-button-primary shrink-0" onClick={() => act(() => registerJournalSubmission(id, form.journal_name), '期刊投稿已登记。')}>登记投稿</button></div>}</section>}
      {(output.can_publish_final || output.final_file) && <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-lg font-semibold">最终发表版</h2>{output.final_file && <p className="mt-3 text-sm text-slate-700">{output.publication_reference} · 接收日期：{new Date(output.journal_accepted_at).toLocaleDateString('zh-CN')}</p>}{output.can_publish_final && <div className="mt-4 space-y-4"><Field label="期刊接收日期"><input type="date" className={inputClass} value={form.journal_accepted_at || ''} onChange={set('journal_accepted_at')} /></Field><Field label="发表信息（论文题录、DOI 等）"><input className={inputClass} value={form.publication_reference || ''} onChange={set('publication_reference')} /></Field><Field label="最终发表版文件">{fileInput('final_file')}</Field><button type="button" disabled={busy} className="rps-button-primary" onClick={() => act(async () => publishResearchOutput(id, { journal_accepted_at: form.journal_accepted_at, publication_reference: form.publication_reference, final_file: await readFile(form.final_file) }), '最终发表版已提交。')}>提交最终发表版</button></div>}</section>}
    </div>}
  </div>;
}
