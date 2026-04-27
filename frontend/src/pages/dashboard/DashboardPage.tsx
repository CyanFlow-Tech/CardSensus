import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  LoadingOutlined,
  PlusOutlined,
  ReloadOutlined,
  VerticalAlignTopOutlined
} from "@ant-design/icons";
import type { Project } from "../../entities/project/model/types";
import type { Technology, TechnologyDetail } from "../../entities/technology/model/types";
import {
  cardSensusApi,
  type DashboardGraphResponse,
  type ProjectCreatePayload,
  type TechnologyProfileResponse,
  type TechnologySyncItemPayload,
  type TechnologyUpdatePayload
} from "../../shared/api/cardSensusApi";
import { buildLayeredPositions } from "../../shared/lib/graphLayout";
import { formatHours, formatPercent } from "../../shared/lib/format";
import { InspectorPanel } from "../../widgets/inspector/InspectorPanel";
import { TopologyMap } from "../../widgets/topology-map/TopologyMap";

const SYNC_DRAFT_ID_PREFIX = "tech-draft-";
const ALL_DECK_ID = "deck-all-cards";

interface SelectedTechnologyState {
  technology: TechnologyDetail | null;
  relatedProjects: Project[];
  prerequisites: Technology[];
  unlocks: Technology[];
}

const emptyTechnologyState: SelectedTechnologyState = {
  technology: null,
  relatedProjects: [],
  prerequisites: [],
  unlocks: []
};

interface SyncDraftChanges {
  addedIds: string[];
  updatedIds: string[];
}

interface DeckViewCard {
  deckId: string;
  name: string;
  summary: string;
  project: Project | null;
  isAllDeck: boolean;
  technologies: Technology[];
  totalHours: number;
  rarityProduct: number;
}

interface NodePickerCard {
  technology: Technology;
  projectCount: number;
}

function normalizeSyncItem(item: TechnologySyncItemPayload): TechnologySyncItemPayload | null {
  const name = String(item.name ?? "").trim();
  if (!name) {
    return null;
  }
  const dependencyIds = Array.isArray(item.dependency_ids)
    ? [...new Set(item.dependency_ids.map((value) => String(value).trim()).filter(Boolean))]
    : undefined;
  return {
    id: item.id?.trim() || undefined,
    name,
    summary: item.summary?.trim() || undefined,
    time_spent_hours: item.time_spent_hours,
    rarity_index: item.rarity_index,
    active_user_count: item.active_user_count,
    dependency_ids: dependencyIds
  };
}

function toSyncPayloadFromTechnology(
  technology: Technology,
  relations: DashboardGraphResponse["relations"]
): TechnologySyncItemPayload {
  return {
    id: technology.id,
    name: technology.name,
    summary: technology.summary,
    time_spent_hours: technology.time_spent_hours,
    rarity_index: technology.rarity_index,
    active_user_count: technology.active_user_count,
    dependency_ids: relations
      .filter((relation) => relation.relation_type === "dependency" && relation.target_id === technology.id)
      .map((relation) => relation.source_id)
  };
}

function buildLocalTechnologyState(graph: DashboardGraphResponse, technologyId: string): SelectedTechnologyState | null {
  const technology = graph.technologies.find((item) => item.id === technologyId);
  if (!technology) {
    return null;
  }
  const relatedProjects = graph.projects.filter((project) => project.associated_tech.includes(technologyId));
  const technologiesById = new Map(graph.technologies.map((item) => [item.id, item]));
  const prerequisites = graph.relations
    .filter((relation) => relation.relation_type === "dependency" && relation.target_id === technologyId)
    .map((relation) => technologiesById.get(relation.source_id))
    .filter((item): item is Technology => Boolean(item));
  const unlocks = graph.relations
    .filter((relation) => relation.relation_type === "dependency" && relation.source_id === technologyId)
    .map((relation) => technologiesById.get(relation.target_id))
    .filter((item): item is Technology => Boolean(item));
  return {
    technology: {
      ...technology,
      resources: [],
      project_ids: relatedProjects.map((project) => project.id)
    },
    relatedProjects,
    prerequisites,
    unlocks
  };
}

function buildSyncPreview(
  baseGraph: DashboardGraphResponse,
  items: TechnologySyncItemPayload[]
): { graph: DashboardGraphResponse; addedIds: string[]; updatedIds: string[] } {
  const technologies = baseGraph.technologies.map((item) => ({ ...item, layout: { ...item.layout } }));
  const byId = new Map(technologies.map((item) => [item.id, item]));
  const byName = new Map(technologies.map((item) => [item.name.trim(), item]));
  let draftIndex = 1;
  const nextDraftId = () => {
    while (byId.has(`${SYNC_DRAFT_ID_PREFIX}${draftIndex}`)) {
      draftIndex += 1;
    }
    const id = `${SYNC_DRAFT_ID_PREFIX}${draftIndex}`;
    draftIndex += 1;
    return id;
  };
  const addedIds: string[] = [];
  const updatedIds: string[] = [];
  let draftRelations = baseGraph.relations.map((relation) => ({ ...relation }));

  items.forEach((item) => {
    const normalized = normalizeSyncItem(item);
    if (!normalized) {
      return;
    }
    const incomingId = normalized.id?.trim();
    const target = (incomingId && byId.get(incomingId)) || byName.get(normalized.name);
    if (target) {
      const oldName = target.name.trim();
      target.name = normalized.name;
      if (normalized.summary !== undefined) {
        target.summary = normalized.summary;
      }
      if (normalized.time_spent_hours !== undefined) {
        target.time_spent_hours = Math.max(0, normalized.time_spent_hours);
      }
      if (normalized.rarity_index !== undefined) {
        target.rarity_index = Math.min(1, Math.max(0, normalized.rarity_index));
      }
      if (normalized.active_user_count !== undefined) {
        target.active_user_count = Math.max(0, normalized.active_user_count);
      }
      if (!updatedIds.includes(target.id) && !addedIds.includes(target.id)) {
        updatedIds.push(target.id);
      }
      if (oldName !== target.name.trim()) {
        byName.delete(oldName);
        byName.set(target.name.trim(), target);
      }
      if (normalized.dependency_ids) {
        draftRelations = draftRelations.filter(
          (relation) => !(relation.relation_type === "dependency" && relation.target_id === target.id)
        );
        normalized.dependency_ids.forEach((dependencyId) => {
          if (
            dependencyId &&
            dependencyId !== target.id &&
            byId.has(dependencyId) &&
            !draftRelations.some(
              (relation) =>
                relation.relation_type === "dependency" &&
                relation.source_id === dependencyId &&
                relation.target_id === target.id
            )
          ) {
            draftRelations.push({
              source_id: dependencyId,
              target_id: target.id,
              relation_type: "dependency"
            });
          }
        });
      }
      return;
    }

    const nodeId = incomingId && !byId.has(incomingId) ? incomingId : nextDraftId();
    const newTech: Technology = {
      id: nodeId,
      name: normalized.name,
      summary: normalized.summary ?? "",
      time_spent_hours: Math.max(0, normalized.time_spent_hours ?? 0),
      status: "exploring",
      rarity_index: Math.min(1, Math.max(0, normalized.rarity_index ?? 0.5)),
      active_user_count: Math.max(0, normalized.active_user_count ?? 0),
      image_url: "",
      layout: { x: 0, y: 0 },
      resource_count: 0
    };
    technologies.push(newTech);
    byId.set(nodeId, newTech);
    byName.set(newTech.name.trim(), newTech);
    addedIds.push(nodeId);
    if (normalized.dependency_ids) {
      normalized.dependency_ids.forEach((dependencyId) => {
        if (
          dependencyId &&
          dependencyId !== nodeId &&
          byId.has(dependencyId) &&
          !draftRelations.some(
            (relation) =>
              relation.relation_type === "dependency" &&
              relation.source_id === dependencyId &&
              relation.target_id === nodeId
          )
        ) {
          draftRelations.push({
            source_id: dependencyId,
            target_id: nodeId,
            relation_type: "dependency"
          });
        }
      });
    }
  });

  return {
    graph: {
      ...baseGraph,
      technologies,
      relations: draftRelations
    },
    addedIds,
    updatedIds
  };
}

function hasDependencyPath(relations: DashboardGraphResponse["relations"], fromId: string, toId: string): boolean {
  if (fromId === toId) {
    return true;
  }
  const adjacency = new Map<string, string[]>();
  relations
    .filter((relation) => relation.relation_type === "dependency")
    .forEach((relation) => {
      const next = adjacency.get(relation.source_id) ?? [];
      next.push(relation.target_id);
      adjacency.set(relation.source_id, next);
    });

  const queue = [fromId];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current === toId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    (adjacency.get(current) ?? []).forEach((next) => {
      if (!visited.has(next)) {
        queue.push(next);
      }
    });
  }
  return false;
}

function buildDeckRelations(
  relations: DashboardGraphResponse["relations"],
  technologyIds: string[]
): DashboardGraphResponse["relations"] {
  const selectedIds = [...new Set(technologyIds)];
  if (selectedIds.length <= 1) {
    return [];
  }

  const dependencyRelations = relations.filter((relation) => relation.relation_type === "dependency");
  const adjacency = new Map<string, string[]>();
  dependencyRelations.forEach((relation) => {
    const next = adjacency.get(relation.source_id) ?? [];
    next.push(relation.target_id);
    adjacency.set(relation.source_id, next);
  });

  const reachableById = new Map<string, Set<string>>();
  selectedIds.forEach((sourceId) => {
    const visited = new Set<string>();
    const queue = [...(adjacency.get(sourceId) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) {
        continue;
      }
      visited.add(current);
      (adjacency.get(current) ?? []).forEach((nextId) => {
        if (!visited.has(nextId)) {
          queue.push(nextId);
        }
      });
    }
    reachableById.set(sourceId, visited);
  });

  const inferredRelations: DashboardGraphResponse["relations"] = [];
  selectedIds.forEach((sourceId) => {
    const reachable = reachableById.get(sourceId) ?? new Set<string>();
    selectedIds.forEach((targetId) => {
      if (sourceId === targetId || !reachable.has(targetId)) {
        return;
      }
      const hasIntermediateSelectedNode = selectedIds.some((intermediateId) => {
        if (intermediateId === sourceId || intermediateId === targetId) {
          return false;
        }
        return (
          (reachableById.get(sourceId)?.has(intermediateId) ?? false) &&
          (reachableById.get(intermediateId)?.has(targetId) ?? false)
        );
      });
      if (!hasIntermediateSelectedNode) {
        inferredRelations.push({
          source_id: sourceId,
          target_id: targetId,
          relation_type: "dependency"
        });
      }
    });
  });

  return inferredRelations;
}

function normalizeSearchKeyword(value: string): string {
  return value.trim().toLowerCase();
}

function projectIdToLayoutKey(projectId: string | null): number {
  if (!projectId) {
    return 0;
  }
  return [...projectId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardGraphResponse | null>(null);
  const [selectedTechnologyId, setSelectedTechnologyId] = useState<string | null>(null);
  const [selectedTechnology, setSelectedTechnology] = useState<SelectedTechnologyState>(emptyTechnologyState);
  const [selectedDeckId, setSelectedDeckId] = useState<string>(ALL_DECK_ID);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingFromId, setCreatingFromId] = useState<string | null>(null);
  const [creatingStandaloneCard, setCreatingStandaloneCard] = useState(false);
  const [enterEditForTechnologyId, setEnterEditForTechnologyId] = useState<string | null>(null);
  const [mapLayoutKey, setMapLayoutKey] = useState(0);
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [syncJsonText, setSyncJsonText] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncCommitting, setSyncCommitting] = useState(false);
  const [syncDraftChanges, setSyncDraftChanges] = useState<SyncDraftChanges | null>(null);
  const [exporting, setExporting] = useState(false);
  const [relayoutSaving, setRelayoutSaving] = useState(false);
  const [deckSearchKeyword, setDeckSearchKeyword] = useState("");
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [selectedDeckTechnologyIds, setSelectedDeckTechnologyIds] = useState<string[]>([]);
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [editingDeckName, setEditingDeckName] = useState("");
  const [editingDeckSummary, setEditingDeckSummary] = useState("");
  const [updatingDeck, setUpdatingDeck] = useState(false);
  const deckListRef = useRef<HTMLDivElement | null>(null);
  const deckItemRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const isSyncDrafting = syncDraftChanges !== null;
  const glowingTechnologyIds = syncDraftChanges
    ? [...syncDraftChanges.addedIds, ...syncDraftChanges.updatedIds]
    : [];

  const bumpMapLayout = useCallback(() => {
    setMapLayoutKey((k) => k + 1);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const handleEnterEditConsumed = useCallback(() => {
    setEnterEditForTechnologyId(null);
  }, []);

  const handleRelayout = useCallback(async () => {
    if (!dashboard) {
      return;
    }
    if (isSyncDrafting) {
      showToast("草稿同步中，请先确认或取消后再重排布局");
      return;
    }
    clearToast();
    setRelayoutSaving(true);
    try {
      const positions = buildLayeredPositions(dashboard.technologies, dashboard.relations);
      const items = [...positions.entries()].map(([id, pos]) => ({ id, x: pos.x, y: pos.y }));
      await cardSensusApi.updateTechnologyLayouts(items);
      const graph = await cardSensusApi.getDashboardGraph();
      setDashboard(graph);
      bumpMapLayout();
      showToast("已全局重排并保存布局到数据文件");
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : "保存布局失败");
    } finally {
      setRelayoutSaving(false);
    }
  }, [bumpMapLayout, clearToast, dashboard, isSyncDrafting, showToast]);

  const handleDiscardSyncDraft = useCallback(async () => {
    clearToast();
    try {
      const graph = await cardSensusApi.getDashboardGraph();
      setDashboard(graph);
      setSyncDraftChanges(null);
      setSelectedTechnologyId(null);
      setSelectedTechnology(emptyTechnologyState);
      showToast("已取消草稿同步");
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : "取消草稿失败");
    }
  }, [bumpMapLayout, clearToast, showToast]);

  const handleCommitSyncDraft = useCallback(async () => {
    if (!dashboard || !syncDraftChanges || syncCommitting) {
      return;
    }
    clearToast();
    setSyncCommitting(true);
    try {
      const changedIdSet = new Set([...syncDraftChanges.addedIds, ...syncDraftChanges.updatedIds]);
      const commitItems = dashboard.technologies
        .filter((technology) => changedIdSet.has(technology.id))
        .map((technology) => toSyncPayloadFromTechnology(technology, dashboard.relations));
      const result = await cardSensusApi.syncTechnologies(commitItems);
      const graph = await cardSensusApi.getDashboardGraph();
      setDashboard(graph);
      setSyncDraftChanges(null);
      showToast(`已提交：新增 ${result.added_ids.length}，更新 ${result.updated_ids.length}`);
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : "提交草稿失败");
    } finally {
      setSyncCommitting(false);
    }
  }, [clearToast, dashboard, showToast, syncCommitting, syncDraftChanges]);

  useEffect(() => {
    cardSensusApi
      .getDashboardGraph()
      .then((response) => {
        setDashboard(response);
      })
      .catch((requestError) => {
        setLoadError(requestError instanceof Error ? requestError.message : "加载失败");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedTechnologyId) {
      setSelectedTechnology(emptyTechnologyState);
      return;
    }

    if (dashboard) {
      const localState = buildLocalTechnologyState(dashboard, selectedTechnologyId);
      if (localState) {
        setSelectedTechnology(localState);
      }
    }

    if (dashboard && isSyncDrafting) {
      return;
    }

    cardSensusApi
      .getTechnologyProfile(selectedTechnologyId)
      .then((response: TechnologyProfileResponse) => {
        setSelectedTechnology({
          technology: response.technology,
          relatedProjects: response.related_projects,
          prerequisites: response.prerequisites,
          unlocks: response.unlocks
        });
      })
      .catch((requestError) => {
        showToast(requestError instanceof Error ? requestError.message : "卡牌详情加载失败");
      });
  }, [dashboard, isSyncDrafting, selectedTechnologyId, showToast]);

  const technologiesById = useMemo(
    () => new Map((dashboard?.technologies ?? []).map((technology) => [technology.id, technology])),
    [dashboard]
  );

  const deckCards = useMemo<DeckViewCard[]>(() => {
    if (!dashboard) {
      return [];
    }
    const allTechnologies = dashboard.technologies;
    const allDeckCard: DeckViewCard = {
      deckId: ALL_DECK_ID,
      name: "全部卡牌",
      summary: "",
      project: null,
      isAllDeck: true,
      technologies: allTechnologies,
      totalHours: allTechnologies.reduce((sum, technology) => sum + technology.time_spent_hours, 0),
      rarityProduct: allTechnologies.reduce((product, technology) => product * technology.rarity_index, 1)
    };

    const projectDeckCards = dashboard.projects.map((project) => {
      const technologies = project.associated_tech
        .map((technologyId) => technologiesById.get(technologyId))
        .filter((technology): technology is Technology => Boolean(technology));
      return {
        deckId: project.id,
        name: project.name,
        summary: project.summary,
        project,
        isAllDeck: false,
        technologies,
        totalHours: technologies.reduce((sum, technology) => sum + technology.time_spent_hours, 0),
        rarityProduct: technologies.reduce((product, technology) => product * technology.rarity_index, 1)
      };
    });
    return [allDeckCard, ...projectDeckCards];
  }, [dashboard, technologiesById]);

  const normalizedDeckSearchKeyword = useMemo(() => normalizeSearchKeyword(deckSearchKeyword), [deckSearchKeyword]);

  const filteredDeckCards = useMemo(() => {
    if (!normalizedDeckSearchKeyword) {
      return deckCards;
    }
    return deckCards.filter(({ name, summary }) => {
      const haystack = `${name} ${summary}`.toLowerCase();
      return haystack.includes(normalizedDeckSearchKeyword);
    });
  }, [deckCards, normalizedDeckSearchKeyword]);

  const filteredNodePickerCards = useMemo<NodePickerCard[]>(() => {
    if (!dashboard) {
      return [];
    }
    const projectCountByTechnologyId = new Map<string, number>();
    dashboard.projects.forEach((project) => {
      project.associated_tech.forEach((technologyId) => {
        projectCountByTechnologyId.set(technologyId, (projectCountByTechnologyId.get(technologyId) ?? 0) + 1);
      });
    });
    return dashboard.technologies
      .filter((technology) => {
        if (!normalizedDeckSearchKeyword) {
          return true;
        }
        const haystack = `${technology.name} ${technology.summary}`.toLowerCase();
        return haystack.includes(normalizedDeckSearchKeyword);
      })
      .map((technology) => ({
        technology,
        projectCount: projectCountByTechnologyId.get(technology.id) ?? 0
      }));
  }, [dashboard, normalizedDeckSearchKeyword]);

  const activeDeckCard = useMemo(
    () => deckCards.find((deckCard) => deckCard.deckId === selectedDeckId) ?? deckCards[0] ?? null,
    [deckCards, selectedDeckId]
  );
  const activeDeckLayoutKey = useMemo(
    () => mapLayoutKey + projectIdToLayoutKey(activeDeckCard?.deckId ?? null),
    [activeDeckCard?.deckId, mapLayoutKey]
  );

  const activeDeckRelations = useMemo(() => {
    if (!dashboard || !activeDeckCard) {
      return [];
    }
    return buildDeckRelations(
      dashboard.relations,
      activeDeckCard.technologies.map((technology) => technology.id)
    );
  }, [activeDeckCard, dashboard]);

  const pinnedDeckCard = useMemo(
    () => filteredDeckCards.find((deckCard) => deckCard.isAllDeck) ?? null,
    [filteredDeckCards]
  );

  const scrollableDeckCards = useMemo(
    () => filteredDeckCards.filter((deckCard) => !deckCard.isAllDeck),
    [filteredDeckCards]
  );
  const isEditingDeck = editingDeckId !== null;

  useEffect(() => {
    if (isCreatingDeck || selectedDeckId === ALL_DECK_ID) {
      return;
    }
    const listElement = deckListRef.current;
    const itemElement = deckItemRefs.current.get(selectedDeckId);
    if (!listElement || !itemElement) {
      return;
    }
    const listRect = listElement.getBoundingClientRect();
    const itemRect = itemElement.getBoundingClientRect();
    const itemCenterOffset = itemRect.top - listRect.top + listElement.scrollTop + itemRect.height / 2;
    const targetTop = itemCenterOffset - listElement.clientHeight / 2;
    listElement.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth"
    });
  }, [isCreatingDeck, selectedDeckId]);

  const handleSelectTechnology = (technologyId: string) => {
    setSelectedTechnologyId(technologyId);
  };

  const handleClearSelection = () => {
    setSelectedTechnologyId(null);
    setSelectedTechnology(emptyTechnologyState);
  };

  const handleCreateDerived = async (parentId: string) => {
    if (creatingFromId) {
      return;
    }
    if (isSyncDrafting) {
      showToast("草稿同步中暂不支持新增衍生卡牌，请先确认或取消草稿");
      return;
    }
    clearToast();
    setCreatingFromId(parentId);
    try {
      const profile = await cardSensusApi.createDerivedTechnology(parentId);
      const graph = await cardSensusApi.getDashboardGraph();
      setDashboard(graph);
      setSelectedTechnologyId(profile.technology.id);
      setEnterEditForTechnologyId(profile.technology.id);
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : "创建卡牌失败");
    } finally {
      setCreatingFromId(null);
    }
  };

  const handleCreateStandaloneCard = async () => {
    if (!dashboard || creatingStandaloneCard || creatingFromId) {
      return;
    }
    if (isSyncDrafting) {
      showToast("草稿同步中暂不支持新增卡牌，请先确认或取消草稿");
      return;
    }
    clearToast();
    setCreatingStandaloneCard(true);
    const newId = `tech-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const usedNumbers = new Set(
      (dashboard.technologies ?? [])
        .map((technology) => {
          const match = /^新卡牌(\d+)$/.exec(technology.name.trim());
          return match ? Number(match[1]) : null;
        })
        .filter((value): value is number => value !== null && Number.isInteger(value) && value > 0)
    );
    let nextNumber = 1;
    while (usedNumbers.has(nextNumber)) {
      nextNumber += 1;
    }
    const newName = `新卡牌${nextNumber}`;
    try {
      const result = await cardSensusApi.syncTechnologies([
        {
          id: newId,
          name: newName,
          summary: "",
          time_spent_hours: 0,
          rarity_index: 0.5,
          active_user_count: 0
        }
      ]);
      const graph = await cardSensusApi.getDashboardGraph();
      setDashboard(graph);
      const createdId = result.added_ids[0] ?? result.updated_ids[0] ?? null;
      if (!createdId) {
        showToast("新增卡牌失败：未返回有效卡牌 id");
        return;
      }
      setSelectedTechnologyId(createdId);
      setEnterEditForTechnologyId(createdId);
      const actionText = result.added_ids.length > 0 ? "新增" : "复用更新";
      showToast(`已${actionText}卡牌并写入数据库`);
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : "新增卡牌失败");
    } finally {
      setCreatingStandaloneCard(false);
    }
  };

  const isDependencyLinkAllowed = useCallback(
    (dependencyId: string, dependentId: string) => {
      if (!dashboard) {
        return false;
      }
      if (dependencyId === dependentId) {
        return false;
      }
      const exists = dashboard.relations.some(
        (relation) =>
          relation.relation_type === "dependency" &&
          relation.source_id === dependencyId &&
          relation.target_id === dependentId
      );
      if (exists) {
        return false;
      }
      return !hasDependencyPath(dashboard.relations, dependentId, dependencyId);
    },
    [dashboard]
  );

  const handleCreateDependency = useCallback(
    async (dependencyId: string, dependentId: string) => {
      if (!dashboard) {
        return;
      }
      if (!isDependencyLinkAllowed(dependencyId, dependentId)) {
        return;
      }
      clearToast();

      if (isSyncDrafting) {
        setDashboard((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            relations: [
              ...prev.relations,
              {
                source_id: dependencyId,
                target_id: dependentId,
                relation_type: "dependency"
              }
            ]
          };
        });

        setSelectedTechnology((prev) => {
          if (!prev.technology || prev.technology.id !== dependentId) {
            return prev;
          }
          const dependency = dashboard.technologies.find((technology) => technology.id === dependencyId);
          if (!dependency) {
            return prev;
          }
          if (prev.prerequisites.some((item) => item.id === dependencyId)) {
            return prev;
          }
          return {
            ...prev,
            prerequisites: [...prev.prerequisites, dependency]
          };
        });

        showToast("已在草稿中创建依赖，确认同步后写入数据库");
        return;
      }

      try {
        await cardSensusApi.addDependencyRelation(dependencyId, dependentId);
        const graph = await cardSensusApi.getDashboardGraph();
        setDashboard(graph);
        showToast("已创建依赖关系并已保存");
      } catch (requestError) {
        showToast(requestError instanceof Error ? requestError.message : "保存依赖关系失败");
      }
    },
    [clearToast, dashboard, isDependencyLinkAllowed, isSyncDrafting, showToast]
  );

  const handleDeleteDependency = useCallback(
    async (dependencyId: string, dependentId: string) => {
      if (!dashboard) {
        return;
      }
      clearToast();

      if (isSyncDrafting) {
        setDashboard((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            relations: prev.relations.filter(
              (relation) =>
                !(
                  relation.relation_type === "dependency" &&
                  relation.source_id === dependencyId &&
                  relation.target_id === dependentId
                )
            )
          };
        });

        setSelectedTechnology((prev) => {
          if (!prev.technology) {
            return prev;
          }
          const tid = prev.technology.id;
          let prerequisites = prev.prerequisites;
          let unlocks = prev.unlocks;
          if (tid === dependentId) {
            prerequisites = prerequisites.filter((item) => item.id !== dependencyId);
          }
          if (tid === dependencyId) {
            unlocks = unlocks.filter((item) => item.id !== dependentId);
          }
          if (prerequisites === prev.prerequisites && unlocks === prev.unlocks) {
            return prev;
          }
          return { ...prev, prerequisites, unlocks };
        });

        showToast("已在草稿中删除依赖，确认同步后写入数据库");
        return;
      }

      try {
        await cardSensusApi.deleteDependencyRelation(dependencyId, dependentId);
        const graph = await cardSensusApi.getDashboardGraph();
        setDashboard(graph);
        showToast("已删除依赖关系并已保存");
      } catch (requestError) {
        showToast(requestError instanceof Error ? requestError.message : "删除依赖关系失败");
        throw requestError instanceof Error ? requestError : new Error("删除依赖关系失败");
      }
    },
    [clearToast, dashboard, isSyncDrafting, showToast]
  );

  const handleUpdateTechnology = async (technologyId: string, payload: TechnologyUpdatePayload) => {
    if (isSyncDrafting && dashboard) {
      clearToast();
      setDashboard((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          technologies: prev.technologies.map((technology) =>
            technology.id === technologyId
              ? {
                  ...technology,
                  name: payload.name ?? technology.name,
                  summary: payload.summary ?? technology.summary,
                  time_spent_hours: payload.time_spent_hours ?? technology.time_spent_hours,
                  rarity_index: payload.rarity_index ?? technology.rarity_index,
                  active_user_count: payload.active_user_count ?? technology.active_user_count
                }
              : technology
          )
        };
      });
      setSyncDraftChanges((prev) => {
        if (!prev || prev.addedIds.includes(technologyId) || prev.updatedIds.includes(technologyId)) {
          return prev;
        }
        return { ...prev, updatedIds: [...prev.updatedIds, technologyId] };
      });
      const localGraph = {
        ...dashboard,
        technologies: dashboard.technologies.map((technology) =>
          technology.id === technologyId
            ? {
                ...technology,
                name: payload.name ?? technology.name,
                summary: payload.summary ?? technology.summary,
                time_spent_hours: payload.time_spent_hours ?? technology.time_spent_hours,
                rarity_index: payload.rarity_index ?? technology.rarity_index,
                active_user_count: payload.active_user_count ?? technology.active_user_count
              }
            : technology
        )
      };
      const localState = buildLocalTechnologyState(localGraph, technologyId);
      if (localState) {
        setSelectedTechnology(localState);
      }
      return;
    }
    clearToast();
    try {
      const profile = await cardSensusApi.updateTechnology(technologyId, payload);
      const graph = await cardSensusApi.getDashboardGraph();
      setDashboard(graph);
      setSelectedTechnology({
        technology: profile.technology,
        relatedProjects: profile.related_projects,
        prerequisites: profile.prerequisites,
        unlocks: profile.unlocks
      });
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : "更新失败");
      throw requestError;
    }
  };

  const handleDeleteTechnology = async (technologyId: string) => {
    if (isSyncDrafting) {
      showToast("草稿同步中暂不支持删除，请先确认或取消草稿");
      throw new Error("draft mode delete disabled");
    }
    clearToast();
    try {
      await cardSensusApi.deleteTechnology(technologyId);
      setSelectedTechnologyId(null);
      setSelectedTechnology(emptyTechnologyState);
      setDashboard(await cardSensusApi.getDashboardGraph());
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : "删除失败");
      throw requestError;
    }
  };

  const handleAppendResource = useCallback(
    async (text: string) => {
      if (!selectedTechnologyId) {
        return;
      }
      if (isSyncDrafting) {
        showToast("草稿同步中暂不支持添加资料，请先确认或取消草稿");
        throw new Error("draft mode append resource disabled");
      }
      clearToast();
      try {
        const profile = await cardSensusApi.appendTechnologyResourceNote(selectedTechnologyId, text);
        const graph = await cardSensusApi.getDashboardGraph();
        setDashboard(graph);
        setSelectedTechnology({
          technology: profile.technology,
          relatedProjects: profile.related_projects,
          prerequisites: profile.prerequisites,
          unlocks: profile.unlocks
        });
      } catch (requestError) {
        showToast(requestError instanceof Error ? requestError.message : "添加资料失败");
        throw requestError;
      }
    },
    [clearToast, isSyncDrafting, selectedTechnologyId, showToast]
  );

  const handleRegenerateImage = useCallback(
    async (technologyId: string) => {
      clearToast();
      try {
        const result = await cardSensusApi.regenerateTechnologyImage(technologyId);
        showToast(result.detail || "已开始后台生成插图");
      } catch (requestError) {
        showToast(requestError instanceof Error ? requestError.message : "重新生成插图失败");
        throw requestError;
      }
    },
    [clearToast, showToast]
  );

  const handleSelectProject = (projectId: string) => {
    setSelectedDeckId(projectId);
  };

  const handleSelectDeckProject = (projectId: string) => {
    setSelectedTechnologyId(null);
    setSelectedTechnology(emptyTechnologyState);
    if (projectId === ALL_DECK_ID) {
      setSelectedDeckId(ALL_DECK_ID);
      return;
    }
    setSelectedDeckId(projectId);
  };

  const handleToggleDeckCreateMode = () => {
    clearToast();
    if (isCreatingDeck) {
      setIsCreatingDeck(false);
      setSelectedDeckTechnologyIds([]);
      setDeckSearchKeyword("");
      return;
    }
    setSelectedTechnologyId(null);
    setSelectedTechnology(emptyTechnologyState);
    setSelectedDeckTechnologyIds([]);
    setDeckSearchKeyword("");
    setIsCreatingDeck(true);
  };

  const handleStartDeckEdit = (deckCard: DeckViewCard) => {
    if (deckCard.isAllDeck || isCreatingDeck || updatingDeck || creatingDeck) {
      return;
    }
    clearToast();
    setSelectedTechnologyId(null);
    setSelectedTechnology(emptyTechnologyState);
    setEditingDeckId(deckCard.deckId);
    setEditingDeckName(deckCard.name);
    setEditingDeckSummary(deckCard.summary);
    setSelectedDeckTechnologyIds(deckCard.technologies.map((technology) => technology.id));
    setDeckSearchKeyword("");
  };

  const handleCancelDeckEdit = () => {
    if (!isEditingDeck) {
      return;
    }
    setEditingDeckId(null);
    setEditingDeckName("");
    setEditingDeckSummary("");
    setSelectedDeckTechnologyIds([]);
    setDeckSearchKeyword("");
  };

  const handleToggleDeckTechnology = (technologyId: string) => {
    setSelectedDeckTechnologyIds((prev) =>
      prev.includes(technologyId) ? prev.filter((id) => id !== technologyId) : [...prev, technologyId]
    );
  };

  const handleConfirmCreateDeck = async () => {
    if (!dashboard || creatingDeck) {
      return;
    }
    clearToast();
    const technologyIds = selectedDeckTechnologyIds;
    if (technologyIds.length === 0) {
      showToast("请至少选择一张卡牌后再确认");
      return;
    }
    const payload: ProjectCreatePayload = {
      technology_ids: technologyIds
    };
    setCreatingDeck(true);
    try {
      const profile = await cardSensusApi.createProject(payload);
      const graph = await cardSensusApi.getDashboardGraph();
      setDashboard(graph);
      setSelectedDeckId(profile.project.id);
      setSelectedTechnologyId(null);
      setSelectedTechnology(emptyTechnologyState);
      setSelectedDeckTechnologyIds([]);
      setDeckSearchKeyword("");
      setIsCreatingDeck(false);
      showToast(`已创建 ${profile.project.name}`);
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : "创建牌组失败");
    } finally {
      setCreatingDeck(false);
    }
  };

  const handleConfirmUpdateDeck = async () => {
    if (!dashboard || !editingDeckId || updatingDeck) {
      return;
    }
    clearToast();
    const name = editingDeckName.trim();
    if (!name) {
      showToast("请先填写牌组名称");
      return;
    }
    const summary = editingDeckSummary.trim();
    const technologyIds = selectedDeckTechnologyIds;
    if (technologyIds.length === 0) {
      showToast("请至少选择一个标签后再保存");
      return;
    }
    setUpdatingDeck(true);
    try {
      const profile = await cardSensusApi.updateProject(editingDeckId, {
        name,
        summary,
        technology_ids: technologyIds
      });
      const graph = await cardSensusApi.getDashboardGraph();
      setDashboard(graph);
      setSelectedDeckId(editingDeckId);
      setEditingDeckId(null);
      setEditingDeckName("");
      setEditingDeckSummary("");
      setSelectedDeckTechnologyIds([]);
      setDeckSearchKeyword("");
      showToast(`已更新 ${profile.project.name}`);
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : "更新牌组失败");
    } finally {
      setUpdatingDeck(false);
    }
  };

  const handleDeleteDeck = async (deckId: string) => {
    if (deletingDeckId || creatingDeck) {
      return;
    }
    const confirmed = window.confirm("确认删除当前牌组？此操作不会删除牌组内卡牌。");
    if (!confirmed) {
      return;
    }
    clearToast();
    setDeletingDeckId(deckId);
    try {
      await cardSensusApi.deleteProject(deckId);
      const graph = await cardSensusApi.getDashboardGraph();
      setDashboard(graph);
      if (selectedDeckId === deckId) {
        setSelectedDeckId(ALL_DECK_ID);
        setSelectedTechnologyId(null);
        setSelectedTechnology(emptyTechnologyState);
      }
      showToast("牌组已删除（卡牌保留）");
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : "删除牌组失败");
    } finally {
      setDeletingDeckId(null);
    }
  };

  const handleOpenSyncDialog = () => {
    if (isSyncDrafting) {
      showToast("当前有待确认草稿，请先点击右上角确认或取消");
      return;
    }
    clearToast();
    setIsSyncDialogOpen(true);
  };

  const handleCopyModelPrompt = async () => {
    const prompt = `你是技术知识图谱整理助手，善于对代码、博客文章、技术文档等进行归纳总结，提取出其中的技术栈。` +
    `现有一个DAG图谱，以卡牌表示技术，边表示依赖关系。我需要你根据现有卡牌内容，生成针对上传文件的图谱更新JSON列表。` +
    `如果上传的文件中包含current.json，则现有卡牌定义在该文件中，否则现有卡牌为空。`+
    `你生成的JSON列表的每一项必须满足以下数据结构：
- name (必填，尽量使用中文，专有名词可以使用英文，保持简短)
- id (可选，若已有卡牌请复用其 id)
- summary (描述该技术的定义、用途、特点、优势等，保持简短)
- time_spent_hours (评估我在上传文件中实现这个技术所花费的时间)
- rarity_index (设为默认值1)
- active_user_count (设为默认值1)
- dependency_ids (可选，表示该卡牌的前置依赖卡牌 id 列表)

要求：
1) 优先复用当前卡牌池里语义最接近的卡牌（输出其 id 并可更新其他字段）。
2) 若没有合适卡牌，则创建新卡牌（不提供 id 也可）。
3) dependency_ids 仅填写当前卡牌池中已存在的 id（可为空数组）。
4) 仅输出 JSON 列表，不要输出 Markdown、解释、代码块围栏。

`;
    try {
      await navigator.clipboard.writeText(prompt);
      showToast("已复制大模型提示词");
    } catch (clipboardError) {
      showToast(clipboardError instanceof Error ? clipboardError.message : "复制失败");
    }
  };

  const handleDownloadNodeJson = async () => {
    clearToast();
    setExporting(true);
    try {
      const payload = await cardSensusApi.exportTechnologies();
      const blob = new Blob([JSON.stringify(payload.items, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      // const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `current.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      showToast("已下载当前JSON快照");
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : "下载失败");
    } finally {
      setExporting(false);
    }
  };

  const handleApplySyncJson = async () => {
    if (syncing || !dashboard) {
      return;
    }
    clearToast();
    let parsed: unknown;
    try {
      parsed = JSON.parse(syncJsonText);
    } catch (parseError) {
      showToast(parseError instanceof Error ? `JSON 解析失败：${parseError.message}` : "JSON 解析失败");
      return;
    }
    if (!Array.isArray(parsed)) {
      showToast("JSON 必须是列表（array）");
      return;
    }

    setSyncing(true);
    try {
      const items = (parsed as TechnologySyncItemPayload[])
        .map(normalizeSyncItem)
        .filter((item): item is TechnologySyncItemPayload => Boolean(item));
      const result = await cardSensusApi.syncTechnologies(items);
      const graph = await cardSensusApi.getDashboardGraph();
      setDashboard(graph);
      setSyncDraftChanges(null);
      if (result.added_ids[0] || result.updated_ids[0]) {
        setSelectedTechnologyId(result.added_ids[0] ?? result.updated_ids[0]);
      }
      showToast(`已写入数据库：新增 ${result.added_ids.length}，更新 ${result.updated_ids.length}`);
      setIsSyncDialogOpen(false);
      setSyncJsonText("");
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="state-shell">正在加载图谱数据...</div>;
  }

  if (!dashboard) {
    return <div className="state-shell">接口连接失败：{loadError ?? "未知错误"}</div>;
  }

  return (
    <main className="dashboard-shell">
      <section className="workspace-stage">
        <div className="graph-action-group">
          <button
            type="button"
            className="graph-action-btn graph-action-btn--icon"
            title="在第一层新增无依赖卡牌"
            aria-label="在第一层新增无依赖卡牌"
            disabled={creatingStandaloneCard || Boolean(creatingFromId) || isSyncDrafting}
            onClick={() => void handleCreateStandaloneCard()}
          >
            {creatingStandaloneCard ? <LoadingOutlined spin /> : <PlusOutlined />}
          </button>
          <button
            type="button"
            className="graph-action-btn graph-action-btn--icon"
            title="通过 JSON 同步卡牌"
            aria-label="通过 JSON 同步卡牌"
            onClick={handleOpenSyncDialog}
          >
            <FileTextOutlined />
          </button>
          <button
            type="button"
            className="graph-action-btn graph-action-btn--icon"
            title="复制大模型提示词"
            aria-label="复制大模型提示词"
            onClick={handleCopyModelPrompt}
          >
            <CopyOutlined />
          </button>
          <button
            type="button"
            className="graph-action-btn graph-action-btn--icon"
            title="下载当前卡牌 JSON"
            aria-label="下载当前卡牌 JSON"
            disabled={exporting}
            onClick={handleDownloadNodeJson}
          >
            {exporting ? <LoadingOutlined spin /> : <DownloadOutlined />}
          </button>
          <button
            type="button"
            className="graph-action-btn graph-action-btn--icon"
            title="全局重排卡牌布局并写入数据文件"
            aria-label="全局重排卡牌布局"
            disabled={isSyncDrafting || relayoutSaving}
            onClick={() => void handleRelayout()}
          >
            {relayoutSaving ? <LoadingOutlined spin /> : <ReloadOutlined />}
          </button>
        </div>

        <div className="deck-view-shell">
          <div className="deck-view-shell__map">
            {activeDeckCard ? (
              <TopologyMap
                technologies={activeDeckCard.technologies}
                relations={activeDeckRelations}
                projects={activeDeckCard.project ? [activeDeckCard.project] : dashboard.projects}
                selectedTechnologyId={selectedTechnologyId}
                onSelectTechnology={handleSelectTechnology}
                onClearSelection={handleClearSelection}
                onCreateDerived={handleCreateDerived}
                onCreateDependency={handleCreateDependency}
                onDeleteDependency={handleDeleteDependency}
                isDependencyLinkAllowed={isDependencyLinkAllowed}
                creatingFromId={creatingFromId}
                glowingTechnologyIds={glowingTechnologyIds}
                editable
                layoutKey={activeDeckLayoutKey}
              />
            ) : (
              <div className="deck-view-placeholder" role="status">
                <p className="deck-view-placeholder__title">选择一个牌组</p>
                <p className="deck-view-placeholder__hint">左侧会展示该牌组包含的全部卡牌及其依赖关系。</p>
              </div>
            )}

            {selectedTechnologyId ? (
              <div className="workspace-stage__inspector">
                <InspectorPanel
                  technology={selectedTechnology.technology}
                  loading={!selectedTechnology.technology}
                  relatedProjects={selectedTechnology.relatedProjects}
                  prerequisites={selectedTechnology.prerequisites}
                  unlocks={selectedTechnology.unlocks}
                  onSelectProject={handleSelectProject}
                  onSelectTechnology={handleSelectTechnology}
                  onUpdateTechnology={handleUpdateTechnology}
                  onDeleteTechnology={handleDeleteTechnology}
                  enterEditForTechnologyId={enterEditForTechnologyId}
                  onEnterEditConsumed={handleEnterEditConsumed}
                  onAppendResource={handleAppendResource}
                  onRegenerateImage={handleRegenerateImage}
                />
              </div>
            ) : null}
          </div>

          <aside className="deck-sidebar">
            <div className="deck-sidebar__search-row">
              <input
                type="search"
                value={deckSearchKeyword}
                onChange={(event) => setDeckSearchKeyword(event.target.value)}
                placeholder={isCreatingDeck || isEditingDeck ? "搜索和过滤卡牌" : "搜索牌组名称或说明"}
                aria-label={isCreatingDeck || isEditingDeck ? "搜索和过滤卡牌" : "搜索牌组名称或说明"}
              />
              <div className="deck-sidebar__actions">
                {isCreatingDeck ? (
                  <>
                    <button
                      type="button"
                      className="deck-sidebar__action deck-sidebar__action--confirm"
                      disabled={creatingDeck}
                      onClick={() => void handleConfirmCreateDeck()}
                    >
                      {creatingDeck ? "确认中..." : "确认"}
                    </button>
                    <button
                      type="button"
                      className="deck-sidebar__action deck-sidebar__action--cancel"
                      disabled={creatingDeck}
                      onClick={handleToggleDeckCreateMode}
                      aria-label="取消创建牌组"
                      title="取消创建牌组"
                    >
                      取消
                    </button>
                  </>
                ) : isEditingDeck ? (
                  <>
                    <button
                      type="button"
                      className="deck-sidebar__action deck-sidebar__action--confirm"
                      disabled={updatingDeck}
                      onClick={() => void handleConfirmUpdateDeck()}
                    >
                      {updatingDeck ? "保存中..." : "保存"}
                    </button>
                    <button
                      type="button"
                      className="deck-sidebar__action deck-sidebar__action--cancel"
                      disabled={updatingDeck}
                      onClick={handleCancelDeckEdit}
                      aria-label="取消编辑牌组"
                      title="取消编辑牌组"
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="deck-sidebar__action"
                    disabled={creatingDeck || updatingDeck}
                    onClick={handleToggleDeckCreateMode}
                  >
                    增加牌组
                  </button>
                )}
              </div>
            </div>

            <div className="deck-sidebar__list" aria-label="牌组列表">
              {isEditingDeck ? (
                <div className="deck-sidebar__edit-name">
                  <label htmlFor="deck-edit-name">牌组名称</label>
                  <input
                    id="deck-edit-name"
                    type="text"
                    value={editingDeckName}
                    onChange={(event) => setEditingDeckName(event.target.value)}
                    placeholder="请输入牌组名称"
                    maxLength={64}
                  />
                  <label htmlFor="deck-edit-summary">牌组说明</label>
                  <textarea
                    id="deck-edit-summary"
                    value={editingDeckSummary}
                    onChange={(event) => setEditingDeckSummary(event.target.value)}
                    placeholder="请输入牌组说明"
                    maxLength={300}
                    rows={3}
                  />
                  <p>已选标签 {selectedDeckTechnologyIds.length} 个</p>
                </div>
              ) : null}
              {isCreatingDeck || isEditingDeck ? (
                filteredNodePickerCards.length > 0 ? (
                  filteredNodePickerCards.map(({ technology, projectCount }) => (
                    <label
                      key={technology.id}
                      className={`deck-card deck-card--node-picker ${
                        selectedDeckTechnologyIds.includes(technology.id) ? "deck-card--active" : ""
                      }`}
                    >
                      <div className="deck-card__checkbox">
                        <input
                          type="checkbox"
                          checked={selectedDeckTechnologyIds.includes(technology.id)}
                          onChange={() => handleToggleDeckTechnology(technology.id)}
                          aria-label={`选择卡牌 ${technology.name}`}
                        />
                      </div>
                      <div className="deck-card__meta">
                        <span>时间 {formatHours(technology.time_spent_hours)}</span>
                        <span>品质 {formatPercent(technology.rarity_index)}</span>
                        <span>牌组 {projectCount}</span>
                      </div>
                      <div className="deck-card__body">
                        <strong>{technology.name}</strong>
                        <p>{technology.summary}</p>
                      </div>
                    </label>
                  ))
                ) : (
                  <div className="deck-sidebar__empty" role="status">
                    没有命中该关键词的卡牌
                  </div>
                )
              ) : filteredDeckCards.length > 0 ? (
                <>
                  {pinnedDeckCard ? (
                    <div key={pinnedDeckCard.deckId} className="deck-card-wrap">
                      <button
                        type="button"
                        className={`deck-card deck-card--pinned ${selectedDeckId === pinnedDeckCard.deckId ? "deck-card--active" : ""}`}
                        onClick={() => handleSelectDeckProject(pinnedDeckCard.deckId)}
                      >
                        <div className="deck-card__meta">
                          <span>时间 {formatHours(pinnedDeckCard.totalHours)}</span>
                          <span>品质 {formatPercent(pinnedDeckCard.rarityProduct)}</span>
                          <span>拥趸 1</span>
                          <span className="deck-card__pinned-badge">
                            <VerticalAlignTopOutlined />
                            <span>置顶</span>
                          </span>
                        </div>
                        <div className="deck-card__title-row">
                          <strong>{pinnedDeckCard.name}</strong>
                          <span>{pinnedDeckCard.technologies.length} 张卡牌</span>
                        </div>
                        <div className="deck-card__body">
                          <p>{pinnedDeckCard.summary}</p>
                        </div>
                      </button>
                    </div>
                  ) : null}

                  <div ref={deckListRef} className="deck-sidebar__scroll">
                    {scrollableDeckCards.map((deckCard) => (
                      <div key={deckCard.deckId} className="deck-card-wrap">
                        <button
                          type="button"
                          ref={(element) => {
                            deckItemRefs.current.set(deckCard.deckId, element);
                          }}
                          className={`deck-card ${selectedDeckId === deckCard.deckId ? "deck-card--active" : ""}`}
                          onClick={() => handleSelectDeckProject(deckCard.deckId)}
                        >
                          <div className="deck-card__meta">
                            <span>时间 {formatHours(deckCard.totalHours)}</span>
                            <span>品质 {formatPercent(deckCard.rarityProduct)}</span>
                            <span>拥趸 1</span>
                          </div>
                          <div className="deck-card__title-row">
                            <strong>{deckCard.name}</strong>
                            <span>{deckCard.technologies.length} 张卡牌</span>
                          </div>
                          <div className="deck-card__body">
                            <p>{deckCard.summary}</p>
                          </div>
                        </button>
                        <div className="deck-card__tools">
                          <button
                            type="button"
                            className="deck-card__tool deck-card__tool--edit"
                            disabled={Boolean(deletingDeckId) || updatingDeck || isCreatingDeck || isEditingDeck}
                            aria-label={`编辑牌组 ${deckCard.name}`}
                            title="编辑牌组"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleStartDeckEdit(deckCard);
                            }}
                          >
                            <EditOutlined />
                          </button>
                          <button
                            type="button"
                            className="deck-card__tool deck-card__tool--delete"
                            disabled={Boolean(deletingDeckId) || updatingDeck || isCreatingDeck || isEditingDeck}
                            aria-label={`删除牌组 ${deckCard.name}`}
                            title="删除牌组（保留卡牌）"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteDeck(deckCard.deckId);
                            }}
                          >
                            <DeleteOutlined />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="deck-sidebar__empty" role="status">
                  没有命中该关键词的牌组
                </div>
              )}
            </div>
          </aside>
        </div>

        {isSyncDrafting ? (
          <div className="sync-draft-actions" role="toolbar" aria-label="草稿同步操作">
            <button
              type="button"
              className="graph-action-btn graph-action-btn--confirm"
              title="确认提交草稿同步"
              aria-label="确认提交草稿同步"
              disabled={syncCommitting}
              onClick={() => void handleCommitSyncDraft()}
            >
              {syncCommitting ? "…" : "✓"}
            </button>
            <button
              type="button"
              className="graph-action-btn graph-action-btn--cancel"
              title="取消草稿同步"
              aria-label="取消草稿同步"
              disabled={syncCommitting}
              onClick={() => void handleDiscardSyncDraft()}
            >
              ✕
            </button>
          </div>
        ) : null}

      </section>

      {isSyncDialogOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="JSON 同步卡牌">
          <div className="modal-card">
            <h3>JSON 同步卡牌</h3>
            <p>输入 JSON 列表。重名或同 id 卡牌会更新，点击应用后将直接写入数据库。</p>
            <textarea
              className="modal-json-input"
              value={syncJsonText}
              onChange={(event) => setSyncJsonText(event.target.value)}
              placeholder='[\n  {"name":"Neo4j","summary":"图数据库","time_spent_hours":0,"rarity_index":0.72,"active_user_count":0}\n]'
            />
            <div className="modal-actions">
              <button type="button" className="modal-btn" onClick={() => setIsSyncDialogOpen(false)}>
                取消
              </button>
              <button type="button" className="modal-btn modal-btn--primary" disabled={syncing} onClick={handleApplySyncJson}>
                {syncing ? "同步中..." : "应用并写入"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="workspace-statusbar" role="status" aria-live="polite">
        {toast ?? "就绪"}
      </div>
    </main>
  );
}
