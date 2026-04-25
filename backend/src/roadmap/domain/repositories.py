from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Iterable, List, Mapping

from roadmap.domain.models import ProjectNode, RelationEdge, TechnologyNode


class RoadmapRepository(ABC):
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
    def add_derived_technology(self, parent_id: str) -> TechnologyNode:
        """在依赖关系上位于 parent 的上一层新建节点：parent ->(dependency)-> new。"""
        raise NotImplementedError

    @abstractmethod
    def update_technology(self, technology_id: str, updates: Mapping[str, Any]) -> TechnologyNode:
        raise NotImplementedError

    @abstractmethod
    def delete_technology(self, technology_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def sync_technologies(self, items: Iterable[Mapping[str, Any]]) -> Dict[str, List[str]]:
        """批量同步节点：同 id/同名称会更新，否则新增。"""
        raise NotImplementedError

    @abstractmethod
    def export_technologies(self) -> List[Dict[str, Any]]:
        """导出当前节点池，供外部模型生成增量 JSON 使用。"""
        raise NotImplementedError

