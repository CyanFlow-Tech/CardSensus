export type DashboardView = "topology" | "kanban";

interface ViewSwitcherProps {
  activeView: DashboardView;
  onChange: (view: DashboardView) => void;
}

export function ViewSwitcher({ activeView, onChange }: ViewSwitcherProps) {
  return (
    <div className="view-switcher" aria-label="切换视图">
      <button
        type="button"
        className={activeView === "topology" ? "is-active" : ""}
        onClick={() => onChange("topology")}
      >
        拓扑图
      </button>
      <button
        type="button"
        className={activeView === "kanban" ? "is-active" : ""}
        onClick={() => onChange("kanban")}
      >
        看板
      </button>
    </div>
  );
}

