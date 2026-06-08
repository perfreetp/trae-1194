import { useState, useMemo } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Space,
  List,
  Tag,
  Row,
  Col,
  Empty,
  App as AntApp,
  Modal,
  Select,
  Divider,
  Tooltip,
  Table,
  Alert,
  Timeline,
  Avatar,
  Badge,
  Tabs,
  Radio,
} from 'antd';
import {
  CameraOutlined,
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SwapOutlined,
  DiffOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  EditOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  FileOutlined,
  CodeOutlined,
  MinusOutlined,
  KeyOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  WarningOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useLineageStore } from '../store/lineageStore';
import type {
  Snapshot,
  DataNode,
  DataEdge,
  NodeType,
  ModifiedFields,
  FieldChange,
  FieldInfo,
} from '../types';
import dayjs from 'dayjs';

const typeIcons: Record<NodeType, React.ReactNode> = {
  table: <DatabaseOutlined />,
  file: <FileOutlined />,
  report: <BarChartOutlined />,
  script: <CodeOutlined />,
  field: <DatabaseOutlined />,
};

type CompareTabKey = 'nodes' | 'edges' | 'fields' | 'overview';

function isHighRiskFieldChange(change: FieldChange): boolean {
  const { changedProps, before, after } = change;
  if (changedProps.includes('isKey')) return true;
  if (changedProps.includes('isSensitive')) return true;
  if (before && after && changedProps.length > 0 && changedProps.includes('type')) {
    return true;
  }
  return false;
}

function isHighRiskRemovedField(f: FieldInfo): boolean {
  return !!f.isKey || !!f.isSensitive;
}

function isHighRiskAddedField(f: FieldInfo): boolean {
  return !!f.isKey || !!f.isSensitive;
}

function describeFieldChanges(fc: FieldChange): string[] {
  const lines: string[] = [];
  const propsMap: Record<string, string> = {
    type: '类型',
    description: '描述',
    isKey: '主键标记',
    isSensitive: '敏感标记',
    businessRule: '业务口径',
  };
  for (const p of fc.changedProps) {
    const b = fc.before?.[p as keyof FieldInfo];
    const a = fc.after?.[p as keyof FieldInfo];
    const label = propsMap[p] || p;
    const fmt = (v: unknown) => {
      if (typeof v === 'boolean') return v ? '是' : '否';
      return v == null || v === '' ? '(空)' : String(v);
    };
    lines.push(`- ${label}: ${fmt(b)} → ${fmt(a)}`);
  }
  return lines;
}

function SnapshotPanel() {
  const {
    snapshots,
    nodes,
    edges,
    createSnapshot,
    deleteSnapshot,
    restoreSnapshot,
    compareSnapshots,
    compareFieldLevel,
    selectNode,
    setActivePanel,
    setPendingTaskFormData,
    getNodeById,
  } = useLineageStore();
  const { message, modal } = AntApp.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [compareOpen, setCompareOpen] = useState(false);
  const [snap1, setSnap1] = useState<string | undefined>(undefined);
  const [snap2, setSnap2] = useState<string | undefined>(undefined);
  const [compareTab, setCompareTab] = useState<CompareTabKey>('overview');

  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((a, b) => b.createdAt - a.createdAt),
    [snapshots]
  );

  const compareResult = useMemo(() => {
    if (!snap1 || !snap2) return null;
    return compareSnapshots(snap1, snap2);
  }, [snap1, snap2, compareSnapshots]);

  const fieldLevelChanges = useMemo(() => {
    if (!snap1 || !snap2) return [] as ModifiedFields[];
    return compareFieldLevel(snap1, snap2);
  }, [snap1, snap2, compareFieldLevel]);

  const snap1Name = useMemo(
    () => (snap1 ? snapshots.find((s) => s.id === snap1)?.name : undefined),
    [snap1, snapshots]
  );
  const snap2Name = useMemo(
    () => (snap2 ? snapshots.find((s) => s.id === snap2)?.name : undefined),
    [snap2, snapshots]
  );

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      createSnapshot(values.name, values.description);
      message.success('快照创建成功');
      setCreateOpen(false);
      createForm.resetFields();
    } catch (e) {
      // noop
    }
  };

  const handleRestore = (snap: Snapshot) => {
    modal.confirm({
      title: '恢复快照',
      content: `恢复快照「${snap.name}」将覆盖当前的血缘数据，确定继续吗？`,
      okText: '确认恢复',
      okButtonProps: { danger: true },
      onOk: () => {
        restoreSnapshot(snap.id);
        message.success(`已恢复到「${snap.name}」`);
      },
    });
  };

  const handleDelete = (snap: Snapshot) => {
    modal.confirm({
      title: '删除快照',
      content: `确定删除「${snap.name}」？此操作不可恢复`,
      onOk: () => {
        deleteSnapshot(snap.id);
        message.success('已删除');
      },
    });
  };

  const handleJumpToDetail = (nodeId: string) => {
    selectNode(nodeId);
    setActivePanel('canvas');
    message.info('已跳转至血缘画布并选中节点');
  };

  const handleCreateTask = (opts: {
    nodeId?: string;
    nodeName?: string;
    relatedFields: string[];
    titleExtra?: string;
    description: string;
    highRisk?: boolean;
  }) => {
    const nodeName = opts.nodeName || (opts.nodeId ? getNodeById(opts.nodeId)?.name : undefined) || '节点';
    setPendingTaskFormData({
      priority: opts.highRisk ? 'high' : 'high',
      relatedNodeId: opts.nodeId,
      relatedFields: opts.relatedFields,
      changeSource: `快照对比: ${snap1Name || '旧版'} → ${snap2Name || '新版'}`,
      title: `处理 ${nodeName} ${opts.titleExtra || '字段变更'}`,
      description:
        `来源：快照对比「${snap1Name || '旧快照'}」→「${snap2Name || '新快照'}」\n` +
        `关联节点：${nodeName}\n` +
        `关联字段：${opts.relatedFields.join(', ')}\n\n` +
        `变更详情：\n${opts.description}`,
      autoOpen: true,
    });
    setActivePanel('task');
    message.success('已打开任务面板，预填整改任务');
  };

  const diffNodeColumns = [
    {
      title: '变更',
      key: 'change',
      width: 70,
      render: (_: unknown, __: unknown, type?: string) => {
        if (type === 'added')
          return <Tag color="green" icon={<PlusOutlined />}>新增</Tag>;
        if (type === 'removed')
          return <Tag color="red" icon={<CloseOutlined />}>删除</Tag>;
        return <Tag color="orange" icon={<EditOutlined />}>修改</Tag>;
      },
    },
    {
      title: '节点',
      key: 'node',
      render: (_: unknown, record: DataNode) => (
        <Space>
          {typeIcons[record.type]}
          <code>{record.name}</code>
          <Tag>{record.type}</Tag>
        </Space>
      ),
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      render: (t: string) => t || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, record: DataNode, type?: string) => (
        <Space size="small">
          <Button
            size="small"
            icon={<SearchOutlined />}
            onClick={() => handleJumpToDetail(record.id)}
            disabled={type === 'removed'}
          >
            详情
          </Button>
          <Button
            size="small"
            danger
            icon={<WarningOutlined />}
            onClick={() =>
              handleCreateTask({
                nodeId: record.id,
                nodeName: record.name,
                relatedFields: record.fields?.map((f) => f.name) || [],
                titleExtra:
                  type === 'added'
                    ? '新增节点确认'
                    : type === 'removed'
                    ? '删除节点确认'
                    : '节点变更整改',
                description: `节点类型：${type === 'added' ? '新增' : type === 'removed' ? '删除' : '修改'}\n描述：${record.description || '(无)'}`,
                highRisk: type === 'removed' || record.isCritical,
              })
            }
          >
            生成任务
          </Button>
        </Space>
      ),
    },
  ];

  const diffEdgeColumns = [
    {
      title: '变更',
      key: 'change',
      width: 70,
      render: (_: unknown, __: unknown, type?: string) => {
        if (type === 'added')
          return <Tag color="green" icon={<PlusOutlined />}>新增</Tag>;
        if (type === 'removed')
          return <Tag color="red" icon={<CloseOutlined />}>删除</Tag>;
        return <Tag color="orange" icon={<EditOutlined />}>修改</Tag>;
      },
    },
    {
      title: '源节点',
      key: 'source',
      render: (_: unknown, record: DataEdge) => {
        const n = getNodeById(record.source);
        return (
          <Space>
            {n ? typeIcons[n.type] : null}
            <code>{n?.name || record.source}</code>
            {record.sourceField && (
              <Tag color="cyan">字段: {record.sourceField}</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '→',
      key: 'arrow',
      width: 40,
      align: 'center' as const,
      render: () => <SwapOutlined style={{ color: '#1677ff' }} />,
    },
    {
      title: '目标节点',
      key: 'target',
      render: (_: unknown, record: DataEdge) => {
        const n = getNodeById(record.target);
        return (
          <Space>
            {n ? typeIcons[n.type] : null}
            <code>{n?.name || record.target}</code>
            {record.targetField && (
              <Tag color="cyan">字段: {record.targetField}</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '变换逻辑',
      dataIndex: 'transformLogic',
      key: 'transformLogic',
      render: (t: string) => t || '-',
    },
  ];

  const NodeChangeSection = () => {
    if (!compareResult) return null;
    const { addedNodes, removedNodes, modifiedNodes } = compareResult;
    if (
      addedNodes.length === 0 &&
      removedNodes.length === 0 &&
      modifiedNodes.length === 0
    ) {
      return <Empty description="无节点变化" />;
    }
    return (
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {addedNodes.length > 0 && (
          <div>
            <Divider orientation="left" style={{ margin: '4px 0' }} plain>
              <Tag color="green">新增节点 {addedNodes.length}</Tag>
            </Divider>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {addedNodes.map((r) => (
                <div
                  key={r.id}
                  className="snapshot-compare-row added"
                  style={{ padding: '8px 12px', justifyContent: 'space-between' }}
                >
                  <Space style={{ flex: 1 }}>
                    <Tag color="green" icon={<PlusOutlined />}>新增</Tag>
                    {typeIcons[r.type]}
                    <code>{r.name}</code>
                    <Tag>{r.type}</Tag>
                    <span style={{ color: '#8c8c8c' }}>{r.description || ''}</span>
                  </Space>
                  <Space size="small">
                    <Button
                      size="small"
                      icon={<SearchOutlined />}
                      onClick={() => handleJumpToDetail(r.id)}
                    >
                      详情
                    </Button>
                    <Button
                      size="small"
                      icon={<UnorderedListOutlined />}
                      onClick={() =>
                        handleCreateTask({
                          nodeId: r.id,
                          nodeName: r.name,
                          relatedFields: r.fields?.map((f) => f.name) || [],
                          titleExtra: '新增节点确认',
                          description: `节点类型：新增\n描述：${r.description || '(无)'}`,
                        })
                      }
                    >
                      生成任务
                    </Button>
                  </Space>
                </div>
              ))}
            </Space>
          </div>
        )}

        {modifiedNodes.length > 0 && (
          <div>
            <Divider orientation="left" style={{ margin: '4px 0' }} plain>
              <Tag color="orange">修改节点 {modifiedNodes.length}</Tag>
            </Divider>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {modifiedNodes.map((r) => (
                <div
                  key={r.id}
                  className="snapshot-compare-row modified"
                  style={{
                    padding: '8px 12px',
                    justifyContent: 'space-between',
                    borderLeftColor: r.isCritical ? '#ff4d4f' : undefined,
                  }}
                >
                  <Space style={{ flex: 1 }}>
                    <Tag color="orange" icon={<EditOutlined />}>修改</Tag>
                    {typeIcons[r.type]}
                    <code>{r.name}</code>
                    <Tag>{r.type}</Tag>
                    {r.isCritical && (
                      <Tag color="red" icon={<WarningOutlined />}>关键</Tag>
                    )}
                  </Space>
                  <Space size="small">
                    <Button
                      size="small"
                      icon={<SearchOutlined />}
                      onClick={() => handleJumpToDetail(r.id)}
                    >
                      详情
                    </Button>
                    <Button
                      size="small"
                      danger
                      icon={<UnorderedListOutlined />}
                      onClick={() =>
                        handleCreateTask({
                          nodeId: r.id,
                          nodeName: r.name,
                          relatedFields: r.fields?.map((f) => f.name) || [],
                          titleExtra: '节点变更',
                          description: `节点类型：修改\n需在字段变化 Tab 查看具体字段变更`,
                          highRisk: r.isCritical,
                        })
                      }
                    >
                      生成任务
                    </Button>
                  </Space>
                </div>
              ))}
            </Space>
          </div>
        )}

        {removedNodes.length > 0 && (
          <div>
            <Divider orientation="left" style={{ margin: '4px 0' }} plain>
              <Tag color="red">删除节点 {removedNodes.length}</Tag>
            </Divider>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {removedNodes.map((r) => (
                <div
                  key={r.id}
                  className="snapshot-compare-row removed"
                  style={{ padding: '8px 12px', justifyContent: 'space-between' }}
                >
                  <Space style={{ flex: 1 }}>
                    <Tag color="red" icon={<CloseOutlined />}>删除</Tag>
                    {typeIcons[r.type]}
                    <code style={{ textDecoration: 'line-through' }}>{r.name}</code>
                    <Tag>{r.type}</Tag>
                    <Badge
                      color="red"
                      text={
                        <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
                          高风险
                        </span>
                      }
                    />
                  </Space>
                  <Space size="small">
                    <Button
                      size="small"
                      danger
                      icon={<UnorderedListOutlined />}
                      onClick={() =>
                        handleCreateTask({
                          nodeId: r.id,
                          nodeName: r.name,
                          relatedFields: r.fields?.map((f) => f.name) || [],
                          titleExtra: '删除节点确认',
                          description: `节点类型：删除\n原描述：${r.description || '(无)'}`,
                          highRisk: true,
                        })
                      }
                    >
                      生成整改任务
                    </Button>
                  </Space>
                </div>
              ))}
            </Space>
          </div>
        )}
      </Space>
    );
  };

  const EdgeChangeSection = () => {
    if (!compareResult) return null;
    const { addedEdges, removedEdges } = compareResult;
    if (addedEdges.length === 0 && removedEdges.length === 0) {
      return <Empty description="无边变化" />;
    }
    return (
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {addedEdges.length > 0 && (
          <div>
            <Divider orientation="left" style={{ margin: '4px 0' }} plain>
              <Tag color="green">新增关系 {addedEdges.length}</Tag>
            </Divider>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {addedEdges.map((e) => {
                const s = getNodeById(e.source);
                const t = getNodeById(e.target);
                return (
                  <div
                    key={e.id}
                    className="snapshot-compare-row added"
                    style={{ padding: '8px 12px' }}
                  >
                    <Space wrap>
                      <Tag color="green" icon={<PlusOutlined />}>新增</Tag>
                      <Space>
                        {s && typeIcons[s.type]}
                        <code>{s?.name || e.source}</code>
                        {e.sourceField && (
                          <Tag color="cyan">字段: {e.sourceField}</Tag>
                        )}
                      </Space>
                      <SwapOutlined style={{ color: '#1677ff' }} />
                      <Space>
                        {t && typeIcons[t.type]}
                        <code>{t?.name || e.target}</code>
                        {e.targetField && (
                          <Tag color="cyan">字段: {e.targetField}</Tag>
                        )}
                      </Space>
                      {e.transformLogic && <Tag>{e.transformLogic}</Tag>}
                    </Space>
                  </div>
                );
              })}
            </Space>
          </div>
        )}
        {removedEdges.length > 0 && (
          <div>
            <Divider orientation="left" style={{ margin: '4px 0' }} plain>
              <Tag color="red">删除关系 {removedEdges.length}</Tag>
            </Divider>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {removedEdges.map((e) => {
                const s = getNodeById(e.source);
                const t = getNodeById(e.target);
                return (
                  <div
                    key={e.id}
                    className="snapshot-compare-row removed"
                    style={{ padding: '8px 12px' }}
                  >
                    <Space wrap>
                      <Tag color="red" icon={<CloseOutlined />}>删除</Tag>
                      <Space>
                        {s && typeIcons[s.type]}
                        <code style={{ textDecoration: 'line-through' }}>
                          {s?.name || e.source}
                        </code>
                        {e.sourceField && (
                          <Tag color="cyan">字段: {e.sourceField}</Tag>
                        )}
                      </Space>
                      <SwapOutlined style={{ color: '#1677ff' }} />
                      <Space>
                        {t && typeIcons[t.type]}
                        <code style={{ textDecoration: 'line-through' }}>
                          {t?.name || e.target}
                        </code>
                        {e.targetField && (
                          <Tag color="cyan">字段: {e.targetField}</Tag>
                        )}
                      </Space>
                      {e.transformLogic && <Tag>{e.transformLogic}</Tag>}
                    </Space>
                  </div>
                );
              })}
            </Space>
          </div>
        )}
      </Space>
    );
  };

  const FieldChangeSection = () => {
    if (fieldLevelChanges.length === 0) {
      return <Empty description="无字段变化" />;
    }
    return (
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {fieldLevelChanges.map((mf) => {
          const hasAdded = mf.added.length > 0;
          const hasRemoved = mf.removed.length > 0;
          const hasChanged = mf.changed.length > 0;
          const highRiskRemoved = mf.removed.some(isHighRiskRemovedField);
          const highRiskKeyOrSensChanged = mf.changed.some(isHighRiskFieldChange);
          const nodeHighRisk = highRiskRemoved || highRiskKeyOrSensChanged;

          const allRelatedFields = [
            ...mf.added.map((f) => f.name),
            ...mf.removed.map((f) => f.name),
            ...mf.changed.map((c) => c.fieldName),
          ];

          const generateTaskForNode = () => {
            const descParts: string[] = [];
            if (hasAdded) {
              descParts.push('【新增字段】');
              mf.added.forEach((f) => {
                descParts.push(
                  `- ${f.name} (${f.type || '无类型'}): ${f.description || '无描述'}${
                    f.isKey ? ' [主键]' : ''
                  }${f.isSensitive ? ' [敏感]' : ''}`
                );
              });
            }
            if (hasRemoved) {
              descParts.push('【删除字段】');
              mf.removed.forEach((f) => {
                descParts.push(
                  `- ${f.name} (${f.type || '无类型'}): ${f.description || '无描述'}${
                    f.isKey ? ' [主键]' : ''
                  }${f.isSensitive ? ' [敏感]' : ''} (已删除)`
                );
              });
            }
            if (hasChanged) {
              descParts.push('【修改字段】');
              mf.changed.forEach((c) => {
                descParts.push(`- ${c.fieldName}:`);
                descParts.push(...describeFieldChanges(c));
              });
            }
            handleCreateTask({
              nodeId: mf.nodeId,
              nodeName: mf.nodeName,
              relatedFields: allRelatedFields,
              titleExtra: '字段变更整改',
              description: descParts.join('\n'),
              highRisk: nodeHighRisk,
            });
          };

          return (
            <Card
              key={mf.nodeId}
              size="small"
              title={
                <Space wrap>
                  {nodeHighRisk && (
                    <Badge
                      color="red"
                      text={<span style={{ color: '#ff4d4f' }}>高风险</span>}
                    />
                  )}
                  <SearchOutlined style={{ color: '#1677ff' }} />
                  <strong style={{ fontSize: 14 }}>{mf.nodeName}</strong>
                  {hasAdded && (
                    <Tag color="green">{mf.added.length} 新增</Tag>
                  )}
                  {hasRemoved && (
                    <Tag color="red">{mf.removed.length} 删除</Tag>
                  )}
                  {hasChanged && (
                    <Tag color="orange">{mf.changed.length} 修改</Tag>
                  )}
                </Space>
              }
              extra={
                <Space size="small">
                  <Button
                    size="small"
                    icon={<SearchOutlined />}
                    onClick={() => handleJumpToDetail(mf.nodeId)}
                  >
                    详情
                  </Button>
                  <Button
                    size="small"
                    danger
                    icon={<WarningOutlined />}
                    onClick={generateTaskForNode}
                  >
                    生成整改任务
                  </Button>
                </Space>
              }
              styles={{ body: { padding: '8px 12px' } }}
            >
              {hasAdded && (
                <div style={{ marginBottom: 12 }}>
                  <Divider orientation="left" style={{ margin: '4px 0' }} plain>
                    <Tag color="green">新增字段 {mf.added.length}</Tag>
                  </Divider>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    {mf.added.map((f) => {
                      const hi = isHighRiskAddedField(f);
                      return (
                        <div
                          key={`add-${f.name}`}
                          className="snapshot-compare-row added"
                          style={{
                            padding: '8px 12px',
                            border: hi ? '1px solid #ffa39e' : undefined,
                            background: hi ? '#fff1f0' : undefined,
                          }}
                        >
                          <Space wrap style={{ flex: 1 }}>
                            {hi && (
                              <Badge
                                color="red"
                                text={<span style={{ color: '#ff4d4f', fontWeight: 600 }}>⚠ 高风险</span>}
                              />
                            )}
                            <Tag color="green" icon={<PlusOutlined />}>新增</Tag>
                            <code style={{ fontWeight: 600 }}>{f.name}</code>
                            {f.type && <Tag color="blue">{f.type}</Tag>}
                            {f.isKey && (
                              <Tag color="gold" icon={<KeyOutlined />}>主键</Tag>
                            )}
                            {f.isSensitive && (
                              <Tag color="red" icon={<LockOutlined />}>敏感</Tag>
                            )}
                            {f.description && (
                              <span style={{ color: '#595959' }}>{f.description}</span>
                            )}
                            {f.businessRule && (
                              <Tooltip title={f.businessRule}>
                                <Tag color="purple" icon={<SafetyCertificateOutlined />}>
                                  口径说明
                                </Tag>
                              </Tooltip>
                            )}
                          </Space>
                          <Space size="small">
                            <Button
                              size="small"
                              icon={<UnorderedListOutlined />}
                              onClick={() =>
                                handleCreateTask({
                                  nodeId: mf.nodeId,
                                  nodeName: mf.nodeName,
                                  relatedFields: [f.name],
                                  titleExtra: `新增字段 ${f.name}`,
                                  description: `新增字段：${f.name}\n类型：${f.type || '无'}\n描述：${f.description || '无'}\n主键：${f.isKey ? '是' : '否'}\n敏感：${f.isSensitive ? '是' : '否'}${f.businessRule ? `\n口径：${f.businessRule}` : ''}`,
                                  highRisk: hi,
                                })
                              }
                            >
                              ⚠ 整改
                            </Button>
                          </Space>
                        </div>
                      );
                    })}
                  </Space>
                </div>
              )}

              {hasRemoved && (
                <div style={{ marginBottom: 12 }}>
                  <Divider orientation="left" style={{ margin: '4px 0' }} plain>
                    <Tag color="red">删除字段 {mf.removed.length}</Tag>
                  </Divider>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    {mf.removed.map((f) => {
                      const hi = isHighRiskRemovedField(f);
                      return (
                        <div
                          key={`rm-${f.name}`}
                          className="snapshot-compare-row removed"
                          style={{
                            padding: '8px 12px',
                            border: hi ? '2px solid #ff4d4f' : undefined,
                          }}
                        >
                          <Space wrap style={{ flex: 1 }}>
                            {hi && (
                              <Badge
                                color="red"
                                text={<span style={{ color: '#ff4d4f', fontWeight: 700 }}>⚠ 删除高风险</span>}
                              />
                            )}
                            <Tag color="red" icon={<CloseOutlined />}>删除</Tag>
                            <code style={{ fontWeight: 600, textDecoration: 'line-through' }}>
                              {f.name}
                            </code>
                            {f.type && <Tag color="blue">{f.type}</Tag>}
                            {f.isKey && (
                              <Tag color="gold" icon={<KeyOutlined />}>主键</Tag>
                            )}
                            {f.isSensitive && (
                              <Tag color="red" icon={<LockOutlined />}>敏感</Tag>
                            )}
                            {f.description && (
                              <span style={{ color: '#595959' }}>{f.description}</span>
                            )}
                          </Space>
                          <Space size="small">
                            <Button
                              size="small"
                              danger
                              icon={<UnorderedListOutlined />}
                              onClick={() =>
                                handleCreateTask({
                                  nodeId: mf.nodeId,
                                  nodeName: mf.nodeName,
                                  relatedFields: [f.name],
                                  titleExtra: `删除字段 ${f.name} 确认`,
                                  description: `删除字段：${f.name}\n原类型：${f.type || '无'}\n原描述：${f.description || '无'}\n主键：${f.isKey ? '是' : '否'}\n敏感：${f.isSensitive ? '是' : '否'}`,
                                  highRisk: true,
                                })
                              }
                            >
                              ⚠ 生成任务
                            </Button>
                          </Space>
                        </div>
                      );
                    })}
                  </Space>
                </div>
              )}

              {hasChanged && (
                <div>
                  <Divider orientation="left" style={{ margin: '4px 0' }} plain>
                    <Tag color="orange">修改字段 {mf.changed.length}</Tag>
                  </Divider>
                  <Table
                    size="small"
                    rowKey={(r) => `ch-${r.fieldName}`}
                    dataSource={mf.changed}
                    pagination={false}
                    rowClassName={(r) =>
                      isHighRiskFieldChange(r) ? 'high-risk-field-change-row' : ''
                    }
                    columns={[
                      {
                        title: '风险',
                        key: 'risk',
                        width: 90,
                        align: 'center' as const,
                        render: (_: unknown, r: FieldChange) =>
                          isHighRiskFieldChange(r) ? (
                            <Badge color="red" text={<span style={{ color: '#ff4d4f', fontWeight: 700 }}>高风险</span>} />
                          ) : (
                            <span style={{ color: '#8c8c8c' }}>普通</span>
                          ),
                      },
                      {
                        title: '字段名',
                        dataIndex: 'fieldName',
                        key: 'fieldName',
                        width: 160,
                        render: (t: string, r: FieldChange) => (
                          <Space>
                            <code style={{ fontWeight: 600 }}>{t}</code>
                            {(r.before?.isKey || r.after?.isKey) && (
                              <Tag color="gold" icon={<KeyOutlined />} />
                            )}
                            {(r.before?.isSensitive || r.after?.isSensitive) && (
                              <Tag color="red" icon={<LockOutlined />} />
                            )}
                          </Space>
                        ),
                      },
                      {
                        title: '属性',
                        key: 'prop',
                        width: 100,
                        render: () => (
                          <Space direction="vertical" size={2}>
                            <span style={{ color: '#8c8c8c', fontSize: 12 }}>类型</span>
                            <span style={{ color: '#8c8c8c', fontSize: 12 }}>描述</span>
                            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                              <KeyOutlined /> 主键
                            </span>
                            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                              <LockOutlined /> 敏感
                            </span>
                            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                              <SafetyCertificateOutlined /> 口径
                            </span>
                          </Space>
                        ),
                      },
                      {
                        title: 'Before',
                        key: 'before',
                        render: (_: unknown, r: FieldChange) => (
                          <Space direction="vertical" size={2} style={{ width: '100%' }}>
                            <span style={{ fontSize: 12 }}>
                              {r.before?.type || <span style={{ color: '#bfbfbf' }}>(空)</span>}
                            </span>
                            <span style={{ fontSize: 12, color: '#595959' }}>
                              {r.before?.description || <span style={{ color: '#bfbfbf' }}>(空)</span>}
                            </span>
                            <span style={{ fontSize: 12 }}>
                              {r.before?.isKey ? (
                                <Tag color="gold">是</Tag>
                              ) : (
                                <Tag color="default">否</Tag>
                              )}
                            </span>
                            <span style={{ fontSize: 12 }}>
                              {r.before?.isSensitive ? (
                                <Tag color="red">是</Tag>
                              ) : (
                                <Tag color="default">否</Tag>
                              )}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: '#595959',
                                maxWidth: 200,
                                display: 'inline-block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={r.before?.businessRule}
                            >
                              {r.before?.businessRule || (
                                <span style={{ color: '#bfbfbf' }}>(空)</span>
                              )}
                            </span>
                          </Space>
                        ),
                      },
                      {
                        title: '→',
                        key: 'arrow',
                        width: 40,
                        align: 'center' as const,
                        render: () => <SwapOutlined />,
                      },
                      {
                        title: 'After',
                        key: 'after',
                        render: (_: unknown, r: FieldChange) => (
                          <Space direction="vertical" size={2} style={{ width: '100%' }}>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight:
                                  r.changedProps.includes('type') ? 700 : 400,
                                color: r.changedProps.includes('type')
                                  ? isHighRiskFieldChange(r)
                                    ? '#ff4d4f'
                                    : '#fa8c16'
                                  : undefined,
                              }}
                            >
                              {r.after?.type || <span style={{ color: '#bfbfbf' }}>(空)</span>}
                              {r.changedProps.includes('type') && (
                                <Tag color="orange" style={{ marginLeft: 4 }}>变</Tag>
                              )}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: r.changedProps.includes('description')
                                  ? '#fa8c16'
                                  : '#595959',
                                fontWeight: r.changedProps.includes('description')
                                  ? 600
                                  : 400,
                              }}
                            >
                              {r.after?.description || <span style={{ color: '#bfbfbf' }}>(空)</span>}
                            </span>
                            <span style={{ fontSize: 12 }}>
                              {r.after?.isKey ? (
                                <Tag color="gold">是</Tag>
                              ) : (
                                <Tag color="default">否</Tag>
                              )}
                              {r.changedProps.includes('isKey') && (
                                <Tag color="red" style={{ marginLeft: 4 }}>
                                  <WarningOutlined /> 变
                                </Tag>
                              )}
                            </span>
                            <span style={{ fontSize: 12 }}>
                              {r.after?.isSensitive ? (
                                <Tag color="red">是</Tag>
                              ) : (
                                <Tag color="default">否</Tag>
                              )}
                              {r.changedProps.includes('isSensitive') && (
                                <Tag color="red" style={{ marginLeft: 4 }}>
                                  <WarningOutlined /> 变
                                </Tag>
                              )}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: r.changedProps.includes('businessRule')
                                  ? '#fa8c16'
                                  : '#595959',
                                fontWeight: r.changedProps.includes('businessRule')
                                  ? 600
                                  : 400,
                                maxWidth: 200,
                                display: 'inline-block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={r.after?.businessRule}
                            >
                              {r.after?.businessRule || <span style={{ color: '#bfbfbf' }}>(空)</span>}
                            </span>
                          </Space>
                        ),
                      },
                      {
                        title: '操作',
                        key: 'action',
                        width: 140,
                        render: (_: unknown, r: FieldChange) => {
                          const hi = isHighRiskFieldChange(r);
                          return (
                            <Space size="small">
                              <Button
                                size="small"
                                icon={<SearchOutlined />}
                                onClick={() => handleJumpToDetail(mf.nodeId)}
                              >
                                详情
                              </Button>
                              <Button
                                size="small"
                                danger={hi}
                                icon={<UnorderedListOutlined />}
                                onClick={() =>
                                  handleCreateTask({
                                    nodeId: mf.nodeId,
                                    nodeName: mf.nodeName,
                                    relatedFields: [r.fieldName],
                                    titleExtra: `字段 ${r.fieldName} 变更`,
                                    description:
                                      `字段：${r.fieldName}\n` +
                                      `变更属性：${r.changedProps.join(', ')}\n` +
                                      '具体变化：\n' +
                                      describeFieldChanges(r).join('\n'),
                                    highRisk: hi,
                                  })
                                }
                              >
                                ⚠ 整改
                              </Button>
                            </Space>
                          );
                        },
                      },
                    ]}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </Space>
    );
  };

  const OverviewSection = () => {
    if (!compareResult) return null;
    const totalAddNodes = compareResult.addedNodes.length;
    const totalRemoveNodes = compareResult.removedNodes.length;
    const totalModNodes = compareResult.modifiedNodes.length;
    const totalAddEdges = compareResult.addedEdges.length;
    const totalRemoveEdges = compareResult.removedEdges.length;
    const totalFieldNodes = fieldLevelChanges.length;
    const totalAddedFields = fieldLevelChanges.reduce(
      (s, m) => s + m.added.length,
      0
    );
    const totalRemovedFields = fieldLevelChanges.reduce(
      (s, m) => s + m.removed.length,
      0
    );
    const totalChangedFields = fieldLevelChanges.reduce(
      (s, m) => s + m.changed.length,
      0
    );

    const highRiskRemovedF = fieldLevelChanges.reduce(
      (s, m) => s + m.removed.filter(isHighRiskRemovedField).length,
      0
    );
    const highRiskChangedF = fieldLevelChanges.reduce(
      (s, m) => s + m.changed.filter(isHighRiskFieldChange).length,
      0
    );
    const highRiskRemovedN = totalRemoveNodes;
    const totalHighRisk = highRiskRemovedF + highRiskChangedF + highRiskRemovedN;

    return (
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {totalHighRisk > 0 && (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined />}
            message={`检测到 ${totalHighRisk} 项高风险变更`}
            description={
              <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
                {highRiskRemovedN > 0 && <li>删除节点：{highRiskRemovedN} 项（需评估血缘断裂）</li>}
                {highRiskRemovedF > 0 && <li>删除高风险字段：{highRiskRemovedF} 项（主键/敏感字段）</li>}
                {highRiskChangedF > 0 && <li>高风险字段修改：{highRiskChangedF} 项（主键/敏感/类型变更）</li>}
              </ul>
            }
          />
        )}

        <Row gutter={12}>
          <Col span={4}>
            <div
              style={{
                padding: 12,
                borderRadius: 6,
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
              }}
            >
              <div style={{ fontSize: 11, color: '#52c41a' }}>新增节点</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#52c41a' }}>
                {totalAddNodes}
              </div>
            </div>
          </Col>
          <Col span={4}>
            <div
              style={{
                padding: 12,
                borderRadius: 6,
                background: '#fffbe6',
                border: '1px solid #ffe58f',
              }}
            >
              <div style={{ fontSize: 11, color: '#faad14' }}>修改节点</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#faad14' }}>
                {totalModNodes}
              </div>
            </div>
          </Col>
          <Col span={4}>
            <div
              style={{
                padding: 12,
                borderRadius: 6,
                background: '#fff1f0',
                border: '1px solid #ffa39e',
              }}
            >
              <div style={{ fontSize: 11, color: '#ff4d4f' }}>删除节点</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#ff4d4f' }}>
                {totalRemoveNodes}
              </div>
            </div>
          </Col>
          <Col span={4}>
            <div
              style={{
                padding: 12,
                borderRadius: 6,
                background: '#e6f4ff',
                border: '1px solid #91caff',
              }}
            >
              <div style={{ fontSize: 11, color: '#1677ff' }}>关系变化</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#1677ff' }}>
                +{totalAddEdges}/-{totalRemoveEdges}
              </div>
            </div>
          </Col>
          <Col span={4}>
            <div
              style={{
                padding: 12,
                borderRadius: 6,
                background: '#f9f0ff',
                border: '1px solid #d3adf7',
              }}
            >
              <div style={{ fontSize: 11, color: '#722ed1' }}>字段变更节点</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#722ed1' }}>
                {totalFieldNodes}
              </div>
            </div>
          </Col>
          <Col span={4}>
            <div
              style={{
                padding: 12,
                borderRadius: 6,
                background: '#fff7e6',
                border: '1px solid #ffd591',
              }}
            >
              <div style={{ fontSize: 11, color: '#fa8c16' }}>字段变化数</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#fa8c16' }}>
                +{totalAddedFields}/-{totalRemovedFields}/~{totalChangedFields}
              </div>
            </div>
          </Col>
        </Row>

        <Card size="small" title={<Space><DiffOutlined />变化摘要</Space>}>
          <Tabs
            size="small"
            items={[
              {
                key: 'nodes',
                label: `节点变化 (${totalAddNodes + totalModNodes + totalRemoveNodes})`,
                children: (
                  <div style={{ maxHeight: 220, overflow: 'auto' }}>
                    {totalAddNodes + totalModNodes + totalRemoveNodes === 0 ? (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无节点变化" />
                    ) : (
                      <NodeChangeSection />
                    )}
                  </div>
                ),
              },
              {
                key: 'edges',
                label: `边变化 (${totalAddEdges + totalRemoveEdges})`,
                children: (
                  <div style={{ maxHeight: 220, overflow: 'auto' }}>
                    {totalAddEdges + totalRemoveEdges === 0 ? (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无边变化" />
                    ) : (
                      <EdgeChangeSection />
                    )}
                  </div>
                ),
              },
              {
                key: 'fields',
                label: `字段变化 (${totalAddedFields + totalRemovedFields + totalChangedFields})`,
                children: (
                  <div style={{ maxHeight: 260, overflow: 'auto' }}>
                    {totalAddedFields + totalRemovedFields + totalChangedFields === 0 ? (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无字段变化" />
                    ) : (
                      <FieldChangeSection />
                    )}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </Space>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="window-card">
        <div className="window-header">
          <CameraOutlined style={{ color: '#eb2f96' }} />
          <span className="window-title">变更快照</span>
          <Tag color="magenta">共 {snapshots.length} 个快照</Tag>
          <div style={{ flex: 1 }} />
          <Space>
            <Button
              icon={<DiffOutlined />}
              onClick={() => {
                if (snapshots.length < 2) {
                  message.warning('至少需要2个快照才能对比');
                  return;
                }
                setSnap1(sortedSnapshots[1]?.id);
                setSnap2(sortedSnapshots[0]?.id);
                setCompareTab('overview');
                setCompareOpen(true);
              }}
              disabled={snapshots.length < 2}
            >
              对比快照
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                createForm.setFieldsValue({
                  name: `快照_${dayjs().format('MMDD_HHmm')}`,
                });
                setCreateOpen(true);
              }}
            >
              创建快照
            </Button>
          </Space>
        </div>

        <div className="window-body">
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={6}>
                <div className="stat-card table">
                  <div className="stat-value">{nodes.length}</div>
                  <div className="stat-label">当前节点数</div>
                </div>
              </Col>
              <Col span={6}>
                <div className="stat-card edge">
                  <div className="stat-value">{edges.length}</div>
                  <div className="stat-label">当前关系数</div>
                </div>
              </Col>
              <Col span={6}>
                <div className="stat-card critical">
                  <div className="stat-value">
                    {nodes.filter((n) => n.isCritical).length}
                  </div>
                  <div className="stat-label">关键指标数</div>
                </div>
              </Col>
              <Col span={6}>
                <div className="stat-card report">
                  <div className="stat-value">{snapshots.length}</div>
                  <div className="stat-label">累计快照数</div>
                </div>
              </Col>
            </Row>
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 12 }}
              message="快照使用建议"
              description={
                <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
                  <li>每次大规模变更前创建快照，便于回滚</li>
                  <li>对比不同时期的快照可使用4个Tab查看节点/边/字段变化</li>
                  <li>高风险变更（主键变动/敏感字段变更/删除）自动生成整改任务</li>
                </ul>
              }
            />
          </Card>

          {snapshots.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无快照，点击右上角创建"
              style={{ padding: 80 }}
            />
          ) : (
            <Row gutter={16}>
              <Col span={10}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <ClockCircleOutlined />
                      快照时间线
                    </Space>
                  }
                  styles={{ body: { padding: '16px 16px 16px 8px' } }}
                >
                  <Timeline
                    mode="left"
                    items={sortedSnapshots.map((s, idx) => ({
                      color: idx === 0 ? 'blue' : 'gray',
                      children: (
                        <div style={{ padding: '4px 0' }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {s.name}
                            {idx === 0 && <Tag color="blue">最新</Tag>}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#8c8c8c',
                              marginTop: 2,
                            }}
                          >
                            {s.description || '无描述'}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: '#bfbfbf',
                              marginTop: 4,
                            }}
                          >
                            {dayjs(s.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                          </div>
                          <Space size="small" style={{ marginTop: 8 }}>
                            <Button
                              size="small"
                              icon={<EyeOutlined />}
                              onClick={() => {
                                modal.info({
                                  title: s.name,
                                  width: 600,
                                  content: (
                                    <div>
                                      <Divider style={{ margin: '8px 0' }} />
                                      <p>
                                        <strong>创建时间:</strong>{' '}
                                        {dayjs(s.createdAt).format(
                                          'YYYY-MM-DD HH:mm:ss'
                                        )}
                                      </p>
                                      <p>
                                        <strong>描述:</strong>{' '}
                                        {s.description || '-'}
                                      </p>
                                      <Divider>快照内容</Divider>
                                      <Space
                                        direction="vertical"
                                        style={{ width: '100%' }}
                                      >
                                        <Space>
                                          <Tag color="blue">
                                            节点: {s.nodes.length}
                                          </Tag>
                                          <Tag color="green">
                                            关系: {s.edges.length}
                                          </Tag>
                                        </Space>
                                        <div>
                                          <div
                                            style={{
                                              fontSize: 12,
                                              marginBottom: 4,
                                              color: '#595959',
                                            }}
                                          >
                                            包含节点:
                                          </div>
                                          <Space wrap>
                                            {s.nodes.slice(0, 30).map((n) => (
                                              <Tag key={n.id}>
                                                {typeIcons[n.type]} {n.name}
                                              </Tag>
                                            ))}
                                            {s.nodes.length > 30 && (
                                              <Tag>
                                                +{s.nodes.length - 30}...
                                              </Tag>
                                            )}
                                          </Space>
                                        </div>
                                      </Space>
                                    </div>
                                  ),
                                });
                              }}
                            >
                              查看
                            </Button>
                            <Button
                              size="small"
                              icon={<ReloadOutlined />}
                              onClick={() => handleRestore(s)}
                            >
                              恢复
                            </Button>
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => handleDelete(s)}
                            />
                          </Space>
                        </div>
                      ),
                    }))}
                  />
                </Card>
              </Col>

              <Col span={14}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <SwapOutlined />
                      快速对比（选两个快照）
                    </Space>
                  }
                  extra={
                    <Space>
                      <Select
                        style={{ width: 180 }}
                        size="small"
                        placeholder="选较早快照"
                        value={snap1}
                        onChange={setSnap1}
                        options={sortedSnapshots.map((s) => ({
                          value: s.id,
                          label: s.name,
                        }))}
                        allowClear
                      />
                      <span style={{ color: '#bfbfbf' }}>vs</span>
                      <Select
                        style={{ width: 180 }}
                        size="small"
                        placeholder="选较新快照"
                        value={snap2}
                        onChange={setSnap2}
                        options={sortedSnapshots.map((s) => ({
                          value: s.id,
                          label: s.name,
                        }))}
                        allowClear
                      />
                      {snap1 && snap2 && (
                        <Button
                          size="small"
                          type="primary"
                          icon={<DiffOutlined />}
                          onClick={() => {
                            setCompareTab('overview');
                            setCompareOpen(true);
                          }}
                        >
                          打开对比
                        </Button>
                      )}
                    </Space>
                  }
                >
                  {!snap1 || !snap2 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="选择两个快照后显示差异"
                      style={{ padding: 40 }}
                    />
                  ) : compareResult ? (
                    <OverviewSection />
                  ) : null}
                </Card>
              </Col>
            </Row>
          )}
        </div>
      </div>

      <Modal
        title={<Space><PlusOutlined />创建快照</Space>}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        okText="创建"
      >
        <Form form={createForm} layout="vertical">
          <Alert
            type="info"
            showIcon
            message={`将记录 ${nodes.length} 个节点和 ${edges.length} 条关系的完整状态`}
            style={{ marginBottom: 16 }}
          />
          <Form.Item
            label="快照名称"
            name="name"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：2024.12 版本迭代前" />
          </Form.Item>
          <Form.Item label="变更说明" name="description">
            <Input.TextArea
              rows={4}
              placeholder="如：重构了DWD层加工脚本，为订单指标新增了退款字段"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <DiffOutlined />
            快照对比：
            <Tag color="blue">{snap1Name || '旧版本'}</Tag>
            <span>→</span>
            <Tag color="green">{snap2Name || '新版本'}</Tag>
          </Space>
        }
        open={compareOpen}
        onCancel={() => setCompareOpen(false)}
        footer={
          <Space>
            <Radio.Group
              size="small"
              value={compareTab}
              onChange={(e) => setCompareTab(e.target.value)}
            >
              <Radio.Button value="overview">全部概览</Radio.Button>
              <Radio.Button value="nodes">节点变化</Radio.Button>
              <Radio.Button value="edges">边变化</Radio.Button>
              <Radio.Button value="fields">字段变化</Radio.Button>
            </Radio.Group>
            <Button onClick={() => setCompareOpen(false)}>关闭</Button>
          </Space>
        }
        width={1100}
        destroyOnClose
        styles={{ body: { maxHeight: '75vh', overflow: 'auto' } }}
      >
        {!snap1 || !snap2 ? (
          <Empty description="请先选择两个快照" />
        ) : !compareResult ? (
          <Empty description="无对比结果" />
        ) : (
          <>
            {compareTab === 'overview' && <OverviewSection />}
            {compareTab === 'nodes' && <NodeChangeSection />}
            {compareTab === 'edges' && <EdgeChangeSection />}
            {compareTab === 'fields' && <FieldChangeSection />}
          </>
        )}
      </Modal>
    </div>
  );
}

export default SnapshotPanel;
