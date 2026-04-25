import { Background, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, type Edge, type Node } from "@xyflow/react";
import { memo, useEffect, useMemo } from "react";
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
  for (let pass = 0; pass < 6; pass += 1) {
    for (let i = 1; i < sortedLayerKeys.length; i += 1) {
      const layer = sortedLayerKeys[i];
      const upper = sortedLayerKeys[i - 1];
      reorderLayerByNeighbors(layer, upper, (id) => dependencyByNode.get(id) ?? []);
    }
    for (let i = sortedLayerKeys.length - 2; i >= 0; i -= 1) {
      const layer = sortedLayerKeys[i];
      const lower = sortedLayerKeys[i + 1];
      reorderLayerByNeighbors(layer, lower, (id) => dependentByNode.get(id) ?? []);
    }
  }

  const yGap = 300;
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
  const boardCenterX = (boardMinCenterX + boardMaxCenterX) / 2;
  const positions = new Map<string, { x: number; y: number }>();

  const spreadByOrder = (ids: string[], gap: number) => {
    const centerIndex = (ids.length - 1) / 2;
    const map = new Map<string, number>();
    ids.forEach((id, index) => {
      map.set(id, boardCenterX + (index - centerIndex) * gap);
    });
    return map;
  };

  const isotonicNonDecreasing = (values: number[]) => {
    type Block = { start: number; end: number; mean: number };
    const blocks: Block[] = [];
    values.forEach((value, index) => {
      blocks.push({ start: index, end: index, mean: value });
      while (blocks.length >= 2) {
        const right = blocks[blocks.length - 1];
        const left = blocks[blocks.length - 2];
        if (left.mean <= right.mean) {
          break;
        }
        const leftCount = left.end - left.start + 1;
        const rightCount = right.end - right.start + 1;
        const mergedMean = (left.mean * leftCount + right.mean * rightCount) / (leftCount + rightCount);
        blocks.splice(blocks.length - 2, 2, {
          start: left.start,
          end: right.end,
          mean: mergedMean
        });
      }
    });
    const result = [...values];
    blocks.forEach((block) => {
      for (let i = block.start; i <= block.end; i += 1) {
        result[i] = block.mean;
      }
    });
    return result;
  };

  const solveLayerCenters = (ids: string[], desiredCenterById: Map<string, number>) => {
    const n = ids.length;
    if (n === 0) {
      return new Map<string, number>();
    }
    const span = boardMaxCenterX - boardMinCenterX;
    const gap = n <= 1 ? 0 : Math.min(minCenterGap, span / (n - 1));

    const desired = ids.map((id) => {
      const x = desiredCenterById.get(id) ?? boardCenterX;
      return Math.min(boardMaxCenterX, Math.max(boardMinCenterX, x));
    });
    const transformed = desired.map((x, i) => x - i * gap);
    const y = isotonicNonDecreasing(transformed);
    const centers = y.map((v, i) => v + i * gap);

    const minDelta = boardMinCenterX - centers[0];
    const maxDelta = boardMaxCenterX - centers[centers.length - 1];
    const delta = Math.min(Math.max(0, minDelta), maxDelta);

    const result = new Map<string, number>();
    ids.forEach((id, i) => {
      result.set(id, centers[i] + delta);
    });
    return result;
  };

  const positioningLayerKeys = [...sortedLayerKeys].reverse();
  positioningLayerKeys.forEach((layer) => {
    const sortedIds = layerOrderMap.get(layer) ?? [];
    if (sortedIds.length === 0) {
      return;
    }

    const desiredCenterX = new Map<string, number>();
    sortedIds.forEach((id) => {
      const dependencies = dependencyByNode.get(id) ?? [];
      const dependencyCenters = dependencies
        .map((depId) => {
          const dep = positions.get(depId);
          return dep ? dep.x + nodeWidth / 2 : undefined;
        })
        .filter((x): x is number => x !== undefined);
      if (dependencyCenters.length > 0) {
        desiredCenterX.set(id, dependencyCenters.reduce((sum, x) => sum + x, 0) / dependencyCenters.length);
      }
    });
    if (desiredCenterX.size === 0) {
      const span = boardMaxCenterX - boardMinCenterX;
      const gap = sortedIds.length <= 1 ? 0 : Math.min(minCenterGap, span / (sortedIds.length - 1));
      spreadByOrder(sortedIds, gap).forEach((x, id) => desiredCenterX.set(id, x));
    } else {
      const span = boardMaxCenterX - boardMinCenterX;
      const gap = sortedIds.length <= 1 ? 0 : Math.min(minCenterGap, span / (sortedIds.length - 1));
      const fallback = spreadByOrder(sortedIds, gap);
      sortedIds.forEach((id) => {
        if (!desiredCenterX.has(id)) {
          desiredCenterX.set(id, fallback.get(id) ?? boardCenterX);
        }
      });
    }
    const alignedCenterX = solveLayerCenters(sortedIds, desiredCenterX);
    sortedIds.forEach((id) => {
      const centerX = alignedCenterX.get(id) ?? boardCenterX;
      positions.set(id, {
        x: centerX - nodeWidth / 2,
        y: 80 + layer * yGap
      });
    });
  });

  return positions;
}

function GraphFitViewEffect({
  layoutKey,
  nodeCount,
  edgeCount
}: {
  layoutKey: number;
  nodeCount: number;
  edgeCount: number;
}) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 300 });
    });
    return () => cancelAnimationFrame(id);
  }, [fitView, layoutKey, nodeCount, edgeCount]);

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
  const layeredPositions = useMemo(() => buildLayeredPositions(technologies, relations), [technologies, relations]);
  const glowIdSet = useMemo(() => new Set(glowingTechnologyIds), [glowingTechnologyIds]);

  const nodes = useMemo<Node<TechnologyNodeData>[]>(
    () =>
      technologies.map((technology) => ({
        id: technology.id,
        type: "technology",
        position: layeredPositions.get(technology.id) ?? technology.layout,
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
    [creatingFromId, glowIdSet, layeredPositions, onCreateDerived, onSelectTechnology, projects, selectedTechnologyId, technologies]
  );

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
        fitViewOptions={{ padding: 0.2 }}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        onPaneClick={onClearSelection}
      >
        <GraphFitViewEffect layoutKey={layoutKey} nodeCount={nodes.length} edgeCount={edges.length} />
        <Controls />
        <Background gap={24} size={1} />
      </ReactFlow>
    </section>
  );
}
