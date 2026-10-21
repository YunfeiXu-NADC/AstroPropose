export function hasObservationFeedback(feedback) {
  if (!feedback || !Object.keys(feedback).length) return false;
  return !(
    feedback.status === 'scheduled'
    && feedback.summary === '已推送观测编排负责人'
    && !feedback.visibility_window
    && !feedback.observation_id
    && !feedback.completed_at
    && !feedback.data_products?.length
  );
}

export function hasFinalObservationFeedback(feedback) {
  return ['completed', 'unable'].includes(feedback?.status)
    && Boolean(String(feedback?.summary || '').trim());
}

export function observationFeedbackLabel(feedback) {
  if (feedback.status === 'data_ready' || feedback.data_products?.length) return '数据已开放';
  if (feedback.status === 'completed') return '观测已完成';
  if (feedback.status === 'unable') return '当前无法执行';
  if (feedback.status === 'scheduled') return '已安排观测';
  return '执行信息已更新';
}
