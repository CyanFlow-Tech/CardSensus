import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type NodeChange,
  useEdgesState,
  useReactFlow,
  ViewportPortal,
  type Edge,
  type Node
} from "@xyflow/react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { Technology } from "../../entities/technology/model/types";
import type { Project } from "../../entities/project/model/types";
import type { Relation } from "../../entities/technology/model/types";
import { formatHours, formatPercent } from "../../shared/lib/format";
import { getRarityMeta } from "../../shared/lib/rarity";
import { resolveApiAssetUrl } from "../../shared/api/http";

type DependencyEdgeData = { dependencySourceId: string; dependencyTargetId: string };

interface TopologyMapProps {
  technologies: Technology[];
  relations: Relation[];
  projects: Project[];
  selectedTechnologyId: string | null;
  onSelectTechnology: (technologyId: string) => void;
  onClearSelection: () => void;
  onCreateDerived: (parentId: string) => void | Promise<void>;
  onCreateDependency: (dependencyId: string, dependentId: string) => void | Promise<void>;
  onDeleteDependency: (dependencyId: string, dependentId: string) => void | Promise<void>;
  isDependencyLinkAllowed: (dependencyId: string, dependentId: string) => boolean;
  creatingFromId: string | null;
  glowingTechnologyIds: string[];
  editable?: boolean;
  onUpdateTechnologyLayout?: (technologyId: string, position: { x: number; y: number }) => void | Promise<void>;
  /** 在创建/删除卡牌等结构变化后自增，用于触发布局后的 fitView */
  layoutKey: number;
}

interface TechnologyNodeData {
  technology: Technology;
  projectCount: number;
  isSelected: boolean;
  onSelect: (technologyId: string) => void;
  onCreateDerived: (parentId: string) => void | Promise<void>;
  onStartDependencyDrag: (technologyId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  creatingFromId: string | null;
  isGlowing: boolean;
  isDependencyDragSource: boolean;
  isDependencyDropTarget: boolean;
  editable: boolean;
  [key: string]: unknown;
}

interface DependencyDragState {
  dependentId: string;
  /** 视口（client）坐标，供 screenToFlowPosition 转换 */
  sourceClient: { x: number; y: number };
  currentClient: { x: number; y: number };
}

function DependencyDraftOverlay({ drag }: { drag: DependencyDragState | null }) {
  const { screenToFlowPosition } = useReactFlow();
  if (!drag) {
    return null;
  }
  const src = screenToFlowPosition({ x: drag.sourceClient.x, y: drag.sourceClient.y });
  const cur = screenToFlowPosition({ x: drag.currentClient.x, y: drag.currentClient.y });
  const bend = 48;
  const d = `M ${src.x} ${src.y} C ${src.x} ${src.y + bend}, ${cur.x} ${cur.y - bend}, ${cur.x} ${cur.y}`;
  return (
    <ViewportPortal>
      <svg className="map-panel__link-draft" aria-hidden>
        <path d={d} />
      </svg>
    </ViewportPortal>
  );
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
  const {
    technology,
    projectCount,
    isSelected,
    onSelect,
    onCreateDerived,
    onStartDependencyDrag,
    creatingFromId,
    isGlowing,
    isDependencyDragSource,
    isDependencyDropTarget,
    editable
  } = data;
  const rarity = getRarityMeta(technology.rarity_index);
  const isCreating = creatingFromId === technology.id;

  return (
    <>
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
      <div className="tech-node-wrap" data-tech-node-id={technology.id}>
        {editable ? (
          <div className="tech-node__add-bar">
            <button
              type="button"
              className="tech-node__add-btn"
              disabled={isCreating}
              title="在依赖上一层新建卡牌"
              aria-label="在依赖上一层新建卡牌"
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
        ) : null}
        <button
          type="button"
          className={`tech-node tech-node--drag-handle tech-node--${rarity.tier} ${isSelected ? "tech-node--selected" : ""} ${isGlowing ? "tech-node--glow" : ""} ${isDependencyDropTarget ? "tech-node--link-target" : ""}`}
          onClick={() => onSelect(technology.id)}
        >
          <div className="tech-node__top">
            <span className="tech-node__name">{technology.name}</span>
            <span className={`tech-node__rarity-pct rarity-text--${rarity.colorToken}`} title="稀有度">
              {formatPercent(technology.rarity_index)}
            </span>
          </div>
          <div className="tech-node__art" aria-label="卡面插图" role="img">
            {technology.image_url ? (
              <img
                className="tech-node__art-image"
                src={resolveApiAssetUrl(technology.image_url)}
                alt={`${technology.name} 卡面`}
              />
            ) : null}
          </div>
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
        {editable ? (
          <div className={`tech-node__link-zone ${isDependencyDragSource ? "tech-node__link-zone--active" : ""}`}>
            <button
              type="button"
              className={`tech-node__link-anchor ${isDependencyDragSource ? "tech-node__link-anchor--active" : ""}`}
              title="拖拽创建依赖关系"
              aria-label="拖拽创建依赖关系"
              onPointerDown={(event) => {
                onStartDependencyDrag(technology.id, event);
              }}
            />
          </div>
        ) : null}
      </div>
      <Handle type="source" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
    </>
  );
});

const nodeTypes = { technology: TechnologyNodeCard };

function GraphFitViewEffect({
  layoutKey,
  nodeCount,
  hasComputedLayout,
  onFitStart,
  onFitComplete
}: {
  layoutKey: number;
  nodeCount: number;
  hasComputedLayout: boolean;
  onFitStart: () => void;
  onFitComplete: () => void;
}) {
  const { fitView } = useReactFlow();
  const hasFittedInitiallyRef = useRef(false);
  const lastFittedLayoutKeyRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (nodeCount === 0 || !hasComputedLayout) {
      onFitComplete();
      return;
    }
    const shouldFit = !hasFittedInitiallyRef.current || lastFittedLayoutKeyRef.current !== layoutKey;
    if (!shouldFit) {
      return;
    }

    onFitStart();
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 300, minZoom: 0.05 })
        .then(() => {
          if (!cancelled) {
            hasFittedInitiallyRef.current = true;
            lastFittedLayoutKeyRef.current = layoutKey;
            onFitComplete();
          }
        })
        .catch(() => {
          if (!cancelled) {
            hasFittedInitiallyRef.current = true;
            lastFittedLayoutKeyRef.current = layoutKey;
            onFitComplete();
          }
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [fitView, hasComputedLayout, layoutKey, nodeCount, onFitComplete, onFitStart]);

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
  onCreateDependency,
  onDeleteDependency,
  isDependencyLinkAllowed,
  creatingFromId,
  glowingTechnologyIds,
  editable = true,
  onUpdateTechnologyLayout,
  layoutKey
}: TopologyMapProps) {
  const [viewportReady, setViewportReady] = useState(() => technologies.length === 0);
  const [dependencyDrag, setDependencyDrag] = useState<DependencyDragState | null>(null);
  const [dependencyHoverTargetId, setDependencyHoverTargetId] = useState<string | null>(null);
  const dependencyDragRef = useRef<DependencyDragState | null>(null);
  const glowIdSet = useMemo(() => new Set(glowingTechnologyIds), [glowingTechnologyIds]);
  const hasComputedLayout = technologies.length > 0;

  useEffect(() => {
    if (technologies.length === 0) {
      setViewportReady(true);
    }
  }, [technologies.length]);

  const onFitViewStart = useCallback(() => {
    setViewportReady(false);
  }, []);

  const onFitViewComplete = useCallback(() => {
    setViewportReady(true);
  }, []);

  const finishDependencyDrag = useCallback(() => {
    dependencyDragRef.current = null;
    setDependencyDrag(null);
    setDependencyHoverTargetId(null);
  }, []);

  const handleStartDependencyDrag = useCallback((technologyId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const anchorRect = event.currentTarget.getBoundingClientRect();
    const cx = anchorRect.left + anchorRect.width / 2;
    const cy = anchorRect.top + anchorRect.height / 2;
    const nextState: DependencyDragState = {
      dependentId: technologyId,
      sourceClient: { x: cx, y: cy },
      currentClient: { x: cx, y: cy }
    };
    dependencyDragRef.current = nextState;
    setDependencyHoverTargetId(null);
    setDependencyDrag(nextState);
  }, []);

  /** 文件中的坐标；仅对仍为默认 (0,0) 的新卡牌做临时占位（下一依赖层上的空位），不重算全局 layout、不改 graphLayout 算法 */
  const displayPositions = useMemo(() => {
    const result = new Map<string, { x: number; y: number }>();
    for (const t of technologies) {
      result.set(t.id, { x: t.layout.x, y: t.layout.y });
    }

    const isUnsetLayout = (t: Technology) => t.layout.x === 0 && t.layout.y === 0;
    const pendingIds = new Set(technologies.filter(isUnsetLayout).map((t) => t.id));
    if (pendingIds.size === 0) {
      return result;
    }

    const nodeWidth = 160;
    const minNodeGap = 20;
    const nodeSpacing = nodeWidth + minNodeGap;
    const boardMinX = 40;

    const yToXList = new Map<number, number[]>();
    for (const t of technologies) {
      if (pendingIds.has(t.id)) {
        continue;
      }
      const p = result.get(t.id)!;
      const ry = Math.round(p.y);
      if (!yToXList.has(ry)) yToXList.set(ry, []);
      yToXList.get(ry)!.push(p.x);
    }

    const yValues = [...yToXList.keys()].sort((a, b) => a - b);
    const yGap = yValues.length > 1 ? yValues[1] - yValues[0] : 300;

    const placeAtRow = (id: string, targetY: number) => {
      const roundedTargetY = Math.round(targetY);
      const occupiedX = [...(yToXList.get(roundedTargetY) ?? [])].sort((a, b) => a - b);
      let candidateX = boardMinX;
      for (const ox of occupiedX) {
        if (candidateX + nodeWidth + minNodeGap <= ox) {
          break;
        }
        candidateX = ox + nodeSpacing;
      }
      result.set(id, { x: candidateX, y: targetY });
      if (!yToXList.has(roundedTargetY)) yToXList.set(roundedTargetY, []);
      yToXList.get(roundedTargetY)!.push(candidateX);
      pendingIds.delete(id);
    };

    while (pendingIds.size > 0) {
      let placed = 0;
      for (const id of [...pendingIds]) {
        const parentRelation = relations.find(
          (r) => r.relation_type === "dependency" && r.target_id === id && result.has(r.source_id)
        );
        const parentId = parentRelation?.source_id;
        if (parentId && pendingIds.has(parentId)) {
          continue;
        }

        const parentPos = parentId ? result.get(parentId) : undefined;
        const targetY =
          parentPos !== undefined
            ? Math.round(parentPos.y - yGap)
            : yValues.length > 0
              ? yValues[0] - yGap
              : 80;

        placeAtRow(id, targetY);
        placed += 1;
      }

      if (placed === 0) {
        const id = [...pendingIds][0];
        const targetY = yValues.length > 0 ? yValues[0] - yGap : 80;
        placeAtRow(id, targetY);
      }
    }

    return result;
  }, [relations, technologies]);

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
          onStartDependencyDrag: handleStartDependencyDrag,
          isDependencyDragSource: dependencyDrag?.dependentId === technology.id,
          isDependencyDropTarget: dependencyHoverTargetId === technology.id,
          creatingFromId,
          editable
        },
        draggable: editable,
        dragHandle: ".tech-node--drag-handle",
        sourcePosition: Position.Top,
        targetPosition: Position.Bottom
      })),
    [
      creatingFromId,
      dependencyDrag,
      dependencyHoverTargetId,
      displayPositions,
      glowIdSet,
      handleStartDependencyDrag,
      editable,
      onCreateDerived,
      onSelectTechnology,
      projects,
      selectedTechnologyId,
      technologies
    ]
  );

  useEffect(() => {
    if (!dependencyDrag) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const activeDrag = dependencyDragRef.current;
      if (!activeDrag) {
        return;
      }

      const nextState = {
        ...activeDrag,
        currentClient: { x: event.clientX, y: event.clientY }
      };
      dependencyDragRef.current = nextState;
      setDependencyDrag(nextState);

      const element = document.elementFromPoint(event.clientX, event.clientY);
      const hoverNode = element instanceof HTMLElement ? element.closest<HTMLElement>("[data-tech-node-id]") : null;
      const hoverNodeId = hoverNode?.dataset.techNodeId ?? null;
      const nextDependencyId =
        hoverNodeId &&
        hoverNodeId !== activeDrag.dependentId &&
        isDependencyLinkAllowed(hoverNodeId, activeDrag.dependentId)
          ? hoverNodeId
          : null;

      setDependencyHoverTargetId(nextDependencyId);
    };

    const endDependencyDrag = (event: PointerEvent) => {
      const activeDrag = dependencyDragRef.current;
      if (activeDrag) {
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const hoverNode = element instanceof HTMLElement ? element.closest<HTMLElement>("[data-tech-node-id]") : null;
        const dropId = hoverNode?.dataset.techNodeId ?? null;
        const dependencyId =
          dropId &&
          dropId !== activeDrag.dependentId &&
          isDependencyLinkAllowed(dropId, activeDrag.dependentId)
            ? dropId
            : null;
        if (dependencyId) {
          void onCreateDependency(dependencyId, activeDrag.dependentId);
        }
      }
      finishDependencyDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDependencyDrag);
    window.addEventListener("pointercancel", endDependencyDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDependencyDrag);
      window.removeEventListener("pointercancel", endDependencyDrag);
    };
  }, [dependencyDrag, finishDependencyDrag, isDependencyLinkAllowed, onCreateDependency]);

  const dependencyEdgesFromRelations = useMemo<Edge<DependencyEdgeData>[]>(
    () =>
      relations
        .filter((relation) => relation.relation_type === "dependency")
        .map((relation) => ({
          id: `dependency:${relation.source_id}:${relation.target_id}`,
          source: relation.source_id,
          target: relation.target_id,
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed },
          selectable: editable,
          focusable: editable,
          data: {
            dependencySourceId: relation.source_id,
            dependencyTargetId: relation.target_id
          }
        })),
    [editable, relations]
  );

  const relationsSig = useMemo(
    () =>
      relations
        .filter((r) => r.relation_type === "dependency")
        .map((r) => `${r.source_id}\t${r.target_id}`)
        .sort()
        .join(";"),
    [relations]
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<DependencyEdgeData>>([]);
  const prevRelationsSigRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (prevRelationsSigRef.current === relationsSig) {
      return;
    }
    prevRelationsSigRef.current = relationsSig;
    setEdges(dependencyEdgesFromRelations);
  }, [relationsSig, dependencyEdgesFromRelations, setEdges]);

  const handleEdgesDelete = useCallback(
    (deleted: Edge<DependencyEdgeData>[]) => {
      void (async () => {
        const failed: Edge<DependencyEdgeData>[] = [];
        for (const edge of deleted) {
          const s = edge.data?.dependencySourceId;
          const t = edge.data?.dependencyTargetId;
          if (!s || !t) {
            continue;
          }
          try {
            await onDeleteDependency(s, t);
          } catch {
            failed.push(edge);
          }
        }
        if (failed.length > 0) {
          setEdges((current) => {
            const ids = new Set(current.map((e) => e.id));
            return [...current, ...failed.filter((e) => !ids.has(e.id))];
          });
        }
      })();
    },
    [onDeleteDependency, setEdges]
  );

  return (
    <section className="map-panel">
      <div className={`map-panel__flow-wrap${viewportReady ? "" : " map-panel__flow-wrap--concealed"}`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(_: NodeChange[]) => {}}
          onNodeDragStop={(_, node) => {
            void onUpdateTechnologyLayout?.(node.id, node.position);
          }}
          onEdgesChange={onEdgesChange}
          deleteKeyCode={editable ? "Delete" : null}
          onEdgesDelete={editable ? handleEdgesDelete : undefined}
          fitView
          minZoom={0.05}
          fitViewOptions={{ padding: 0.2, minZoom: 0.05 }}
          nodeTypes={nodeTypes}
          nodesDraggable={editable}
          onPaneClick={onClearSelection}
        >
          <DependencyDraftOverlay drag={dependencyDrag} />
          <GraphFitViewEffect
            layoutKey={layoutKey}
            nodeCount={nodes.length}
            hasComputedLayout={hasComputedLayout}
            onFitStart={onFitViewStart}
            onFitComplete={onFitViewComplete}
          />
          <Controls />
          <Background gap={24} size={1} />
        </ReactFlow>
      </div>
    </section>
  );
}
