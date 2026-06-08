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
} from '@ant-design/icons';
import { useLineageStore } from '../store/lineageStore';
import type { DataNode, NodeType } from '../types';
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

function NodeSearchPanel() {
  const {
    nodes,
    edges,
    searchQuery,
    setSearchQuery,
    selectNode,
    focusNode,
    updateNode,
    getUpstreamNodes,
    getDownstreamNodes,
    deleteNode,
  } = useLineageStore();
  const { message, modal } = AntApp.useApp();

  const [typeFilter, setTypeFilter] = useState<NodeType | 'all'>('all');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string | undefined>(undefined);
  const [detailNode, setDetailNode] = useState<DataNode | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm] = Form.useForm();

  const owners = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n) => n.owner && set.add(n.owner));
    return Array.from(set);
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    let result = nodes;
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          (n.description && n.description.toLowerCase().includes(q)) ||
          (n.owner && n.owner.toLowerCase().includes(q)) ||
          (n.tags && n.tags.some((t) => t.toLowerCase().includes(q))) ||
          (n.fields &&
            n.fields.some(
              (f) =>
                f.name.toLowerCase().includes(q) ||
                (f.description && f.description.toLowerCase().includes(q))
            ))
      );
    }
    if (typeFilter !== 'all') {
      result = result.filter((n) => n.type === typeFilter);
    }
    if (criticalOnly) {
      result = result.filter((n) => n.isCritical);
    }
    if (ownerFilter) {
      result = result.filter((n) => n.owner === ownerFilter);
    }
    return result.sort((a, b) => {
      if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [nodes, searchQuery, typeFilter, criticalOnly, ownerFilter]);

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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="window-card">
        <div className="window-header">
          <SearchOutlined style={{ color: '#722ed1' }} />
          <span className="window-title">节点搜索</span>
          <Tag color="purple">{filteredNodes.length} 个结果</Tag>
          <div style={{ flex: 1 }} />
        </div>

        <div className="window-body">
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Input
                size="large"
                prefix={<SearchOutlined />}
                placeholder="搜索节点名称、描述、负责人、标签、字段..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
              />
              <Row gutter={12}>
                <Col span={8}>
                  <Segmented
                    value={typeFilter}
                    onChange={(v) => setTypeFilter(v as any)}
                    block
                    options={[
                      { value: 'all', label: '全部' },
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
                <Col span={10} style={{ display: 'flex', alignItems: 'center' }}>
                  <Space>
                    <FilterOutlined style={{ color: '#8c8c8c' }} />
                    <span style={{ fontSize: 12, color: '#8c8c8c' }}>仅关键指标</span>
                    <Switch
                      size="small"
                      checked={criticalOnly}
                      onChange={setCriticalOnly}
                    />
                  </Space>
                </Col>
              </Row>
            </Space>
          </Card>

          {filteredNodes.length === 0 ? (
            <Empty description="未找到匹配的节点" />
          ) : (
            <Row gutter={[12, 12]}>
              {filteredNodes.map((n) => (
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
                        {n.fields && n.fields.length > 0 && (
                          <span
                            style={{
                              fontSize: 12,
                              color: '#8c8c8c',
                            }}
                          >
                            📋 {n.fields.length} 字段
                          </span>
                        )}
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
                    </Space>
                  </Card>
                </Col>
              ))}
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
                      <Space style={{ width: '100%' }}>
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
                          }}
                        >
                          {i + 1}
                        </span>
                        <code style={{ fontSize: 13 }}>{f.name}</code>
                        {f.type && <Tag color="blue">{f.type}</Tag>}
                        {f.isKey && <Tag color="red">主键</Tag>}
                        <span
                          style={{
                            flex: 1,
                            color: '#8c8c8c',
                            fontSize: 12,
                          }}
                        >
                          {f.description}
                        </span>
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
