export type NodeType = 'table' | 'file' | 'report' | 'script' | 'field';

export interface FieldInfo {
  name: string;
  type?: string;
  description?: string;
  isKey?: boolean;
  isSensitive?: boolean;
  businessRule?: string;
}

export interface FieldChange {
  fieldName: string;
  before?: Partial<FieldInfo>;
  after?: Partial<FieldInfo>;
  changedProps: string[];
}

export interface ModifiedFields {
  nodeId: string;
  nodeName: string;
  added: FieldInfo[];
  removed: FieldInfo[];
  changed: FieldChange[];
}

export interface DataNode {
  id: string;
  name: string;
  type: NodeType;
  description?: string;
  owner?: string;
  tags?: string[];
  isCritical?: boolean;
  source?: string;
  fields?: FieldInfo[];
  createdAt: number;
  updatedAt: number;
  content?: string;
  path?: string;
}

export interface DataEdge {
  id: string;
  source: string;
  target: string;
  sourceField?: string;
  targetField?: string;
  transformLogic?: string;
  type?: 'direct' | 'transform' | 'aggregate';
  createdAt: number;
}

export interface Snapshot {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  nodes: DataNode[];
  edges: DataEdge[];
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'doing' | 'done';
  relatedNodeId?: string;
  relatedFields?: string[];
  changeSource?: string;
  assignee?: string;
  createdAt: number;
  dueDate?: number;
}

export interface ImpactAnalysis {
  affectedNodes: DataNode[];
  affectedEdges: DataEdge[];
  affectedReports: DataNode[];
  affectedFields: Map<string, string[]>;
  riskLevel: 'high' | 'medium' | 'low';
}

export interface SearchResult {
  node: DataNode;
  matchedFields: string[];
}

export interface CompareSnapshotsResult {
  addedNodes: DataNode[];
  removedNodes: DataNode[];
  modifiedNodes: DataNode[];
  addedEdges: DataEdge[];
  removedEdges: DataEdge[];
  modifiedFields: ModifiedFields[];
}

export type MergeStrategy = 'merge' | 'overwrite' | 'skip';

export type PanelKey =
  | 'datasource'
  | 'parser'
  | 'canvas'
  | 'search'
  | 'impact'
  | 'snapshot'
  | 'task'
  | 'report';

export interface PendingTaskFormData {
  priority: 'high' | 'medium' | 'low';
  relatedNodeId?: string;
  relatedFields?: string[];
  changeSource?: string;
  title?: string;
  description?: string;
  autoOpen: boolean;
}
