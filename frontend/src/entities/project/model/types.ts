import type { LayoutPosition } from "../../technology/model/types";

export interface Project {
  id: string;
  name: string;
  summary: string;
  repository_url: string;
  status: "active" | "archived" | "incubating";
  associated_tech: string[];
  layouts: Record<string, LayoutPosition>;
  highlights: string[];
}
