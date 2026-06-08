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
  EditOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  FileOutlined,
  CodeOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import { useLineageStore } from '../store/lineageStore';
import type { Snapshot, DataNode, NodeType } from '../types';
import dayjs from 'dayjs';

const typeIcons: Record<NodeType, React.ReactNode> = {
  table: <DatabaseOutlined />,
  file: <FileOutlined />,
  report: <BarChartOutlined />,
  script: <CodeOutlined />,
  field: <DatabaseOutlined />,
};

function SnapshotPanel() {
  const {
    snapshots,
    nodes,
    edges,
    createSnapshot,
    deleteSnapshot,
    restoreSnapshot,
    compareSnapshots,
  } = useLineageStore();
  const { message, modal } = AntApp.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [compareOpen, setCompareOpen] = useState(false);
  const [snap1, setSnap1] = useState<string | undefined>(undefined);
  const [snap2, setSnap2] = useState<string | undefined>(undefined);

  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((a, b) => b.createdAt - a.createdAt),
    [snapshots]
  );

  const compareResult = useMemo(() => {
    if (!snap1 || !snap2) return null;
    return compareSnapshots(snap1, snap2);
  }, [snap1, snap2, compareSnapshots]);

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

  const diffNodeColumns = [
    {
      title: '变更',
      key: 'change',
      width: 60,
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
  ];

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
                  <div className="stat-value">{nodes.filter((n) => n.isCritical).length}</div>
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
                  <li>每次大规模变更前（如重构加工脚本）创建快照，便于回滚</li>
                  <li>对比不同时期的快照，了解血缘演进趋势</li>
                  <li>重要节点的新增/修改建议记录在快照描述中</li>
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
                  title={<Space><ClockCircleOutlined />快照时间线</Space>}
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
                          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
                            {s.description || '无描述'}
                          </div>
                          <div style={{ fontSize: 11, color: '#bfbfbf', marginTop: 4 }}>
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
                                      <p><strong>创建时间:</strong> {dayjs(s.createdAt).format('YYYY-MM-DD HH:mm:ss')}</p>
                                      <p><strong>描述:</strong> {s.description || '-'}</p>
                                      <Divider>快照内容</Divider>
                                      <Space direction="vertical" style={{ width: '100%' }}>
                                        <Space>
                                          <Tag color="blue">节点: {s.nodes.length}</Tag>
                                          <Tag color="green">关系: {s.edges.length}</Tag>
                                        </Space>
                                        <div>
                                          <div style={{ fontSize: 12, marginBottom: 4, color: '#595959' }}>包含节点:</div>
                                          <Space wrap>
                                            {s.nodes.slice(0, 30).map((n) => (
                                              <Tag key={n.id}>{typeIcons[n.type]} {n.name}</Tag>
                                            ))}
                                            {s.nodes.length > 30 && <Tag>+{s.nodes.length - 30}...</Tag>}
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
                  title={<Space><SwapOutlined />快速对比（选两个快照）</Space>}
                  extra={
                    <Space>
                      <Select
                        style={{ width: 180 }}
                        size="small"
                        placeholder="选较早快照"
                        value={snap1}
                        onChange={setSnap1}
                        options={sortedSnapshots.map((s) => ({ value: s.id, label: s.name }))}
                        allowClear
                      />
                      <span style={{ color: '#bfbfbf' }}>vs</span>
                      <Select
                        style={{ width: 180 }}
                        size="small"
                        placeholder="选较新快照"
                        value={snap2}
                        onChange={setSnap2}
                        options={sortedSnapshots.map((s) => ({ value: s.id, label: s.name }))}
                        allowClear
                      />
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
                    <div>
                      <Row gutter={8} style={{ marginBottom: 12 }}>
                        <Col span={8}>
                          <div
                            style={{
                              padding: '10px',
                              background: '#f6ffed',
                              borderRadius: 6,
                              border: '1px solid #b7eb8f',
                            }}
                          >
                            <div style={{ fontSize: 11, color: '#52c41a' }}>新增节点</div>
                            <div style={{ fontSize: 24, fontWeight: 600, color: '#52c41a' }}>
                              {compareResult.addedNodes.length}
                            </div>
                          </div>
                        </Col>
                        <Col span={8}>
                          <div
                            style={{
                              padding: '10px',
                              background: '#fffbe6',
                              borderRadius: 6,
                              border: '1px solid #ffe58f',
                            }}
                          >
                            <div style={{ fontSize: 11, color: '#faad14' }}>修改节点</div>
                            <div style={{ fontSize: 24, fontWeight: 600, color: '#faad14' }}>
                              {compareResult.modifiedNodes.length}
                            </div>
                          </div>
                        </Col>
                        <Col span={8}>
                          <div
                            style={{
                              padding: '10px',
                              background: '#fff1f0',
                              borderRadius: 6,
                              border: '1px solid #ffa39e',
                            }}
                          >
                            <div style={{ fontSize: 11, color: '#ff4d4f' }}>删除节点</div>
                            <div style={{ fontSize: 24, fontWeight: 600, color: '#ff4d4f' }}>
                              {compareResult.removedNodes.length}
                            </div>
                          </div>
                        </Col>
                      </Row>

                      <Row gutter={8} style={{ marginBottom: 8 }}>
                        <Col span={12}>
                          <Tag color="green">
                            <PlusOutlined /> 新增关系: {compareResult.addedEdges.length}
                          </Tag>
                        </Col>
                        <Col span={12}>
                          <Tag color="red">
                            <MinusOutlined /> 删除关系: {compareResult.removedEdges.length}
                          </Tag>
                        </Col>
                      </Row>

                      <Divider style={{ margin: '12px 0' }} orientation="left" plain>
                        节点变更明细
                      </Divider>

                      {compareResult.addedNodes.length === 0 &&
                        compareResult.removedNodes.length === 0 &&
                        compareResult.modifiedNodes.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="两个快照内容一致" />
                      ) : (
                        <div style={{ maxHeight: 320, overflow: 'auto' }}>
                          {compareResult.addedNodes.map((n) => (
                            <div key={n.id} className="snapshot-compare-row added">
                              <Tag color="green" icon={<PlusOutlined />}>新增</Tag>
                              {typeIcons[n.type]}
                              <code>{n.name}</code>
                              <Tag style={{ marginLeft: 'auto' }}>{n.type}</Tag>
                            </div>
                          ))}
                          {compareResult.modifiedNodes.map((n) => (
                            <div key={n.id} className="snapshot-compare-row modified">
                              <Tag color="orange" icon={<EditOutlined />}>修改</Tag>
                              {typeIcons[n.type]}
                              <code>{n.name}</code>
                              <Tag style={{ marginLeft: 'auto' }}>{n.type}</Tag>
                            </div>
                          ))}
                          {compareResult.removedNodes.map((n) => (
                            <div key={n.id} className="snapshot-compare-row removed">
                              <Tag color="red" icon={<CloseOutlined />}>删除</Tag>
                              {typeIcons[n.type]}
                              <code style={{ textDecoration: 'line-through' }}>{n.name}</code>
                              <Tag style={{ marginLeft: 'auto' }}>{n.type}</Tag>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
        title={<Space><DiffOutlined />快照对比</Space>}
        open={compareOpen}
        onCancel={() => setCompareOpen(false)}
        footer={
          <Button onClick={() => setCompareOpen(false)}>关闭</Button>
        }
        width={800}
      >
        <p>在主界面右侧的「快速对比」面板查看详细差异</p>
      </Modal>
    </div>
  );
}

export default SnapshotPanel;
