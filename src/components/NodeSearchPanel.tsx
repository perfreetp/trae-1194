import { useState, useMemo } from 'react';
import {
  Input,
  Card,
  Tag,
  Button,
  Space,
  List,
  Empty,
  Drawer,
  Descriptions,
  Row,
  Col,
  Avatar,
  Select,
  Segmented,
  App as AntApp,
  Tooltip,
  Badge,
  Switch,
  Form,
  Modal,
} from 'antd';
import {
  SearchOutlined,
  StarOutlined,
  StarFilled,
  UserOutlined,
  DatabaseOutlined,
  FileOutlined,
  BarChartOutlined,
  CodeOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  InfoCircleOutlined,
  FilterOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useLineageStore } from '../store/lineageStore';
import type { DataNode, NodeType, FieldInfo } from '../types';
import dayjs from 'dayjs';

const typeIcons: Record<NodeType, React.ReactNode> = {
  table: <DatabaseOutlined />,
  file: <FileOutlined />,
  report: <BarChartOutlined />,
  script: <CodeOutlined />,
  field: <DatabaseOutlined />,
};

const typeLabels: Record<NodeType, string> = {
  table: '数据表',
  file: '文件',
  report: '报表',
  script: '脚本',
  field: '字段',
};

const typeColors: Record<NodeType, string> = {
  table: 'blue',
  file: 'green',
  report: 'purple',
  script: 'orange',
  field: 'cyan',
};

type SearchScope = 'all' | 'nodes' | 'fields';

type FieldHitReason = 'name' | 'description' | 'type' | 'sensitive' | 'key' | 'businessRule';

interface MatchedField {
  field: FieldInfo;
  reasons: FieldHitReason[];
}

interface SearchResultItem {
  node: DataNode;
  matchedFields: MatchedField[];
  matchedCount: number;
  sensitiveCount: number;
  keyCount: number;
}

const sensitiveKeywords = ['敏感', '手机号', '身份证', 'phone', 'mobile', 'idcard', 'id_card'];
const keyKeywords = ['主键', 'key', 'id'];

function matchKeyword(text: string | undefined, keywords: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function getFieldReasons(f: FieldInfo, q: string): FieldHitReason[] {
  const reasons: FieldHitReason[] = [];
  if (!q) return reasons;

  const nameLower = f.name.toLowerCase();
  const descLower = f.description?.toLowerCase() || '';
  const typeLower = f.type?.toLowerCase() || '';
  const brLower = f.businessRule?.toLowerCase() || '';

  if (nameLower.includes(q)) reasons.push('name');
  if (descLower.includes(q)) reasons.push('description');
  if (typeLower.includes(q)) reasons.push('type');
  if (brLower.includes(q)) reasons.push('businessRule');

  if (f.isSensitive && matchKeyword(q, sensitiveKeywords)) reasons.push('sensitive');
  if (f.isKey && matchKeyword(q, keyKeywords)) reasons.push('key');

  return reasons;
}

function getReasonBadge(reason: FieldHitReason) {
  const map: Record<FieldHitReason, { label: string; color: string }> = {
    name: { label: '匹配字段名', color: 'blue' },
    description: { label: '匹配描述', color: 'cyan' },
    type: { label: '匹配类型', color: 'geekblue' },
    sensitive: { label: '匹配敏感字段', color: 'orange' },
    key: { label: '匹配主键', color: 'red' },
    businessRule: { label: '匹配口径', color: 'purple' },
  };
  const cfg = map[reason];
  return (
    <Tag key={reason} color={cfg.color} style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>
      {cfg.label}
    </Tag>
  );
}

function NodeSearchPanel() {
  const {
    nodes,
    edges,
    searchQuery,
    setSearchQuery,
    selectNode,
    selectField,
    focusNode,
    updateNode,
    getUpstreamNodes,
    getDownstreamNodes,
    deleteNode,
    setActivePanel,
  } = useLineageStore();
  const { message, modal } = AntApp.useApp();

  const [typeFilter, setTypeFilter] = useState<NodeType | 'all'>('all');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string | undefined>(undefined);
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [onlySensitive, setOnlySensitive] = useState(false);
  const [onlyKey, setOnlyKey] = useState(false);
  const [detailNode, setDetailNode] = useState<DataNode | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const owners = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n) => n.owner && set.add(n.owner));
    return Array.from(set);
  }, [nodes]);

  const searchResults = useMemo<SearchResultItem[]>(() => {
    const q = searchQuery.toLowerCase().trim();
    const scopeFields = searchScope === 'all' || searchScope === 'fields';
    const scopeNodes = searchScope === 'all' || searchScope === 'nodes';

    return nodes
      .map((n) => {
        const fields = n.fields || [];
        const matchedFields: MatchedField[] = [];
        let sensitiveCount = 0;
        let keyCount = 0;

        fields.forEach((f) => {
          if (f.isSensitive) sensitiveCount++;
          if (f.isKey) keyCount++;
        });

        if (!q) {
          return {
            node: n,
            matchedFields: [],
            matchedCount: 0,
            sensitiveCount,
            keyCount,
          };
        }

        let nodeHit = false;
        if (scopeNodes) {
          nodeHit = Boolean(
            n.name.toLowerCase().includes(q) ||
            (n.description && n.description.toLowerCase().includes(q)) ||
            (n.owner && n.owner.toLowerCase().includes(q)) ||
            (n.tags && n.tags.some((t) => t.toLowerCase().includes(q)))
          );
        }

        if (scopeFields) {
          fields.forEach((f) => {
            const reasons = getFieldReasons(f, q);
            if (reasons.length > 0) {
              matchedFields.push({ field: f, reasons });
            }
          });
        }

        if (nodeHit || matchedFields.length > 0) {
          return {
            node: n,
            matchedFields,
            matchedCount: matchedFields.length,
            sensitiveCount,
            keyCount,
          };
        }

        return null;
      })
      .filter((r): r is SearchResultItem => r !== null);
  }, [nodes, searchQuery, searchScope]);

  const filteredResults = useMemo(() => {
    let result = searchResults;

    if (typeFilter !== 'all') {
      result = result.filter((r) => r.node.type === typeFilter);
    }
    if (criticalOnly) {
      result = result.filter((r) => r.node.isCritical);
    }
    if (ownerFilter) {
      result = result.filter((r) => r.node.owner === ownerFilter);
    }
    if (onlySensitive) {
      result = result.filter((r) => r.sensitiveCount > 0);
    }
    if (onlyKey) {
      result = result.filter((r) => r.keyCount > 0);
    }

    return result.sort((a, b) => {
      if (a.matchedCount !== b.matchedCount) return b.matchedCount - a.matchedCount;
      if (a.node.isCritical !== b.node.isCritical) return a.node.isCritical ? -1 : 1;
      return (b.node.updatedAt || 0) - (a.node.updatedAt || 0);
    });
  }, [searchResults, typeFilter, criticalOnly, ownerFilter, onlySensitive, onlyKey]);

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleTrackLineage = (nodeId: string, fieldName: string) => {
    selectNode(nodeId);
    selectField(fieldName);
    setActivePanel('canvas');
    setDetailNode(null);
    message.success(`已切换到血缘画布追踪字段：${fieldName}`);
  };

  const handleEdit = (node: DataNode) => {
    setDetailNode(node);
    editForm.setFieldsValue(node);
    setEditOpen(true);
  };

  const handleEditSubmit = async () => {
    try {
      const values = await editForm.validateFields();
      if (detailNode) {
        updateNode(detailNode.id, values);
        message.success('更新成功');
        setEditOpen(false);
      }
    } catch (e) {
      //
    }
  };

  const renderMatchedFieldsBlock = (item: SearchResultItem) => {
    if (item.matchedFields.length === 0) return null;
    const expanded = expandedNodes.has(item.node.id);
    const showCount = 5;
    const display = expanded ? item.matchedFields : item.matchedFields.slice(0, showCount);
    const hiddenCount = item.matchedFields.length - showCount;

    return (
      <Card
        size="small"
        style={{ marginTop: 8, background: '#fafafa' }}
        styles={{ body: { padding: 8 } }}
        title={
          <Space size={4}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>命中字段</span>
            <Tag color="purple" style={{ margin: 0 }}>
              {item.matchedCount}
            </Tag>
          </Space>
        }
        extra={
          hiddenCount > 0 && (
            <Button
              type="link"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(item.node.id);
              }}
              style={{ padding: 0, height: 'auto' }}
            >
              {expanded ? '收起' : `还有 ${hiddenCount} 个`}
            </Button>
          )
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          {display.map((mf) => (
            <div
              key={mf.field.name}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                padding: '4px 6px',
                background: '#fff',
                borderRadius: 4,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <code style={{ fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                {mf.field.name}
              </code>
              {mf.field.type && (
                <Tag color="blue" style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>
                  {mf.field.type}
                </Tag>
              )}
              {mf.field.isKey && (
                <Tag color="red" style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>
                  主键
                </Tag>
              )}
              {mf.field.isSensitive && (
                <Tag color="orange" style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>
                  🔒敏感
                </Tag>
              )}
              <Space size={4} style={{ flexShrink: 0 }}>
                {mf.reasons.map((r) => getReasonBadge(r))}
              </Space>
              {mf.field.description && (
                <span
                  style={{
                    fontSize: 11,
                    color: '#8c8c8c',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {mf.field.description}
                </span>
              )}
            </div>
          ))}
        </Space>
      </Card>
    );
  };

  const renderFieldsCountTag = (item: SearchResultItem) => {
    const total = item.node.fields?.length || 0;
    if (total === 0) return null;
    return (
      <Space size={4} style={{ fontSize: 12, color: '#8c8c8c' }}>
        <span>📋 {total} 字段</span>
        {item.sensitiveCount > 0 && (
          <Tag color="orange" style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>
            🔒{item.sensitiveCount}
          </Tag>
        )}
        {item.keyCount > 0 && (
          <Tag color="red" style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>
            🔑{item.keyCount}
          </Tag>
        )}
      </Space>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="window-card">
        <div className="window-header">
          <SearchOutlined style={{ color: '#722ed1' }} />
          <span className="window-title">节点搜索</span>
          <Tag color="purple">{filteredResults.length} 个结果</Tag>
          <div style={{ flex: 1 }} />
        </div>

        <div className="window-body">
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Row gutter={12} align="middle">
                <Col span={8}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', marginRight: 8 }}>
                    搜索范围
                  </span>
                  <Segmented
                    value={searchScope}
                    onChange={(v) => setSearchScope(v as SearchScope)}
                    options={[
                      { value: 'all', label: '全部' },
                      { value: 'nodes', label: '仅节点' },
                      { value: 'fields', label: '仅字段资产' },
                    ]}
                  />
                </Col>
                <Col span={16}>
                  <Input
                    size="large"
                    prefix={<SearchOutlined />}
                    placeholder="搜索节点名称、描述、负责人、标签、字段名/类型/描述/口径、敏感/主键..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    allowClear
                  />
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={8}>
                  <Segmented
                    value={typeFilter}
                    onChange={(v) => setTypeFilter(v as any)}
                    block
                    options={[
                      { value: 'all', label: '全部类型' },
                      { value: 'table', label: '数据表' },
                      { value: 'file', label: '文件' },
                      { value: 'report', label: '报表' },
                      { value: 'script', label: '脚本' },
                    ]}
                  />
                </Col>
                <Col span={6}>
                  <Select
                    allowClear
                    placeholder="筛选负责人"
                    value={ownerFilter}
                    onChange={setOwnerFilter}
                    style={{ width: '100%' }}
                    options={owners.map((o) => ({ value: o, label: o }))}
                  />
                </Col>
                <Col span={10} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Space size={8} wrap>
                    <Tag
                      color={onlySensitive ? 'orange' : 'default'}
                      style={{
                        cursor: 'pointer',
                        padding: '4px 12px',
                        borderRadius: 16,
                        fontWeight: onlySensitive ? 600 : 400,
                        background: onlySensitive ? '#fff7e6' : '#fafafa',
                        border: `1px solid ${onlySensitive ? '#ffbb96' : '#d9d9d9'}`,
                        userSelect: 'none',
                      }}
                      onClick={() => setOnlySensitive(!onlySensitive)}
                    >
                      {onlySensitive ? <LockOutlined /> : null} {onlySensitive ? '🔒' : '🔓'} 仅敏感字段
                    </Tag>
                    <Tag
                      color={onlyKey ? 'red' : 'default'}
                      style={{
                        cursor: 'pointer',
                        padding: '4px 12px',
                        borderRadius: 16,
                        fontWeight: onlyKey ? 600 : 400,
                        background: onlyKey ? '#fff1f0' : '#fafafa',
                        border: `1px solid ${onlyKey ? '#ffa39e' : '#d9d9d9'}`,
                        userSelect: 'none',
                      }}
                      onClick={() => setOnlyKey(!onlyKey)}
                    >
                      {onlyKey ? <KeyOutlined /> : null} {onlyKey ? '🔑' : ''} 仅主键字段
                    </Tag>
                    <Space size={4}>
                      <FilterOutlined style={{ color: '#8c8c8c' }} />
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>关键指标</span>
                      <Switch
                        size="small"
                        checked={criticalOnly}
                        onChange={setCriticalOnly}
                      />
                    </Space>
                  </Space>
                </Col>
              </Row>
            </Space>
          </Card>

          {filteredResults.length === 0 ? (
            <Empty description="未找到匹配的节点" />
          ) : (
            <Row gutter={[12, 12]}>
              {filteredResults.map((item) => {
                const n = item.node;
                return (
                  <Col span={12} key={n.id}>
                    <Card
                      size="small"
                      className={`node-card ${n.isCritical ? 'critical' : ''}`}
                      styles={{ body: { padding: 12 } }}
                      hoverable
                      onClick={() => {
                        selectNode(n.id);
                        setDetailNode(n);
                      }}
                      extra={
                        <Space size={0}>
                          <Tooltip title="标记关键指标">
                            <Button
                              type="text"
                              size="small"
                              danger={n.isCritical}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateNode(n.id, { isCritical: !n.isCritical });
                                message.success(
                                  n.isCritical ? '已取消关键标记' : '已标记为关键指标'
                                );
                              }}
                              icon={n.isCritical ? <StarFilled /> : <StarOutlined />}
                            />
                          </Tooltip>
                          <Tooltip title="聚焦此节点">
                            <Button
                              type="text"
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                focusNode(n.id);
                                setActivePanel('canvas');
                                message.success('已切换到画布视图聚焦此节点');
                              }}
                              icon={<ZoomInOutlined />}
                            />
                          </Tooltip>
                        </Space>
                      }
                    >
                      <Space direction="vertical" style={{ width: '100%' }} size={6}>
                        <Space style={{ width: '100%' }}>
                          <Tag icon={typeIcons[n.type]} color={typeColors[n.type]}>
                            {typeLabels[n.type]}
                          </Tag>
                          <strong style={{ fontSize: 14, flex: 1 }}>{n.name}</strong>
                          {n.isCritical && <Badge status="error" text="关键" />}
                          {item.matchedCount > 0 && (
                            <Badge count={item.matchedCount} style={{ backgroundColor: '#722ed1' }} />
                          )}
                        </Space>
                        {n.description && (
                          <div
                            style={{
                              fontSize: 12,
                              color: '#595959',
                              lineHeight: 1.5,
                            }}
                          >
                            {n.description}
                          </div>
                        )}
                        <Space size={8} wrap style={{ marginTop: 4 }}>
                          {n.owner && (
                            <span
                              style={{
                                fontSize: 12,
                                color: '#8c8c8c',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <UserOutlined /> {n.owner}
                            </span>
                          )}
                          {renderFieldsCountTag(item)}
                          <span
                            style={{
                              fontSize: 12,
                              color: '#8c8c8c',
                            }}
                          >
                            ⬆️ {getUpstreamNodes(n.id).length}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: '#8c8c8c',
                            }}
                          >
                            ⬇️ {getDownstreamNodes(n.id).length}
                          </span>
                          {n.tags?.slice(0, 3).map((t) => (
                            <Tag
                              key={t}
                              style={{
                                fontSize: 11,
                                padding: '0 4px',
                              }}
                            >
                              {t}
                            </Tag>
                          ))}
                        </Space>
                        {renderMatchedFieldsBlock(item)}
                      </Space>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          )}
        </div>
      </div>

      <Drawer
        title={
          detailNode ? (
            <Space>
              <Tag color={typeColors[detailNode.type]}>{typeLabels[detailNode.type]}</Tag>
              <strong>{detailNode.name}</strong>
              {detailNode.isCritical && <StarFilled style={{ color: '#faad14' }} />}
            </Space>
          ) : (
            '详情'
          )
        }
        open={!!detailNode}
        onClose={() => setDetailNode(null)}
        width={560}
        extra={
          detailNode && (
            <Space>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEdit(detailNode)}
              >
                编辑
              </Button>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: '删除节点',
                    content: `确定删除 ${detailNode.name}？关联血缘关系将同步删除`,
                    onOk: () => {
                      deleteNode(detailNode.id);
                      setDetailNode(null);
                      message.success('已删除');
                    },
                  })
                }
              >
                删除
              </Button>
            </Space>
          )
        }
      >
        {detailNode && (
          <div>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="负责人" span={2}>
                <Space>
                  <Avatar size="small" icon={<UserOutlined />} />
                  {detailNode.owner || '-'}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(detailNode.createdAt).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="最近更新">
                {dayjs(detailNode.updatedAt).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="上游依赖" labelStyle={{ color: '#1677ff' }}>
                <Badge
                  count={getUpstreamNodes(detailNode.id).length}
                  style={{ backgroundColor: '#1677ff' }}
                />
              </Descriptions.Item>
              <Descriptions.Item label="下游影响" labelStyle={{ color: '#ff4d4f' }}>
                <Badge
                  count={getDownstreamNodes(detailNode.id).length}
                  style={{ backgroundColor: '#ff4d4f' }}
                />
              </Descriptions.Item>
              <Descriptions.Item label="标签" span={2}>
                <Space wrap>
                  {detailNode.tags?.length ? (
                    detailNode.tags.map((t) => <Tag key={t}>{t}</Tag>)
                  ) : (
                    '-'
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>
                {detailNode.description || '-'}
              </Descriptions.Item>
            </Descriptions>

            {detailNode.fields && detailNode.fields.length > 0 && (
              <Card
                size="small"
                title={`字段清单 (${detailNode.fields.length})`}
                style={{ marginBottom: 16 }}
              >
                <List
                  size="small"
                  dataSource={detailNode.fields}
                  renderItem={(f, i) => (
                    <List.Item>
                      <Space style={{ width: '100%' }} align="start">
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: '#f5f5f5',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            color: '#8c8c8c',
                            flexShrink: 0,
                            marginTop: 2,
                          }}
                        >
                          {i + 1}
                        </span>
                        <Space direction="vertical" size={2} style={{ flex: 1, minWidth: 0 }}>
                          <Space size={4} wrap>
                            <code style={{ fontSize: 13 }}>{f.name}</code>
                            {f.type && <Tag color="blue">{f.type}</Tag>}
                            {f.isKey && <Tag color="red">🔑 主键</Tag>}
                            {f.isSensitive && <Tag color="orange">🔒 敏感</Tag>}
                            {f.businessRule && (
                              <Tooltip title={f.businessRule}>
                                <Tag color="purple" icon={<InfoCircleOutlined />}>
                                  口径说明
                                </Tag>
                              </Tooltip>
                            )}
                          </Space>
                          {f.description && (
                            <span
                              style={{
                                color: '#8c8c8c',
                                fontSize: 12,
                              }}
                            >
                              {f.description}
                            </span>
                          )}
                        </Space>
                        <Tooltip title="追踪该字段血缘">
                          <Button
                            type="link"
                            size="small"
                            icon={<SearchOutlined />}
                            onClick={() => handleTrackLineage(detailNode.id, f.name)}
                            style={{ padding: 0, flexShrink: 0 }}
                          >
                            追踪血缘
                          </Button>
                        </Tooltip>
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            )}

            {detailNode.content && (
              <Card size="small" title="原始内容/脚本">
                <pre className="code-block">{detailNode.content}</pre>
              </Card>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        title="编辑节点"
        open={editOpen}
        onOk={handleEditSubmit}
        onCancel={() => setEditOpen(false)}
        okText="保存"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="负责人" name="owner">
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="标签" name="tags">
            <Select mode="tags" style={{ width: '100%' }} placeholder="输入标签" />
          </Form.Item>
          <Form.Item label="标记为关键指标" name="isCritical" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default NodeSearchPanel;
