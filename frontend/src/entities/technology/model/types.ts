export type TechnologyStatus = "exploring" | "proficient" | "expert";

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface ResourceItem {
  id: string;
  title: string;
  url: string;
  resource_type: string;
  description: string;
}

export interface Technology {
  id: string;
  name: string;
  category: string;
  hashtags?: string[];
  summary: string;
  time_spent_hours: number;
  status: TechnologyStatus;
  rarity_index: number;
  active_user_count: number;
  layout: LayoutPosition;
  resource_count: number;
}

export interface TechnologyDetail extends Technology {
  resources: ResourceItem[];
  project_ids: string[];
}

export interface Relation {
  source_id: string;
  target_id: string;
  relation_type: string;
}

