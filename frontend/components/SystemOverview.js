'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRightIcon,
  BoltIcon,
  ChartBarIcon,
  ClockIcon,
  EyeIcon,
  FolderOpenIcon,
  PlusIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';

import {
  executeToolOperationFromForm,
  getCurrentUser,
  getExternalTool,
  getProposals,
  listExternalTools,
} from '@/lib/api';
import { getProposalKind, getWorkflowDisplayStage } from '@/lib/workflowDisplay.mjs';
import { formatRoles } from '@/lib/locale.mjs';

function hasFeedback(proposal) {
  return (proposal.instruments || []).some((instrument) => Object.keys(instrument.scheduling_feedback || {}).length);
}

function dashboardPersona(roles = []) {
  if (roles.includes('Technical Expert')) {
    return {
      key: 'reviewer',
      title: '技术评审专家',
      scope: '分配给我的技术评审任务',
      description: '查看分配给您的提案，完成技术可行性审阅与意见提交。',
      capabilities: ['查看提案完整材料', '下载申请附件', '提交技术评审意见'],
    };
  }
  if (roles.includes('Reviewer')) {
    return {
      key: 'reviewer',
      title: '科学评审专家',
      scope: '分配给我的科学评审任务',
      description: '查看分配给您的提案，完成科学价值打分与评语提交。',
      capabilities: ['查看提案完整材料', '下载申请附件', '提交评分与评语'],
    };
  }
  if (roles.includes('Panel Chair')) {
    return {
      key: 'reviewer',
      title: '科学委员会成员',
      scope: '分配给我的决策任务',
      description: '查看进入委员会决策环节的提案与既有评审意见。',
      capabilities: ['查看评审汇总', '查阅提案材料', '提交最终意见'],
    };
  }
  if (roles.includes('Instrument Scheduler')) {
    return {
      key: 'scheduler',
      title: '观测编排负责人',
      scope: '需要处理的观测与反馈',
      description: '查看已通过提案，维护观测窗口、执行状态与数据反馈。',
      capabilities: ['查看通过的提案', '维护观测状态', '分配观测数据'],
    };
  }
  return {
    key: 'proposer',
    title: '提案申请人',
    scope: '我创建的提案',
    description: roles.includes('Admin')
      ? '工作区采用提案申请人视角，仅显示您本人创建的提案；全局内容请进入管理区。'
      : '创建研究提案或机遇观测申请，并跟踪本人提案的完整进度。',
    capabilities: ['创建与编辑草稿', '提交研究或机遇申请', '查看本人提案进度'],
  };
}

function proposalHref(proposal, persona) {
  return persona.key === 'reviewer'
    ? `/proposals/${proposal.id}?mode=review`
    : `/proposals/${proposal.id}`;
}

function overviewScope(roles = []) {
  const persona = dashboardPersona(roles);
  if (persona.key === 'reviewer') return { scope: 'assigned_reviews' };
  if (persona.key === 'scheduler') return { scope: 'feedback' };
  return {};
}

export default function SystemOverview() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visibilityOperationId, setVisibilityOperationId] = useState(null);
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [visibilityResult, setVisibilityResult] = useState(null);
  const [visibilityForm, setVisibilityForm] = useState({
    target_name: '',
    ra: '',
    dec: '',
    start_date: '',
    end_date: '',
    instrument: 'LF',
  });

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }

    getCurrentUser()
      .then(async (me) => {
        const [items, tools] = await Promise.all([
          getProposals(overviewScope(me.roles)),
          listExternalTools().catch(() => []),
        ]);
        setUser(me);
        setProposals(items || []);
        const visibilityTool = (tools || []).find((tool) => {
          const identity = `${tool.name} ${tool.description || ''}`;
          return /visibility|可见/i.test(identity) && /DSL|鸿蒙/i.test(identity);
        });
        if (visibilityTool) {
          try {
            const detail = await getExternalTool(visibilityTool.id);
            const operation = (detail.operations || []).find((item) => /visibility|可见/i.test(`${item.operation_id} ${item.name} ${item.description || ''}`));
            setVisibilityOperationId(operation?.id || null);
          } catch (toolError) {
            console.error(toolError);
          }
        }
      })
      .catch((requestError) => {
        console.error(requestError);
        setError(requestError.info?.message || '工作台加载失败。');
        if (requestError.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const summary = useMemo(() => {
    const research = proposals.filter((item) => getProposalKind(item.proposal_type?.name) === 'research').length;
    const opportunity = proposals.filter((item) => getProposalKind(item.proposal_type?.name) === 'opportunity').length;
    const reviewing = proposals.filter((item) => /评审|review/i.test(item.status || '')).length;
    const feedback = proposals.filter(hasFeedback).length;
    return { research, opportunity, reviewing, feedback };
  }, [proposals]);

  const recentProposals = useMemo(
    () => [...proposals].sort((left, right) => Number(right.id) - Number(left.id)).slice(0, 5),
    [proposals]
  );

  const persona = dashboardPersona(user?.roles || []);
  const canCreate = persona.key === 'proposer';
  const roleLabel = formatRoles(user?.roles) || '用户';
  const directoryHref = persona.key === 'reviewer'
    ? '/dashboard/panel'
    : persona.key === 'scheduler'
      ? '/dashboard/feedback'
      : '/dashboard/research';

  const statusEntries = [
    {
      label: '研究提案',
      value: summary.research,
      Icon: FolderOpenIcon,
      href: persona.key === 'proposer' ? '/dashboard/research' : null,
    },
    {
      label: '机遇观测',
      value: summary.opportunity,
      Icon: BoltIcon,
      href: persona.key === 'proposer' ? '/dashboard/opportunity' : null,
    },
    {
      label: '评审进行中',
      value: summary.reviewing,
      Icon: ClockIcon,
      href: persona.key === 'reviewer' ? '/dashboard/panel' : null,
    },
    {
      label: '已生成反馈',
      value: summary.feedback,
      Icon: SignalIcon,
      href: persona.key === 'scheduler' ? '/dashboard/feedback' : null,
    },
  ];

  const updateVisibilityField = (event) => {
    setVisibilityForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
    setVisibilityResult(null);
  };

  const runVisibilityCalculation = async (event) => {
    event.preventDefault();
    if (!visibilityOperationId) {
      setVisibilityResult({ success: false, message: '尚未配置可见性计算服务，请联系系统管理员。' });
      return;
    }
    setVisibilityLoading(true);
    setVisibilityResult(null);
    try {
      const response = await executeToolOperationFromForm(visibilityOperationId, visibilityForm);
      if (!response.success) throw new Error(response.error || '可见性计算失败。');
      const output = response.mapped_output?.visibility_result || response.response || {};
      const message = output.visible === false
        ? `目标在所选时段内不可见${output.reason ? `：${output.reason}` : '。'}`
        : output.visible === true
          ? '目标在所选时段内可见，计算结果已生成。'
          : '可见性分析已完成，计算结果已生成。';
      setVisibilityResult({ success: true, message });
    } catch (toolError) {
      setVisibilityResult({ success: false, message: toolError.message || '可见性计算服务暂不可用。' });
    } finally {
      setVisibilityLoading(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-[1450px] py-16 text-sm text-slate-500">正在加载我的工作台…</div>;
  }

  return (
    <div className="rps-enter mx-auto max-w-[1450px] pb-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="rps-eyebrow">个人工作区</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">我的工作台</h1>
          <p className="mt-1.5 text-base text-slate-500">查看与当前工作身份相关的提案、任务和快捷工具。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <Link href="/proposals/new" className="rps-button-primary">
              <PlusIcon className="h-4 w-4" /> 创建新提案
            </Link>
          )}
          <Link href={directoryHref} className="rps-button-secondary">
            <FolderOpenIcon className="h-4 w-4" /> 查看提案
          </Link>
        </div>
      </header>

      {error && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <section className="mt-4 overflow-hidden rounded-2xl bg-[#07111f] text-white" aria-labelledby="user-panel-title">
        <div className="relative isolate min-h-[230px] overflow-hidden p-6 sm:p-7">
            <img
              src="/images/hongmeng-mission.png"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 -z-20 h-full w-full object-cover object-[52%_48%] opacity-42 transition-transform duration-700 hover:scale-[1.02]"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#07111f]/98 via-[#07111f]/90 to-[#07111f]/45" />
          <div className="max-w-3xl">
            <p className="text-xs font-semibold tracking-[0.18em] text-[#91a9b5]">当前登录用户</p>
            <div className="mt-4 flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-2xl font-semibold text-white">
                {(user?.username || 'U').slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h2 id="user-panel-title" className="truncate text-2xl font-semibold sm:text-3xl">{user?.username || '—'}</h2>
                <p className="mt-1 text-sm text-slate-400">账户角色：{roleLabel}</p>
              </div>
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="text-sm text-slate-500">当前工作身份</p>
              <p className="mt-1 text-xl font-semibold text-[#d8e5ea]">{persona.title}</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{persona.description}</p>
            </div>

            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
              {persona.capabilities.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#8eabb7]" /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <nav aria-label="工作台快捷入口" className="mt-3 grid gap-px overflow-hidden border-y border-slate-200 bg-slate-200 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {statusEntries.map(({ label, value, Icon, href }) => {
          const content = (
            <>
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0 text-[#7899a7]" />
                <div>
                  <p className="text-2xl font-semibold leading-none text-slate-950">{value}</p>
                  <p className="mt-1.5 text-sm font-medium text-slate-500">{label}</p>
                </div>
              </div>
              {href && <ArrowRightIcon className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-[#3347b8]" />}
            </>
          );
          return href ? (
            <Link key={label} href={href} className="group flex min-h-20 items-center justify-between gap-4 bg-white px-5 py-3.5 hover:bg-slate-50">
              {content}
            </Link>
          ) : (
            <div key={label} className="flex min-h-20 items-center justify-between gap-4 bg-white px-5 py-3.5">
              {content}
            </div>
          );
        })}
        <a href="#visibility-calculator" className="group flex items-center justify-between gap-4 bg-white px-5 py-4 hover:bg-slate-50">
          <div className="flex items-center gap-3">
            <EyeIcon className="h-5 w-5 shrink-0 text-[#7899a7]" />
            <div>
              <p className="text-base font-semibold text-slate-900">可见性计算</p>
              <p className="mt-1 text-sm text-slate-500">打开计算工具</p>
            </div>
          </div>
          <ArrowRightIcon className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-[#3347b8]" />
        </a>
      </nav>

      <section className="py-5" aria-labelledby="recent-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="rps-eyebrow">提案动态</p>
            <h2 id="recent-title" className="mt-1 text-2xl font-semibold text-slate-950">最近更新</h2>
          </div>
          <Link href={directoryHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#3347b8] hover:text-[#263b9a]">
            查看全部 <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 border-y border-slate-200 bg-white">
          <div className="hidden grid-cols-[minmax(0,1fr)_140px_190px_24px] gap-4 border-b border-slate-100 px-4 py-2.5 text-[11px] font-semibold text-slate-400 sm:grid">
            <span>提案</span><span>类型</span><span>当前进度</span><span aria-hidden="true" />
          </div>
          {recentProposals.map((proposal) => {
            const kind = getProposalKind(proposal.proposal_type?.name);
            const stage = getWorkflowDisplayStage(proposal.workflow?.definition, proposal.status);
            return (
              <Link key={proposal.id} href={proposalHref(proposal, persona)} className="group grid gap-2 border-t border-slate-100 px-4 py-3.5 first:border-t-0 hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_140px_190px_24px] sm:items-center sm:gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-slate-400">RPS-{String(proposal.id).padStart(5, '0')}</p>
                  <p className="mt-1 truncate text-base font-semibold text-slate-900">{proposal.title}</p>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${kind === 'opportunity' ? 'bg-amber-50 text-amber-700' : 'bg-[#3347b8]/10 text-[#3347b8]'}`}>
                  {kind === 'opportunity' ? '机遇观测' : '研究提案'}
                </span>
                <div className="text-sm text-slate-500">
                  <span className="block text-slate-400">{stage}</span>
                  <span className="mt-0.5 block font-medium text-slate-700">{proposal.status}</span>
                </div>
                <ArrowRightIcon className="hidden h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-[#3347b8] sm:block" />
              </Link>
            );
          })}
          {!recentProposals.length && <p className="px-5 py-12 text-center text-sm text-slate-500">当前范围内暂无提案。</p>}
        </div>
      </section>

      <section id="visibility-calculator" className="scroll-mt-6 border-y border-slate-200 bg-white px-5 py-6 sm:px-6" aria-labelledby="visibility-title">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#3347b8]/10 text-[#3347b8]">
              <ChartBarIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 id="visibility-title" className="text-xl font-semibold text-slate-950">目标可见性计算</h2>
                <span className="font-mono text-[11px] tracking-[0.12em] text-slate-400">RWGN03-RPS-02</span>
              </div>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">填写提案时可随时计算，不属于审批节点；结果用于辅助选择观测时间。</p>
            </div>
          </div>
          <p className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${visibilityOperationId ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {visibilityOperationId ? '计算服务已连接' : '计算服务待管理员配置'}
          </p>
        </div>

        <form onSubmit={runVisibilityCalculation} className="pt-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-12">
              <label className="sm:col-span-2 xl:col-span-4">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">目标名称</span>
                <input name="target_name" value={visibilityForm.target_name} onChange={updateVisibilityField} placeholder="例如：宇宙黎明巡天区域" className="rps-field" />
              </label>
              <label className="xl:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">赤经 RA *</span>
                <input name="ra" value={visibilityForm.ra} onChange={updateVisibilityField} required placeholder="00h 00m 00s" className="rps-field" />
              </label>
              <label className="xl:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">赤纬 Dec *</span>
                <input name="dec" value={visibilityForm.dec} onChange={updateVisibilityField} required placeholder="+00° 00′ 00″" className="rps-field" />
              </label>
              <label className="sm:col-span-2 xl:col-span-4">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">申请仪器</span>
                <select name="instrument" value={visibilityForm.instrument} onChange={updateVisibilityField} className="rps-field">
                  <option value="LF">LF · 0.1–30 MHz 成像</option>
                  <option value="HF">HF · 0.1–120 MHz 频谱</option>
                </select>
              </label>
              <label className="xl:col-span-4">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">开始日期</span>
                <input type="date" name="start_date" value={visibilityForm.start_date} onChange={updateVisibilityField} className="rps-field" />
              </label>
              <label className="xl:col-span-4">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">结束日期</span>
                <input type="date" name="end_date" value={visibilityForm.end_date} onChange={updateVisibilityField} className="rps-field" />
              </label>
              <div className="flex items-end xl:col-span-4">
                <button type="submit" disabled={visibilityLoading} className="rps-button-primary w-full">
                  <EyeIcon className="h-4 w-4" /> {visibilityLoading ? '正在计算…' : '计算可见性'}
                </button>
              </div>
            </div>

            {visibilityResult && (
              <p role="status" className={`mt-3 rounded-xl px-3 py-2.5 text-xs leading-5 ${visibilityResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                {visibilityResult.message}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-xs leading-5 text-slate-400">公式与轨道服务由管理员按专家方案配置。</p>
              {canCreate && <Link href="/proposals/new?focus=visibility" className="text-xs font-semibold text-[#3347b8] hover:text-[#263b9a]">在提案中使用</Link>}
            </div>
        </form>
      </section>
    </div>
  );
}
