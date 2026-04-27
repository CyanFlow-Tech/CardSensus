import type { Project } from "../../entities/project/model/types";
import type { Relation, Technology, TechnologyDetail } from "../../entities/technology/model/types";
import { httpDelete, httpGet, httpPatch, httpPatchNoContent, httpPost, httpPostNoContent } from "./http";

export interface Summary {
  total_technologies: number;
  total_projects: number;
  expert_nodes: number;
}

export interface DashboardGraphResponse {
  technologies: Technology[];
  relations: Relation[];
  projects: Project[];
  summary: Summary;
}

export interface TechnologyProfileResponse {
  technology: TechnologyDetail;
  related_projects: Project[];
  prerequisites: Technology[];
  unlocks: Technology[];
}

export interface ProjectCreatePayload {
  technology_ids: string[];
}

export interface ProjectUpdatePayload {
  name: string;
  summary: string;
  technology_ids: string[];
}

export interface TechnologyUpdatePayload {
  name?: string;
  summary?: string;
  time_spent_hours?: number;
  rarity_index?: number;
  active_user_count?: number;
}

export interface TechnologySyncItemPayload {
  id?: string;
  name: string;
  summary?: string;
  time_spent_hours?: number;
  rarity_index?: number;
  active_user_count?: number;
}

export interface TechnologySyncResponse {
  added_ids: string[];
  updated_ids: string[];
  skipped_names: string[];
}

export interface TechnologyExportItem {
  id: string;
  name: string;
  summary: string;
  time_spent_hours: number;
  rarity_index: number;
  active_user_count: number;
}

export interface TechnologyExportResponse {
  items: TechnologyExportItem[];
}

export interface TechnologyLayoutItemPayload {
  id: string;
  x: number;
  y: number;
}

export const roadmapApi = {
  getDashboardGraph: () => httpGet<DashboardGraphResponse>("/graph"),
  addDependencyRelation: (sourceId: string, targetId: string) =>
    httpPostNoContent("/relations", {
      source_id: sourceId,
      target_id: targetId,
      relation_type: "dependency"
    }),
  deleteDependencyRelation: (sourceId: string, targetId: string) =>
    httpDelete(
      `/relations?${new URLSearchParams({ source_id: sourceId, target_id: targetId }).toString()}`
    ),
  updateTechnologyLayouts: (items: TechnologyLayoutItemPayload[]) =>
    httpPatchNoContent("/technologies/layout", { items }),
  getTechnologyProfile: (technologyId: string) =>
    httpGet<TechnologyProfileResponse>(`/technologies/${technologyId}`),
  createDerivedTechnology: (parentId: string) =>
    httpPost<TechnologyProfileResponse>(`/technologies/${encodeURIComponent(parentId)}/derived`),
  syncTechnologies: (items: TechnologySyncItemPayload[]) =>
    httpPost<TechnologySyncResponse>("/technologies/sync", { items }),
  exportTechnologies: () => httpGet<TechnologyExportResponse>("/technologies/export"),
  updateTechnology: (technologyId: string, payload: TechnologyUpdatePayload) =>
    httpPatch<TechnologyProfileResponse>(
      `/technologies/${encodeURIComponent(technologyId)}`,
      payload
    ),
  appendTechnologyResourceNote: (technologyId: string, text: string) =>
    httpPost<TechnologyProfileResponse>(`/technologies/${encodeURIComponent(technologyId)}/resources`, { text }),
  deleteTechnology: (technologyId: string) =>
    httpDelete(`/technologies/${encodeURIComponent(technologyId)}`),
  createProject: (payload: ProjectCreatePayload) =>
    httpPost<{ project: Project; related_technologies: Technology[] }>("/projects", payload),
  updateProject: (projectId: string, payload: ProjectUpdatePayload) =>
    httpPatch<{ project: Project; related_technologies: Technology[] }>(
      `/projects/${encodeURIComponent(projectId)}`,
      payload
    ),
  deleteProject: (projectId: string) =>
    httpDelete(`/projects/${encodeURIComponent(projectId)}`)
};
