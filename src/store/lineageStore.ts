import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { DataNode, DataEdge, Snapshot, TaskItem, NodeType } from '../types';

const PERSIST_KEY = 'data_lineage_persist_v1';

interface PersistData {
  nodes: DataNode[];
  edges: DataEdge[];
  snapshots: Snapshot[];
  tasks: TaskItem[];
  _savedAt: number;
}

function loadFromStorage(): Partial<PersistData> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as PersistData;
    return {
      nodes: data.nodes || [],
      edges: data.edges || [],
      snapshots: data.snapshots || [],
      tasks: data.tasks || [],
    };
  } catch (e) {
    console.warn('读取本地持久化数据失败', e);
    return {};
  }
}

function saveToStorage(state: {
  nodes: DataNode[];
  edges: DataEdge[];
  snapshots: Snapshot[];
  tasks: TaskItem[];
}) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const data: PersistData = {
      nodes: state.nodes,
      edges: state.edges,
      snapshots: state.snapshots,
      tasks: state.tasks,
      _savedAt: Date.now(),
    };
    window.localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('写入本地持久化数据失败', e);
  }
}

const persisted = loadFromStorage();

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

  addEdge: (edge: Omit<DataEdge, 'id' | 'createdAt'>) => DataEdge | null;
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

  getDownstreamFields: (
    nodeId: string,
    fieldName: string
  ) => Array<{ node: DataNode; field: string; transform?: string; viaNode?: string }>;

  importData: (data: { nodes: DataNode[]; edges: DataEdge[] }) => void;
  exportData: () => { nodes: DataNode[]; edges: DataEdge[] };

  clearAll: () => void;
  loadDemoData: () => void;
}

export const useLineageStore = create<LineageState>((set, get) => ({
  nodes: persisted.nodes || [],
  edges: persisted.edges || [],
  snapshots: persisted.snapshots || [],
  tasks: persisted.tasks || [],
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
    set((state) => {
      const next = { ...state, nodes: [...state.nodes, newNode] };
      saveToStorage(next);
      return next;
    });
    return newNode;
  },

  updateNode: (id, updates) =>
    set((state) => {
      const next = {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
        ),
      };
      saveToStorage(next);
      return next;
    }),

  deleteNode: (id) =>
    set((state) => {
      const next = {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== id),
        edges: state.edges.filter((e) => e.source !== id && e.target !== id),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      };
      saveToStorage(next);
      return next;
    }),

  batchAddNodes: (nodesList) => {
    const now = Date.now();
    const newNodes: DataNode[] = nodesList.map((n) => ({
      ...n,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    }));
    set((state) => {
      const next = { ...state, nodes: [...state.nodes, ...newNodes] };
      saveToStorage(next);
      return next;
    });
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
    set((s) => {
      const next = { ...s, edges: [...s.edges, newEdge] };
      saveToStorage(next);
      return next;
    });
    return newEdge;
  },

  updateEdge: (id, updates) =>
    set((state) => {
      const next = {
        ...state,
        edges: state.edges.map((e) => (e.id === id ? { ...e, ...updates } : e)),
      };
      saveToStorage(next);
      return next;
    }),

  deleteEdge: (id) =>
    set((state) => {
      const next = { ...state, edges: state.edges.filter((e) => e.id !== id) };
      saveToStorage(next);
      return next;
    }),

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
    set((s) => {
      const next = { ...s, edges: [...s.edges, ...newEdges] };
      saveToStorage(next);
      return next;
    });
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
    set((s) => {
      const next = { ...s, snapshots: [...s.snapshots, snapshot] };
      saveToStorage(next);
      return next;
    });
    return snapshot;
  },

  deleteSnapshot: (id) =>
    set((state) => {
      const next = {
        ...state,
        snapshots: state.snapshots.filter((s) => s.id !== id),
      };
      saveToStorage(next);
      return next;
    }),

  restoreSnapshot: (id) => {
    const state = get();
    const snapshot = state.snapshots.find((s) => s.id === id);
    if (snapshot) {
      set((s) => {
        const next = {
          ...s,
          nodes: JSON.parse(JSON.stringify(snapshot.nodes)),
          edges: JSON.parse(JSON.stringify(snapshot.edges)),
        };
        saveToStorage(next);
        return next;
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
    set((state) => {
      const next = { ...state, tasks: [...state.tasks, newTask] };
      saveToStorage(next);
      return next;
    });
    return newTask;
  },

  updateTask: (id, updates) =>
    set((state) => {
      const next = {
        ...state,
        tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      };
      saveToStorage(next);
      return next;
    }),

  deleteTask: (id) =>
    set((state) => {
      const next = { ...state, tasks: state.tasks.filter((t) => t.id !== id) };
      saveToStorage(next);
      return next;
    }),

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

  getDownstreamFields: (nodeId, fieldName) => {
    const state = get();
    const result: Array<{
      node: DataNode;
      field: string;
      transform?: string;
      viaNode?: string;
    }> = [];
    const visited = new Set<string>();
    const queue: Array<{ nid: string; field: string }> = [
      { nid: nodeId, field: fieldName },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const outEdges = state.edges.filter(
        (e) =>
          e.source === current.nid &&
          (e.sourceField === current.field || !e.sourceField)
      );

      for (const edge of outEdges) {
        if (!edge.targetField) continue;
        const key = `${edge.target}:${edge.targetField}`;
        if (visited.has(key)) continue;
        visited.add(key);

        const targetNode = state.nodes.find((n) => n.id === edge.target);
        if (!targetNode) continue;

        result.push({
          node: targetNode,
          field: edge.targetField,
          transform: edge.transformLogic,
        });
        queue.push({ nid: targetNode.id, field: edge.targetField });
      }

      if (!current.field) continue;
      const genericOut = state.edges.filter(
        (e) => e.source === current.nid && !e.sourceField
      );
      for (const edge of genericOut) {
        const tNode = state.nodes.find((n) => n.id === edge.target);
        if (!tNode) continue;
        if (tNode.fields && tNode.fields.length > 0) {
          const matchedFields = tNode.fields.filter(
            (f) =>
              f.name.toLowerCase().includes(current.field.toLowerCase()) ||
              (f.description &&
                f.description.toLowerCase().includes(current.field.toLowerCase()))
          );
          for (const mf of matchedFields) {
            const key = `${tNode.id}:${mf.name}`;
            if (visited.has(key)) continue;
            visited.add(key);
            result.push({
              node: tNode,
              field: mf.name,
              transform:
                edge.transformLogic ||
                (current.field !== mf.name ? '字段名模糊匹配' : undefined),
              viaNode: current.nid,
            });
            queue.push({ nid: tNode.id, field: mf.name });
          }
        }
      }
    }
    return result;
  },

  importData: (data) =>
    set((s) => {
      const next = { ...s, nodes: data.nodes, edges: data.edges };
      saveToStorage(next);
      return next;
    }),

  exportData: () => {
    const state = get();
    return { nodes: state.nodes, edges: state.edges };
  },

  clearAll: () => {
    set((s) => {
      const next = {
        ...s,
        nodes: [],
        edges: [],
        snapshots: [],
        tasks: [],
        selectedNodeId: null,
        selectedField: null,
        focusedNodeId: null,
        searchQuery: '',
      };
      saveToStorage(next);
      return next;
    });
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
    return retention_result`,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const demoEdges: DataEdge[] = [
      { id: 'e1', source: 'demo_1', target: 'demo_4', type: 'direct', createdAt: now },
      { id: 'e2', source: 'demo_2', target: 'demo_4', type: 'direct', createdAt: now },
      { id: 'e3', source: 'demo_3', target: 'demo_4', type: 'direct', createdAt: now },
      { id: 'e4', source: 'demo_4', target: 'demo_5', type: 'transform', transformLogic: '按用户+日期分组汇总', createdAt: now },
      {
        id: 'e_f1',
        source: 'demo_1',
        target: 'demo_5',
        sourceField: 'user_id',
        targetField: 'user_id',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'e_f2',
        source: 'demo_1',
        target: 'demo_5',
        sourceField: 'user_name',
        targetField: 'user_name',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'e_f3',
        source: 'demo_1',
        target: 'demo_5',
        sourceField: 'city',
        targetField: 'city',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'e_f4',
        source: 'demo_2',
        target: 'demo_5',
        sourceField: 'order_time',
        targetField: 'dt',
        type: 'transform',
        transformLogic: 'DATE(order_time) 日期提取',
        createdAt: now,
      },
      {
        id: 'e_f5',
        source: 'demo_2',
        target: 'demo_5',
        sourceField: 'order_id',
        targetField: 'order_count',
        type: 'aggregate',
        transformLogic: 'COUNT(order_id) 统计订单数',
        createdAt: now,
      },
      {
        id: 'e_f6',
        source: 'demo_2',
        target: 'demo_5',
        sourceField: 'amount',
        targetField: 'total_amount',
        type: 'aggregate',
        transformLogic: 'SUM(amount) 汇总金额',
        createdAt: now,
      },
      {
        id: 'e_f7',
        source: 'demo_2',
        target: 'demo_5',
        sourceField: 'quantity',
        targetField: 'total_quantity',
        type: 'aggregate',
        transformLogic: 'SUM(quantity) 汇总数量',
        createdAt: now,
      },
      { id: 'e5', source: 'demo_5', target: 'demo_6', type: 'direct', createdAt: now },
      { id: 'e6', source: 'demo_6', target: 'demo_7', type: 'transform', transformLogic: '按城市+月份聚合', createdAt: now },
      {
        id: 'e_f8',
        source: 'demo_5',
        target: 'demo_7',
        sourceField: 'city',
        targetField: 'city',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'e_f9',
        source: 'demo_5',
        target: 'demo_7',
        sourceField: 'dt',
        targetField: 'month',
        type: 'transform',
        transformLogic: "DATE_FORMAT(dt, '%Y-%m') 月份格式化",
        createdAt: now,
      },
      {
        id: 'e_f10',
        source: 'demo_5',
        target: 'demo_7',
        sourceField: 'order_count',
        targetField: 'city_orders',
        type: 'aggregate',
        transformLogic: 'SUM(order_count) 城市订单总量',
        createdAt: now,
      },
      {
        id: 'e_f11',
        source: 'demo_5',
        target: 'demo_7',
        sourceField: 'total_amount',
        targetField: 'city_gmv',
        type: 'aggregate',
        transformLogic: 'SUM(total_amount) 城市GMV',
        createdAt: now,
      },
      {
        id: 'e_f12',
        source: 'demo_5',
        target: 'demo_7',
        sourceField: 'user_id',
        targetField: 'active_users',
        type: 'aggregate',
        transformLogic: 'COUNT(DISTINCT user_id) 去重活跃用户',
        createdAt: now,
      },
      {
        id: 'e7',
        source: 'demo_7',
        target: 'demo_8',
        type: 'direct',
        transformLogic: '报表数据引用',
        createdAt: now,
      },
      {
        id: 'e_f13',
        source: 'demo_7',
        target: 'demo_8',
        sourceField: 'city_gmv',
        targetField: 'city_gmv',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'e_f14',
        source: 'demo_7',
        target: 'demo_8',
        sourceField: 'city_orders',
        targetField: 'city_orders',
        type: 'direct',
        createdAt: now,
      },
      {
        id: 'e_f15',
        source: 'demo_7',
        target: 'demo_8',
        sourceField: 'active_users',
        targetField: 'active_users',
        type: 'direct',
        createdAt: now,
      },
      { id: 'e8', source: 'demo_1', target: 'demo_10', type: 'direct', createdAt: now },
      { id: 'e9', source: 'demo_2', target: 'demo_10', type: 'direct', createdAt: now },
    ];

    set((s) => {
      const existingIds = new Set(s.nodes.map((n) => n.id));
      const filteredNodes = demoNodes.filter((n) => !existingIds.has(n.id));
      const existingEdgeKeys = new Set(
        s.edges.map((e) => `${e.source}:${e.target}:${e.sourceField || ''}:${e.targetField || ''}`)
      );
      const filteredEdges = demoEdges.filter(
        (e) => !existingEdgeKeys.has(`${e.source}:${e.target}:${e.sourceField || ''}:${e.targetField || ''}`)
      );
      const next = {
        ...s,
        nodes: [...s.nodes, ...filteredNodes],
        edges: [...s.edges, ...filteredEdges],
      };
      saveToStorage(next);
      return next;
    });
  },
}));
