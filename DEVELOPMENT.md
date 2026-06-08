# 数据血缘分析器 - 开发指南

## 环境准备

| 依赖 | 版本要求 | 说明 |
| :--- | :--- | :--- |
| Node.js | >= 18 | 推荐使用 LTS 版本 |
| npm | >= 9 | 随 Node.js 一同安装 |

> 验证环境：在终端执行 `node -v` 和 `npm -v` 确认版本达标。

---

## 命令速查表

| 命令 | 用途 | 适用场景 | 启动端口/产物 |
| :--- | :--- | :--- | :--- |
| `npm run dev` | 桌面开发（默认） | 日常桌面端开发调试，等价于 `dev:electron` | 端口 5180 + Electron 窗口 |
| `npm run dev:web` | 纯网页预览 | 仅调试前端页面布局、组件交互，无需 Electron 能力 | 端口 5180，浏览器访问 |
| `npm run dev:electron` | 显式桌面开发 | 需要调用 Electron API、菜单、文件系统等桌面能力 | 端口 5180 + Electron 窗口 |
| `npm run build` | 生产构建（前端+主进程） | 发布前构建全量产物 | 前端产物：`dist/`，主进程产物：`dist-electron/` |
| `npm start` | 生产启动桌面 | 构建完成后，以生产模式启动桌面客户端 | Electron 窗口（加载生产产物） |
| `npm run build:web` | 单独构建前端 | 仅验证前端 TS/构建是否通过 | 产物：`dist/` |
| `npm run build:electron` | 单独构建主进程 | 仅验证主进程 TS 编译是否通过 | 产物：`dist-electron/` |
| `npm run electron:build` | 打 NSIS 安装包 | 交付给用户的 Windows 安装程序 | 产物：`release/数据血缘分析器 Setup x.x.x.exe` |

---

## 常见问题

### 端口冲突

`vite.config.ts` 中默认端口为 **5180**，且 `strictPort: true`（端口被占会直接报错）。

解决方式：修改 `vite.config.ts:14` 中的 `port` 字段，改为空闲端口即可。

```typescript
server: {
  port: 5180,   // ← 修改这里
  strictPort: true,
}
```

### 启动白屏

执行 `npm start` 或安装包启动后白屏，按以下顺序排查：

1. **构建产物缺失**：确认 `dist/` 和 `dist-electron/` 两个目录均存在且非空。若缺失，先执行 `npm run build`。
2. **主进程入口错误**：检查 `package.json` 中 `main` 字段是否为 `dist-electron/main.js`。
3. **路径解析问题**：`vite.config.ts` 中 `base` 已设为 `./`，确保相对路径正确。
4. **控制台错误**：在 Electron 窗口按 `F12` 打开开发者工具查看报错信息。

---

## 目录结构

```
.
├── electron/                  # Electron 主进程 & 预加载脚本
│   ├── main.ts                # 主进程入口：窗口创建、菜单注册、IPC 通信
│   └── preload.ts             # 预加载脚本：暴露安全 API 给渲染进程
│
├── src/                       # 前端渲染进程源码（React + TypeScript）
│   ├── components/            # 功能面板组件（8 个，对应顶部菜单 Tab）
│   │   ├── DataSourcePanel.tsx    # 数据源导入 & 节点管理
│   │   ├── ScriptParserPanel.tsx  # SQL/脚本解析 & 血缘生成
│   │   ├── LineageCanvasPanel.tsx # 血缘画布（ReactFlow）
│   │   ├── NodeSearchPanel.tsx    # 节点搜索 & 定位
│   │   ├── ImpactPanel.tsx        # 影响范围评估
│   │   ├── SnapshotPanel.tsx      # 版本快照 & 对比
│   │   ├── ReportExportPanel.tsx  # 报告导出（Word/Excel）
│   │   └── TaskPanel.tsx          # 变更任务清单
│   │
│   ├── store/                 # 全局状态管理
│   │   └── lineageStore.ts    # Zustand Store：节点/边/快照/任务 全部数据 + 持久化
│   │
│   ├── styles/
│   │   └── global.css         # 全局样式
│   │
│   ├── types/
│   │   └── index.ts           # TypeScript 核心类型定义（数据模型）
│   │
│   ├── utils/
│   │   └── scriptParser.ts    # SQL 脚本解析器（基于 sql-parser-cst）
│   │
│   ├── App.tsx                # 根组件：Tab 布局、菜单、页面路由
│   └── main.tsx               # 前端入口
│
├── index.html                 # Vite HTML 模板
├── vite.config.ts             # Vite 配置（端口 5180、别名 @）
├── tsconfig.json              # 前端 TS 配置
├── tsconfig.electron.json     # 主进程 TS 配置
├── package.json               # 依赖 & 脚本 & electron-builder 配置
└── release/                   # NSIS 安装包输出目录（执行 electron:build 后生成）
```

---

## 核心数据模型

以下模型定义于 `src/types/index.ts`，是整个应用的数据骨架。

### DataNode — 数据节点（表/文件/报表/脚本/字段）

| 字段 | 类型 | 关键字段说明 |
| :--- | :--- | :--- |
| `id` | `string` | 唯一标识（UUID） |
| `name` | `string` | 节点名称，如 `dim_user` |
| `type` | `NodeType` | 节点类型：`table` / `file` / `report` / `script` / `field` |
| `fields` | `FieldInfo[]` | 字段列表（表节点必填） |
| `isCritical` | `boolean` | 是否为核心节点，影响评估高亮依据 |
| `owner` / `tags` | `string` / `string[]` | 负责人、标签，用于搜索和筛选 |
| `createdAt` / `updatedAt` | `number` | 创建/更新时间戳（ms） |

### DataEdge — 血缘边（节点间流转关系）

| 字段 | 类型 | 关键字段说明 |
| :--- | :--- | :--- |
| `id` | `string` | 唯一标识（UUID） |
| `source` / `target` | `string` | 源节点 id / 目标节点 id |
| `sourceField` / `targetField` | `string` | 可选，字段级血缘映射 |
| `type` | `'direct' \| 'transform' \| 'aggregate'` | 边类型：直连 / 转换 / 聚合 |
| `transformLogic` | `string` | 转换逻辑描述，如 `CAST(amount AS DECIMAL)` |
| `createdAt` | `number` | 创建时间戳 |

### FieldInfo — 字段信息

| 字段 | 类型 | 关键字段说明 |
| :--- | :--- | :--- |
| `name` | `string` | 字段名 |
| `type` | `string` | 数据类型，如 `VARCHAR(100)` |
| `isKey` | `boolean` | 是否为主键/唯一键 |
| `isSensitive` | `boolean` | 是否为敏感字段（脱敏标记） |
| `businessRule` | `string` | 业务规则说明 |
| `description` | `string` | 字段描述 |

### Snapshot — 版本快照

| 字段 | 类型 | 关键字段说明 |
| :--- | :--- | :--- |
| `id` | `string` | 唯一标识（UUID） |
| `name` | `string` | 快照名称，如 `v1.2 发布前` |
| `description` | `string` | 快照备注说明 |
| `createdAt` | `number` | 创建时间戳 |
| `nodes` / `edges` | `DataNode[]` / `DataEdge[]` | 全量节点和边的副本（用于对比） |

### TaskItem — 变更任务

| 字段 | 类型 | 关键字段说明 |
| :--- | :--- | :--- |
| `id` | `string` | 唯一标识（UUID） |
| `title` | `string` | 任务标题 |
| `priority` | `'high' \| 'medium' \| 'low'` | 优先级（影响评估自动生成 high 任务） |
| `status` | `'todo' \| 'doing' \| 'done'` | 任务状态 |
| `relatedNodeId` | `string` | 关联受影响的节点 id |
| `relatedFields` | `string[]` | 关联受影响的字段名列表 |
| `assignee` | `string` | 负责人 |
| `dueDate` | `number` | 截止日期时间戳 |
| `createdAt` | `number` | 创建时间戳 |
