'use client';

import { useEffect, useState } from 'react';
import ListPageHeader from '@/components/ListPageHeader';
import { createProposalSeason, listProposalSeasons, updateProposalSeason } from '@/lib/api';

const EMPTY = { name: '', start_date: '', end_date: '', data_release_deadline: '' };
const STATUS = { accepting: '接收提案中', upcoming: '尚未开始', closed: '申请已截止', legacy: '历史提案' };

function displayTime(value) {
  return value ? value.slice(0, 16).replace('T', ' ') : '—';
}

export default function ProposalSeasonsPage() {
  const [seasons, setSeasons] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    try {
      setSeasons(await listProposalSeasons());
    } catch (requestError) {
      setError(requestError.info?.message || '批次加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function edit(season) {
    setEditingId(season.id);
    setForm({
      name: season.name,
      start_date: season.start_date?.slice(0, 16) || '',
      end_date: season.end_date?.slice(0, 16) || '',
      data_release_deadline: season.data_release_deadline?.slice(0, 16) || '',
    });
    setShowForm(true);
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY);
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!(form.start_date < form.end_date && form.end_date <= form.data_release_deadline)) {
      setError('时间应依次为：开始申请、接受提案截止、数据释放最晚时间。');
      return;
    }
    setSaving(true);
    try {
      if (editingId) await updateProposalSeason(editingId, form);
      else await createProposalSeason(form);
      setNotice(editingId ? '批次已更新' : '批次已创建');
      closeForm();
      await refresh();
    } catch (requestError) {
      setError(requestError.info?.message || '保存批次失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rps-enter mx-auto max-w-[1450px]">
      <ListPageHeader title="提案批次" />
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">每个批次设置申请窗口和数据释放最晚时间；到期后数据授权不可修改。时间均为北京时间。</p>
        <button type="button" onClick={() => { if (showForm) closeForm(); else { setShowForm(true); setError(''); setNotice(''); } }} className="rps-button-primary shrink-0">{showForm ? '取消' : '新建批次'}</button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      {showForm && (
        <form onSubmit={save} className="mt-5 border-y border-slate-200 bg-white px-4 py-5 sm:px-6">
          <h2 className="text-base font-semibold text-slate-950">{editingId ? '编辑批次' : '新建批次'}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="block text-sm font-medium text-slate-700">批次名称
              <input required maxLength={140} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rps-field mt-1.5" placeholder="例如：2027 年度提案" />
            </label>
            {[
              ['start_date', '开始接受提案'],
              ['end_date', '接受提案截止'],
              ['data_release_deadline', '数据释放最晚时间'],
            ].map(([key, label]) => (
              <label key={key} className="block text-sm font-medium text-slate-700">{label}
                <input required type="datetime-local" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="rps-field mt-1.5" />
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={closeForm} className="rps-button-secondary">取消</button><button type="submit" disabled={saving} className="rps-button-primary">{saving ? '保存中…' : '保存批次'}</button></div>
        </form>
      )}

      <section className="mt-5 overflow-x-auto border-y border-slate-200 bg-white" aria-label="提案批次列表">
        <table className="rps-list-table min-w-[790px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-4 py-3">批次</th><th className="px-4 py-3">开始接受</th><th className="px-4 py-3">申请截止</th><th className="px-4 py-3">数据释放最晚</th><th className="px-4 py-3">提案数</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">操作</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {seasons.map((season) => (
              <tr key={season.id}>
                <td className="px-4 py-3 font-semibold text-slate-900">{season.name}</td>
                <td className="px-4 py-3 text-slate-600">{displayTime(season.start_date)}</td>
                <td className="px-4 py-3 text-slate-600">{displayTime(season.end_date)}</td>
                <td className="px-4 py-3 text-slate-600">{displayTime(season.data_release_deadline)}</td>
                <td className="px-4 py-3 tabular-nums text-slate-600">{season.proposal_count}</td>
                <td className="px-4 py-3 text-slate-700">{STATUS[season.status]}{!season.can_allocate_data && !season.is_legacy ? ' · 数据授权已锁定' : ''}</td>
                <td className="px-4 py-3">{!season.is_legacy && <button type="button" onClick={() => edit(season)} className="font-semibold text-[#3347b8]">编辑</button>}</td>
              </tr>
            ))}
            {!loading && !seasons.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">尚无批次。请先创建，之后才能接收新提案。</td></tr>}
            {loading && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">正在加载…</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
