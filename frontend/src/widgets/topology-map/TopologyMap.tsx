import { Background, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, type Edge, type Node } from "@xyflow/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Technology } from "../../entities/technology/model/types";
import type { Project } from "../../entities/project/model/types";
import type { Relation } from "../../entities/technology/model/types";
import { formatHours, formatPercent } from "../../shared/lib/format";
import { getRarityMeta } from "../../shared/lib/rarity";

interface TopologyMapProps {
  technologies: Technology[];
  relations: Relation[];
  projects: Project[];
  selectedTechnologyId: string | null;
  onSelectTechnology: (technologyId: string) => void;
  onClearSelection: () => void;
  onCreateDerived: (parentId: string) => void | Promise<void>;
  creatingFromId: string | null;
  glowingTechnologyIds: string[];
  /** 在创建/删除节点等结构变化后自增，用于触发布局后的 fitView */
  layoutKey: number;
}

interface TechnologyNodeData {
  technology: Technology;
  projectCount: number;
  isSelected: boolean;
  onSelect: (technologyId: string) => void;
  onCreateDerived: (parentId: string) => void | Promise<void>;
  creatingFromId: string | null;
  isGlowing: boolean;
  [key: string]: unknown;
}

function TimeStatIcon() {
  return (
    <svg className="tech-node__stat-icon-svg" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.8V8h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ProjectStatIcon() {
  return (
    <svg className="tech-node__stat-icon-svg" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

const TechnologyNodeCard = memo(({ data }: { data: TechnologyNodeData }) => {
  const { technology, projectCount, isSelected, onSelect, onCreateDerived, creatingFromId, isGlowing } = data;
  const rarity = getRarityMeta(technology.rarity_index);
  const isCreating = creatingFromId === technology.id;

  return (
    <>
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
      <div className="tech-node-wrap">
        <div className="tech-node__add-bar">
          <button
            type="button"
            className="tech-node__add-btn"
            disabled={isCreating}
            title="在依赖上一层新建节点"
            aria-label="在依赖上一层新建节点"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              if (!isCreating) {
                void onCreateDerived(technology.id);
              }
            }}
          >
            {isCreating ? "…" : "+"}
          </button>
        </div>
        <button
          type="button"
          className={`tech-node tech-node--${rarity.tier} ${isSelected ? "tech-node--selected" : ""} ${isGlowing ? "tech-node--glow" : ""}`}
          onClick={() => onSelect(technology.id)}
        >
          <div className="tech-node__top">
            <span className="tech-node__name">{technology.name}</span>
            <span className={`tech-node__rarity-pct rarity-text--${rarity.colorToken}`} title="稀有度">
              {formatPercent(technology.rarity_index)}
            </span>
          </div>
          <div className="tech-node__art" aria-label="卡面插图预留" role="img" />
          <div className="tech-node__stats">
            <div className="tech-node__stat-chip">
              <span className="tech-node__stat-value">{formatHours(technology.time_spent_hours)}</span>
              <span className="tech-node__stat-icon">
                <TimeStatIcon />
              </span>
            </div>
            <div className="tech-node__stat-chip">
              <span className="tech-node__stat-value">{projectCount}</span>
              <span className="tech-node__stat-icon">
                <ProjectStatIcon />
              </span>
            </div>
          </div>
        </button>
      </div>
      <Handle type="source" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
    </>
  );
});

const nodeTypes = { technology: TechnologyNodeCard };

function buildLayeredPositions(technologies: Technology[], relations: Relation[]): Map<string, { x: number; y: number }> {
  const nodeIds = technologies.map((technology) => technology.id);
  const dependencyRelations = relations.filter((relation) => relation.relation_type === "dependency");
  const indegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const adjacency = new Map<string, string[]>(nodeIds.map((id) => [id, []]));

  dependencyRelations.forEach((relation) => {
    if (!adjacency.has(relation.source_id) || !indegree.has(relation.target_id)) {
      return;
    }
    adjacency.get(relation.source_id)?.push(relation.target_id);
    indegree.set(relation.target_id, (indegree.get(relation.target_id) ?? 0) + 1);
  });

  const queue = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const depth = new Map<string, number>(nodeIds.map((id) => [id, 0]));

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const currentDepth = depth.get(current) ?? 0;
    const neighbors = adjacency.get(current) ?? [];

    neighbors.forEach((next) => {
      depth.set(next, Math.max(depth.get(next) ?? 0, currentDepth + 1));
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if ((indegree.get(next) ?? 0) === 0) {
        queue.push(next);
      }
    });
  }

  const maxDepth = Math.max(...depth.values(), 0);
  const layers = new Map<number, string[]>();
  technologies.forEach((technology) => {
    const visualLayer = maxDepth - (depth.get(technology.id) ?? 0);
    const current = layers.get(visualLayer) ?? [];
    current.push(technology.id);
    layers.set(visualLayer, current);
  });

  const layerOrderMap = new Map<number, string[]>();
  [...layers.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([layer, ids]) => {
      layerOrderMap.set(layer, [...ids].sort((a, b) => a.localeCompare(b)));
    });

  const dependencyByNode = new Map<string, string[]>();
  const dependentByNode = new Map<string, string[]>();
  nodeIds.forEach((id) => {
    dependencyByNode.set(id, []);
    dependentByNode.set(id, []);
  });
  dependencyRelations.forEach((relation) => {
    dependencyByNode.get(relation.target_id)?.push(relation.source_id);
    dependentByNode.get(relation.source_id)?.push(relation.target_id);
  });

  const computeDownstreamHeight = () => {
    const memo = new Map<string, number>();
    const visiting = new Set<string>();
    const dfs = (nodeId: string): number => {
      if (memo.has(nodeId)) {
        return memo.get(nodeId) ?? 0;
      }
      if (visiting.has(nodeId)) {
        return 0;
      }
      visiting.add(nodeId);
      const children = dependentByNode.get(nodeId) ?? [];
      const value =
        children.length === 0
          ? 0
          : 1 +
            children.reduce((maxDepth, childId) => {
              return Math.max(maxDepth, dfs(childId));
            }, 0);
      visiting.delete(nodeId);
      memo.set(nodeId, value);
      return value;
    };
    nodeIds.forEach((id) => {
      dfs(id);
    });
    return memo;
  };
  const downstreamHeightByNode = computeDownstreamHeight();

  // Default order: deeper chain first (left), then id.
  [...layerOrderMap.entries()].forEach(([layer, ids]) => {
    layerOrderMap.set(
      layer,
      [...ids].sort((a, b) => {
        const depthDiff = (downstreamHeightByNode.get(b) ?? 0) - (downstreamHeightByNode.get(a) ?? 0);
        return depthDiff !== 0 ? depthDiff : a.localeCompare(b);
      })
    );
  });

  const resolveIndexMap = (ids: string[]) => new Map(ids.map((id, idx) => [id, idx]));

  const reorderLayerByNeighbors = (
    layer: number,
    neighborLayer: number,
    getNeighbors: (id: string) => string[]
  ) => {
    const current = layerOrderMap.get(layer);
    const neighbors = layerOrderMap.get(neighborLayer);
    if (!current || !neighbors || current.length <= 1) {
      return;
    }
    const neighborIndex = resolveIndexMap(neighbors);
    const currentIndex = resolveIndexMap(current);
    const decorated = current.map((id) => {
      const refs = getNeighbors(id).filter((neighborId) => neighborIndex.has(neighborId));
      if (refs.length === 0) {
        return { id, barycenter: Number.POSITIVE_INFINITY, fallback: currentIndex.get(id) ?? 0 };
      }
      const barycenter = refs.reduce((sum, ref) => sum + (neighborIndex.get(ref) ?? 0), 0) / refs.length;
      return { id, barycenter, fallback: currentIndex.get(id) ?? 0 };
    });
    decorated.sort((a, b) => {
      if (a.barycenter === b.barycenter) {
        const depthDiff = (downstreamHeightByNode.get(b.id) ?? 0) - (downstreamHeightByNode.get(a.id) ?? 0);
        if (depthDiff !== 0) {
          return depthDiff;
        }
        return a.fallback - b.fallback;
      }
      return a.barycenter - b.barycenter;
    });
    layerOrderMap.set(
      layer,
      decorated.map((item) => item.id)
    );
  };

  const sortedLayerKeys = [...layerOrderMap.keys()].sort((a, b) => a - b);

  // Count edge crossings between every pair of adjacent layers.
  // An edge from v (upper layer, pos p1) to u (lower layer, pos p2) crosses
  // an edge from x (upper, pos q1) to y (lower, pos q2) iff p1 < q1 but p2 > q2.
  const countCrossings = (): number => {
    let total = 0;
    for (let i = 0; i < sortedLayerKeys.length - 1; i++) {
      const upperKey = sortedLayerKeys[i];
      const lowerKey = sortedLayerKeys[i + 1];
      const upperIds = layerOrderMap.get(upperKey) ?? [];
      const lowerIds = layerOrderMap.get(lowerKey) ?? [];
      const upperPos = new Map(upperIds.map((id, p) => [id, p] as [string, number]));
      const lowerPos = new Map(lowerIds.map((id, p) => [id, p] as [string, number]));
      // Edges go from a node v in the upper layer to a node u in the lower layer
      // when u is a dependency of v (dependencyByNode[v] contains u).
      const edges: [number, number][] = [];
      upperIds.forEach((v) => {
        (dependencyByNode.get(v) ?? []).forEach((u) => {
          if (lowerPos.has(u)) edges.push([upperPos.get(v)!, lowerPos.get(u)!]);
        });
      });
      for (let e1 = 0; e1 < edges.length; e1++) {
        for (let e2 = e1 + 1; e2 < edges.length; e2++) {
          const [a1, b1] = edges[e1];
          const [a2, b2] = edges[e2];
          if ((a1 < a2 && b1 > b2) || (a1 > a2 && b1 < b2)) total++;
        }
      }
    }
    return total;
  };

  const snapshotOrdering = (): Map<number, string[]> => {
    const snap = new Map<number, string[]>();
    layerOrderMap.forEach((ids, l) => snap.set(l, [...ids]));
    return snap;
  };

  let bestOrdering = snapshotOrdering();
  let minCrossings = countCrossings();

  for (let pass = 0; pass < 20; pass++) {
    // Downsweep (top → bottom): order layer[i] by connections to layer[i-1] (above).
    // Nodes above v are in dependentByNode[v] (things that depend on v).
    for (let i = 1; i < sortedLayerKeys.length; i++) {
      const layer = sortedLayerKeys[i];
      const upper = sortedLayerKeys[i - 1];
      reorderLayerByNeighbors(layer, upper, (id) => dependentByNode.get(id) ?? []);
    }
    // Upsweep (bottom → top): order layer[i] by connections to layer[i+1] (below).
    // Nodes below v are in dependencyByNode[v] (what v depends on).
    for (let i = sortedLayerKeys.length - 2; i >= 0; i--) {
      const layer = sortedLayerKeys[i];
      const lower = sortedLayerKeys[i + 1];
      reorderLayerByNeighbors(layer, lower, (id) => dependencyByNode.get(id) ?? []);
    }
    const c = countCrossings();
    if (c < minCrossings) {
      minCrossings = c;
      bestOrdering = snapshotOrdering();
    }
    if (minCrossings === 0) break;
  }
  // Apply the best ordering found across all iterations.
  bestOrdering.forEach((ids, layer) => layerOrderMap.set(layer, ids));

  const layerCount = sortedLayerKeys.length;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
  const topOffset = 80;
  const bottomPadding = 48;
  const usableHeight = Math.max(400, viewportHeight - topOffset - bottomPadding);
  // 卡片本体 min-height ~248px + 顶部「+」条，层距过小会导致层与层视觉上叠在一起
  const minYGap = 300;
  const maxYGap = 360;
  const yGap =
    layerCount <= 1
      ? minYGap
      : Math.max(
          minYGap,
          Math.min(maxYGap, Math.ceil(usableHeight / Math.max(1, layerCount - 1)))
        );
  const nodeWidth = 160;
  const minNodeGap = 20;
  const minCenterGap = nodeWidth + minNodeGap;
  const boardPaddingX = 40;
  const widestLayerNodeCount = Math.max(...sortedLayerKeys.map((layer) => (layerOrderMap.get(layer) ?? []).length), 1);
  const boardWidth = Math.max(1200, widestLayerNodeCount * nodeWidth + (widestLayerNodeCount - 1) * minNodeGap + boardPaddingX * 2);
  const boardMinX = boardPaddingX;
  const boardMaxX = boardWidth - nodeWidth - boardPaddingX;
  const boardMinCenterX = boardMinX + nodeWidth / 2;
  const boardMaxCenterX = boardMaxX + nodeWidth / 2;
  // ── Brandes-Köpf X-coordinate assignment ──────────────────────────────────────
  //
  // The algorithm runs in three phases per direction, then balances 4 results:
  //   1. Vertical alignment  — group nodes into blocks that should share one x.
  //   2. Block-graph compaction — assign x to each block root while respecting
  //      the minimum spacing between blocks in the same layer.
  //   3. Normalization + balance — align the 4 coordinate systems, then take the
  //      median (avg of 2nd & 3rd of 4 sorted values) for each node.

  // --- Phase 1: Vertical alignment for one direction ---
  // topToBottom: sweep layers in ascending index order (visually top → bottom).
  // leftToRight: process nodes left → right within each layer.
  // Returns: root map (block representative for each node).
  const bkAlign = (topToBottom: boolean, leftToRight: boolean): Map<string, string> => {
    const root = new Map<string, string>();
    const align = new Map<string, string>();
    sortedLayerKeys.forEach((layer) => {
      (layerOrderMap.get(layer) ?? []).forEach((id) => {
        root.set(id, id);
        align.set(id, id);
      });
    });

    const layerSeq = topToBottom ? sortedLayerKeys : [...sortedLayerKeys].reverse();
    for (let li = 1; li < layerSeq.length; li++) {
      const curLayer = layerSeq[li];
      const refLayer = layerSeq[li - 1];
      const curNodes = layerOrderMap.get(curLayer) ?? [];
      const refNodes = layerOrderMap.get(refLayer) ?? [];
      const refPos = new Map(refNodes.map((id, i) => [id, i] as [string, number]));
      // r: right-barrier (leftToRight) or left-barrier (rightToLeft) — prevents
      // a new alignment from crossing a previously committed one in the ref layer.
      let r = leftToRight ? -1 : refNodes.length;
      const ordered = leftToRight ? curNodes : [...curNodes].reverse();

      for (const v of ordered) {
        // topToBottom: ref is visually above v → v's neighbors there are dependentByNode[v]
        //              (nodes that depend on v, which sit in the upper layers).
        // bottomToTop: ref is visually below v → v's neighbors there are dependencyByNode[v].
        const nbArr = topToBottom ? (dependentByNode.get(v) ?? []) : (dependencyByNode.get(v) ?? []);
        const upper = nbArr
          .filter((u) => refPos.has(u))
          .sort((a, b) => refPos.get(a)! - refPos.get(b)!);
        const d = upper.length;
        if (d === 0) continue;

        const m1 = Math.floor((d - 1) / 2);
        const m2 = Math.floor(d / 2);
        // Try median candidates; for leftToRight prefer the left (smaller) median first.
        const medians = m1 === m2 ? [m1] : leftToRight ? [m1, m2] : [m2, m1];

        for (const mi of medians) {
          if (align.get(v) !== v) break; // v already committed to an alignment
          const u = upper[mi];
          const up = refPos.get(u)!;
          if (leftToRight ? up > r : up < r) {
            align.set(u, v);
            root.set(v, root.get(u)!);
            align.set(v, root.get(v)!);
            r = up;
          }
        }
      }
    }
    return root;
  };

  // --- Phase 2: Build block constraint graph ---
  // Each block root is a node. An edge rootA → rootB (weight = minCenterGap) means
  // rootA must be at least minCenterGap to the left of rootB (for leftToRight).
  const buildBlockGraph = (
    root: Map<string, string>,
    leftToRight: boolean
  ): Map<string, Array<{ to: string; minSep: number }>> => {
    const graph = new Map<string, Array<{ to: string; minSep: number }>>();
    sortedLayerKeys.forEach((k) => {
      (layerOrderMap.get(k) ?? []).forEach((v) => {
        const r = root.get(v)!;
        if (!graph.has(r)) graph.set(r, []);
      });
    });

    sortedLayerKeys.forEach((layerKey) => {
      const nodes = layerOrderMap.get(layerKey) ?? [];
      const ordered = leftToRight ? nodes : [...nodes].reverse();
      for (let i = 1; i < ordered.length; i++) {
        const rootLeft = root.get(ordered[i - 1])!;
        const rootRight = root.get(ordered[i])!;
        if (rootLeft === rootRight) continue;
        const edges = graph.get(rootLeft)!;
        const existing = edges.find((e) => e.to === rootRight);
        if (existing) {
          existing.minSep = Math.max(existing.minSep, minCenterGap);
        } else {
          edges.push({ to: rootRight, minSep: minCenterGap });
        }
      }
    });
    return graph;
  };

  // Assign x to block roots by topologically traversing the constraint graph.
  const assignBlockX = (
    blockGraph: Map<string, Array<{ to: string; minSep: number }>>,
    leftToRight: boolean
  ): Map<string, number> => {
    const blockX = new Map<string, number>();
    const inDeg = new Map<string, number>();
    [...blockGraph.keys()].forEach((r) => inDeg.set(r, 0));
    blockGraph.forEach((edges) => {
      edges.forEach(({ to }) => inDeg.set(to, (inDeg.get(to) ?? 0) + 1));
    });

    const queue = [...blockGraph.keys()].filter((r) => (inDeg.get(r) ?? 0) === 0);
    for (let qi = 0; qi < queue.length; qi++) {
      const r = queue[qi];
      if (!blockX.has(r)) {
        blockX.set(r, leftToRight ? boardMinCenterX : boardMaxCenterX);
      }
      for (const { to, minSep } of blockGraph.get(r) ?? []) {
        const proposed = leftToRight ? blockX.get(r)! + minSep : blockX.get(r)! - minSep;
        const cur = blockX.get(to);
        blockX.set(
          to,
          cur === undefined ? proposed : leftToRight ? Math.max(cur, proposed) : Math.min(cur, proposed)
        );
        inDeg.set(to, inDeg.get(to)! - 1);
        if (inDeg.get(to) === 0) queue.push(to);
      }
    }
    // Fallback for block roots not reachable (rare, e.g. if a cycle slipped through).
    [...blockGraph.keys()].forEach((r) => {
      if (!blockX.has(r)) blockX.set(r, leftToRight ? boardMinCenterX : boardMaxCenterX);
    });
    return blockX;
  };

  // --- Run BK in all 4 directions ---
  type BKDir = { topToBottom: boolean; leftToRight: boolean };
  const bkDirections: BKDir[] = [
    { topToBottom: true, leftToRight: true },   // TL
    { topToBottom: true, leftToRight: false },  // TR
    { topToBottom: false, leftToRight: true },  // BL
    { topToBottom: false, leftToRight: false }, // BR
  ];

  const bkLayouts = bkDirections.map(({ topToBottom, leftToRight }) => {
    const root = bkAlign(topToBottom, leftToRight);
    const blockGraph = buildBlockGraph(root, leftToRight);
    const blockX = assignBlockX(blockGraph, leftToRight);
    const result = new Map<string, number>();
    sortedLayerKeys.forEach((k) => {
      (layerOrderMap.get(k) ?? []).forEach((v) => {
        result.set(v, blockX.get(root.get(v)!) ?? (leftToRight ? boardMinCenterX : boardMaxCenterX));
      });
    });
    return result;
  });

  // --- Phase 3: Normalize then balance ---
  // Shift each layout into a common coordinate frame before averaging:
  //   left-biased  (leftToRight=true)  → min x = boardMinCenterX
  //   right-biased (leftToRight=false) → max x = boardMaxCenterX
  const normalizedBkLayouts = bkLayouts.map((layout, i) => {
    const ltr = bkDirections[i].leftToRight;
    const allIds = [...layout.keys()];
    if (allIds.length === 0) return layout;
    const normalized = new Map<string, number>();
    if (ltr) {
      const minX = Math.min(...allIds.map((id) => layout.get(id) ?? boardMinCenterX));
      const delta = boardMinCenterX - minX;
      allIds.forEach((id) => normalized.set(id, (layout.get(id) ?? boardMinCenterX) + delta));
    } else {
      const maxX = Math.max(...allIds.map((id) => layout.get(id) ?? boardMaxCenterX));
      const delta = boardMaxCenterX - maxX;
      allIds.forEach((id) => normalized.set(id, (layout.get(id) ?? boardMaxCenterX) + delta));
    }
    return normalized;
  });

  // Grid-aligned final positioning.
  //
  // BK determines the ORDER of nodes within each layer (via barycenter + alignment).
  // For the actual x coordinates we use a uniform grid (all gaps = minCenterGap),
  // anchored at the layer's "center of mass" derived from the 4 BK layouts.
  // This eliminates the large, unnecessary gaps that isotonic regression leaves
  // when two consecutive nodes happen to want very different x positions.
  const positions = new Map<string, { x: number; y: number }>();
  sortedLayerKeys.forEach((layer) => {
    const sortedIds = layerOrderMap.get(layer) ?? [];
    const n = sortedIds.length;
    if (n === 0) return;

    // For each node, take the median of its 4 BK candidate x values.
    // The median is influenced by parent/child alignment from the BK step.
    const bkX = sortedIds.map((id) => {
      const xs = normalizedBkLayouts.map((l) => l.get(id) ?? boardMinCenterX);
      xs.sort((a, b) => a - b);
      const raw = (xs[1] + xs[2]) / 2;
      return Math.min(boardMaxCenterX, Math.max(boardMinCenterX, raw));
    });

    // The layer's anchor is the center of mass of all BK positions.
    // This keeps the group close to where its parent/child connections suggest,
    // without letting individual outliers create large intra-layer gaps.
    const bkCenter = bkX.reduce((s, x) => s + x, 0) / n;

    // Place all n nodes on a uniform grid of step minCenterGap,
    // centred at bkCenter, then clamp the group inside the board.
    const halfSpan = ((n - 1) / 2) * minCenterGap;
    const startCX = Math.max(
      boardMinCenterX,
      Math.min(boardMaxCenterX - (n - 1) * minCenterGap, bkCenter - halfSpan)
    );

    sortedIds.forEach((id, i) => {
      positions.set(id, {
        x: startCX + i * minCenterGap - nodeWidth / 2,
        y: 80 + layer * yGap,
      });
    });
  });

  return positions;
}

function GraphFitViewEffect({
  layoutKey,
  nodeCount,
  hasComputedLayout
}: {
  layoutKey: number;
  nodeCount: number;
  hasComputedLayout: boolean;
}) {
  const { fitView } = useReactFlow();
  const hasFittedInitiallyRef = useRef(false);
  const lastFittedLayoutKeyRef = useRef<number | null>(null);

  useEffect(() => {
    if (nodeCount === 0 || !hasComputedLayout) {
      return;
    }
    const shouldFit = !hasFittedInitiallyRef.current || lastFittedLayoutKeyRef.current !== layoutKey;
    if (!shouldFit) {
      return;
    }
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 300, minZoom: 0.05 });
      hasFittedInitiallyRef.current = true;
      lastFittedLayoutKeyRef.current = layoutKey;
    });
    return () => cancelAnimationFrame(id);
  }, [fitView, hasComputedLayout, layoutKey, nodeCount]);

  return null;
}

export function TopologyMap({
  technologies,
  relations,
  projects,
  selectedTechnologyId,
  onSelectTechnology,
  onClearSelection,
  onCreateDerived,
  creatingFromId,
  glowingTechnologyIds,
  layoutKey
}: TopologyMapProps) {
  const [layeredPositions, setLayeredPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const hasInitializedLayoutRef = useRef(false);
  const lastAppliedLayoutKeyRef = useRef<number | null>(null);
  const glowIdSet = useMemo(() => new Set(glowingTechnologyIds), [glowingTechnologyIds]);
  const hasComputedLayout = technologies.length > 0 && layeredPositions.size === technologies.length;

  useEffect(() => {
    if (hasInitializedLayoutRef.current || technologies.length === 0) {
      return;
    }
    hasInitializedLayoutRef.current = true;
    lastAppliedLayoutKeyRef.current = layoutKey;
    setLayeredPositions(buildLayeredPositions(technologies, relations));
  }, [layoutKey, relations, technologies]);

  useEffect(() => {
    if (!hasInitializedLayoutRef.current) {
      return;
    }
    if (lastAppliedLayoutKeyRef.current === layoutKey) {
      return;
    }
    lastAppliedLayoutKeyRef.current = layoutKey;
    setLayeredPositions(buildLayeredPositions(technologies, relations));
  }, [layoutKey, relations, technologies]);

  // For nodes not yet in layeredPositions (newly created, layout not re-run),
  // compute a non-overlapping placeholder position rather than falling back to
  // the raw technology.layout which often overlaps existing nodes.
  const displayPositions = useMemo(() => {
    const result = new Map(layeredPositions);
    const newNodes = technologies.filter((t) => !layeredPositions.has(t.id));
    if (newNodes.length === 0) return result;

    const nodeWidth = 160;
    const minNodeGap = 20;
    const nodeSpacing = nodeWidth + minNodeGap;
    const boardMinX = 40;

    // Group existing positions by rounded y-coordinate.
    const yToXList = new Map<number, number[]>();
    result.forEach(({ x, y }) => {
      const ry = Math.round(y);
      if (!yToXList.has(ry)) yToXList.set(ry, []);
      yToXList.get(ry)!.push(x);
    });

    // Estimate yGap from the sorted unique y-values.
    const yValues = [...yToXList.keys()].sort((a, b) => a - b);
    const yGap = yValues.length > 1 ? yValues[1] - yValues[0] : 300;

    for (const newNode of newNodes) {
      // Find the parent: a dependency relation where this node is the dependent (target).
      // In the relation schema: source_id = the dependency (parent), target_id = the dependent.
      const parentRelation = relations.find(
        (r) => r.relation_type === "dependency" && r.target_id === newNode.id && result.has(r.source_id)
      );
      const parentPos = parentRelation ? result.get(parentRelation.source_id) : null;

      // The new node should appear one visual layer ABOVE its parent (smaller y).
      // If no parent found, place it above the current topmost layer.
      const targetY = parentPos !== null && parentPos !== undefined
        ? Math.round(parentPos.y - yGap)
        : (yValues.length > 0 ? yValues[0] - yGap : 80);

      const roundedTargetY = Math.round(targetY);

      // Find the first un-occupied horizontal slot (left-to-right).
      const occupiedX = [...(yToXList.get(roundedTargetY) ?? [])].sort((a, b) => a - b);
      let candidateX = boardMinX;
      for (const ox of occupiedX) {
        if (candidateX + nodeWidth + minNodeGap <= ox) break; // gap found before ox
        candidateX = ox + nodeSpacing;
      }

      result.set(newNode.id, { x: candidateX, y: targetY });

      // Register so subsequent new nodes in the same pass avoid this slot.
      if (!yToXList.has(roundedTargetY)) yToXList.set(roundedTargetY, []);
      yToXList.get(roundedTargetY)!.push(candidateX);
    }

    return result;
  }, [layeredPositions, relations, technologies]);

  const nodes = useMemo<Node<TechnologyNodeData>[]>(
    () =>
      technologies.map((technology) => ({
        id: technology.id,
        type: "technology",
        position: displayPositions.get(technology.id) ?? technology.layout,
        data: {
          technology,
          projectCount: projects.filter((project) => project.associated_tech.includes(technology.id)).length,
          isSelected: selectedTechnologyId === technology.id,
          isGlowing: glowIdSet.has(technology.id),
          onSelect: onSelectTechnology,
          onCreateDerived,
          creatingFromId
        },
        draggable: false,
        sourcePosition: Position.Top,
        targetPosition: Position.Bottom
      })),
    [creatingFromId, glowIdSet, displayPositions, onCreateDerived, onSelectTechnology, projects, selectedTechnologyId, technologies]
  );

  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }
    const layerMap = new Map<number, { y: number; nodeCount: number }>();
    nodes.forEach((node) => {
      const key = Math.round(node.position.y);
      const prev = layerMap.get(key);
      if (prev) {
        prev.nodeCount += 1;
      } else {
        layerMap.set(key, { y: node.position.y, nodeCount: 1 });
      }
    });
    const layers = [...layerMap.values()].sort((a, b) => a.y - b.y);
    const minY = layers[0]?.y ?? 0;
    const maxY = layers[layers.length - 1]?.y ?? 0;
    const estimatedTotalHeight = maxY - minY + 320;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
    // eslint-disable-next-line no-console
    console.table(
      layers.map((layer, index) => ({
        layer: index,
        y: Math.round(layer.y),
        nodeCount: layer.nodeCount
      }))
    );
    // eslint-disable-next-line no-console
    console.info("[TopologyMap] height-check", {
      estimatedTotalHeight: Math.round(estimatedTotalHeight),
      viewportHeight,
      overflow: estimatedTotalHeight > viewportHeight
    });
  }, [nodes]);

  const edges = useMemo<Edge[]>(
    () =>
      relations
        .filter((relation) => relation.relation_type === "dependency")
        .map((relation) => ({
        id: `${relation.source_id}-${relation.target_id}`,
        source: relation.source_id,
        target: relation.target_id,
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: undefined
      })),
    [relations]
  );

  return (
    <section className="map-panel">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.05}
        fitViewOptions={{ padding: 0.2, minZoom: 0.05 }}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        onPaneClick={onClearSelection}
      >
        <GraphFitViewEffect layoutKey={layoutKey} nodeCount={nodes.length} hasComputedLayout={hasComputedLayout} />
        <Controls />
        <Background gap={24} size={1} />
      </ReactFlow>
    </section>
  );
}
