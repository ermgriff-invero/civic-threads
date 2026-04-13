import type { ApplyThreadStructurePatch, ThreadStructureSnapshot } from "@shared/schema";

export type ThreadStructureValidationResult = {
  ok: boolean;
  errors: string[];
};

type MutableNode = {
  id: string;
  parentId: string | null;
  order: number;
};

function hasCycle(nodes: Map<string, MutableNode>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    const parentId = nodes.get(nodeId)?.parentId;
    if (parentId && nodes.has(parentId) && visit(parentId)) return true;
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  for (const nodeId of Array.from(nodes.keys())) {
    if (visit(nodeId)) return true;
  }
  return false;
}

export function validateThreadStructurePatch(
  snapshot: ThreadStructureSnapshot,
  patch: ApplyThreadStructurePatch
): ThreadStructureValidationResult {
  const nodes = new Map<string, MutableNode>(
    snapshot.nodes.map((node) => [node.id, { ...node }])
  );
  const errors: string[] = [];

  for (const op of patch.operations) {
    if (op.type === "create") {
      if (nodes.has(op.nodeId)) {
        errors.push(`Node '${op.nodeId}' already exists`);
        continue;
      }
      if (op.parentId !== null && !nodes.has(op.parentId)) {
        errors.push(`Parent '${op.parentId}' not found for create '${op.nodeId}'`);
        continue;
      }
      nodes.set(op.nodeId, {
        id: op.nodeId,
        parentId: op.parentId,
        order: op.order,
      });
      continue;
    }

    if (op.type === "move") {
      const existing = nodes.get(op.nodeId);
      if (!existing) {
        errors.push(`Node '${op.nodeId}' not found for move`);
        continue;
      }
      if (op.parentId !== null && !nodes.has(op.parentId)) {
        errors.push(`Parent '${op.parentId}' not found for move '${op.nodeId}'`);
        continue;
      }
      existing.parentId = op.parentId;
      existing.order = op.order;
      continue;
    }

    if (op.type === "delete") {
      if (!nodes.has(op.nodeId)) {
        errors.push(`Node '${op.nodeId}' not found for delete`);
        continue;
      }
      nodes.delete(op.nodeId);
      for (const node of Array.from(nodes.values())) {
        if (node.parentId === op.nodeId) {
          errors.push(`Delete '${op.nodeId}' would orphan child '${node.id}'`);
        }
      }
      continue;
    }

    if (op.type === "update" && !nodes.has(op.nodeId)) {
      errors.push(`Node '${op.nodeId}' not found for update`);
    }
  }

  const roots = Array.from(nodes.values()).filter((node) => node.parentId === null);
  if (nodes.size > 0 && roots.length !== 1) {
    errors.push(`Strict tree requires exactly one root; found ${roots.length}`);
  }

  const siblingKeySeen = new Set<string>();
  for (const node of Array.from(nodes.values())) {
    if (node.parentId !== null && !nodes.has(node.parentId)) {
      errors.push(`Node '${node.id}' has missing parent '${node.parentId}'`);
    }
    const siblingKey = `${node.parentId ?? "root"}:${node.order}`;
    if (siblingKeySeen.has(siblingKey)) {
      errors.push(`Duplicate sibling order '${siblingKey}'`);
    }
    siblingKeySeen.add(siblingKey);
  }

  if (hasCycle(nodes)) {
    errors.push("Cycle detected in strict tree");
  }

  return { ok: errors.length === 0, errors };
}
