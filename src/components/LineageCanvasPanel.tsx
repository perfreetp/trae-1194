import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Button,
  Space,
  Card,
  Drawer,
  Descriptions,
  Tag,
  Form,
  Input,
  Select,
  Slider,
  Switch,
  Divider,
  Row,
  Col,
  List,
  Empty,
  App as AntApp,
  Tooltip,
  Avatar,
  Badge,
  Checkbox,
  Modal,
  Alert,
} from 'antd';
const { Group: CheckboxGroup } = Checkbox;
import {
  ForkOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  InfoCircleOutlined,
  FilterOutlined,
  SettingOutlined,
  LinkOutlined,
  PlusOutlined,
  CloseOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Position,
  MarkerType,
  Handle,
  type Node,
  type Edge,
  type Connection,
} from 'reactflow';
import { useLineageStore } from '../store/lineageStore';
import type { DataNode, NodeType } from '../types';
import dayjs from 'dayjs';

const nodeTypeColors: Record<NodeType, { bg: string; border: string; text: string }> = {
  table: { bg: '#e6f4ff', border: '#1677ff', text: '#1677ff' },
  file: { bg: '#f6ffed', border: '#52c41a', text: '#389e0d' },
  report: { bg: '#f9f0ff', border: '#722ed1', text: '#531dab' },
  script: { bg: '#fff7e6', border: '#fa8c16', text: '#d46b08' },
  field: { bg: '#e6fffb', border: '#13c2c2', text: '#08979c' },
};

const nodeTypeLabels: Record<NodeType, string> = {
  table: '表',
  file: '文件',
  report: '报表',
  script: '脚本',
  field: '字段',
};

interface CustomNodeData {
  label: string;
  type: NodeType;
  owner?: string;
  critical?: boolean;
  fieldCount?: number;
  onClick?: () => void;
}

function CustomNode({ data }: { data: CustomNodeData }) {
  const colors = nodeTypeColors[data.type];
  return (
    <div
      className={`custom-node ${data.type} ${data.critical ? 'critical' : ''}`}
      style={{
        borderColor: colors.border,
        background: `linear-gradient(135deg, ${colors.bg} 0%, #ffffff 100%)`,
      }}
      onClick={data.onClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: colors.border }}
      />
      <div className="node-title">
        <span
          className={`node-type-tag ${data.type}`}
          style={{ background: colors.bg, color: colors.text }}
        >
          {nodeTypeLabels[data.type]}
        </span>
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.label}
        </span>
        {data.critical && (
          <Tooltip title="关键指标">
            <Badge status="error" />
          </Tooltip>
        )}
      </div>
      {(data.owner || data.fieldCount !== undefined) && (
        <div className="node-owner">
          {data.owner && <span>👤 {data.owner}</span>}
          {data.fieldCount !== undefined && data.fieldCount > 0 && (
            <span style={{ marginLeft: 8 }}>📋 {data.fieldCount}字段</span>
          )}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: colors.border }}
      />
    </div>
  );
}

const nodeTypes = {
  custom: CustomNode,
};

function getLayoutedNodes(
  dataNodes: DataNode[],
  edges: { source: string; target: string }[]
): Node[] {
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();
  dataNodes.forEach((n) => {
    inDegree.set(n.id, 0);
    graph.set(n.id, []);
  });
  edges.forEach((e) => {
    const target = inDegree.get(e.target);
    if (target !== undefined) inDegree.set(e.target, target + 1);
    graph.get(e.source)?.push(e.target);
  });

  const levels = new Map<string, number>();
  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) {
      queue.push(id);
      levels.set(id, 0);
    }
  });
  const tempDeg = new Map(inDegree);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const level = levels.get(id) || 0;
    (graph.get(id) || []).forEach((next) => {
      const n = (tempDeg.get(next) || 1) - 1;
      tempDeg.set(next, n);
      levels.set(next, Math.max(levels.get(next) || 0, level + 1));
      if (n === 0) queue.push(next);
    });
  }

  const levelNodes = new Map<number, string[]>();
  levels.forEach((level, id) => {
    if (!levelNodes.has(level)) levelNodes.set(level, []);
    levelNodes.get(level)!.push(id);
  });

  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 80;
  const H_GAP = 180;
  const V_GAP = 50;

  const result: Node[] = dataNodes.map((n) => {
    const level = levels.get(n.id) || 0;
    const sameLevel = levelNodes.get(level) || [];
    const idx = sameLevel.indexOf(n.id);
    const total = sameLevel.length;
    const x = level * (NODE_WIDTH + H_GAP);
    const y = idx * (NODE_HEIGHT + V_GAP) - ((total - 1) * (NODE_HEIGHT + V_GAP)) / 2;
    return {
      id: n.id,
      type: 'custom',
      position: { x, y },
      data: {
        label: n.name,
        type: n.type,
        owner: n.owner,
        critical: n.isCritical,
        fieldCount: n.fields?.length,
      } as CustomNodeData,
    };
  });
  return result;
}

function LineageCanvasPanel() {
  const {
    nodes,
    edges,
    selectedNodeId,
    selectNode,
    selectedField,
    selectField,
    addEdge: storeAddEdge,
    focusNode,
    focusedNodeId,
    getUpstreamNodes,
    getDownstreamNodes,
    getDownstreamFields,
    getFieldUpstream,
    getNodeById,
    canvasDetailOpen,
    canvasHighlightField,
    snapshotContextTag,
    setCanvasDetailOpen,
    setCanvasHighlightField,
    setSnapshotContextTag,
  } = useLineageStore();
  const { message, modal } = AntApp.useApp();

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [settingOpen, setSettingOpen] = useState(false);
  const [expandLevels, setExpandLevels] = useState(3);
  const [showOnlyCritical, setShowOnlyCritical] = useState(false);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<NodeType[]>([
    'table',
    'file',
    'report',
    'script',
  ]);
  const [addRelationOpen, setAddRelationOpen] = useState(false);
  const [relForm] = Form.useForm();
  const fieldItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (canvasDetailOpen) {
      setDetailOpen(true);
      setCanvasDetailOpen(false);
    }
  }, [canvasDetailOpen, setCanvasDetailOpen]);

  useEffect(() => {
    if (detailOpen && canvasHighlightField) {
      const timer = setTimeout(() => {
        const el = fieldItemRefs.current.get(canvasHighlightField);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [detailOpen, canvasHighlightField]);

  const selectedNode = selectedNodeId ? getNodeById(selectedNodeId) : null;

  const visibleNodes = useMemo(() => {
    let result = nodes;
    if (showOnlyCritical) {
      result = result.filter((n) => n.isCritical);
    }
    result = result.filter((n) => nodeTypeFilter.includes(n.type));

    if (focusedNodeId) {
      const upstream = getUpstreamNodes(focusedNodeId, expandLevels);
      const downstream = getDownstreamNodes(focusedNodeId, expandLevels);
      const focusNode = getNodeById(focusedNodeId);
      const focusIds = new Set<string>([focusedNodeId]);
      upstream.forEach((n) => focusIds.add(n.id));
      downstream.forEach((n) => focusIds.add(n.id));
      result = result.filter((n) => focusIds.has(n.id));
    }
    return result;
  }, [
    nodes,
    showOnlyCritical,
    nodeTypeFilter,
    focusedNodeId,
    expandLevels,
    getUpstreamNodes,
    getDownstreamNodes,
    getNodeById,
  ]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes]
  );

  const visibleEdges = useMemo(
    () => edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [edges, visibleNodeIds]
  );

  const { highlightedEdgeIds, involvedNodeIds } = useMemo(() => {
    const edgeIds = new Set<string>();
    const nodeIds = new Set<string>();

    if (!selectedNodeId || !selectedField) {
      return { highlightedEdgeIds: edgeIds, involvedNodeIds: nodeIds };
    }

    nodeIds.add(selectedNodeId);

    const visitedFieldKey = new Set<string>();
    const queue: Array<{ nid: string; field: string; dir: 'up' | 'down' | 'both' }> = [
      { nid: selectedNodeId, field: selectedField, dir: 'both' },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const curKey = `${current.nid}:${current.field}`;
      if (visitedFieldKey.has(curKey)) continue;
      visitedFieldKey.add(curKey);

      if (current.dir === 'down' || current.dir === 'both') {
        for (const edge of visibleEdges) {
          const matchSource =
            edge.source === current.nid &&
            (edge.sourceField === current.field || !edge.sourceField);
          if (!matchSource) continue;
          if (!edge.targetField) {
            edgeIds.add(edge.id);
            nodeIds.add(edge.target);
            continue;
          }
          edgeIds.add(edge.id);
          nodeIds.add(edge.target);
          const nextKey = `${edge.target}:${edge.targetField}`;
          if (!visitedFieldKey.has(nextKey)) {
            queue.push({ nid: edge.target, field: edge.targetField, dir: 'down' });
          }
        }
      }

      if (current.dir === 'up' || current.dir === 'both') {
        for (const edge of visibleEdges) {
          const matchTarget =
            edge.target === current.nid &&
            (edge.targetField === current.field || !edge.targetField);
          if (!matchTarget) continue;
          if (!edge.sourceField) {
            edgeIds.add(edge.id);
            nodeIds.add(edge.source);
            continue;
          }
          edgeIds.add(edge.id);
          nodeIds.add(edge.source);
          const nextKey = `${edge.source}:${edge.sourceField}`;
          if (!visitedFieldKey.has(nextKey)) {
            queue.push({ nid: edge.source, field: edge.sourceField, dir: 'up' });
          }
        }
      }
    }

    return { highlightedEdgeIds: edgeIds, involvedNodeIds: nodeIds };
  }, [selectedNodeId, selectedField, visibleEdges]);

  useEffect(() => {
    const layouted = getLayoutedNodes(visibleNodes, visibleEdges);
    const hasFieldSelection = !!selectedNodeId && !!selectedField;
    if (focusedNodeId) {
      const highlightIds = new Set<string>([focusedNodeId]);
      const upstreamIds = getUpstreamNodes(focusedNodeId, expandLevels).map((n) => n.id);
      const downstreamIds = getDownstreamNodes(focusedNodeId, expandLevels).map((n) => n.id);
      upstreamIds.forEach((id) => highlightIds.add(id));
      downstreamIds.forEach((id) => highlightIds.add(id));
      layouted.forEach((node) => {
        if (node.id === selectedNodeId) {
          node.className = 'selected';
        } else if (highlightIds.has(node.id)) {
          node.className = 'highlighted';
        } else {
          node.className = 'dimmed';
        }
        if (hasFieldSelection && !involvedNodeIds.has(node.id)) {
          node.className = (node.className ? node.className + ' ' : '') + 'field-dimmed';
        }
      });
    } else if (hasFieldSelection) {
      layouted.forEach((node) => {
        if (node.id === selectedNodeId) {
          node.className = 'selected';
        } else if (!involvedNodeIds.has(node.id)) {
          node.className = 'field-dimmed';
        }
      });
    } else if (selectedNodeId) {
      layouted.forEach((node) => {
        if (node.id === selectedNodeId) {
          node.className = 'selected';
        }
      });
    }
    setRfNodes(layouted);

    const mappedEdges: Edge[] = visibleEdges.map((e) => {
      const isHighlighted = highlightedEdgeIds.has(e.id);
      let label = '';
      let color = '#999';
      let strokeWidth = 1.5;
      let opacity = 1;

      if (e.type === 'transform') {
        color = '#fa8c16';
        label = '转换';
      } else if (e.type === 'aggregate') {
        color = '#722ed1';
        label = '聚合';
      }
      if (e.transformLogic) {
        label = e.transformLogic;
      }

      if (isHighlighted) {
        color = '#eb2f96';
        strokeWidth = 3.5;
        if (e.transformLogic) {
          label = e.transformLogic;
        } else if (e.sourceField || e.targetField) {
          label = `${e.sourceField || '?'} → ${e.targetField || '?'}`;
        }
      } else if (hasFieldSelection) {
        opacity = 0.2;
      }

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        animated: isHighlighted || e.type === 'transform' || e.type === 'aggregate',
        label,
        labelStyle: {
          fontSize: isHighlighted ? 12 : 10,
          fill: color,
          fontWeight: isHighlighted ? 700 : 400,
        },
        labelBgPadding: [4, 2],
        labelBgStyle: {
          fill: 'white',
          fillOpacity: isHighlighted ? 1 : 0.9,
          stroke: isHighlighted ? '#eb2f96' : 'transparent',
          strokeWidth: isHighlighted ? 1 : 0,
        },
        style: { stroke: color, strokeWidth, opacity },
        markerEnd: { type: MarkerType.ArrowClosed, color: color },
      };
    });
    setRfEdges(mappedEdges);
  }, [
    visibleNodes,
    visibleEdges,
    focusedNodeId,
    selectedNodeId,
    selectedField,
    expandLevels,
    highlightedEdgeIds,
    involvedNodeIds,
  ]);

  const onConnect = useCallback(
    (params: Connection) => {
      modal.confirm({
        title: '创建血缘关系',
        content: `确定从 ${getNodeById(params.source || '')?.name || '源节点'} 到 ${getNodeById(params.target || '')?.name || '目标节点'}?`,
        onOk: () => {
          if (params.source && params.target) {
            const result = storeAddEdge({
              source: params.source,
              target: params.target,
              type: 'direct',
            });
            if (result) {
              setRfEdges((eds) =>
                addEdge(
                  {
                    ...params,
                    markerEnd: { type: MarkerType.ArrowClosed },
                    style: { strokeWidth: 1.5 },
                  } as Edge,
                  eds
                )
              );
              message.success('关系已创建');
            } else {
              message.warning('关系已存在');
            }
          }
        },
      });
    },
    [getNodeById, storeAddEdge, setRfEdges, message, modal]
  );

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    if (node.id !== selectedNodeId) {
      selectField(null);
    }
    selectNode(node.id);
    setDetailOpen(true);
  };

  const handlePaneClick = () => {
    selectField(null);
  };

  const handleAddRelation = async () => {
    try {
      const values = await relForm.validateFields();
      const result = storeAddEdge({
        source: values.source,
        target: values.target,
        sourceField: values.sourceField,
        targetField: values.targetField,
        type: values.relType,
        transformLogic: values.transformLogic,
      });
      if (result) {
        message.success('关系添加成功');
        setAddRelationOpen(false);
        relForm.resetFields();
      } else {
        message.warning('关系已存在');
      }
    } catch (e) {
      // noop
    }
  };

  const upstream = selectedNode ? getUpstreamNodes(selectedNode.id) : [];
  const downstream = selectedNode ? getDownstreamNodes(selectedNode.id) : [];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="window-card">
        <div className="window-header">
          <ForkOutlined style={{ color: '#13c2c2' }} />
          <span className="window-title">血缘画布</span>
          <Tag color="blue">节点: {visibleNodes.length}</Tag>
          <Tag color="green">关系: {visibleEdges.length}</Tag>
          {focusedNodeId && (
            <Tag color="purple" closable onClose={() => focusNode(null)}>
              聚焦: {getNodeById(focusedNodeId)?.name} (展开{expandLevels}层)
            </Tag>
          )}
          <div style={{ flex: 1 }} />
          <Space>
            <Tooltip title="仅显示关键指标">
              <Switch
                size="small"
                checked={showOnlyCritical}
                onChange={setShowOnlyCritical}
                checkedChildren={<EyeOutlined />}
                unCheckedChildren={<EyeInvisibleOutlined />}
              />
            </Tooltip>
            <Button
              size="small"
              icon={<LinkOutlined />}
              onClick={() => {
                setAddRelationOpen(true);
                relForm.resetFields();
              }}
            >
              手动添加关系
            </Button>
            <Button
              size="small"
              icon={<FilterOutlined />}
              onClick={() => setSettingOpen(true)}
            >
              过滤设置
            </Button>
            <Button
              size="small"
              icon={<ExpandOutlined />}
              onClick={() => focusNode(null)}
            >
              展开全部
            </Button>
          </Space>
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
          {rfNodes.length === 0 ? (
            <Empty
              description="暂无血缘数据，先导入数据源或在脚本解析中生成节点"
              style={{ padding: 80 }}
            />
          ) : (
            <ReactFlow
              nodes={rfNodes.map((n) => ({
                ...n,
                data: { ...n.data, onClick: undefined },
              }))}
              edges={rfEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={handlePaneClick}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={16} />
              <Controls />
              <MiniMap
                nodeColor={(node) =>
                  nodeTypeColors[(node.data as CustomNodeData).type]?.border || '#999'
                }
                maskColor="rgba(0,0,0,0.1)"
                pannable
                zoomable
              />
            </ReactFlow>
          )}
        </div>
      </div>

      <Drawer
        title={
          <Space>
            {selectedNode && (
              <Tag
                color={nodeTypeColors[selectedNode.type].text}
                style={{ borderColor: nodeTypeColors[selectedNode.type].border }}
              >
                {nodeTypeLabels[selectedNode.type]}
              </Tag>
            )}
            <span style={{ fontWeight: 600 }}>{selectedNode?.name}</span>
            {selectedNode?.isCritical && (
              <Tag color="red">关键指标</Tag>
            )}
          </Space>
        }
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={520}
        extra={
          <Space>
            <Button
              size="small"
              onClick={() => {
                if (selectedNode) {
                  focusNode(selectedNode.id);
                  setDetailOpen(false);
                }
              }}
            >
              <ExpandOutlined /> 聚焦此节点
            </Button>
          </Space>
        }
      >
        {selectedNode && (
          <div>
            {snapshotContextTag && (
              <Alert
                type={
                  snapshotContextTag.type === 'added'
                    ? 'success'
                    : snapshotContextTag.type === 'removed'
                    ? 'error'
                    : snapshotContextTag.type === 'changed'
                    ? 'warning'
                    : 'info'
                }
                showIcon
                closable
                onClose={() => setSnapshotContextTag(null)}
                style={{ marginBottom: 16 }}
                message={
                  <Space>
                    <strong>
                      来自「{snapshotContextTag.title}」：
                      {snapshotContextTag.type === 'added' && '新增字段'}
                      {snapshotContextTag.type === 'removed' && '删除字段'}
                      {snapshotContextTag.type === 'changed' && '修改字段'}
                      {snapshotContextTag.fieldName && (
                        <code style={{ marginLeft: 4 }}>{snapshotContextTag.fieldName}</code>
                      )}
                    </strong>
                  </Space>
                }
              />
            )}
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="负责人" span={2}>
                <Avatar size="small" style={{ marginRight: 8 }}>
                  {selectedNode.owner?.charAt(0) || '?'}
                </Avatar>
                {selectedNode.owner || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="标签" span={2}>
                <Space wrap>
                  {selectedNode.tags?.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  )) || '-'}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>
                {selectedNode.description || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(selectedNode.createdAt).format('YYYY-MM-DD')}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {dayjs(selectedNode.updatedAt).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
            </Descriptions>

            {selectedNode.fields && selectedNode.fields.length > 0 && (
              <Card
                size="small"
                title={
                  <Space>
                    <BulbOutlined />
                    字段定义 ({selectedNode.fields.length})
                    {selectedField && (
                      <Tag
                        color="magenta"
                        closable
                        onClose={(e) => {
                          e.stopPropagation();
                          selectField(null);
                        }}
                      >
                        追踪中: {selectedField}
                      </Tag>
                    )}
                  </Space>
                }
                style={{ marginBottom: 16 }}
                extra={
                  selectedField && (
                    <Button size="small" type="text" onClick={() => selectField(null)}>
                      <CloseOutlined /> 取消追踪
                    </Button>
                  )
                }
              >
                <List
                  size="small"
                  dataSource={selectedNode.fields}
                  renderItem={(f) => {
                    const isSelected = selectedField === f.name;
                    const isHighlighted = canvasHighlightField === f.name;
                    return (
                      <div
                        ref={(el) => {
                          if (el) {
                            fieldItemRefs.current.set(f.name, el);
                          }
                        }}
                        style={{ display: 'contents' }}
                      >
                        <List.Item
                          className={`field-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => selectField(isSelected ? null : f.name)}
                          style={{
                            cursor: 'pointer',
                            background: isHighlighted
                              ? '#fff7e6'
                              : isSelected
                              ? '#fff0f6'
                              : 'transparent',
                            borderLeft: isHighlighted
                              ? '4px solid #fa8c16'
                              : isSelected
                              ? '3px solid #eb2f96'
                              : '3px solid transparent',
                            paddingLeft: isHighlighted ? 8 : isSelected ? 9 : 12,
                            transition: 'all 0.2s',
                            animation: isHighlighted
                              ? 'highlightPulse 1.2s ease-in-out 3'
                              : undefined,
                            boxShadow: isHighlighted
                              ? '0 2px 8px rgba(250, 140, 22, 0.25)'
                              : undefined,
                          }}
                        >
                        <Space style={{ flex: 1 }}>
                          {f.isKey && <Tag color="red">主键</Tag>}
                          <code style={{ fontWeight: isSelected ? 700 : 400 }}>{f.name}</code>
                          {f.type && <Tag color="blue">{f.type}</Tag>}
                          <span style={{ color: '#8c8c8c', fontSize: 12, flex: 1 }}>
                            {f.description}
                          </span>
                        </Space>
                        <Tooltip title={isSelected ? '取消追踪' : '🔍 追踪该字段血缘'}>
                          <Button
                            size="small"
                            type={isSelected ? 'primary' : 'text'}
                            danger={isSelected}
                            icon={<span>🔍</span>}
                            onClick={(e) => {
                              e.stopPropagation();
                              selectField(isSelected ? null : f.name);
                            }}
                            style={isSelected ? { background: '#eb2f96', borderColor: '#eb2f96' } : {}}
                          >
                            {isSelected ? '追踪中' : '追踪'}
                          </Button>
                        </Tooltip>
                      </List.Item>
                      </div>
                    );
                  }}
                />
                <style>{`
                  @keyframes highlightPulse {
                    0%, 100% {
                      background-color: #fff7e6;
                    }
                    50% {
                      background-color: #ffd591;
                    }
                  }
                `}</style>
              </Card>
            )}

            <Row gutter={12}>
              <Col span={12}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <ZoomInOutlined />
                      上游依赖 ({upstream.length})
                    </Space>
                  }
                  styles={{ body: { maxHeight: 240, overflow: 'auto' } }}
                >
                  {upstream.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无" />
                  ) : (
                    upstream.map((n) => (
                      <div
                        key={n.id}
                        className="node-card"
                        style={{ marginBottom: 6 }}
                        onClick={() => selectNode(n.id)}
                      >
                        <Space>
                          <Tag color={nodeTypeColors[n.type].text}>
                            {nodeTypeLabels[n.type]}
                          </Tag>
                          <span>{n.name}</span>
                        </Space>
                      </div>
                    ))
                  )}
                </Card>
              </Col>
              <Col span={12}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <ZoomOutOutlined />
                      下游影响 ({downstream.length})
                    </Space>
                  }
                  styles={{ body: { maxHeight: 240, overflow: 'auto' } }}
                >
                  {downstream.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无" />
                  ) : (
                    downstream.map((n) => (
                      <div
                        key={n.id}
                        className="node-card"
                        style={{ marginBottom: 6 }}
                        onClick={() => selectNode(n.id)}
                      >
                        <Space>
                          <Tag color={nodeTypeColors[n.type].text}>
                            {nodeTypeLabels[n.type]}
                          </Tag>
                          <span>{n.name}</span>
                        </Space>
                      </div>
                    ))
                  )}
                </Card>
              </Col>
            </Row>

            {selectedNode.content && (
              <>
                <Divider orientation="left">脚本内容</Divider>
                <pre className="code-block">{selectedNode.content}</pre>
              </>
            )}
          </div>
        )}
      </Drawer>

      <Drawer
        title={<Space><SettingOutlined />显示过滤设置</Space>}
        open={settingOpen}
        onClose={() => setSettingOpen(false)}
        width={360}
        placement="left"
      >
        <Form layout="vertical">
          <Form.Item label="显示节点类型">
            <CheckboxGroup
              value={nodeTypeFilter}
              onChange={(v) => setNodeTypeFilter(v as NodeType[])}
              options={[
                { label: '数据表', value: 'table' },
                { label: '文件', value: 'file' },
                { label: '报表', value: 'report' },
                { label: '脚本', value: 'script' },
              ]}
            />
          </Form.Item>
          <Form.Item label="聚焦模式展开层级">
            <Slider
              min={1}
              max={8}
              value={expandLevels}
              onChange={setExpandLevels}
              marks={{ 1: '1', 3: '3', 5: '5', 8: '8' }}
            />
          </Form.Item>
          <Form.Item label="仅显示关键节点">
            <Switch checked={showOnlyCritical} onChange={setShowOnlyCritical} />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title={<Space><LinkOutlined />手动添加血缘关系</Space>}
        open={addRelationOpen}
        onOk={handleAddRelation}
        onCancel={() => setAddRelationOpen(false)}
        okText="添加"
      >
        <Form form={relForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="源节点 (上游)"
                name="source"
                rules={[{ required: true, message: '请选择源节点' }]}
              >
                <Select
                  showSearch
                  placeholder="选择上游节点"
                  optionFilterProp="label"
                  options={nodes.map((n) => ({
                    value: n.id,
                    label: `${nodeTypeLabels[n.type]} - ${n.name}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="目标节点 (下游)"
                name="target"
                rules={[{ required: true, message: '请选择目标节点' }]}
              >
                <Select
                  showSearch
                  placeholder="选择下游节点"
                  optionFilterProp="label"
                  options={nodes.map((n) => ({
                    value: n.id,
                    label: `${nodeTypeLabels[n.type]} - ${n.name}`,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="源字段" name="sourceField">
                <Select
                  allowClear
                  showSearch
                  placeholder="可选：指定字段级"
                  options={(() => {
                    const srcId = relForm.getFieldValue('source');
                    const srcNode = nodes.find((n) => n.id === srcId);
                    return (
                      srcNode?.fields?.map((f) => ({
                        value: f.name,
                        label: f.name,
                      })) || []
                    );
                  })()}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="目标字段" name="targetField">
                <Select
                  allowClear
                  showSearch
                  placeholder="可选：指定字段级"
                  options={(() => {
                    const tgtId = relForm.getFieldValue('target');
                    const tgtNode = nodes.find((n) => n.id === tgtId);
                    return (
                      tgtNode?.fields?.map((f) => ({
                        value: f.name,
                        label: f.name,
                      })) || []
                    );
                  })()}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="关系类型" name="relType" initialValue="direct">
                <Select
                  options={[
                    { value: 'direct', label: '直接依赖' },
                    { value: 'transform', label: '字段转换' },
                    { value: 'aggregate', label: '聚合计算' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="转换逻辑" name="transformLogic">
                <Input placeholder="如 SUM()/JOIN 等说明" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

export default LineageCanvasPanel;
