export type NodeType = 'table' | 'file' | 'report' | 'script' | 'field';

export interface FieldInfo {
  name: string;
  type?: string;
  description?: string;
  isKey?: boolean;
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
