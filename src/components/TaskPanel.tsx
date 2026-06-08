import { useState, useMemo, useEffect } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Modal,
  Row,
  Col,
  Statistic,
  App as AntApp,
  Progress,
  Tooltip,
  Avatar,
  Badge,
  Popconfirm,
  Radio,
  DatePicker,
  List,
  Alert,
  Divider,
} from 'antd';
import {
  UnorderedListOutlined,
  PlusOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  FlagOutlined,
  EditOutlined,
  UserOutlined,
  LinkOutlined,
  FilterOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useLineageStore } from '../store/lineageStore';
import type { TaskItem } from '../types';
import dayjs from 'dayjs';

const priorityConfig = {
  high: { color: 'red', label: '高', icon: <WarningOutlined /> },
  medium: { color: 'orange', label: '中', icon: <ClockCircleOutlined /> },
  low: { color: 'green', label: '低', icon: <CheckCircleOutlined /> },
};

const statusConfig = {
  todo: { color: 'default', label: '待处理', icon: <ClockCircleOutlined /> },
  doing: { color: 'processing', label: '处理中', icon: <UnorderedListOutlined /> },
  done: { color: 'success', label: '已完成', icon: <CheckCircleOutlined /> },
};

function TaskPanel() {
  const {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    getNodeById,
    nodes,
    pendingTaskFormData,
    setPendingTaskFormData,
  } = useLineageStore();
  const { message, modal } = AntApp.useApp();

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (pendingTaskFormData?.autoOpen) {
      addForm.resetFields();
      const relatedNodeName = pendingTaskFormData.relatedNodeId
        ? getNodeById(pendingTaskFormData.relatedNodeId)?.name
        : undefined;
      addForm.setFieldsValue({
        priority: pendingTaskFormData.priority,
        relatedNodeId: pendingTaskFormData.relatedNodeId,
        relatedFields: pendingTaskFormData.relatedFields,
        title:
          pendingTaskFormData.title ||
          `处理 ${relatedNodeName || '节点'} 的字段变更`,
        description: pendingTaskFormData.description,
        changeSource: pendingTaskFormData.changeSource,
      });
      setAddOpen(true);
      setPendingTaskFormData(null);
    }
  }, [pendingTaskFormData, addForm, getNodeById, setPendingTaskFormData]);

  const assignees = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => t.assignee && set.add(t.assignee));
    return Array.from(set);
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let result = [...tasks];
    if (statusFilter !== 'all') {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (priorityFilter !== 'all') {
      result = result.filter((t) => t.priority === priorityFilter);
    }
    if (assigneeFilter) {
      result = result.filter((t) => t.assignee === assigneeFilter);
    }
    return result.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (a.status !== b.status) return a.status === 'done' ? 1 : b.status === 'done' ? -1 : 0;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [tasks, statusFilter, priorityFilter, assigneeFilter]);

  const stats = useMemo(() => ({
    total: tasks.length,
    done: tasks.filter((t) => t.status === 'done').length,
    doing: tasks.filter((t) => t.status === 'doing').length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    overdue: tasks.filter(
      (t) => t.status !== 'done' && t.dueDate && t.dueDate < Date.now()
    ).length,
    highPriority: tasks.filter((t) => t.priority === 'high' && t.status !== 'done').length,
  }), [tasks]);

  const completionRate = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);

  const handleAddSubmit = async () => {
    try {
      const values = await addForm.validateFields();
      addTask({
        title: values.title,
        description: values.description,
        priority: values.priority,
        status: 'todo',
        relatedNodeId: values.relatedNodeId,
        relatedFields: values.relatedFields,
        changeSource: values.changeSource,
        assignee: values.assignee,
        dueDate: values.dueDate?.valueOf(),
      });
      message.success('任务已添加');
      setAddOpen(false);
      addForm.resetFields();
    } catch (e) {
      // noop
    }
  };

  const handleEditSubmit = async () => {
    try {
      const values = await editForm.validateFields();
      if (editingTask) {
        updateTask(editingTask.id, {
          ...values,
          dueDate: values.dueDate?.valueOf(),
        });
        message.success('已更新');
        setEditOpen(false);
      }
    } catch (e) {
      // noop
    }
  };

  const handleEdit = (task: TaskItem) => {
    setEditingTask(task);
    editForm.setFieldsValue({
      ...task,
      dueDate: task.dueDate ? dayjs(task.dueDate) : undefined,
    });
    setEditOpen(true);
  };

  const overdueCount = tasks.filter(
    (t) => t.status !== 'done' && t.dueDate && t.dueDate < Date.now()
  ).length;

  const columns = [
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (p: TaskItem['priority']) => (
        <Tag color={priorityConfig[p].color} icon={priorityConfig[p].icon}>
          {priorityConfig[p].label}
        </Tag>
      ),
    },
    {
      title: '任务',
      dataIndex: 'title',
      key: 'title',
      render: (t: string, record: TaskItem) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Space>
            {record.status === 'done' ? (
              <span style={{ textDecoration: 'line-through', color: '#8c8c8c' }}>
                {t}
              </span>
            ) : (
              <strong>{t}</strong>
            )}
            {record.dueDate && record.status !== 'done' && record.dueDate < Date.now() && (
              <Badge status="error" text="已逾期" />
            )}
          </Space>
          {record.description && (
            <div
              style={{
                fontSize: 12,
                color: '#8c8c8c',
                paddingLeft: 4,
                whiteSpace: 'pre-wrap',
              }}
            >
              {record.description.slice(0, 100)}
              {record.description.length > 100 && '...'}
            </div>
          )}
        </Space>
      ),
    },
    {
      title: '关联节点',
      dataIndex: 'relatedNodeId',
      key: 'relatedNodeId',
      width: 160,
      render: (id?: string) => {
        const node = id ? getNodeById(id) : null;
        if (!node) return <span style={{ color: '#bfbfbf' }}>-</span>;
        return (
          <Tag color="blue">
            <LinkOutlined /> {node.name}
          </Tag>
        );
      },
    },
    {
      title: '负责人',
      dataIndex: 'assignee',
      key: 'assignee',
      width: 100,
      render: (a?: string) =>
        a ? (
          <Space size={4}>
            <Avatar size="small" style={{ width: 22, height: 22, fontSize: 11 }} icon={<UserOutlined />} />
            {a}
          </Space>
        ) : (
          <span style={{ color: '#bfbfbf' }}>-</span>
        ),
    },
    {
      title: '截止日期',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 110,
      render: (d: number | undefined, record: TaskItem) => {
        if (!d) return <span style={{ color: '#bfbfbf' }}>-</span>;
        const isOverdue = record.status !== 'done' && d < Date.now();
        return (
          <span style={{ color: isOverdue ? '#ff4d4f' : undefined }}>
            {dayjs(d).format('YYYY-MM-DD')}
          </span>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: TaskItem['status'], record: TaskItem) => (
        <Radio.Group
          value={s}
          size="small"
          onChange={(e) => updateTask(record.id, { status: e.target.value })}
        >
          <Radio.Button value="todo">待办</Radio.Button>
          <Radio.Button value="doing">进行</Radio.Button>
          <Radio.Button value="done">完成</Radio.Button>
        </Radio.Group>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: TaskItem) => (
        <Space size={0}>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="删除此任务？"
            onConfirm={() => {
              deleteTask(record.id);
              message.success('已删除');
            }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="window-card">
        <div className="window-header">
          <UnorderedListOutlined style={{ color: '#13c2c2' }} />
          <span className="window-title">任务清单 / 整改计划</span>
          <Tag color="cyan">{stats.todo} 待办</Tag>
          <Tag color="processing">{stats.doing} 进行中</Tag>
          {stats.overdue > 0 && <Tag color="red">{stats.overdue} 逾期</Tag>}
          <div style={{ flex: 1 }} />
          <Space>
            <Button
              icon={<ExportOutlined />}
              onClick={() => {
                const text = filteredTasks
                  .map(
                    (t) =>
                      `[${priorityConfig[t.priority].label}] [${statusConfig[t.status].label}] ${t.title}` +
                      (t.assignee ? ` @${t.assignee}` : '') +
                      (t.dueDate ? ` 截止:${dayjs(t.dueDate).format('MM-DD')}` : '') +
                      (t.description ? `\n  ${t.description.split('\n').join('\n  ')}` : '')
                  )
                  .join('\n\n');
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `任务清单_${dayjs().format('YYYYMMDD')}.txt`;
                a.click();
                URL.revokeObjectURL(url);
                message.success('已导出');
              }}
            >
              导出任务
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                addForm.resetFields();
                addForm.setFieldsValue({ priority: 'medium' });
                setAddOpen(true);
              }}
            >
              新建任务
            </Button>
          </Space>
        </div>

        <div className="window-body">
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col span={4}>
              <Card size="small">
                <Statistic title="总任务数" value={stats.total} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="完成率"
                  value={completionRate}
                  suffix="%"
                  valueStyle={{ color: completionRate >= 70 ? '#52c41a' : '#faad14' }}
                />
                <Progress percent={completionRate} size="small" showInfo={false} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="高优先级待办"
                  value={stats.highPriority}
                  valueStyle={{ color: '#ff4d4f' }}
                  prefix={<FlagOutlined />}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic title="处理中" value={stats.doing} valueStyle={{ color: '#1677ff' }} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Row gutter={8} align="middle" style={{ height: 56 }}>
                  <Col flex="60px">
                    <FilterOutlined style={{ color: '#8c8c8c' }} />
                  </Col>
                  <Col flex="110px">
                    <Select
                      size="small"
                      style={{ width: '100%' }}
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={[
                        { value: 'all', label: '全部状态' },
                        { value: 'todo', label: '待处理' },
                        { value: 'doing', label: '处理中' },
                        { value: 'done', label: '已完成' },
                      ]}
                    />
                  </Col>
                  <Col flex="100px">
                    <Select
                      size="small"
                      style={{ width: '100%' }}
                      value={priorityFilter}
                      onChange={setPriorityFilter}
                      options={[
                        { value: 'all', label: '全部优先级' },
                        { value: 'high', label: '高' },
                        { value: 'medium', label: '中' },
                        { value: 'low', label: '低' },
                      ]}
                    />
                  </Col>
                  <Col flex="130px">
                    <Select
                      size="small"
                      allowClear
                      style={{ width: '100%' }}
                      placeholder="指定负责人"
                      value={assigneeFilter}
                      onChange={setAssigneeFilter}
                      options={assignees.map((a) => ({ value: a, label: a }))}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>

          {stats.overdue > 0 && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
              message={`有 ${stats.overdue} 个任务已逾期，请优先处理`}
              action={
                <Button
                  size="small"
                  type="primary"
                  danger
                  onClick={() => setStatusFilter('todo')}
                >
                  查看
                </Button>
              }
            />
          )}

          <Card size="small" styles={{ body: { padding: 0 } }}>
            <Table<TaskItem>
              size="small"
              rowKey="id"
              columns={columns}
              dataSource={filteredTasks}
              pagination={{ pageSize: 8 }}
              locale={{ emptyText: '暂无任务，点击右上角「新建任务」' }}
              rowClassName={(r) =>
                r.status === 'done' ? 'ant-table-row-disabled' : ''
              }
            />
          </Card>
        </div>
      </div>

      <Modal
        title={<Space><PlusOutlined />新建任务</Space>}
        open={addOpen}
        onOk={handleAddSubmit}
        onCancel={() => setAddOpen(false)}
        okText="创建"
      >
        <Form form={addForm} layout="vertical">
          <Form.Item
            label="任务标题"
            name="title"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="如：评估 ods_user_info.user_id 变更影响" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="优先级" name="priority" initialValue="medium">
                <Select
                  options={[
                    { value: 'high', label: '高 - 立即处理' },
                    { value: 'medium', label: '中 - 计划内' },
                    { value: 'low', label: '低 - 闲时' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="负责人" name="assignee">
                <Input prefix={<UserOutlined />} placeholder="负责人姓名" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item label="关联血缘节点" name="relatedNodeId">
                <Select
                  allowClear
                  showSearch
                  placeholder="选择关联的表/报表/脚本（可选）"
                  optionFilterProp="label"
                  style={{ width: '100%' }}
                  options={nodes.map((n) => ({
                    value: n.id,
                    label: `[${n.type}] ${n.name}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label="截止日期" name="dueDate">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item label="关联字段" name="relatedFields">
                <Select
                  mode="tags"
                  placeholder="输入或选择关联字段名（可选）"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label="变更来源" name="changeSource">
                <Input placeholder="如：快照对比、字段变更等" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="详细描述" name="description">
            <Input.TextArea rows={4} placeholder="任务描述、操作步骤、备注信息..." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={<Space><EditOutlined />编辑任务</Space>}
        open={editOpen}
        onOk={handleEditSubmit}
        onCancel={() => setEditOpen(false)}
        okText="保存"
      >
        <Form form={editForm} layout="vertical">
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
                    { value: 'high', label: '高' },
                    { value: 'medium', label: '中' },
                    { value: 'low', label: '低' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="状态" name="status">
                <Select
                  options={[
                    { value: 'todo', label: '待处理' },
                    { value: 'doing', label: '处理中' },
                    { value: 'done', label: '已完成' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="负责人" name="assignee">
                <Input prefix={<UserOutlined />} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="截止日期" name="dueDate">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="详细描述" name="description">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default TaskPanel;
