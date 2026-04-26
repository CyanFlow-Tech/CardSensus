import { PlusOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import type { Project } from "../../entities/project/model/types";
import type { Technology, TechnologyDetail } from "../../entities/technology/model/types";
import type { TechnologyUpdatePayload } from "../../shared/api/roadmapApi";
import { LinkifiedText, resourceDisplayText } from "../../shared/lib/linkifyText";
import { formatHours } from "../../shared/lib/format";
import { getRarityMeta } from "../../shared/lib/rarity";

interface InspectorPanelProps {
  technology: TechnologyDetail | null;
  relatedProjects: Project[];
  prerequisites: Technology[];
  unlocks: Technology[];
  onSelectProject: (projectId: string) => void;
  onSelectTechnology: (technologyId: string) => void;
  onUpdateTechnology: (technologyId: string, payload: TechnologyUpdatePayload) => Promise<void>;
  onDeleteTechnology: (technologyId: string) => Promise<void>;
  /** 为某 id 打开时自动进入编辑态（用后即通过 onEnterEditConsumed 清理） */
  enterEditForTechnologyId: string | null;
  onEnterEditConsumed: () => void;
  onAppendResource?: (text: string) => void | Promise<void>;
}

function IconPencil() {
  return (
    <svg className="inspector-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 20h4l9.5-9.5-4-4L4 16v4z" strokeLinejoin="round" />
      <path d="m13.5 6.5 4 4" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="inspector-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" strokeLinecap="round" />
      <path d="M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 1.8-1.3L20 7" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="inspector-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconX() {
  return (
    <svg className="inspector-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

export function InspectorPanel({
  technology,
  relatedProjects,
  prerequisites,
  unlocks,
  onSelectProject,
  onSelectTechnology,
  onUpdateTechnology,
  onDeleteTechnology,
  enterEditForTechnologyId,
  onEnterEditConsumed,
  onAppendResource
}: InspectorPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const prevTechIdRef = useRef<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftTime, setDraftTime] = useState(0);
  const [draftRarity, setDraftRarity] = useState(0);
  const [draftUsers, setDraftUsers] = useState(0);
  const [resourceInputOpen, setResourceInputOpen] = useState(false);
  const [resourceDraft, setResourceDraft] = useState("");
  const resourceInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!technology) {
      return;
    }
    setDraftName(technology.name);
    setDraftSummary(technology.summary);
    setDraftTime(technology.time_spent_hours);
    setDraftRarity(technology.rarity_index);
    setDraftUsers(technology.active_user_count);
  }, [technology]);

  useEffect(() => {
    setResourceInputOpen(false);
    setResourceDraft("");
  }, [technology?.id]);

  useEffect(() => {
    if (resourceInputOpen) {
      resourceInputRef.current?.focus();
    }
  }, [resourceInputOpen]);

  useEffect(() => {
    if (!technology) {
      prevTechIdRef.current = undefined;
      return;
    }
    const { id } = technology;
    if (enterEditForTechnologyId && id === enterEditForTechnologyId) {
      setIsEditing(true);
      onEnterEditConsumed();
      prevTechIdRef.current = id;
      return;
    }
    if (prevTechIdRef.current !== id) {
      setIsEditing(false);
      prevTechIdRef.current = id;
    }
  }, [technology, enterEditForTechnologyId, onEnterEditConsumed]);

  if (!technology) {
    return (
      <aside className="inspector-panel inspector-panel--placeholder">
        <h2>选择一个技术节点</h2>
        <p>查看该节点的熟练度状态、前置依赖、所在牌组与沉淀资料。</p>
      </aside>
    );
  }

  const rarity = getRarityMeta(technology.rarity_index);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdateTechnology(technology.id, {
        name: draftName,
        summary: draftSummary,
        time_spent_hours: draftTime,
        rarity_index: draftRarity,
        active_user_count: draftUsers
      });
      setIsEditing(false);
    } catch {
      /* 错误由父级展示 */
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraftName(technology.name);
    setDraftSummary(technology.summary);
    setDraftTime(technology.time_spent_hours);
    setDraftRarity(technology.rarity_index);
    setDraftUsers(technology.active_user_count);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("确定要删除此技术节点吗？相关依赖边与项目关联引用也会被移除。")) {
      return;
    }
    setDeleting(true);
    try {
      await onDeleteTechnology(technology.id);
    } catch {
      /* 错误由父级展示 */
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmResourceAdd = async () => {
    const t = resourceDraft.trim();
    if (!t) {
      setResourceInputOpen(false);
      setResourceDraft("");
      return;
    }
    try {
      await onAppendResource?.(t);
      setResourceDraft("");
      setResourceInputOpen(false);
    } catch {
      /* 错误由父级展示 */
    }
  };

  return (
    <aside className="inspector-panel">
      <div className="inspector-panel__section">
        <div className="inspector-panel__head">
          <div className="inspector-panel__head-text">
            {isEditing ? (
              <input
                type="text"
                className="inspector-field-input inspector-field-input--title"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="名称"
                aria-label="名称"
              />
            ) : (
              <h2>{technology.name}</h2>
            )}
          </div>

          <div className="inspector-panel__tools" role="toolbar" aria-label="节点操作">
            {!isEditing && (
              <>
                <button type="button" className="inspector-icon-btn" title="编辑" onClick={() => setIsEditing(true)} aria-label="进入编辑">
                  <IconPencil />
                </button>
                <button
                  type="button"
                  className="inspector-icon-btn inspector-icon-btn--danger"
                  title="删除"
                  disabled={deleting}
                  onClick={handleDelete}
                  aria-label="删除节点"
                >
                  <IconTrash />
                </button>
              </>
            )}
            {isEditing && (
              <>
                <button
                  type="button"
                  className="inspector-icon-btn inspector-icon-btn--primary"
                  title="保存"
                  disabled={saving}
                  onClick={handleSave}
                  aria-label="保存"
                >
                  <IconCheck />
                </button>
                <button
                  type="button"
                  className="inspector-icon-btn"
                  title="取消"
                  disabled={saving}
                  onClick={handleCancel}
                  aria-label="取消编辑"
                >
                  <IconX />
                </button>
                <button
                  type="button"
                  className="inspector-icon-btn inspector-icon-btn--danger"
                  title="删除"
                  disabled={saving || deleting}
                  onClick={handleDelete}
                  aria-label="删除节点"
                >
                  <IconTrash />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="inspector-panel__intro">
          {isEditing ? (
            <textarea
              className="inspector-field-textarea inspector-field-textarea--intro"
              value={draftSummary}
              onChange={(e) => setDraftSummary(e.target.value)}
              placeholder="简介"
              rows={4}
              aria-label="简介"
            />
          ) : (
            <p className="inspector-panel__intro-body">{technology.summary}</p>
          )}
        </div>
      </div>

      <div className="inspector-panel__section inspector-panel__metrics">
        {isEditing ? (
          <>
            <label className="inspector-field-metric">
              <span>能量（小时）</span>
              <input
                type="number"
                className="inspector-field-input"
                value={Number.isNaN(draftTime) ? "" : draftTime}
                min={0}
                step={0.1}
                onChange={(e) => setDraftTime(parseFloat(e.target.value) || 0)}
              />
            </label>
            <label className="inspector-field-metric">
              <span>品质（0–1）</span>
              <input
                type="number"
                className="inspector-field-input"
                value={Number.isNaN(draftRarity) ? "" : draftRarity}
                min={0}
                max={1}
                step={0.01}
                onChange={(e) => setDraftRarity(parseFloat(e.target.value) || 0)}
              />
            </label>
            <label className="inspector-field-metric">
              <span>拥趸</span>
              <input
                type="number"
                className="inspector-field-input"
                value={Number.isNaN(draftUsers) ? "" : draftUsers}
                min={0}
                step={1}
                onChange={(e) => setDraftUsers(parseInt(e.target.value, 10) || 0)}
              />
            </label>
          </>
        ) : (
          <>
            <div>
              <span>能量</span>
              <strong>{formatHours(technology.time_spent_hours)}</strong>
            </div>
            <div>
              <span>品质</span>
              <strong className={`rarity-text--${rarity.colorToken}`}>{rarity.label}</strong>
            </div>
            <div>
              <span>拥趸</span>
              <strong>{technology.active_user_count}</strong>
            </div>
          </>
        )}
      </div>

      {prerequisites.length > 0 || unlocks.length > 0 ? (
        <div className="inspector-panel__section">
          <h3>依赖关系</h3>
          {prerequisites.length > 0 ? (
            <div className="dependency-block">
              <span>前置</span>
              <div className="tag-group">
                {prerequisites.map((item) => (
                  <button key={item.id} type="button" className="tag-button" onClick={() => onSelectTechnology(item.id)}>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {unlocks.length > 0 ? (
            <div className="dependency-block">
              <span>解锁</span>
              <div className="tag-group">
                {unlocks.map((item) => (
                  <button key={item.id} type="button" className="tag-button" onClick={() => onSelectTechnology(item.id)}>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {relatedProjects.length > 0 ? (
        <div className="inspector-panel__section">
          <h3>所在牌组</h3>
          <div className="project-list">
            {relatedProjects.map((project) => (
              <button key={project.id} type="button" className="project-card" onClick={() => onSelectProject(project.id)}>
                <strong>{project.name}</strong>
                <span>{project.summary}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="inspector-panel__section">
        <h3>资料聚合</h3>
        <ul className="inspector-resources-list">
          {technology.resources.map((resource) => (
            <li key={resource.id} className="inspector-resource-item">
              <p className="inspector-resource-body">
                <LinkifiedText text={resourceDisplayText(resource)} />
              </p>
            </li>
          ))}
        </ul>
        {resourceInputOpen ? (
          <textarea
            ref={resourceInputRef}
            className="inspector-field-textarea inspector-resource-add-input"
            value={resourceDraft}
            onChange={(e) => setResourceDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleConfirmResourceAdd();
              }
              if (e.key === "Escape") {
                setResourceInputOpen(false);
                setResourceDraft("");
              }
            }}
            placeholder="输入内容，Enter 提交，Shift+Enter 换行（链接将自动可点）"
            aria-label="新建资料"
            rows={3}
          />
        ) : (
          <button
            type="button"
            className="inspector-resource-add"
            onClick={() => setResourceInputOpen(true)}
            aria-label="添加资料"
          >
            <PlusOutlined className="inspector-resource-add__icon" aria-hidden />
            <span>添加</span>
          </button>
        )}
      </div>
    </aside>
  );
}
