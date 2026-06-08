import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { DataNode, DataEdge, Snapshot, TaskItem, NodeType } from '../types';

interface LineageState {
  nodes: DataNode[];
  edges: DataEdge[];
  snapshots: Snapshot[];
  tasks: TaskItem[];
  selectedNodeId: string | null;
  selectedField: string | null;
  focusedNodeId: string | null;
  searchQuery: string;

  addNode: (node: Omit<DataNode, 'id' | 'createdAt' | 'updatedAt'>) => DataNode;
  updateNode: (id: string, updates: Partial<DataNode>) => void;
  deleteNode: (id: string) => void;
  batchAddNodes: (
    nodes: Omit<DataNode, 'id' | 'createdAt' | 'updatedAt'>[]
  ) => DataNode[];

  addEdge: (
    edge: Omit<DataEdge, 'id' | 'createdAt'>
  ) => DataEdge | null;
  updateEdge: (id: string, updates: Partial<DataEdge>) => void;
  deleteEdge: (id: string) => void;
  batchAddEdges: (
    edges: Omit<DataEdge, 'id' | 'createdAt'>[]
  ) => DataEdge[];

  selectNode: (id: string | null) => void;
  selectField: (field: string | null) => void;
  focusNode: (id: string | null) => void;
  setSearchQuery: (query: string) => void;

  createSnapshot: (name: string, description?: string) => Snapshot;
  deleteSnapshot: (id: string) => void;
  restoreSnapshot: (id: string) => void;
  compareSnapshots: (snap1Id: string, snap2Id: string) => {
    addedNodes: DataNode[];
    removedNodes: DataNode[];
    modifiedNodes: DataNode[];
    addedEdges: DataEdge[];
    removedEdges: DataEdge[];
  };

  addTask: (task: Omit<TaskItem, 'id' | 'createdAt'>) => TaskItem;
  updateTask: (id: string, updates: Partial<TaskItem>) => void;
  deleteTask: (id: string) => void;

  getUpstreamNodes: (nodeId: string, levels?: number) => DataNode[];
  getDownstreamNodes: (nodeId: string, levels?: number) => DataNode[];
  getNodeById: (id: string) => DataNode | undefined;
  getNodesByType: (type: NodeType) => DataNode[];

  importData: (data: { nodes: DataNode[]; edges: DataEdge[] }) => void;
  exportData: () => { nodes: DataNode[]; edges: DataEdge[] };

  loadDemoData: () => void;
}

export const useLineageStore = create<LineageState>((set, get) => ({
  nodes: [],
  edges: [],
  snapshots: [],
  tasks: [],
  selectedNodeId: null,
  selectedField: null,
  focusedNodeId: null,
  searchQuery: '',

  addNode: (node) => {
    const now = Date.now();
    const newNode: DataNode = {
      ...node,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({ nodes: [...state.nodes, newNode] }));
    return newNode;
  },

  updateNode: (id, updates) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
      ),
    })),

  deleteNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    })),

  batchAddNodes: (nodesList) => {
    const now = Date.now();
    const newNodes: DataNode[] = nodesList.map((n) => ({
      ...n,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    }));
    set((state) => ({ nodes: [...state.nodes, ...newNodes] }));
    return newNodes;
  },

  addEdge: (edge) => {
    const state = get();
    const exists = state.edges.some(
      (e) =>
        e.source === edge.source &&
        e.target === edge.target &&
        e.sourceField === edge.sourceField &&
        e.targetField === edge.targetField
    );
    if (exists) return null;
    const newEdge: DataEdge = {
      ...edge,
      id: uuidv4(),
      createdAt: Date.now(),
    };
    set((s) => ({ edges: [...s.edges, newEdge] }));
    return newEdge;
  },

  updateEdge: (id, updates) =>
    set((state) => ({
      edges: state.edges.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),

  deleteEdge: (id) =>
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== id),
    })),

  batchAddEdges: (edgesList) => {
    const state = get();
    const now = Date.now();
    const filtered = edgesList.filter(
      (edge) =>
        !state.edges.some(
          (e) =>
            e.source === edge.source &&
            e.target === edge.target &&
            e.sourceField === edge.sourceField &&
            e.targetField === edge.targetField
        )
    );
    const newEdges: DataEdge[] = filtered.map((e) => ({
      ...e,
      id: uuidv4(),
      createdAt: now,
    }));
    set((s) => ({ edges: [...s.edges, ...newEdges] }));
    return newEdges;
  },

  selectNode: (id) => set({ selectedNodeId: id }),
  selectField: (field) => set({ selectedField: field }),
  focusNode: (id) => set({ focusedNodeId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  createSnapshot: (name, description) => {
    const state = get();
    const snapshot: Snapshot = {
      id: uuidv4(),
      name,
      description,
      createdAt: Date.now(),
      nodes: JSON.parse(JSON.stringify(state.nodes)),
      edges: JSON.parse(JSON.stringify(state.edges)),
    };
    set((s) => ({ snapshots: [...s.snapshots, snapshot] }));
    return snapshot;
  },

  deleteSnapshot: (id) =>
    set((state) => ({
      snapshots: state.snapshots.filter((s) => s.id !== id),
    })),

  restoreSnapshot: (id) => {
    const state = get();
    const snapshot = state.snapshots.find((s) => s.id === id);
    if (snapshot) {
      set({
        nodes: JSON.parse(JSON.stringify(snapshot.nodes)),
        edges: JSON.parse(JSON.stringify(snapshot.edges)),
      });
    }
  },

  compareSnapshots: (snap1Id, snap2Id) => {
    const state = get();
    const snap1 = state.snapshots.find((s) => s.id === snap1Id);
    const snap2 = state.snapshots.find((s) => s.id === snap2Id);
    if (!snap1 || !snap2) {
      return {
        addedNodes: [],
        removedNodes: [],
        modifiedNodes: [],
        addedEdges: [],
        removedEdges: [],
      };
    }
    const snap1NodeIds = new Set(snap1.nodes.map((n) => n.id));
    const snap2NodeIds = new Set(snap2.nodes.map((n) => n.id));
    const snap1EdgeIds = new Set(snap1.edges.map((e) => e.id));
    const snap2EdgeIds = new Set(snap2.edges.map((e) => e.id));

    const addedNodes = snap2.nodes.filter((n) => !snap1NodeIds.has(n.id));
    const removedNodes = snap1.nodes.filter((n) => !snap2NodeIds.has(n.id));
    const modifiedNodes: DataNode[] = [];
    snap1.nodes.forEach((n1) => {
      const n2 = snap2.nodes.find((n) => n.id === n1.id);
      if (n2 && JSON.stringify(n1) !== JSON.stringify(n2)) {
        modifiedNodes.push(n2);
      }
    });

    const addedEdges = snap2.edges.filter((e) => !snap1EdgeIds.has(e.id));
    const removedEdges = snap1.edges.filter((e) => !snap2EdgeIds.has(e.id));

    return {
      addedNodes,
      removedNodes,
      modifiedNodes,
      addedEdges,
      removedEdges,
    };
  },

  addTask: (task) => {
    const newTask: TaskItem = {
      ...task,
      id: uuidv4(),
      createdAt: Date.now(),
    };
    set((state) => ({ tasks: [...state.tasks, newTask] }));
    return newTask;
  },

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  deleteTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    })),

  getUpstreamNodes: (nodeId, levels = Infinity) => {
    const state = get();
    const result: DataNode[] = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; level: number }> = [{ id: nodeId, level: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.level >= levels) continue;
      const incoming = state.edges.filter((e) => e.target === current.id);
      for (const edge of incoming) {
        if (!visited.has(edge.source)) {
          visited.add(edge.source);
          const node = state.nodes.find((n) => n.id === edge.source);
          if (node) {
            result.push(node);
            queue.push({ id: node.id, level: current.level + 1 });
          }
        }
      }
    }
    return result;
  },

  getDownstreamNodes: (nodeId, levels = Infinity) => {
    const state = get();
    const result: DataNode[] = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; level: number }> = [{ id: nodeId, level: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.level >= levels) continue;
      const outgoing = state.edges.filter((e) => e.source === current.id);
      for (const edge of outgoing) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          const node = state.nodes.find((n) => n.id === edge.target);
          if (node) {
            result.push(node);
            queue.push({ id: node.id, level: current.level + 1 });
          }
        }
      }
    }
    return result;
  },

  getNodeById: (id) => get().nodes.find((n) => n.id === id),

  getNodesByType: (type) => get().nodes.filter((n) => n.type === type),

  importData: (data) => set({ nodes: data.nodes, edges: data.edges }),

  exportData: () => {
    const state = get();
    return { nodes: state.nodes, edges: state.edges };
  },

  loadDemoData: () => {
    const now = Date.now();
    const demoNodes: DataNode[] = [
      {
        id: 'demo_1',
        name: 'ods_user_info',
        type: 'table',
        description: 'ODS层用户基础信息表',
        owner: '张三',
        tags: ['ODS', '用户域', '核心表'],
        isCritical: true,
        fields: [
          { name: 'user_id', type: 'BIGINT', description: '用户ID', isKey: true },
          { name: 'user_name', type: 'VARCHAR', description: '用户名' },
          { name: 'gender', type: 'TINYINT', description: '性别' },
          { name: 'age', type: 'INT', description: '年龄' },
          { name: 'city', type: 'VARCHAR', description: '所在城市' },
          { name: 'register_time', type: 'DATETIME', description: '注册时间' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo_2',
        name: 'ods_order_detail',
        type: 'table',
        description: 'ODS层订单明细表',
        owner: '李四',
        tags: ['ODS', '交易域', '核心表'],
        isCritical: true,
        fields: [
          { name: 'order_id', type: 'BIGINT', description: '订单ID', isKey: true },
          { name: 'user_id', type: 'BIGINT', description: '用户ID' },
          { name: 'product_id', type: 'BIGINT', description: '商品ID' },
          { name: 'amount', type: 'DECIMAL', description: '订单金额' },
          { name: 'quantity', type: 'INT', description: '购买数量' },
          { name: 'order_time', type: 'DATETIME', description: '下单时间' },
          { name: 'status', type: 'TINYINT', description: '订单状态' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo_3',
        name: 'ods_product_info',
        type: 'table',
        description: 'ODS层商品信息表',
        owner: '王五',
        tags: ['ODS', '商品域'],
        fields: [
          { name: 'product_id', type: 'BIGINT', description: '商品ID', isKey: true },
          { name: 'product_name', type: 'VARCHAR', description: '商品名称' },
          { name: 'category_id', type: 'BIGINT', description: '类目ID' },
          { name: 'price', type: 'DECIMAL', description: '商品价格' },
          { name: 'brand', type: 'VARCHAR', description: '品牌' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo_4',
        name: 'dwd_user_order_daily',
        type: 'script',
        description: 'DWD层用户日订单加工脚本',
        owner: '张三',
        tags: ['DWD', '加工脚本'],
        source: 'dwd_user_order_daily.sql',
        content: `-- DWD层用户日订单汇总
INSERT INTO dwd_user_order_daily
SELECT
    u.user_id,
    u.user_name,
    u.city,
    o.order_time AS dt,
    COUNT(o.order_id) AS order_count,
    SUM(o.amount) AS total_amount,
    SUM(o.quantity) AS total_quantity
FROM ods_user_info u
LEFT JOIN ods_order_detail o ON u.user_id = o.user_id
WHERE o.status = 1
GROUP BY u.user_id, u.user_name, u.city, DATE(o.order_time);`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo_5',
        name: 'dwd_user_order_daily',
        type: 'table',
        description: 'DWD层用户日订单汇总表',
        owner: '张三',
        tags: ['DWD', '汇总表'],
        isCritical: true,
        fields: [
          { name: 'user_id', type: 'BIGINT', description: '用户ID', isKey: true },
          { name: 'user_name', type: 'VARCHAR', description: '用户名' },
          { name: 'city', type: 'VARCHAR', description: '城市' },
          { name: 'dt', type: 'DATE', description: '日期', isKey: true },
          { name: 'order_count', type: 'INT', description: '订单数' },
          { name: 'total_amount', type: 'DECIMAL', description: '订单总金额' },
          { name: 'total_quantity', type: 'INT', description: '购买商品总数' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo_6',
        name: 'ads_city_sales_monthly',
        type: 'script',
        description: 'ADS层城市月度销售指标加工',
        owner: '李四',
        tags: ['ADS', '指标加工'],
        source: 'ads_city_sales.sql',
        content: `-- 城市月度销售指标
INSERT INTO ads_city_sales_monthly
SELECT
    city,
    DATE_FORMAT(dt, '%Y-%m') AS month,
    SUM(order_count) AS city_orders,
    SUM(total_amount) AS city_gmv,
    COUNT(DISTINCT user_id) AS active_users
FROM dwd_user_order_daily
GROUP BY city, DATE_FORMAT(dt, '%Y-%m');`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo_7',
        name: 'ads_city_sales_monthly',
        type: 'table',
        description: 'ADS层城市月度销售指标表',
        owner: '李四',
        tags: ['ADS', '指标表'],
        isCritical: true,
        fields: [
          { name: 'city', type: 'VARCHAR', description: '城市', isKey: true },
          { name: 'month', type: 'VARCHAR', description: '月份', isKey: true },
          { name: 'city_orders', type: 'INT', description: '城市订单量' },
          { name: 'city_gmv', type: 'DECIMAL', description: '城市GMV' },
          { name: 'active_users', type: 'INT', description: '活跃用户数' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo_8',
        name: '月度销售分析报表',
        type: 'report',
        description: '各城市月度销售数据看板，包含GMV、订单量、用户数趋势图',
        owner: '数据分析师-小王',
        tags: ['报表', '运营看板', '月报'],
        isCritical: true,
        fields: [
          { name: 'city_gmv', description: '城市GMV趋势' },
          { name: 'city_orders', description: '订单量对比' },
          { name: 'active_users', description: '活跃用户数' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo_9',
        name: '用户价值分析.xlsx',
        type: 'file',
        description: '用户RFM价值分析离线文件',
        owner: '运营-小李',
        tags: ['离线分析', 'RFM'],
        path: '/data/analysis/rfm_user.xlsx',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo_10',
        name: '用户留存分析.py',
        type: 'script',
        description: 'Python脚本计算用户7日/30日留存率',
        owner: '数据分析师-小孙',
        tags: ['Python', '留存分析'],
        source: 'user_retention.py',
        content: `import pandas as pd
import numpy as np

def calc_retention(user_df, order_df):
    merged = pd.merge(user_df, order_df, on='user_id')
    # 计算首次下单时间和后续回访
    ...
    return retention_result`,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const demoEdges: DataEdge[] = [
      {
        id: 'edge_1',
        source: 'demo_1',
        target: 'demo_4',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'edge_2',
        source: 'demo_2',
        target: 'demo_4',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'edge_3',
        source: 'demo_4',
        target: 'demo_5',
        type: 'transform',
        transformLogic: '按用户+日期分组汇总订单数和金额',
        createdAt: now,
      },
      {
        id: 'edge_4',
        source: 'demo_1',
        target: 'demo_5',
        sourceField: 'user_id',
        targetField: 'user_id',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'edge_5',
        source: 'demo_1',
        target: 'demo_5',
        sourceField: 'user_name',
        targetField: 'user_name',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'edge_6',
        source: 'demo_1',
        target: 'demo_5',
        sourceField: 'city',
        targetField: 'city',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'edge_7',
        source: 'demo_2',
        target: 'demo_5',
        sourceField: 'order_id',
        targetField: 'order_count',
        type: 'aggregate',
        transformLogic: 'COUNT(order_id)',
        createdAt: now,
      },
      {
        id: 'edge_8',
        source: 'demo_2',
        target: 'demo_5',
        sourceField: 'amount',
        targetField: 'total_amount',
        type: 'aggregate',
        transformLogic: 'SUM(amount)',
        createdAt: now,
      },
      {
        id: 'edge_9',
        source: 'demo_5',
        target: 'demo_6',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'edge_10',
        source: 'demo_6',
        target: 'demo_7',
        type: 'transform',
        transformLogic: '按城市+月份分组聚合',
        createdAt: now,
      },
      {
        id: 'edge_11',
        source: 'demo_5',
        target: 'demo_7',
        sourceField: 'city',
        targetField: 'city',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'edge_12',
        source: 'demo_5',
        target: 'demo_7',
        sourceField: 'order_count',
        targetField: 'city_orders',
        type: 'aggregate',
        transformLogic: 'SUM(order_count)',
        createdAt: now,
      },
      {
        id: 'edge_13',
        source: 'demo_5',
        target: 'demo_7',
        sourceField: 'total_amount',
        targetField: 'city_gmv',
        type: 'aggregate',
        transformLogic: 'SUM(total_amount)',
        createdAt: now,
      },
      {
        id: 'edge_14',
        source: 'demo_7',
        target: 'demo_8',
        type: 'direct',
        transformLogic: '报表数据引用',
        createdAt: now,
      },
      {
        id: 'edge_15',
        source: 'demo_1',
        target: 'demo_10',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'edge_16',
        source: 'demo_2',
        target: 'demo_10',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'edge_17',
        source: 'demo_3',
        target: 'demo_4',
        type: 'direct',
        createdAt: now,
      },
    ];

    const demoTasks: TaskItem[] = [
      {
        id: 'task_1',
        title: '审核 ods_user_info 字段变更影响',
        description: 'user_id 字段类型变更，需要评估下游所有表和报表',
        priority: 'high',
        status: 'doing',
        relatedNodeId: 'demo_1',
        assignee: '张三',
        createdAt: now,
      },
      {
        id: 'task_2',
        title: '补充 dwd_user_order_daily 文档',
        description: '完善字段说明和加工逻辑文档',
        priority: 'medium',
        status: 'todo',
        relatedNodeId: 'demo_5',
        assignee: '张三',
        createdAt: now,
      },
      {
        id: 'task_3',
        title: '验证月度报表数据准确性',
        description: '核对 ads_city_sales_monthly 数据与报表展示一致',
        priority: 'high',
        status: 'todo',
        relatedNodeId: 'demo_8',
        assignee: '小王',
        createdAt: now,
      },
    ];

    set({
      nodes: demoNodes,
      edges: demoEdges,
      tasks: demoTasks,
    });
  },
}));
