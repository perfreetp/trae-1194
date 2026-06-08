import { useState, useMemo } from 'react';
import {
  Button,
  Card,
  Select,
  Space,
  Row,
  Col,
  Tag,
  Progress,
  Alert,
  App as AntApp,
  List,
  Table,
  Statistic,
  Empty,
  Segmented,
  Divider,
  Avatar,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Tooltip,
  Badge,
} from 'antd';
import {
  WarningOutlined,
  WarningFilled,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  FileOutlined,
  CodeOutlined,
  PlusOutlined,
  DownOutlined,
  SafetyOutlined,
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

function ImpactPanel() {
  const {
    nodes,
    getDownstreamNodes,
    getUpstreamNodes,
    getNodeById,
    addTask,
  } = useLineageStore();
  const { message, modal } = AntApp.useApp();

  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [selectedField, setSelectedField] = useState<string | undefined>(undefined);
  const [scenario, setScenario] = useState<'offline' | 'modify' | 'rename'>('offline');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genForm] = Form.useForm();

  const selectedNode = selectedNodeId ? getNodeById(selectedNodeId) : null;

  const impactAnalysis = useMemo(() => {
    if (!selectedNode) return null;
    const downstream = getDownstreamNodes(selectedNode.id);
    const upstream = getUpstreamNodes(selectedNode.id);
    const reports = downstream.filter((n) => n.type === 'report');
    const scripts = downstream.filter((n) => n.type === 'script');
    const tables = downstream.filter((n) => n.type === 'table');
    const critical = downstream.filter((n) => n.isCritical);

    let riskLevel: 'high' | 'medium' | 'low' = 'low';
    if (reports.length > 0 || critical.length > 0) riskLevel = 'high';
    else if (tables.length >= 3) riskLevel = 'medium';

    const affectedFields = new Map<string, string[]>();
    if (selectedField) {
      downstream.forEach((n) => {
        if (n.fields) {
          const matched = n.fields.filter((f) =>
            f.name.toLowerCase().includes(selectedField.toLowerCase()) ||
            (f.description && f.description.toLowerCase().includes(selectedField.toLowerCase()))
          ).map((f) => f.name);
          if (matched.length > 0) affectedFields.set(n.id, matched);
        }
      });
    }

    return {
      downstream,
      upstream,
      reports,
      scripts,
      tables,
      critical,
      riskLevel,
      affectedFields,
      totalAffected: downstream.length,
    };
  }, [selectedNode, selectedField, getDownstreamNodes, getUpstreamNodes, getNodeById]);

  const handleGenerateTask = () => {
    if (!selectedNode) return;
    genForm.setFieldsValue({
      priority: impactAnalysis?.riskLevel || 'medium',
      title:
        scenario === 'offline'
          ? `【下线评估】${selectedNode.name} 字段下线整改`
          : scenario === 'modify'
          ? `【变更评估】${selectedNode.name} 字段变更处理`
          : `【重命名】${selectedNode.name} 字段重命名同步`,
      relatedNodeId: selectedNode.id,
      dueDate: dayjs().add(impactAnalysis?.riskLevel === 'high' ? 3 : 7, 'day'),
    });
    setGenerateOpen(true);
  };

  const handleGenSubmit = async () => {
    try {
      const values = await genForm.validateFields();
      if (selectedNode && impactAnalysis) {
        addTask({
          title: values.title,
          description: `${selectedNode.name} ${scenario} 影响评估：
- 影响节点数: ${impactAnalysis.totalAffected}
- 涉及报表: ${impactAnalysis.reports.map((r) => r.name).join(', ') || '无'}
- 涉及下游表: ${impactAnalysis.tables.map((t) => t.name).join(', ') || '无'}
- 风险等级: ${impactAnalysis.riskLevel}
${values.description ? `\n补充说明: ${values.description}` : ''}
${selectedField ? `\n涉及字段: ${selectedField}` : ''}`,
          priority: values.priority,
          status: 'todo',
          relatedNodeId: selectedNode.id,
          assignee: values.assignee,
          dueDate: values.dueDate.valueOf(),
        });
        message.success('已生成整改任务到任务清单');
        setGenerateOpen(false);
      }
    } catch (e) {
      // noop
    }
  };

  const riskConfig = {
    high: {
      color: '#ff4d4f',
      text: '高风险',
      bg: '#fff1f0',
      border: '#ffa39e',
      progress: 90,
    },
    medium: {
      color: '#faad14',
      text: '中风险',
      bg: '#fffbe6',
      border: '#ffe58f',
      progress: 60,
    },
    low: {
      color: '#52c41a',
      text: '低风险',
      bg: '#f6ffed',
      border: '#b7eb8f',
      progress: 25,
    },
  };

  const downstreamColumns = [
    {
      title: '节点',
      key: 'node',
      render: (_: unknown, record: DataNode) => (
        <Space>
          <Tag color={record.type === 'report' ? 'purple' : record.type === 'script' ? 'orange' : 'blue'}>
            {typeIcons[record.type]} {typeLabels[record.type]}
          </Tag>
          <strong>{record.name}</strong>
          {record.isCritical && <Badge status="error" />}
        </Space>
      ),
    },
    {
      title: '负责人',
      dataIndex: 'owner',
      key: 'owner',
      render: (o: string) => (
        <Space>
          <Avatar size="small" style={{ width: 24, height: 24, fontSize: 12 }}>
            {o?.charAt(0) || '?'}
          </Avatar>
          {o || '-'}
        </Space>
      ),
    },
    {
      title: '关联字段',
      key: 'fields',
      render: (_: unknown, record: DataNode) => {
        if (!impactAnalysis?.affectedFields.has(record.id)) return '-';
        return (
          <Space wrap>
            {impactAnalysis.affectedFields.get(record.id)?.map((f) => (
              <Tag key={f} color="magenta">{f}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      render: (t: string) => (
        <span style={{ color: '#8c8c8c', fontSize: 12 }}>{t || '-'}</span>
      ),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="window-card">
        <div className="window-header">
          <WarningOutlined style={{ color: '#ff4d4f' }} />
          <span className="window-title">影响评估 - 模拟字段下线/变更</span>
          <div style={{ flex: 1 }} />
          <Button
            type="primary"
            danger={impactAnalysis?.riskLevel === 'high'}
            icon={<PlusOutlined />}
            onClick={handleGenerateTask}
            disabled={!selectedNode}
          >
            生成整改任务
          </Button>
        </div>

        <div className="window-body">
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={12} align="top">
              <Col span={8}>
                <div style={{ fontWeight: 500, marginBottom: 8, color: '#595959' }}>
                  1. 选择变更/下线的目标节点
                </div>
                <Select
                  showSearch
                  style={{ width: '100%' }}
                  placeholder="选择要评估的节点（表/字段/脚本）"
                  value={selectedNodeId}
                  onChange={setSelectedNodeId}
                  optionFilterProp="label"
                  size="large"
                  options={nodes.map((n) => ({
                    value: n.id,
                    label: `[${typeLabels[n.type]}] ${n.name}${n.isCritical ? ' ⚠️关键' : ''}`,
                  }))}
                />
              </Col>
              <Col span={5}>
                <div style={{ fontWeight: 500, marginBottom: 8, color: '#595959' }}>
                  2. 场景
                </div>
                <Segmented
                  block
                  value={scenario}
                  onChange={(v) => setScenario(v as any)}
                  options={[
                    { value: 'offline', label: '字段下线' },
                    { value: 'modify', label: '类型变更' },
                    { value: 'rename', label: '字段改名' },
                  ]}
                  size="large"
                />
              </Col>
              <Col span={11}>
                <div style={{ fontWeight: 500, marginBottom: 8, color: '#595959' }}>
                  3. 选择具体字段（可选）
                </div>
                <Select
                  allowClear
                  showSearch
                  style={{ width: '100%' }}
                  placeholder="字段级精确评估，不选则评估整个节点"
                  value={selectedField}
                  onChange={setSelectedField}
                  size="large"
                  disabled={!selectedNode}
                  options={
                    selectedNode?.fields?.map((f) => ({
                      value: f.name,
                      label: `${f.name}${f.type ? ` (${f.type})` : ''}${f.isKey ? ' [主键]' : ''}`,
                    })) || []
                  }
                />
              </Col>
            </Row>
          </Card>

          {!selectedNode ? (
            <Empty
              description="选择节点后开始影响评估分析"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ padding: 60 }}
            >
              <Alert
                type="info"
                showIcon
                message="影响评估使用说明"
                description={
                  <ul style={{ paddingLeft: 20, marginTop: 8, marginBottom: 0 }}>
                    <li>先在上方选择将要下线/变更的节点或字段</li>
                    <li>系统会自动递归分析所有下游依赖的节点</li>
                    <li>可评估风险等级并生成整改任务</li>
                    <li>报表和关键指标节点将触发高风险告警</li>
                  </ul>
                }
                style={{ maxWidth: 500, margin: '0 auto' }}
              />
            </Empty>
          ) : (
            impactAnalysis && (
              <div>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={4}>
                    <Card className="stat-card table" size="small">
                      <Statistic title="下游影响节点" value={impactAnalysis.totalAffected} valueStyle={{ color: '#ff4d4f' }} />
                    </Card>
                  </Col>
                  <Col span={4}>
                    <Card className="stat-card report" size="small">
                      <Statistic title="涉及报表" value={impactAnalysis.reports.length} />
                    </Card>
                  </Col>
                  <Col span={4}>
                    <Card className="stat-card script" size="small">
                      <Statistic title="涉及脚本" value={impactAnalysis.scripts.length} />
                    </Card>
                  </Col>
                  <Col span={4}>
                    <Card className="stat-card critical" size="small">
                      <Statistic title="涉及关键节点" value={impactAnalysis.critical.length} />
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small">
                      <Space>
                        <div
                          style={{
                            padding: '6px 14px',
                            borderRadius: 6,
                            background: riskConfig[impactAnalysis.riskLevel].bg,
                            border: `1px solid ${riskConfig[impactAnalysis.riskLevel].border}`,
                            color: riskConfig[impactAnalysis.riskLevel].color,
                            fontWeight: 600,
                          }}
                        >
                          <SafetyOutlined /> 风险等级：{riskConfig[impactAnalysis.riskLevel].text}
                        </div>
                        <div style={{ flex: 1 }}>
                          <Progress
                            percent={riskConfig[impactAnalysis.riskLevel].progress}
                            strokeColor={riskConfig[impactAnalysis.riskLevel].color}
                            size="small"
                            showInfo={false}
                          />
                        </div>
                      </Space>
                    </Card>
                  </Col>
                </Row>

                {impactAnalysis.riskLevel === 'high' && (
                  <Alert
                    type="error"
                    showIcon
                    icon={<WarningFilled />}
                    message="高风险变更！"
                    description={`该变更将影响 ${impactAnalysis.reports.length} 个报表和 ${impactAnalysis.critical.length} 个关键指标节点，需要严格评估变更窗口，并提前通知相关业务方`}
                    style={{ marginBottom: 16 }}
                  />
                )}

                <Row gutter={16}>
                  <Col span={12}>
                    <Card
                      size="small"
                      title={
                        <Space>
                          <DownOutlined style={{ color: '#ff4d4f' }} />
                          下游影响链路（{impactAnalysis.downstream.length}）
                        </Space>
                      }
                      styles={{ body: { padding: 8 } }}
                    >
                      <Table
                        size="small"
                        rowKey="id"
                        dataSource={impactAnalysis.downstream}
                        columns={downstreamColumns}
                        pagination={{ pageSize: 6 }}
                        locale={{ emptyText: '无下游影响' }}
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card
                      size="small"
                      title={
                        <Space>
                          <ExclamationCircleOutlined style={{ color: '#1677ff' }} />
                          关键指标与报表详细清单
                        </Space>
                      }
                    >
                      {impactAnalysis.reports.length === 0 && impactAnalysis.critical.length === 0 ? (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="未涉及关键指标和报表"
                        />
                      ) : (
                        <List
                          size="small"
                          dataSource={[...impactAnalysis.reports, ...impactAnalysis.critical.filter(
                            (c) => !impactAnalysis.reports.find((r) => r.id === c.id)
                          )]}
                          renderItem={(item) => (
                            <div className={`impact-chain ${impactAnalysis.riskLevel}`}>
                              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                                <Space>
                                  {typeIcons[item.type]}
                                  <strong>{item.name}</strong>
                                  <Tag color={item.type === 'report' ? 'purple' : 'red'}>
                                    {item.type === 'report' ? '业务报表' : '关键指标'}
                                  </Tag>
                                </Space>
                                <div style={{ fontSize: 12, color: '#595959', paddingLeft: 20 }}>
                                  👤 负责人: {item.owner || '-'} | 📌 {item.description || '无描述'}
                                </div>
                              </Space>
                            </div>
                          )}
                        />
                      )}
                    </Card>
                    <Divider />
                    <Card
                      size="small"
                      title={
                        <Space>
                          <CheckCircleOutlined style={{ color: '#52c41a' }} />
                          上游依赖（{impactAnalysis.upstream.length}）
                        </Space>
                      }
                    >
                      {impactAnalysis.upstream.length === 0 ? (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="此节点为数据源根节点"
                        />
                      ) : (
                        <Space wrap>
                          {impactAnalysis.upstream.map((n) => (
                            <Tag key={n.id} color="geekblue">
                              {typeIcons[n.type]} {n.name}
                            </Tag>
                          ))}
                        </Space>
                      )}
                    </Card>
                  </Col>
                </Row>
              </div>
            )
          )}
        </div>
      </div>

      <Modal
        title={<Space><ThunderboltOutlined />生成整改任务</Space>}
        open={generateOpen}
        onOk={handleGenSubmit}
        onCancel={() => setGenerateOpen(false)}
        okText="生成任务"
      >
        <Form form={genForm} layout="vertical">
          <Form.Item
            label="任务标题"
            name="title"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="优先级" name="priority">
                <Select
                  options={[
                    { value: 'high', label: '高 - 立即处理' },
                    { value: 'medium', label: '中 - 计划内处理' },
                    { value: 'low', label: '低 - 闲时处理' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="指定负责人" name="assignee">
                <Input placeholder="指派给" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="截止日期" name="dueDate">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="补充说明" name="description">
            <Input.TextArea rows={3} placeholder="其他需要说明的内容..." />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message="系统会自动附加影响评估摘要"
            description="包含影响节点数、涉及报表、风险等级等信息"
          />
        </Form>
      </Modal>
    </div>
  );
}

export default ImpactPanel;
