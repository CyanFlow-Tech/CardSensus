import type { Technology, TechnologyStatus } from "../../entities/technology/model/types";
import { formatHours, formatPercent } from "../../shared/lib/format";
import { StatusPill } from "../../shared/ui/StatusPill";

interface KanbanBoardProps {
  technologies: Technology[];
  selectedTechnologyId: string | null;
  onSelectTechnology: (technologyId: string) => void;
}

const KANBAN_STATUS_ORDER: TechnologyStatus[] = ["exploring", "proficient", "expert"];

const KANBAN_STATUS_LABEL: Record<TechnologyStatus, string> = {
  exploring: "探索期",
  proficient: "熟练期",
  expert: "专精期"
};

export function KanbanBoard({ technologies, selectedTechnologyId, onSelectTechnology }: KanbanBoardProps) {
  const emptyByStatus: Record<TechnologyStatus, Technology[]> = {
    exploring: [],
    proficient: [],
    expert: []
  };
  const byStatus = technologies.reduce<Record<TechnologyStatus, Technology[]>>((accumulator, technology) => {
    accumulator[technology.status].push(technology);
    return accumulator;
  }, emptyByStatus);

  return (
    <section className="kanban-board">
      {KANBAN_STATUS_ORDER.map((status) => {
        const items = byStatus[status];
        return (
        <article key={status} className="kanban-column">
          <header>
            <h3>{KANBAN_STATUS_LABEL[status]}</h3>
            <span>{items.length} 个节点</span>
          </header>
          <div className="kanban-column__body">
            {items.map((technology) => (
              <button
                type="button"
                key={technology.id}
                className={`kanban-card ${selectedTechnologyId === technology.id ? "kanban-card--selected" : ""}`}
                onClick={() => onSelectTechnology(technology.id)}
              >
                <div className="kanban-card__header">
                  <strong>{technology.name}</strong>
                  <StatusPill status={technology.status} />
                </div>
                <p>{technology.summary}</p>
                <div className="kanban-card__footer">
                  <span>{formatHours(technology.time_spent_hours)}</span>
                  <span>难度 {formatPercent(technology.rarity_index)}</span>
                </div>
              </button>
            ))}
          </div>
        </article>
        );
      })}
    </section>
  );
}

