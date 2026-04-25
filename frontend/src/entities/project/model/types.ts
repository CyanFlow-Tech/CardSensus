export interface Project {
  id: string;
  name: string;
  summary: string;
  repository_url: string;
  status: "active" | "archived" | "incubating";
  associated_tech: string[];
  highlights: string[];
}

