import type { TechnologyStatus } from "../../entities/technology/model/types";

const LABELS: Record<TechnologyStatus, string> = {
  exploring: "探索期",
  proficient: "熟练期",
  expert: "专精期"
};

interface StatusPillProps {
  status: TechnologyStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  return <span className={`status-pill status-pill--${status}`}>{LABELS[status]}</span>;
}

