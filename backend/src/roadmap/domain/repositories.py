from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Iterable, List, Mapping

from .models import ProjectNode, RelationEdge, TechnologyNode


class CardSensusRepository(ABC):
    @abstractmethod
    def list_technologies(self) -> Iterable[TechnologyNode]:
        raise NotImplementedError

    @abstractmethod
    def get_technology(self, technology_id: str) -> TechnologyNode | None:
        raise NotImplementedError

    @abstractmethod
    def list_relations(self) -> Iterable[RelationEdge]:
        raise NotImplementedError

    @abstractmethod
    def list_projects(self) -> Iterable[ProjectNode]:
        raise NotImplementedError

    @abstractmethod
    def get_project(self, project_id: str) -> ProjectNode | None:
        raise NotImplementedError

    @abstractmethod
    def create_project(self, technology_ids: Iterable[str]) -> ProjectNode:
        """创建一个新牌组，并将其关联到给定技术卡牌；新牌组应插入到列表顶部。"""
        raise NotImplementedError

    @abstractmethod
    def delete_project(self, project_id: str) -> None:
        """删除一个牌组，不影响技术卡牌与依赖关系。"""
        raise NotImplementedError

    @abstractmethod
    def update_project(self, project_id: str, *, name: str, summary: str, technology_ids: Iterable[str]) -> ProjectNode:
        """更新牌组名称、说明与关联技术卡牌。"""
        raise NotImplementedError

    @abstractmethod
    def add_derived_technology(self, parent_id: str) -> TechnologyNode:
        """在依赖关系上位于 parent 的上一层新建卡牌：parent ->(dependency)-> new。"""
        raise NotImplementedError

    @abstractmethod
    def add_dependency_relation(self, source_id: str, target_id: str) -> None:
        """追加一条 dependency：target 依赖 source（与既有边重复则静默跳过）。"""
        raise NotImplementedError

    @abstractmethod
    def delete_dependency_relation(self, source_id: str, target_id: str) -> None:
        """删除一条 dependency；不存在则抛 ValueError。"""
        raise NotImplementedError

    @abstractmethod
    def update_technology_layouts(self, layouts: Mapping[str, tuple[float, float]]) -> None:
        """批量更新卡牌在图谱中的 layout.x / layout.y（写入持久化）。"""
        raise NotImplementedError

    @abstractmethod
    def update_technology(self, technology_id: str, updates: Mapping[str, Any]) -> TechnologyNode:
        raise NotImplementedError

    @abstractmethod
    def delete_technology(self, technology_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def sync_technologies(self, items: Iterable[Mapping[str, Any]]) -> Dict[str, List[str]]:
        """批量同步卡牌：同 id/同名称会更新，否则新增。"""
        raise NotImplementedError

    @abstractmethod
    def export_technologies(self) -> List[Dict[str, Any]]:
        """导出当前卡牌池，供外部模型生成增量 JSON 使用。"""
        raise NotImplementedError

    @abstractmethod
    def append_technology_resource_note(self, technology_id: str, text: str) -> None:
        """在指定技术卡牌下追加一条笔记型资料（写入 resources 数组）。"""
        raise NotImplementedError
