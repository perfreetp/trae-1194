import { useState, useRef } from 'react';
import {
  Button,
  Tabs,
  Table,
  Tag,
  Card,
  Form,
  Input,
  Select,
  Modal,
  Space,
  Divider,
  Upload,
  message,
  Row,
  Col,
  App as AntApp,
  Checkbox,
  Radio,
  Alert,
} from 'antd';
import {
  DatabaseOutlined,
  FileOutlined,
  BarChartOutlined,
  CodeOutlined,
  PlusOutlined,
  DeleteOutlined,
  UploadOutlined,
  UserOutlined,
  TagsOutlined,
  ExclamationCircleOutlined,
  KeyOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useLineageStore } from '../store/lineageStore';
import type { DataNode, NodeType, FieldInfo, MergeStrategy } from '../types';
import dayjs from 'dayjs';

const { Dragger } = Upload;

const nodeTypeConfig: Record<
  NodeType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  table: { label: '数据表', icon: <DatabaseOutlined />, color: 'blue' },
  file: { label: '数据文件', icon: <FileOutlined />, color: 'green' },
  report: { label: '报表看板', icon: <BarChartOutlined />, color: 'purple' },
  script: { label: '加工脚本', icon: <CodeOutlined />, color: 'orange' },
  field: { label: '字段', icon: <DatabaseOutlined />, color: 'cyan' },
};

const PK_KEYWORDS = ['_id', 'id', 'pk', 'primary', '主键'];
const SENSITIVE_KEYWORDS = [
  'phone',
  'mobile',
  'tel',
  'email',
  'mail',
  'id_card',
  'idcard',
  'id_no',
  'idno',
  '身份证',
  '手机号',
  '手机',
  '邮箱',
  'name',
  '姓名',
  'address',
  '地址',
  'bank',
  '银行卡',
  'passport',
  '护照',
];

function detectIsKey(colName: string): boolean {
  const lower = colName.toLowerCase().trim();
  return PK_KEYWORDS.some(
    (k) => lower === k || lower.endsWith(`_${k}`) || lower.endsWith(k)
  );
}

function detectIsSensitive(colName: string): boolean {
  const lower = colName.toLowerCase().trim();
  return SENSITIVE_KEYWORDS.some((k) => lower.includes(k));
}

interface EditableFieldRow extends FieldInfo {
  _tempKey: string;
}

function makeFieldRow(f: Partial<FieldInfo> = {}): EditableFieldRow {
  return {
    name: f.name || '',
    type: f.type,
    description: f.description,
    isKey: f.isKey || false,
    isSensitive: f.isSensitive || false,
    businessRule: f.businessRule,
    _tempKey: Math.random().toString(36).slice(2, 10),
  };
}

interface DuplicateResolution {
  existingId: string;
  existingName: string;
  incomingData: Omit<DataNode, 'id' | 'createdAt' | 'updatedAt'>;
  strategy: MergeStrategy;
}

function DataSourcePanel() {
  const {
    nodes,
    addNode,
    deleteNode,
    updateNode,
    batchAddNodes,
    findDuplicateNodesByName,
    mergeNodeWithStrategy,
  } = useLineageStore();
  const { message, modal } = AntApp.useApp();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<DataNode | null>(null);
  const [form] = Form.useForm();
  const [currentType, setCurrentType] = useState<NodeType>('table');

  const [fieldRows, setFieldRows] = useState<EditableFieldRow[]>([]);
  const [fieldsTextInput, setFieldsTextInput] = useState('');

  const [dupModalOpen, setDupModalOpen] = useState(false);
  const [pendingNodes, setPendingNodes] = useState<
    Array<Omit<DataNode, 'id' | 'createdAt' | 'updatedAt'>>
  >([]);
  const [dupResolutions, setDupResolutions] = useState<DuplicateResolution[]>([]);
  const [dupDefaultStrategy, setDupDefaultStrategy] = useState<MergeStrategy>('merge');
  const batchSourceRef = useRef<'csv' | 'paste' | 'file'>('file');

  const handleAdd = (type: NodeType) => {
    setCurrentType(type);
    setEditingNode(null);
    form.resetFields();
    setFieldRows([makeFieldRow()]);
    setFieldsTextInput('');
    setAddModalOpen(true);
  };

  const handleEdit = (node: DataNode) => {
    setCurrentType(node.type);
    setEditingNode(node);
    form.setFieldsValue(node);
    const nf = node.fields;
    setFieldRows(
      (nf || []).length > 0
        ? (nf as FieldInfo[]).map((f) => makeFieldRow(f))
        : [makeFieldRow()]
    );
    setFieldsTextInput(
      nf
        ? (nf as FieldInfo[])
            .map(
              (f) =>
                `${f.name}|${f.type || ''}|${f.description || ''}|${
                  f.isKey ? 1 : 0
                }|${f.isSensitive ? 1 : 0}|${f.businessRule || ''}`
            )
            .join('\n')
        : ''
    );
    setAddModalOpen(true);
  };

  const setRow = (tempKey: string, patch: Partial<EditableFieldRow>) => {
    setFieldRows((rows) =>
      rows.map((r) => (r._tempKey === tempKey ? { ...r, ...patch } : r))
    );
  };

  const addFieldRow = () => {
    setFieldRows((rows) => [...rows, makeFieldRow()]);
  };

  const removeFieldRow = (tempKey: string) => {
    setFieldRows((rows) =>
      rows.length > 1 ? rows.filter((r) => r._tempKey !== tempKey) : rows
    );
  };

  const applyTextToRows = () => {
    if (!fieldsTextInput.trim()) {
      message.warning('请先粘贴字段定义文本');
      return;
    }
    const parsed: EditableFieldRow[] = fieldsTextInput
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        const parts = line.split('|');
        const [name, type, desc, keyFlag, sensFlag, rule] = parts;
        return makeFieldRow({
          name: name?.trim(),
          type: type?.trim() || undefined,
          description: desc?.trim() || undefined,
          isKey: keyFlag?.trim() === '1',
          isSensitive: sensFlag?.trim() === '1',
          businessRule: rule?.trim() || undefined,
        });
      })
      .filter((f) => f.name);
    if (parsed.length === 0) {
      message.warning('未能解析到有效字段');
      return;
    }
    setFieldRows(parsed);
    message.success(`已解析 ${parsed.length} 个字段`);
  };

  const collectFields = (): FieldInfo[] | undefined => {
    const filtered = fieldRows
      .map(({ _tempKey, ...rest }) => rest)
      .filter((f) => f.name?.trim());
    return filtered.length > 0 ? filtered : undefined;
  };

  const processPendingNodes = () => {
    const dupNameSet = new Set(dupResolutions.map((d) => d.existingName));
    const brandNew = pendingNodes.filter(
      (n) => !dupNameSet.has(n.name)
    );

    if (brandNew.length > 0) {
      batchAddNodes(brandNew);
    }

    let mergedCount = 0;
    let skippedCount = 0;
    for (const d of dupResolutions) {
      if (d.strategy === 'skip') {
        skippedCount++;
        continue;
      }
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } =
        d.incomingData as DataNode;
      mergeNodeWithStrategy(d.existingId, { ...rest }, d.strategy);
      mergedCount++;
    }

    message.success(
      `批量导入完成：新增 ${brandNew.length} 个，合并/覆盖 ${mergedCount} 个，跳过 ${skippedCount} 个`
    );
    setDupModalOpen(false);
    setPendingNodes([]);
    setDupResolutions([]);
  };

  const beginBatchImport = (
    incomingList: Array<Omit<DataNode, 'id' | 'createdAt' | 'updatedAt'>>,
    source: 'csv' | 'paste' | 'file' = 'file'
  ) => {
    batchSourceRef.current = source;

    const pseudoForCheck: DataNode[] = incomingList.map((n) => ({
      ...n,
      id: `__temp_${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    const duplicates = findDuplicateNodesByName(pseudoForCheck);

    if (duplicates.length === 0) {
      batchAddNodes(incomingList);
      message.success(`批量导入成功：新增 ${incomingList.length} 个节点`);
      return;
    }

    const existingByName = new Map(
      duplicates.map((d) => [d.name, d]) as [string, DataNode][]
    );

    const resolutions: DuplicateResolution[] = [];
    for (const n of incomingList) {
      const existing = existingByName.get(n.name);
      if (existing) {
        resolutions.push({
          existingId: existing.id,
          existingName: existing.name,
          incomingData: n,
          strategy: dupDefaultStrategy,
        });
      }
    }

    setPendingNodes(incomingList);
    setDupResolutions(resolutions);
    setDupModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const fields = collectFields();

      if (editingNode) {
        updateNode(editingNode.id, { ...values, fields });
        message.success('更新成功');
      } else {
        const nodeData: Omit<DataNode, 'id' | 'createdAt' | 'updatedAt'> = {
          ...values,
          type: currentType,
          fields,
        };
        beginBatchImport([nodeData], 'file');
      }
      setAddModalOpen(false);
    } catch (e) {
      // validation error
    }
  };

  const handleCsvTextImport = () => {
    if (!fieldsTextInput.trim()) {
      message.warning('请先粘贴 CSV 表头或内容');
      return;
    }
    const lines = fieldsTextInput.split('\n').filter((l) => l.trim());
    if (lines.length === 0) {
      message.warning('未能解析内容');
      return;
    }
    const headers = lines[0].split(',').map((h) => h.trim());
    const parsedFields: FieldInfo[] = headers.map((h) => ({
      name: h,
      isKey: detectIsKey(h),
      isSensitive: detectIsSensitive(h),
    }));
    setFieldRows(parsedFields.map((f) => makeFieldRow(f)));
    message.success(
      `已解析 ${parsedFields.length} 个字段，其中主键 ${
        parsedFields.filter((f) => f.isKey).length
      } 个，敏感 ${parsedFields.filter((f) => f.isSensitive).length} 个（可修改）`
    );
  };

  const handleFileUpload: UploadProps['beforeUpload'] = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const ext = file.name.split('.').pop()?.toLowerCase();
      let type: NodeType = 'file';
      if (['sql', 'hql', 'py', 'js'].includes(ext || '')) type = 'script';
      if (['csv', 'xlsx', 'xls', 'json'].includes(ext || '')) type = 'file';

      let fields: FieldInfo[] | undefined;
      if (ext === 'csv' && content) {
        const lines = content.split('\n');
        if (lines.length > 0) {
          const headers = lines[0].split(',').map((h) => h.trim());
          fields = headers.map((h) => ({
            name: h,
            isKey: detectIsKey(h),
            isSensitive: detectIsSensitive(h),
          }));
        }
      }

      const nodeData: Omit<DataNode, 'id' | 'createdAt' | 'updatedAt'> = {
        name: file.name,
        type,
        description: `通过上传导入 (${(file.size / 1024).toFixed(2)}KB)`,
        content,
        path: file.name,
        fields,
      };
      beginBatchImport([nodeData], 'csv');
    };
    reader.readAsText(file);
    return false;
  };

  const fieldTableColumns = [
    {
      title: '字段名 *',
      dataIndex: 'name',
      key: 'name',
      width: 160,
      render: (_: unknown, record: EditableFieldRow) => (
        <Input
          size="small"
          value={record.name}
          placeholder="如: user_id"
          onChange={(e) => setRow(record._tempKey, { name: e.target.value })}
        />
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (_: unknown, record: EditableFieldRow) => (
        <Input
          size="small"
          value={record.type}
          placeholder="如: BIGINT"
          onChange={(e) => setRow(record._tempKey, { type: e.target.value })}
        />
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 160,
      render: (_: unknown, record: EditableFieldRow) => (
        <Input
          size="small"
          value={record.description}
          placeholder="字段说明"
          onChange={(e) =>
            setRow(record._tempKey, { description: e.target.value })
          }
        />
      ),
    },
    {
      title: (
        <span title="主键">
          <KeyOutlined style={{ color: '#faad14' }} /> 主键
        </span>
      ),
      dataIndex: 'isKey',
      key: 'isKey',
      width: 70,
      align: 'center' as const,
      render: (_: unknown, record: EditableFieldRow) => (
        <Checkbox
          checked={!!record.isKey}
          onChange={(e) =>
            setRow(record._tempKey, { isKey: e.target.checked })
          }
        />
      ),
    },
    {
      title: (
        <span title="敏感字段">
          <LockOutlined style={{ color: '#ff4d4f' }} /> 敏感
        </span>
      ),
      dataIndex: 'isSensitive',
      key: 'isSensitive',
      width: 70,
      align: 'center' as const,
      render: (_: unknown, record: EditableFieldRow) => (
        <Checkbox
          checked={!!record.isSensitive}
          onChange={(e) =>
            setRow(record._tempKey, { isSensitive: e.target.checked })
          }
        />
      ),
    },
    {
      title: (
        <span title="业务口径/业务规则说明">
          <SafetyCertificateOutlined style={{ color: '#1677ff' }} /> 口径说明
        </span>
      ),
      dataIndex: 'businessRule',
      key: 'businessRule',
      render: (_: unknown, record: EditableFieldRow) => (
        <Input
          size="small"
          value={record.businessRule}
          placeholder="业务计算口径、统计规则等"
          onChange={(e) =>
            setRow(record._tempKey, { businessRule: e.target.value })
          }
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 70,
      align: 'center' as const,
      render: (_: unknown, record: EditableFieldRow) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeFieldRow(record._tempKey)}
        />
      ),
    },
  ];

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: DataNode) => (
        <Space>
          {nodeTypeConfig[record.type].icon}
          <span style={{ fontWeight: record.isCritical ? 600 : 400 }}>
            {text}
          </span>
          {record.isCritical && (
            <Tag color="red" icon={<ExclamationCircleOutlined />}>
              关键指标
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (t: NodeType) => (
        <Tag color={nodeTypeConfig[t].color}>
          {nodeTypeConfig[t].label}
        </Tag>
      ),
    },
    {
      title: '负责人',
      dataIndex: 'owner',
      key: 'owner',
      width: 120,
      render: (t: string) => t || '-',
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      render: (tags: string[]) => (
        <>
          {tags?.map((t) => (
            <Tag key={t} color="blue">
              {t}
            </Tag>
          ))}
        </>
      ),
    },
    {
      title: '字段数',
      key: 'fields',
      width: 80,
      render: (_: unknown, r: DataNode) => r.fields?.length || 0,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
      render: (t: number) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: unknown, record: DataNode) => (
        <Space size="small">
          <Button size="small" onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              Modal.confirm({
                title: `确定删除 ${record.name}?`,
                content: '删除后关联的血缘关系也会被清除',
                onOk: () => deleteNode(record.id),
              });
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const filteredNodes = nodes.filter((n) => n.type === currentType);

  const nodeStats = {
    table: nodes.filter((n) => n.type === 'table').length,
    file: nodes.filter((n) => n.type === 'file').length,
    report: nodes.filter((n) => n.type === 'report').length,
    script: nodes.filter((n) => n.type === 'script').length,
    critical: nodes.filter((n) => n.isCritical).length,
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="window-card">
        <div className="window-header">
          <DatabaseOutlined style={{ color: '#1677ff' }} />
          <span className="window-title">数据源导入</span>
          <div style={{ flex: 1 }} />
          <Space>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={() => handleAdd('table')}
            >
              新增数据表
            </Button>
            <Button icon={<FileOutlined />} onClick={() => handleAdd('file')}>
              新增文件
            </Button>
            <Button
              icon={<BarChartOutlined />}
              onClick={() => handleAdd('report')}
            >
              新增报表
            </Button>
            <Button
              icon={<CodeOutlined />}
              onClick={() => handleAdd('script')}
            >
              新增脚本
            </Button>
          </Space>
        </div>

        <div className="window-body">
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}>
              <div className="stat-card table">
                <div className="stat-value">{nodeStats.table}</div>
                <div className="stat-label">数据表</div>
              </div>
            </Col>
            <Col span={4}>
              <div className="stat-card file">
                <div className="stat-value">{nodeStats.file}</div>
                <div className="stat-label">数据文件</div>
              </div>
            </Col>
            <Col span={4}>
              <div className="stat-card report">
                <div className="stat-value">{nodeStats.report}</div>
                <div className="stat-label">报表看板</div>
              </div>
            </Col>
            <Col span={4}>
              <div className="stat-card script">
                <div className="stat-value">{nodeStats.script}</div>
                <div className="stat-label">加工脚本</div>
              </div>
            </Col>
            <Col span={4}>
              <div className="stat-card critical">
                <div className="stat-value">{nodeStats.critical}</div>
                <div className="stat-label">关键节点</div>
              </div>
            </Col>
            <Col span={4}>
              <div className="stat-card edge">
                <div className="stat-value">
                  {useLineageStore.getState().edges.length}
                </div>
                <div className="stat-label">血缘关系</div>
              </div>
            </Col>
          </Row>

          <Card
            size="small"
            style={{ marginBottom: 16 }}
            title="批量导入文件"
            extra={
              <Tag color="blue">
                支持 .sql .py .csv .json .xlsx .txt .hql 等
              </Tag>
            }
          >
            <Dragger
              multiple
              accept=".sql,.hql,.py,.js,.csv,.json,.txt,.xlsx,.xls"
              beforeUpload={handleFileUpload}
              showUploadList={false}
              height={100}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
              <p className="ant-upload-hint">
                系统将根据文件类型自动识别，CSV文件将自动提取列名作为字段，并智能识别主键/敏感列（可在编辑时修改）
              </p>
            </Dragger>
          </Card>

          <Tabs
            activeKey={currentType}
            onChange={(k) => setCurrentType(k as NodeType)}
            items={(['table', 'file', 'report', 'script'] as NodeType[]).map(
              (t) => ({
                key: t,
                label: (
                  <Space>
                    {nodeTypeConfig[t].icon}
                    {nodeTypeConfig[t].label}
                    <Tag color={nodeTypeConfig[t].color}>
                      {nodes.filter((n) => n.type === t).length}
                    </Tag>
                  </Space>
                ),
              })
            )}
          />

          <Table<DataNode>
            size="small"
            rowKey="id"
            dataSource={filteredNodes}
            columns={columns}
            pagination={{ pageSize: 8 }}
            locale={{
              emptyText: `暂无${nodeTypeConfig[currentType].label}，点击上方按钮添加`,
            }}
            style={{ marginTop: 12 }}
          />
        </div>
      </div>

      <Modal
        title={`${editingNode ? '编辑' : '新增'}${
          nodeTypeConfig[currentType].label
        }`}
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onOk={handleSubmit}
        okText={editingNode ? '保存' : '添加'}
        width={960}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item
                label="名称"
                name="name"
                rules={[{ required: true, message: '请输入名称' }]}
              >
                <Input
                  placeholder={`请输入${nodeTypeConfig[currentType].label}名称`}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="负责人" name="owner">
                <Input prefix={<UserOutlined />} placeholder="负责人姓名" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="描述说明" name="description">
            <Input.TextArea rows={2} placeholder="简要描述用途..." />
          </Form.Item>
          <Form.Item label="标签" name="tags">
            <Select
              mode="tags"
              placeholder="输入标签后回车"
              style={{ width: '100%' }}
              prefix={<TagsOutlined />}
            />
          </Form.Item>
          <Form.Item
            label="是否为关键指标/节点"
            name="isCritical"
            valuePropName="checked"
          >
            <Input type="checkbox" />
          </Form.Item>

          <Divider orientation="left" style={{ margin: '8px 0' }} plain>
            <TagsOutlined /> 字段定义（表格编辑）
          </Divider>

          <Card
            size="small"
            styles={{ body: { padding: 0 } }}
            style={{ marginBottom: 12 }}
            extra={
              <Space size="small">
                <Button size="small" onClick={addFieldRow}>
                  <PlusOutlined /> 新增字段
                </Button>
              </Space>
            }
          >
            <Table<EditableFieldRow>
              size="small"
              rowKey="_tempKey"
              dataSource={fieldRows}
              columns={fieldTableColumns}
              pagination={false}
              locale={{ emptyText: '请添加字段' }}
              scroll={{ x: 900 }}
            />
          </Card>

          <Divider orientation="left" style={{ margin: '8px 0' }} plain>
            快速批量（可选：粘贴文本解析后覆盖上表）
          </Divider>
          <Input.TextArea
            rows={4}
            value={fieldsTextInput}
            onChange={(e) => setFieldsTextInput(e.target.value)}
            placeholder={
              '格式1(竖线分隔): user_id|BIGINT|用户ID|1|0|主键用户ID\n' +
              '格式2(粘贴CSV表头或内容): user_id,user_name,phone,email,...\n' +
              '粘贴后点击下方对应按钮解析到表格'
            }
            style={{
              fontFamily: 'Consolas, monospace',
              fontSize: 12,
              marginBottom: 8,
            }}
          />
          <Space wrap>
            <Button size="small" onClick={applyTextToRows}>
              解析竖线格式到表格
            </Button>
            <Button size="small" onClick={handleCsvTextImport}>
              解析CSV表头（智能识别主键/敏感列）
            </Button>
            <Tag color="blue" style={{ marginLeft: 'auto' }}>
              <KeyOutlined /> 主键列名含 _id/id/pk 等自动识别
            </Tag>
            <Tag color="red">
              <LockOutlined /> phone/email/id_card 等自动标为敏感
            </Tag>
          </Space>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
            检测到同名节点 - 请选择处理策略
          </Space>
        }
        open={dupModalOpen}
        onCancel={() => {
          setDupModalOpen(false);
          setPendingNodes([]);
          setDupResolutions([]);
        }}
        onOk={processPendingNodes}
        okText="确认导入"
        cancelText="取消本次导入"
        width={780}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`共 ${pendingNodes.length} 个节点待导入，其中 ${dupResolutions.length} 个与现有节点同名`}
          description="请为每个同名节点选择处理策略，或批量应用默认策略"
        />

        <Card
          size="small"
          style={{ marginBottom: 12 }}
          title={
            <Space>
              <span>批量应用默认策略到所有同名项：</span>
              <Radio.Group
                size="small"
                value={dupDefaultStrategy}
                onChange={(e) => {
                  const s = e.target.value as MergeStrategy;
                  setDupDefaultStrategy(s);
                  setDupResolutions((list) =>
                    list.map((d) => ({ ...d, strategy: s }))
                  );
                }}
              >
                <Radio.Button value="merge">合并（推荐）</Radio.Button>
                <Radio.Button value="overwrite">覆盖</Radio.Button>
                <Radio.Button value="skip">跳过</Radio.Button>
              </Radio.Group>
              <Button
                size="small"
                onClick={() =>
                  setDupResolutions((list) =>
                    list.map((d) => ({ ...d, strategy: dupDefaultStrategy }))
                  )
                }
              >
                应用
              </Button>
            </Space>
          }
        />

        <div style={{ maxHeight: 340, overflow: 'auto' }}>
          {dupResolutions.map((d, idx) => {
            const inFields = d.incomingData.fields?.length || 0;
            return (
              <div
                key={`${d.existingId}-${idx}`}
                className="snapshot-compare-row modified"
                style={{
                  marginBottom: 6,
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <Space wrap>
                  <Tag color="orange">同名</Tag>
                  <code>{d.existingName}</code>
                  <Tag color="blue">待导入字段: {inFields}</Tag>
                </Space>
                <Space size="small">
                  <Radio.Group
                    size="small"
                    value={d.strategy}
                    onChange={(e) => {
                      const s = e.target.value as MergeStrategy;
                      setDupResolutions((list) =>
                        list.map((it, i) =>
                          i === idx ? { ...it, strategy: s } : it
                        )
                      );
                    }}
                  >
                    <Radio.Button value="merge">合并</Radio.Button>
                    <Radio.Button value="overwrite">覆盖</Radio.Button>
                    <Radio.Button value="skip">跳过</Radio.Button>
                  </Radio.Group>
                </Space>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

export default DataSourcePanel;
