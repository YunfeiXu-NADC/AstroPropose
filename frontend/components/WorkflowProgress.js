'use client';

import { CheckIcon } from '@heroicons/react/20/solid';

import { getWorkflowStepState } from '@/lib/workflowDisplay.mjs';

export default function WorkflowProgress({ stages = [], currentStage, compact = false }) {
  if (!stages.length) {
    return null;
  }

  return (
    <ol
      className={`flex min-w-0 flex-wrap items-center ${compact ? 'gap-x-3 gap-y-2' : 'gap-4'}`}
      aria-label="提案进度"
    >
      {stages.map((stage, index) => {
        const state = getWorkflowStepState(stages, currentStage, index);
        return (
          <li key={`${stage}-${index}`} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  state === 'complete'
                    ? 'border-[#3347B8] bg-[#3347B8] text-white'
                    : state === 'current'
                      ? 'border-[#3347B8] bg-[#3347B8]/10 text-[#3347B8] ring-2 ring-[#3347B8]/10'
                      : 'border-[#C7CFDD] bg-white text-[#7D899B]'
                }`}
                aria-hidden="true"
              >
                {state === 'complete' ? <CheckIcon className="h-3.5 w-3.5" /> : state === 'current' ? <span className="h-1.5 w-1.5 rounded-full bg-[#3347B8]" /> : null}
              </span>
              <span>
                <span
                  className={`block text-xs font-semibold ${
                    state === 'upcoming' ? 'text-[#79869A]' : 'text-[#152039]'
                  }`}
                >
                  {stage}
                </span>
                {!compact && (
                  <span className="mt-0.5 block text-[11px] text-[#8A95A6]">
                    {state === 'complete' ? '已完成' : state === 'current' ? '进行中' : '待处理'}
                  </span>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
