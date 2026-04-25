import type { Project } from "../../entities/project/model/types";
import type { Relation, Technology, TechnologyDetail } from "../../entities/technology/model/types";
import { httpDelete, httpGet, httpPatch, httpPost } from "./http";

export interface Summary {
  total_technologies: number;
  total_projects: number;
  active_categories: number;
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

export interface ProjectProfileResponse {
  project: Project;
  related_technologies: Technology[];
}

export interface TechnologyUpdatePayload {
  name?: string;
  category?: string;
  summary?: string;
  time_spent_hours?: number;
  rarity_index?: number;
  active_user_count?: number;
}

export interface TechnologySyncItemPayload {
  id?: string;
  name: string;
  category?: string;
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
  category: string;
  summary: string;
  time_spent_hours: number;
  rarity_index: number;
  active_user_count: number;
}

export interface TechnologyExportResponse {
  items: TechnologyExportItem[];
}

export const roadmapApi = {
  getDashboardGraph: () => httpGet<DashboardGraphResponse>("/graph"),
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
  deleteTechnology: (technologyId: string) =>
    httpDelete(`/technologies/${encodeURIComponent(technologyId)}`),
  getProjectProfile: (projectId: string) => httpGet<ProjectProfileResponse>(`/projects/${projectId}`)
};

