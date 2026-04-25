# Roadmap Dynamic Tech Tree

基于 `FastAPI + React + TypeScript` 的动态科技树系统 MVP。项目按可扩展的单仓结构组织，后端使用分层架构隔离领域模型、应用服务和基础设施，前端按 `app / entities / features / widgets / pages / shared` 组织模块。

## 目录结构

```text
backend/
  data/                        # JSON 示例数据，后续可替换为图数据库仓储实现
  src/
    roadmap/
      domain/                  # 领域实体、值对象、仓储接口、状态策略
      application/             # 应用服务与 DTO
      infrastructure/          # JSON 仓储实现
      presentation/            # FastAPI 路由与响应模型
    main.py                    # 应用入口
frontend/
  src/
    app/                       # 应用入口
    entities/                  # 领域实体类型
    features/                  # 可复用交互能力
    widgets/                   # 页面级组合组件
    pages/                     # 页面场景
    shared/                    # API、工具、基础 UI
```

## 架构说明

- 后端遵循依赖倒置原则：`application` 依赖 `domain.repositories.RoadmapRepository` 抽象，当前由 `JsonRoadmapRepository` 提供实现，未来可无痛替换为 `Neo4j` 或 `NebulaGraph`。
- 节点熟练度通过 `TechnologyStatusPolicy` 统一计算，避免把业务规则散落到路由或前端。
- 前端通过 API 模块集中处理接口访问，视图层只消费类型化数据结构，减少耦合。
- 拓扑图与看板共享同一份领域数据，详情面板负责承载节点正向资料聚合与项目反向查询结果。

## 本地启动

### 后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=src uvicorn main:app --reload
```

服务默认启动在 `http://127.0.0.1:8000`。

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端默认启动在 `http://127.0.0.1:5173`，直接请求后端 `http://127.0.0.1:8000/api/v1`。

## 当前已实现

- 技术节点拓扑图视图
- 自动分类的看板视图
- 基于时长与产出阈值的探索期 / 熟练期 / 专精期状态展示
- 技术节点详情、资料聚合、前置与后续节点展示
- 项目详情反查技术栈
- 适合替换为图数据库与自动化分析流程的仓储边界
