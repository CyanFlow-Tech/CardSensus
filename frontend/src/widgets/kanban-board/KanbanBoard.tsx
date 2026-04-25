import type { Technology } from "../../entities/technology/model/types";
import { formatHours, formatPercent } from "../../shared/lib/format";
import { StatusPill } from "../../shared/ui/StatusPill";

interface KanbanBoardProps {
  technologies: Technology[];
  selectedTechnologyId: string | null;
  onSelectTechnology: (technologyId: string) => void;
}

export function KanbanBoard({ technologies, selectedTechnologyId, onSelectTechnology }: KanbanBoardProps) {
  const categories = technologies.reduce<Record<string, Technology[]>>((accumulator, technology) => {
    accumulator[technology.category] = accumulator[technology.category] || [];
    accumulator[technology.category].push(technology);
    return accumulator;
  }, {});

  return (
    <section className="kanban-board">
      {Object.entries(categories).map(([category, items]) => (
        <article key={category} className="kanban-column">
          <header>
            <h3>{category}</h3>
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
      ))}
    </section>
  );
}

