/**
 * Keep opened nodes in their existing order, then expose every populated reward field.
 * Greedily choose groups covering the most remaining fields to limit overlapping controls.
 */
export const getActiveRewardNodes = <
  T extends { id: string; fields: readonly string[] },
>(
  nodes: readonly T[],
  openedNodeIds: readonly string[],
  hasValue: (field: string) => boolean,
): T[] => {
  const selected = openedNodeIds.flatMap((id) => {
    const node = nodes.find((node) => node.id === id);
    return node ? [node] : [];
  });
  const covered = new Set(selected.flatMap((node) => [...node.fields]));
  const remaining = nodes.filter((node) => !openedNodeIds.includes(node.id));
  /** Count populated fields this group would expose beyond the groups already selected. */
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
