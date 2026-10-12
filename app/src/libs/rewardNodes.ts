/** Show explicitly added nodes and enough existing groups to expose every saved reward. */
export const getActiveRewardNodes = <
  T extends { id: string; fields: readonly string[] },
>(
  nodes: readonly T[],
  addedNodeIds: readonly string[],
  hasValue: (field: string) => boolean,
): T[] => {
  const selected = nodes.filter((node) => addedNodeIds.includes(node.id));
  const covered = new Set(selected.flatMap((node) => [...node.fields]));
  const remaining = nodes.filter((node) => !addedNodeIds.includes(node.id));
  const uncoveredCount = (node: T) =>
    node.fields.filter((field) => hasValue(field) && !covered.has(field)).length;
  while (remaining.length > 0) {
    remaining.sort((a, b) => uncoveredCount(b) - uncoveredCount(a));
    const node = remaining.shift();
    if (!node || uncoveredCount(node) === 0) break;
    selected.push(node);
    for (const field of node.fields) covered.add(field);
  }
  return selected;
};
