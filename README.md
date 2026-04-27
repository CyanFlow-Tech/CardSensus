# CardSensus

CardSensus 是一个把“学习、实践、协作、成长”组织成统一科技树的项目。

它想解决的不是单点的笔记整理问题，而是一个更大的问题：一个人很难清楚地知道自己到底会什么、不会什么、离下一个阶段还差什么；一个团队也很难把分散在项目、文档、经验和代码里的技术认知沉淀成可共享的结构。CardSensus 希望通过众包的方式，把万事万物抽象成可连接、可比较、可演化的技术节点，并最终形成一张不断生长的统一科技树。

在这里，每一个技术节点都是一张卡牌。它既可以表示一门语言、一个框架、一个工具，也可以表示一种方法论、一个工程能力，甚至是一类跨学科知识。卡牌之间通过依赖关系组成科技树，卡牌又可以进一步组合成牌组，例如“爬虫技术牌组”里可以包含 `Python`、`协程`、`Selenium`、`代理池`、`反爬对抗` 等节点。用户既可以维护自己的牌组，也可以共享自己的牌组，让别人看到一条真实的学习路线、一套可复用的能力组合，甚至在未来衍生出基于这些牌组的卡牌游戏玩法。

## 项目意义

CardSensus 的核心意义，不只是“做一个技术图谱”，而是把技术成长这件事从模糊、零散、难以衡量，变成结构化、可视化、可协作、可激励的过程。

- 对个人来说，它可以帮助人更直观地看到自己的能力边界。
- 对学习者来说，它可以把“学什么”“先学什么”“学到什么程度算会了”变得更清晰。
- 对团队来说，它可以把技术栈、能力模型、知识传承和项目经验沉淀到同一套系统里。
- 对社区来说，它可以通过众包的方式，不断校正卡牌的稀有度、完成人数和连接关系，让图谱越来越接近真实世界。
- 对产品形态来说，卡牌化和游戏化能把原本枯燥的知识管理，变成有收藏感、策略感和成就感的体验。

从长期看，这个项目可以成为一种“面向现实世界技能的可演化地图”：

- 你可以知道自己擅长的区域在哪里。
- 你可以知道自己薄弱的断层在哪里。
- 你可以沿着别人验证过的牌组去学习。
- 你也可以把自己的成长路径贡献给别人。

## 核心设定

### 1. 众包科技树

- 所有技术节点都不是写死的，而是可以持续补充、合并、修正。
- 节点之间的依赖关系可以逐步演化，形成更完整的 DAG 科技树。
- 稀有度、活跃人数、节点说明等信息可以通过社区共建逐渐趋于平均和稳定。

### 2. 卡牌化表达

- 每个技术节点就是一张卡牌。
- 卡牌有名称、简介、时长、稀有度、活跃人数等属性。
- 卡牌之间的上下游关系天然适合做成拓扑图和收藏系统。

### 3. 牌组机制

- 用户可以把一组相关技术组织成牌组。
- 牌组可以代表一个领域、一条学习路线，或者一个项目所需的能力集合。
- 牌组未来可以被共享、复用、比较，甚至继续扩展为游戏规则中的套牌系统。

### 4. 游戏化成长

- 学习路径不再只是 checklist，而是解锁卡牌、连接依赖、组建牌组的过程。
- 个人成长可以被呈现为“收集度”“探索度”“专精度”。
- 未来可以进一步扩展成成就、任务、挑战、交换、对战等玩法。

## 当前仓库已实现的内容

当前版本已经是一个可运行的前后端原型，重点落在“技术卡牌图谱编辑”和“牌组视图”上。

- 前端基于 `React + TypeScript + Vite`
- 后端基于 `FastAPI`
- 数据当前以 `JSON` 方式存储，便于快速迭代，后续可替换为图数据库

目前已经实现的主要能力包括：

- 技术节点拓扑图展示
- 技术节点详情查看与编辑
- 依赖关系的新增与删除
- 基于节点自动生成和展示牌组
- 手动创建牌组
- 节点 JSON 导出
- 基于 JSON 的节点同步草稿与确认提交
- 图谱自动重排布局并写回数据文件
- 节点资料补充

从现有界面来看，项目已经初步具备以下产品雏形：

- 主区域以卡牌拓扑图方式展示科技树
- 详情区展示单张卡牌的说明、关联牌组、前置与后续节点
- 侧边栏展示牌组列表，并支持创建新牌组
- 支持把外部整理出的节点 JSON 导入为同步草稿，再确认写入

## 仓库结构

```text
CardSensus/
├─ backend/                  # FastAPI 后端
│  ├─ data/seed.json         # 当前示例数据
│  ├─ src/roadmap/           # 分层架构：domain / application / infrastructure / presentation
│  └─ main.py                # 后端入口之一
├─ frontend/                 # React 前端
│  ├─ src/app                # 应用入口
│  ├─ src/pages              # 页面
│  ├─ src/widgets            # 页面级组件
│  ├─ src/shared             # API、工具函数、基础 UI
│  └─ src/entities           # 领域类型
└─ README.md
```

## 本地启动

### 后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=src uvicorn main:app --reload
```

默认地址：`http://127.0.0.1:8000`

### 前端

```bash
cd frontend
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5173`

## 我对当前仓库里“大块无用代码 / 无用内容”的分析

这里我只列“整块组件、整份文件、整类目录”级别的问题，不列零碎的死代码。

### 一、可以直接判定为未接入运行路径的前端组件

这三份文件目前没有被任何运行入口引用，属于整块闲置代码：

- [frontend/src/features/view-switcher/ViewSwitcher.tsx](/root/folkspace/CardSensus/frontend/src/features/view-switcher/ViewSwitcher.tsx:1)
- [frontend/src/widgets/kanban-board/KanbanBoard.tsx](/root/folkspace/CardSensus/frontend/src/widgets/kanban-board/KanbanBoard.tsx:1)
- [frontend/src/widgets/summary-panel/SummaryPanel.tsx](/root/folkspace/CardSensus/frontend/src/widgets/summary-panel/SummaryPanel.tsx:1)

判断依据：

- 前端入口 [frontend/src/main.tsx](/root/folkspace/CardSensus/frontend/src/main.tsx:1) 只渲染了 [frontend/src/app/App.tsx](/root/folkspace/CardSensus/frontend/src/app/App.tsx:1)
- `App` 只挂载了 [frontend/src/pages/dashboard/DashboardPage.tsx](/root/folkspace/CardSensus/frontend/src/pages/dashboard/DashboardPage.tsx:1)
- 在 `DashboardPage` 中，实际引用的页面级组件只有 `TopologyMap` 和 `InspectorPanel`
- 全仓库搜索结果显示，`ViewSwitcher`、`KanbanBoard`、`SummaryPanel` 只有定义，没有被 import 使用

这意味着它们大概率是早期方案残留：

- `ViewSwitcher` 像是曾经计划用于“拓扑图 / 看板”切换
- `KanbanBoard` 像是曾经的技术节点状态看板视图
- `SummaryPanel` 像是曾经的概览统计面板

如果你已经确认不再走这个界面方向，可以删除；如果后面还想恢复多视图，就应该把它们重新接入，而不是继续悬空。

### 二、后端存在重复入口文件

这两份文件内容实质上是重复的：

- [backend/main.py](/root/folkspace/CardSensus/backend/main.py:1)
- [backend/src/main.py](/root/folkspace/CardSensus/backend/src/main.py:1)

它们都在创建同一个 FastAPI app，结构和逻辑基本一致。这类重复入口很容易带来两个问题：

- 后续改配置时只改了一份，另一份忘记同步
- 启动命令、部署方式、导入路径容易产生歧义

如果没有明确的双入口需求，建议保留一个标准入口即可。

### 三、明显不应提交到版本库的大块工程产物

这些内容不一定叫“无用代码”，但作为仓库内容基本属于冗余物，建议从版本库清掉：

- `frontend/node_modules/`
- `frontend/dist/`
- `backend/.venv/`
- `backend/__pycache__/`
- `backend/src/**/__pycache__/`
- `node_modules/`
- `*.tsbuildinfo`

原因很直接：

- 它们是依赖安装、构建或解释器缓存产物，不是项目源码
- 会显著增大仓库体积
- 会污染代码审阅
- 容易制造“看起来文件很多，但真正源码不多”的错觉

而且你自己的忽略规则已经说明这类内容本来就不该进仓库：

- [frontend/.gitignore](/root/folkspace/CardSensus/frontend/.gitignore:1)
- [backend/.gitignore](/root/folkspace/CardSensus/backend/.gitignore:1)

其中还有一个值得注意的点：

- `backend/.gitignore` 里把 `data/` 忽略掉了
- 但仓库里当前又依赖 [backend/data/seed.json](/root/folkspace/CardSensus/backend/data/seed.json:1) 作为示例数据

这会导致以后别人拉取仓库时，数据文件的跟踪策略不清晰。这里需要你决定：`data/` 到底是示例数据的一部分，还是纯本地开发数据目录。现在这个状态是矛盾的。

### 四、根目录与子目录存在文档/配置层面的“骨架残留”

- 根目录 [package.json](/root/folkspace/CardSensus/package.json:1) 几乎没有承担实际 monorepo 管理职责，只保留了一个 `@ant-design/icons` 依赖声明，当前价值很低
- 旧版根目录 `README.md` 更像技术模板说明，不足以承载项目愿景和产品表达

这类内容不一定要删，但如果长期保留“半骨架半成品”状态，会增加理解成本。

## 未来值得继续做的方向

如果沿着现在的思路继续推进，我认为这个项目最有潜力的不是“一个技术关系图页面”，而是下面这几层逐步叠加：

### 1. 从个人图谱走向社区图谱

- 允许多人提交节点定义、依赖关系、稀有度估计和学习建议
- 对众包结果做聚合、评分、版本化和审核

### 2. 从牌组收藏走向学习路线

- 一套牌组不仅是技术集合，还可以表达推荐顺序、分支路线、难度梯度
- 比如“后端工程师基础牌组”“爬虫进阶牌组”“AI 应用开发牌组”

### 3. 从图谱管理走向成长系统

- 记录个人解锁过哪些卡牌
- 标记哪些只是了解，哪些已经实战，哪些可以带人
- 用卡牌稀有度、完成度、组合深度来形成成就系统

### 4. 从成长系统走向真正的卡牌玩法

- 牌组之间可以有主题、协同、克制、流派
- 一个人的技术能力不再只是简历文本，而是一套可视化、可组合、可分享的“能力牌组”

## 总结

CardSensus 现在最有价值的地方，不是它已经完成了多少功能，而是它已经找到了一个很强的表达方式：

把知识图谱、技术成长、众包协作和游戏化卡牌系统放到同一个产品叙事里。

这条路线是成立的，而且有想象空间。当前仓库里真正值得优先清理的，是那些已经脱离运行路径的整块组件、重复入口，以及不该提交的构建和环境产物。把这些整理干净之后，这个项目的产品方向和工程结构都会更清楚。
