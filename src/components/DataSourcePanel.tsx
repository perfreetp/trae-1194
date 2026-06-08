import { useState } from 'react';
import {
  Button,
  Tabs,
  Table,
  Tag,
  Card,
  Form,
  Input,
  Select,
  InputNumber,
  Modal,
  Space,
  Divider,
  Upload,
  message,
  Row,
  Col,
  App as AntApp,
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
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useLineageStore } from '../store/lineageStore';
import type { DataNode, NodeType, FieldInfo } from '../types';
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

function DataSourcePanel() {
  const { nodes, addNode, deleteNode, updateNode, batchAddNodes } =
    useLineageStore();
  const { message } = AntApp.useApp();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<DataNode | null>(null);
  const [form] = Form.useForm();
  const [currentType, setCurrentType] = useState<NodeType>('table');
  const [fieldsInput, setFieldsInput] = useState('');

  const handleAdd = (type: NodeType) => {
    setCurrentType(type);
    setEditingNode(null);
    form.resetFields();
    setFieldsInput('');
    setAddModalOpen(true);
  };

  const handleEdit = (node: DataNode) => {
    setCurrentType(node.type);
    setEditingNode(node);
    form.setFieldsValue(node);
    setFieldsInput(
      node.fields
        ? node.fields
            .map((f) => `${f.name}|${f.type || ''}|${f.description || ''}`)
            .join('\n')
        : ''
    );
    setAddModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      let fields: FieldInfo[] | undefined;
      if (fieldsInput.trim()) {
        fields = fieldsInput
          .split('\n')
          .filter((l) => l.trim())
          .map((line) => {
            const [name, type, description] = line.split('|');
            return {
              name: name?.trim(),
              type: type?.trim() || undefined,
              description: description?.trim() || undefined,
            };
          })
          .filter((f) => f.name);
      }

      if (editingNode) {
        updateNode(editingNode.id, { ...values, fields });
        message.success('更新成功');
      } else {
        addNode({
          ...values,
          type: currentType,
          fields,
        });
        message.success('添加成功');
      }
      setAddModalOpen(false);
    } catch (e) {
      // validation error
    }
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
          fields = headers.map((h) => ({ name: h }));
        }
      }

      addNode({
        name: file.name,
        type,
        description: `通过上传导入 (${(file.size / 1024).toFixed(2)}KB)`,
        content,
        path: file.name,
        fields,
      });
      message.success(`已导入: ${file.name}`);
    };
    reader.readAsText(file);
    return false;
  };

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
            <Button
              icon={<FileOutlined />}
              onClick={() => handleAdd('file')}
            >
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
                <div className="stat-value">{useLineageStore.getState().edges.length}</div>
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
              <p className="ant-upload-text">
                点击或拖拽文件到此区域上传
              </p>
              <p className="ant-upload-hint">
                系统将根据文件类型自动识别，CSV文件将自动提取列名作为字段
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
            locale={{ emptyText: `暂无${nodeTypeConfig[currentType].label}，点击上方按钮添加` }}
            style={{ marginTop: 12 }}
          />
        </div>
      </div>

      <Modal
        title={`${editingNode ? '编辑' : '新增'}${nodeTypeConfig[currentType].label}`}
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onOk={handleSubmit}
        okText={editingNode ? '保存' : '添加'}
        width={640}
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
                <Input placeholder={`请输入${nodeTypeConfig[currentType].label}名称`} />
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
          <Form.Item label="是否为关键指标/节点" name="isCritical" valuePropName="checked">
            <Input type="checkbox" />
          </Form.Item>
          <Divider orientation="left" style={{ margin: '8px 0' }} plain>
            <TagsOutlined /> 字段定义（每行一个，格式：字段名|类型|说明）
          </Divider>
          <Input.TextArea
            rows={5}
            value={fieldsInput}
            onChange={(e) => setFieldsInput(e.target.value)}
            placeholder={`user_id|BIGINT|用户ID\nuser_name|VARCHAR|用户名\namount|DECIMAL|订单金额`}
            style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}
          />
        </Form>
      </Modal>
    </div>
  );
}

export default DataSourcePanel;
