'use client';

import { CheckIcon, XMarkIcon } from '@heroicons/react/20/solid';

import { getWorkflowStepState } from '@/lib/workflowDisplay.mjs';

const CURRENT_TONES = {
  draft: { dot: 'border-[#65758a] bg-[#65758a] ring-[#65758a]/20', text: 'text-[#526174]' },
  active: { dot: 'border-[#3347B8] bg-[#3347B8] ring-[#3347B8]/20', text: 'text-[#3347B8]' },
  revision: { dot: 'border-[#b9771c] bg-[#b9771c] ring-[#b9771c]/20', text: 'text-[#995b14]' },
};

export default function WorkflowProgress({ stages = [], currentStage, compact = false, nearby = false, completed = false, rejected = false, tone = 'active', stageOwners = {}, stageDetails = {} }) {
  if (!stages.length) {
    return null;
  }

  const decisionIndex = stages.indexOf('最终决策');
  const visibleStages = rejected && decisionIndex >= 0 ? stages.slice(0, decisionIndex + 1) : stages;
  const currentIndex = Math.max(0, visibleStages.indexOf(currentStage));
  const startIndex = nearby ? Math.max(0, currentIndex - 1) : 0;
  const endIndex = nearby ? Math.min(visibleStages.length, currentIndex + 2) : visibleStages.length;
  const displayedStages = nearby
    ? visibleStages.slice(startIndex, endIndex)
    : visibleStages;

  return (
    <ol
      className={`flex min-w-0 flex-wrap items-center ${compact ? 'gap-x-3 gap-y-2' : 'gap-4'}`}
      aria-label={nearby ? '提案进度摘要' : '提案进度'}
    >
      {nearby && startIndex > 0 && (
        <li className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-400" aria-label={`前面省略了 ${startIndex} 个阶段`} title={`前面省略了 ${startIndex} 个阶段`}>
          <span aria-hidden="true">… →</span>
        </li>
      )}
      {displayedStages.map((stage) => {
        const index = visibleStages.indexOf(stage);
        const rawState = getWorkflowStepState(visibleStages, currentStage, index);
        const state = (completed || rejected) && rawState === 'current' ? 'complete' : rawState;
        const terminalStage = completed && !rejected && rawState === 'current';
        const rejectedStage = rejected && rawState === 'current';
        const currentTone = CURRENT_TONES[tone] || CURRENT_TONES.active;
        const owner = (stageOwners[stage] || '')
          .replace(/^系统管理员分配\s*·\s*/, '')
          .replace(/专家执行$/, '专家');
        const detail = state === 'complete' ? stageDetails[stage] : '';
        const subtitle = detail || owner;
        return (
          <li
            key={`${stage}-${index}`}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"
            aria-current={state === 'current' ? 'step' : undefined}
            aria-label={`${stage}：${rejectedStage ? '已驳回' : state === 'complete' ? '已完成' : state === 'current' ? '进行中' : '待处理'}${subtitle ? `，${subtitle}` : ''}`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`flex shrink-0 items-center justify-center rounded-full border ${
                  rejectedStage
                    ? 'h-5 w-5 border-[#bd4356] bg-[#bd4356] text-white'
                    : terminalStage
                    ? 'h-5 w-5 border-[#268056] bg-[#268056] text-white'
                    : state === 'complete'
                    ? 'h-5 w-5 border-[#7584A7] bg-[#7584A7] text-white'
                    : state === 'current'
                      ? `h-6 w-6 text-white ring-[3px] ${currentTone.dot}`
                      : 'h-5 w-5 border-[#C7CFDD] bg-white text-[#7D899B]'
                }`}
                aria-hidden="true"
              >
                {rejectedStage ? <XMarkIcon className="h-3.5 w-3.5" /> : state === 'complete' ? <CheckIcon className="h-3.5 w-3.5" /> : state === 'current' ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
              </span>
              <span>
                <span
                  className={`block text-xs ${
                    rejectedStage
                      ? 'font-bold text-[#a52d42]'
                      : terminalStage
                      ? 'font-bold text-[#17603d]'
                      : state === 'current'
                      ? `font-bold ${currentTone.text}`
                      : state === 'complete'
                        ? 'font-semibold text-[#526178]'
                        : 'font-semibold text-[#79869A]'
                  }`}
                >
                  {stage}
                </span>
                {!compact && subtitle && (
                  <span className="mt-0.5 block text-[11px] text-[#8A95A6]">{subtitle}</span>
                )}
              </span>
            </div>
          </li>
        );
      })}
      {nearby && endIndex < visibleStages.length && (
        <li className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-400" aria-label={`后面省略了 ${visibleStages.length - endIndex} 个阶段`} title={`后面省略了 ${visibleStages.length - endIndex} 个阶段`}>
          <span aria-hidden="true">→ …</span>
        </li>
      )}
    </ol>
  );
}
