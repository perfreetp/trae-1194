import { useState, useMemo } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Row,
  Col,
  Descriptions,
  App as AntApp,
  Divider,
  Steps,
} from 'antd';
import {
  FileSearchOutlined,
  CodeOutlined,
  DatabaseOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useLineageStore } from '../store/lineageStore';
import { parseSQL, parsePythonScript } from '../utils/scriptParser';
import type { DataNode } from '../types';

const { TextArea } = Input;

function ScriptParserPanel() {
  const {
    nodes,
    addNode,
    updateNode,
    addEdge,
    batchAddEdges,
    getNodeById,
  } = useLineageStore();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [scriptContent, setScriptContent] = useState(
    `-- 示例：用户订单日汇总脚本\nINSERT INTO dwd_user_order_daily\nSELECT\n    u.user_id,\n    u.user_name,\n    u.city,\n    DATE(o.order_time) AS dt,\n    COUNT(o.order_id) AS order_count,\n    SUM(o.amount) AS total_amount,\n    SUM(o.quantity) AS total_quantity\nFROM ods_user_info u\nLEFT JOIN ods_order_detail o ON u.user_id = o.user_id\nWHERE o.status = 1\nGROUP BY u.user_id, u.user_name, u.city, DATE(o.order_time);`
  );
  const [scriptType, setScriptType] = useState<'sql' | 'python'>('sql');
  const [parseResult, setParseResult] = useState<null | {
    outputTable?: string;
    tables: string[];
    fieldRelations: Array<{
      sourceTable: string;
      sourceField: string;
      targetField: string;
      transform?: string;
      edgeType?: 'direct' | 'transform' | 'aggregate';
    }>;
  }>(null);

  const doParse = () => {
    if (scriptType === 'sql') {
      const res = parseSQL(scriptContent);
      setParseResult(res);
      if (res.tables.length === 0 && !res.outputTable) {
        message.warning('未解析到表名或输出表，请检查SQL语法');
      } else {
        message.success(
          `解析成功：发现 ${res.tables.length} 个输入表，${res.fieldRelations.length} 个字段映射`
        );
      }
    } else {
      const res = parsePythonScript(scriptContent);
      setParseResult({
        outputTable: 'python_output',
        tables: res.dataFrames,
        fieldRelations: [],
      });
      message.success(
        `解析成功：发现 ${res.imports.length} 个依赖库，${res.dataFrames.length} 个DataFrame`
      );
    }
  };

  const matchedSources = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.tables
      .map((t) => nodes.find((n) => n.name === t))
      .filter(Boolean) as DataNode[];
  }, [parseResult, nodes]);

  const unmatchedSources = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.tables.filter(
      (t) => !nodes.find((n) => n.name === t)
    );
  }, [parseResult, nodes]);

  const handleCreateAndConnect = () => {
    if (!parseResult) {
      message.warning('请先执行脚本解析');
      return;
    }

    const sourceNodes: DataNode[] = [];
    unmatchedSources.forEach((name) => {
      const n = addNode({
        name,
        type: 'table',
        description: '解析自动生成',
        owner: '系统',
      });
      sourceNodes.push(n);
    });
    sourceNodes.push(...matchedSources);

    const scriptNode = addNode({
      name: form.getFieldValue('scriptName') || parseResult.outputTable + '_script',
      type: 'script',
      description: form.getFieldValue('description'),
      owner: form.getFieldValue('owner'),
      content: scriptContent,
      fields: parseResult.fieldRelations.map((f) => ({
        name: f.targetField,
        description: f.transform ? `计算方式: ${f.transform}` : `来源: ${f.sourceTable}.${f.sourceField}`,
      })),
    });

    sourceNodes.forEach((s) => {
      addEdge({
        source: s.id,
        target: scriptNode.id,
        type: 'direct',
      });
    });

    let outputNode: DataNode | undefined;
    if (parseResult.outputTable) {
      const existing = nodes.find((n) => n.name === parseResult.outputTable);
      if (existing) {
        outputNode = existing;
      } else {
        outputNode = addNode({
          name: parseResult.outputTable,
          type: 'table',
          description: '解析自动生成的输出表',
          owner: form.getFieldValue('owner') || '系统',
          fields: parseResult.fieldRelations.map((f) => ({
            name: f.targetField,
          })),
        });
      }
      addEdge({
        source: scriptNode.id,
        target: outputNode.id,
        type: 'transform',
      });

      parseResult.fieldRelations.forEach((fr) => {
        const source = sourceNodes.find((s) => s.name === fr.sourceTable);
        if (source && outputNode) {
          const edgeType = fr.edgeType || (fr.transform ? 'aggregate' : 'direct');
          addEdge({
            source: source.id,
            target: outputNode.id,
            sourceField: fr.sourceField,
            targetField: fr.targetField,
            transformLogic: fr.transform,
            type: edgeType,
          });
        }
      });
    }

    message.success(
      `已创建 ${sourceNodes.length} 个源节点 -> 脚本节点 -> ${outputNode ? '输出表' : '无输出表'}`
    );
  };

  const fieldColumns = [
    {
      title: '来源表',
      dataIndex: 'sourceTable',
      key: 'sourceTable',
      render: (t: string) => (
        <Space>
          <DatabaseOutlined style={{ color: '#1677ff' }} />
          <code style={{ color: '#1677ff' }}>{t}</code>
        </Space>
      ),
    },
    {
      title: '来源字段',
      dataIndex: 'sourceField',
      key: 'sourceField',
      render: (t: string) => <Tag color="blue">{t}</Tag>,
    },
    {
      title: '',
      key: 'arrow',
      width: 40,
      render: () => <ArrowRightOutlined style={{ color: '#52c41a' }} />,
    },
    {
      title: '目标字段',
      dataIndex: 'targetField',
      key: 'targetField',
      render: (t: string) => <Tag color="purple">{t}</Tag>,
    },
    {
      title: '转换逻辑',
      dataIndex: 'transform',
      key: 'transform',
      render: (t?: string) =>
        t ? (
          <Tag color="orange" icon={<ThunderboltOutlined />}>
            {t}
          </Tag>
        ) : (
          <span style={{ color: '#8c8c8c' }}>直接映射</span>
        ),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="window-card">
        <div className="window-header">
          <FileSearchOutlined style={{ color: '#fa8c16' }} />
          <span className="window-title">脚本解析与血缘识别</span>
          <div style={{ flex: 1 }} />
          <Space>
            <Select
              value={scriptType}
              onChange={setScriptType}
              style={{ width: 120 }}
              size="small"
            >
              <Select.Option value="sql">SQL 脚本</Select.Option>
              <Select.Option value="python">Python 脚本</Select.Option>
            </Select>
            <Button icon={<ReloadOutlined />} size="small" onClick={doParse}>
              重新解析
            </Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              size="small"
              onClick={handleCreateAndConnect}
              disabled={!parseResult}
            >
              自动创建节点并连线
            </Button>
          </Space>
        </div>

        <div className="window-body">
          <Steps
            current={parseResult ? 2 : 1}
            size="small"
            style={{ marginBottom: 20 }}
            items={[
              { title: '输入脚本', icon: <CodeOutlined /> },
              { title: '解析血缘', icon: <FileSearchOutlined /> },
              { title: '生成节点', icon: <CheckCircleOutlined /> },
            ]}
          />

          <Row gutter={16} style={{ height: '100%' }}>
            <Col span={10}>
              <Card
                size="small"
                title={
                  <Space>
                    <CodeOutlined />
                    脚本输入
                  </Space>
                }
                style={{ height: '100%' }}
                styles={{ body: { height: 'calc(100% - 48px)', display: 'flex', flexDirection: 'column' } }}
              >
                <Form form={form} layout="vertical" size="small">
                  <Row gutter={8}>
                    <Col span={12}>
                      <Form.Item
                        label="脚本名称"
                        name="scriptName"
                        initialValue="dwd_user_order_daily"
                      >
                        <Input placeholder="如 dwd_user_order_daily" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="负责人" name="owner" initialValue="张三">
                        <Input placeholder="负责人" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item label="脚本描述" name="description" initialValue="DWD层加工脚本">
                    <Input />
                  </Form.Item>
                </Form>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                    脚本内容:
                  </div>
                  <TextArea
                    value={scriptContent}
                    onChange={(e) => setScriptContent(e.target.value)}
                    rows={18}
                    style={{
                      flex: 1,
                      fontFamily: 'Fira Code, Consolas, monospace',
                      fontSize: 12,
                    }}
                    spellCheck={false}
                  />
                  <Button
                    type="primary"
                    block
                    icon={<FileSearchOutlined />}
                    onClick={doParse}
                    style={{ marginTop: 12 }}
                  >
                    执行解析
                  </Button>
                </div>
              </Card>
            </Col>

            <Col span={14}>
              {!parseResult ? (
                <Card
                  size="small"
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ textAlign: 'center', color: '#8c8c8c' }}>
                    <FileSearchOutlined style={{ fontSize: 64, opacity: 0.3 }} />
                    <div style={{ marginTop: 12 }}>
                      请在左侧输入脚本后点击"执行解析"
                    </div>
                  </div>
                </Card>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Card size="small" title="解析概览">
                    <Descriptions column={3} size="small">
                      <Descriptions.Item label="输出表">
                        {parseResult.outputTable ? (
                          <Tag color="purple">{parseResult.outputTable}</Tag>
                        ) : (
                          <span style={{ color: '#8c8c8c' }}>未识别</span>
                        )}
                      </Descriptions.Item>
                      <Descriptions.Item label="输入表数量">
                        <Tag color="blue">{parseResult.tables.length}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="字段映射数">
                        <Tag color="green">
                          {parseResult.fieldRelations.length}
                        </Tag>
                      </Descriptions.Item>
                    </Descriptions>
                  </Card>

                  <Card size="small" title="输入源分析">
                    {matchedSources.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: '#52c41a', marginBottom: 4 }}>
                          ✅ 已匹配到现有节点 ({matchedSources.length}):
                        </div>
                        <Space wrap>
                          {matchedSources.map((n) => (
                            <Tag key={n.id} color="green" icon={<CheckCircleOutlined />}>
                              {n.name}
                            </Tag>
                          ))}
                        </Space>
                      </div>
                    )}
                    {unmatchedSources.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, color: '#faad14', marginBottom: 4 }}>
                          ⚠️ 未匹配到，将自动创建 ({unmatchedSources.length}):
                        </div>
                        <Space wrap>
                          {unmatchedSources.map((n) => (
                            <Tag key={n} color="orange">
                              {n}
                            </Tag>
                          ))}
                        </Space>
                      </div>
                    )}
                  </Card>

                  {parseResult.fieldRelations.length > 0 && (
                    <Card
                      size="small"
                      title="字段级血缘映射"
                      style={{ flex: 1, overflow: 'hidden' }}
                      styles={{ body: { height: '100%', overflow: 'auto', padding: 8 } }}
                    >
                      <Table
                        size="small"
                        dataSource={parseResult.fieldRelations}
                        columns={fieldColumns}
                        rowKey={(r) => r.sourceTable + r.sourceField + r.targetField}
                        pagination={{ pageSize: 10 }}
                      />
                    </Card>
                  )}
                </div>
              )}
            </Col>
          </Row>
        </div>
      </div>
    </div>
  );
}

export default ScriptParserPanel;
