import type { Summary } from "../../shared/api/roadmapApi";

interface SummaryPanelProps {
  summary: Summary;
}

const items = [
  { key: "total_technologies", label: "技术节点" },
  { key: "total_projects", label: "牌组" },
  { key: "expert_nodes", label: "专精节点" }
] as const;

export function SummaryPanel({ summary }: SummaryPanelProps) {
  return (
    <section className="summary-panel">
      {items.map((item) => (
        <article key={item.key} className="summary-card">
          <span>{item.label}</span>
          <strong>{summary[item.key]}</strong>
        </article>
      ))}
    </section>
  );
}

