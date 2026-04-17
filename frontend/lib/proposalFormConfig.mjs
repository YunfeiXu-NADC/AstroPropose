export function resolveWorkflowNode(definition, stateName) {
  const nodes = definition?.nodes;
  if (!Array.isArray(nodes) || !stateName) {
    return null;
  }

  return nodes.find((node) => node?.data?.label === stateName) || null;
}

export function resolvePhase1TemplateId(definition) {
  const initialState = definition?.initial_state;
  const node = resolveWorkflowNode(definition, initialState);
  return node?.data?.formTemplateId ?? null;
}
