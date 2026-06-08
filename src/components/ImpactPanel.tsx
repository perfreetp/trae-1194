import { useState, useMemo, useEffect } from 'react';
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
  TeamOutlined,
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

type EvalMode = 'single' | 'batch';
type RiskLevel = 'high' | 'medium' | 'low';

interface PerFieldAffected {
  field: string;
  transform?: string;
  chain: string[];
  sourceFields: string[];
}

interface BatchImpactResult {
  selectedFieldNames: string[];
  highRiskFields: string[];
  allDownstream: DataNode[];
  affectedReports: DataNode[];
  affectedTasks: Array<{ id: string; title: string }>;
  affectedOwners: string[];
  riskLevel: RiskLevel;
  nodeToFieldsMap: Map<string, Set<string>>;
  nodeToAffectedMap: Map<string, PerFieldAffected[]>;
  totalDownstreamCount: number;
  perFieldDownstream: Map<string, DataNode[]>;
}

function ImpactPanel() {
  const {
    nodes,
    tasks,
    getDownstreamNodes,
    getUpstreamNodes,
    getNodeById,
    addTask,
    getDownstreamFields,
    selectedNodeId: storeSelectedNodeId,
    selectedField: storeSelectedField,
    selectNode,
    selectField,
  } = useLineageStore();
  const { message, modal } = AntApp.useApp();

  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(
    storeSelectedNodeId ?? undefined
  );
  const [selectedField, setSelectedField] = useState<string | undefined>(
    storeSelectedField ?? undefined
  );
  const [batchSelectedFields, setBatchSelectedFields] = useState<string[]>([]);
  const [evalMode, setEvalMode] = useState<EvalMode>('single');
  const [scenario, setScenario] = useState<'offline' | 'modify' | 'rename'>('offline');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genForm] = Form.useForm();

  useEffect(() => {
    if (storeSelectedNodeId && storeSelectedNodeId !== selectedNodeId) {
      setSelectedNodeId(storeSelectedNodeId);
    }
    if (storeSelectedField && storeSelectedField !== selectedField) {
      setSelectedField(storeSelectedField);
    }
  }, [storeSelectedNodeId, storeSelectedField]);

  const handleNodeChange = (id: string | undefined) => {
    setSelectedNodeId(id);
    setSelectedField(undefined);
    setBatchSelectedFields([]);
    selectNode(id ?? null);
    selectField(null);
  };

  const handleFieldChange = (field: string | undefined) => {
    setSelectedField(field);
    selectField(field ?? null);
  };

  const handleBatchFieldsChange = (fields: string[]) => {
    setBatchSelectedFields(fields);
  };

  const handleEvalModeChange = (mode: EvalMode) => {
    setEvalMode(mode);
    if (mode === 'batch') {
      if (selectedField) {
        setBatchSelectedFields([selectedField]);
      }
    } else {
      if (batchSelectedFields.length > 0) {
        setSelectedField(batchSelectedFields[0]);
        selectField(batchSelectedFields[0]);
      }
    }
  };

  const selectedNode = selectedNodeId ? getNodeById(selectedNodeId) : null;

  const getFieldPrefix = (f: FieldInfo): string => {
    const parts: string[] = [];
    if (f.isKey) parts.push('🔑');
    if (f.isSensitive) parts.push('🔒');
    return parts.join('');
  };

  const getFieldLabel = (f: FieldInfo): string => {
    const prefix = getFieldPrefix(f);
    const suffixParts: string[] = [];
    if (f.type) suffixParts.push(f.type);
    if (f.isKey) suffixParts.push('主键');
    if (f.isSensitive) suffixParts.push('敏感');
    const suffix = suffixParts.length > 0 ? ` (${suffixParts.join('/')})` : '';
    return `${prefix}${f.name}${suffix}`;
  };

  const isHighRiskField = (f: FieldInfo | undefined): boolean => {
    return !!(f && (f.isKey || f.isSensitive));
  };

  const getFieldInfo = (fieldName: string): FieldInfo | undefined => {
    return selectedNode?.fields?.find((f) => f.name === fieldName);
  };

  const impactAnalysis = useMemo(() => {
    if (!selectedNode) return null;
    const downstream = getDownstreamNodes(selectedNode.id);
    const upstream = getUpstreamNodes(selectedNode.id);
    const reports = downstream.filter((n) => n.type === 'report');
    const scripts = downstream.filter((n) => n.type === 'script');
    const tables = downstream.filter((n) => n.type === 'table');
    const critical = downstream.filter((n) => n.isCritical);

    let riskLevel: RiskLevel = 'low';
    if (reports.length > 0 || critical.length > 0) riskLevel = 'high';
    else if (tables.length >= 3) riskLevel = 'medium';

    const affectedFields = new Map<string, Array<{ field: string; transform?: string; chain: string[] }>>();
    if (selectedField && selectedNodeId) {
      const downstreamFieldList = getDownstreamFields(selectedNodeId, selectedField);
      downstreamFieldList.forEach((df) => {
        if (!affectedFields.has(df.node.id)) {
          affectedFields.set(df.node.id, []);
        }
        const chainEntry = `${selectedNode?.name || ''}.${selectedField}${df.transform ? ` →[${df.transform}]→ ` : ' → '}${df.node.name}.${df.field}`;
        affectedFields.get(df.node.id)!.push({
          field: df.field,
          transform: df.transform,
          chain: [chainEntry],
        });
      });
      if (affectedFields.size > 0) {
        const fieldNodeIds = new Set(affectedFields.keys());
        downstream.forEach((n) => {
          if (!fieldNodeIds.has(n.id) && n.fields) {
            const fuzzy = n.fields.filter(
              (f) =>
                f.name.toLowerCase().includes(selectedField.toLowerCase()) ||
                (f.description && f.description.toLowerCase().includes(selectedField.toLowerCase()))
            );
            if (fuzzy.length > 0) {
              if (!affectedFields.has(n.id)) affectedFields.set(n.id, []);
              fuzzy.forEach((f) =>
                affectedFields.get(n.id)!.push({
                  field: f.name,
                  transform: '字段名模糊匹配',
                  chain: [`${selectedNode?.name || ''}.${selectedField} ≈ ${n.name}.${f.name}`],
                })
              );
            }
          }
        });
      }
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
  }, [selectedNode, selectedField, getDownstreamNodes, getUpstreamNodes, getNodeById, selectedNodeId]);

  const batchImpactAnalysis = useMemo((): BatchImpactResult | null => {
    if (!selectedNode || batchSelectedFields.length === 0) return null;

    const perFieldDownstream = new Map<string, DataNode[]>();
    const nodeToFieldsMap = new Map<string, Set<string>>();
    const nodeToAffectedMap = new Map<string, PerFieldAffected[]>();
    const allDownstreamSet = new Set<string>();
    const reportSet = new Set<string>();
    const ownerSet = new Set<string>();

    for (const fieldName of batchSelectedFields) {
      const downstreamFields = getDownstreamFields(selectedNode.id, fieldName);
      const fieldDownstreamNodes: DataNode[] = [];
      const seenNodesForField = new Set<string>();

      for (const df of downstreamFields) {
        if (!seenNodesForField.has(df.node.id)) {
          seenNodesForField.add(df.node.id);
          fieldDownstreamNodes.push(df.node);
        }
        allDownstreamSet.add(df.node.id);
        if (df.node.type === 'report') {
          reportSet.add(df.node.id);
        }
        if (df.node.owner) {
          ownerSet.add(df.node.owner);
        }

        if (!nodeToFieldsMap.has(df.node.id)) {
          nodeToFieldsMap.set(df.node.id, new Set());
        }
        nodeToFieldsMap.get(df.node.id)!.add(fieldName);

        const chainEntry = `${selectedNode.name}.${fieldName}${df.transform ? ` →[${df.transform}]→ ` : ' → '}${df.node.name}.${df.field}`;

        let affectedArr = nodeToAffectedMap.get(df.node.id);
        if (!affectedArr) {
          affectedArr = [];
          nodeToAffectedMap.set(df.node.id, affectedArr);
        }

        const existing = affectedArr.find((a) => a.field === df.field);
        if (existing) {
          if (!existing.sourceFields.includes(fieldName)) {
            existing.sourceFields.push(fieldName);
          }
          existing.chain.push(chainEntry);
        } else {
          affectedArr.push({
            field: df.field,
            transform: df.transform,
            chain: [chainEntry],
            sourceFields: [fieldName],
          });
        }
      }

      const allNodeDownstream = getDownstreamNodes(selectedNode.id);
      for (const n of allNodeDownstream) {
        if (n.fields) {
          const fuzzy = n.fields.filter(
            (f) =>
              f.name.toLowerCase().includes(fieldName.toLowerCase()) ||
              (f.description && f.description.toLowerCase().includes(fieldName.toLowerCase()))
          );
          for (const f of fuzzy) {
            if (!seenNodesForField.has(n.id)) {
              seenNodesForField.add(n.id);
              fieldDownstreamNodes.push(n);
            }
            allDownstreamSet.add(n.id);
            if (n.type === 'report') reportSet.add(n.id);
            if (n.owner) ownerSet.add(n.owner);

            if (!nodeToFieldsMap.has(n.id)) {
              nodeToFieldsMap.set(n.id, new Set());
            }
            nodeToFieldsMap.get(n.id)!.add(fieldName);

            const chainEntry = `${selectedNode.name}.${fieldName} ≈ ${n.name}.${f.name}`;
            let affectedArr = nodeToAffectedMap.get(n.id);
            if (!affectedArr) {
              affectedArr = [];
              nodeToAffectedMap.set(n.id, affectedArr);
            }
            const existing = affectedArr.find((a) => a.field === f.name);
            if (existing) {
              if (!existing.sourceFields.includes(fieldName)) {
                existing.sourceFields.push(fieldName);
              }
              existing.chain.push(chainEntry);
            } else {
              affectedArr.push({
                field: f.name,
                transform: '字段名模糊匹配',
                chain: [chainEntry],
                sourceFields: [fieldName],
              });
            }
          }
        }
      }

      perFieldDownstream.set(fieldName, fieldDownstreamNodes);
    }

    const allDownstream: DataNode[] = [];
    for (const nid of allDownstreamSet) {
      const n = getNodeById(nid);
      if (n) allDownstream.push(n);
    }

    const affectedReports: DataNode[] = [];
    for (const rid of reportSet) {
      const r = getNodeById(rid);
      if (r) affectedReports.push(r);
    }

    const affectedOwners = Array.from(ownerSet);

    const affectedNodeIds = new Set(allDownstream.map((n) => n.id));
    const affectedTasks = tasks.filter((t) => {
      if (t.relatedNodeId && affectedNodeIds.has(t.relatedNodeId)) return true;
      if (t.relatedFields && t.relatedFields.some((rf) => batchSelectedFields.includes(rf))) return true;
      return false;
    }).map((t) => ({ id: t.id, title: t.title }));

    const highRiskFields = batchSelectedFields.filter((fn) => {
      const fi = getFieldInfo(fn);
      return isHighRiskField(fi);
    });

    let riskLevel: RiskLevel = 'low';
    const hasReports = affectedReports.length > 0;
    const hasHighRiskFields = highRiskFields.length > 0;
    if (hasReports || hasHighRiskFields) {
      riskLevel = 'high';
    } else if (allDownstream.length >= 3) {
      riskLevel = 'medium';
    }

    return {
      selectedFieldNames: [...batchSelectedFields],
      highRiskFields,
      allDownstream,
      affectedReports,
      affectedTasks,
      affectedOwners,
      riskLevel,
      nodeToFieldsMap,
      nodeToAffectedMap,
      totalDownstreamCount: allDownstream.length,
      perFieldDownstream,
    };
  }, [selectedNode, batchSelectedFields, getDownstreamFields, getDownstreamNodes, getNodeById, tasks]);

  const currentRiskLevel = useMemo((): RiskLevel => {
    if (evalMode === 'batch') {
      return batchImpactAnalysis?.riskLevel || impactAnalysis?.riskLevel || 'low';
    }
    return impactAnalysis?.riskLevel || 'low';
  }, [evalMode, batchImpactAnalysis, impactAnalysis]);

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

  const buildBatchTaskTitle = (): string => {
    if (!batchImpactAnalysis) return '';
    const { highRiskFields, selectedFieldNames } = batchImpactAnalysis;
    const otherCount = selectedFieldNames.length - highRiskFields.length;

    let highRiskPart = '';
    if (highRiskFields.length > 0) {
      if (highRiskFields.length < 3) {
        highRiskPart = highRiskFields
          .map((fn) => {
            const fi = getFieldInfo(fn);
            const prefix = getFieldPrefix(fi || { name: fn });
            return `${prefix}${fn}`;
          })
          .join(',');
      } else {
        const top3 = highRiskFields.slice(0, 3);
        const rest = highRiskFields.length - 3;
        highRiskPart =
          top3
            .map((fn) => {
              const fi = getFieldInfo(fn);
              const prefix = getFieldPrefix(fi || { name: fn });
              return `${prefix}${fn}`;
            })
            .join(',') + ` 还有${rest}个高风险`;
      }
    }

    let otherPart = '';
    if (otherCount > 0) {
      otherPart = ` + 其他 ${otherCount} 个字段`;
    }

    return `【批量下线】${highRiskPart}${otherPart} 整改处理`;
  };

  const buildBatchTaskDescription = (extraDesc?: string): string => {
    if (!batchImpactAnalysis || !selectedNode) return '';
    const { highRiskFields, selectedFieldNames, affectedReports, nodeToAffectedMap, riskLevel } = batchImpactAnalysis;

    const sortedFields = [
      ...highRiskFields,
      ...selectedFieldNames.filter((fn) => !highRiskFields.includes(fn)),
    ];

    let desc = '';

    desc += '⚠️ 高风险字段清单\n';
    desc += '========================\n';
    if (highRiskFields.length === 0) {
      desc += '（无高风险字段）\n';
    } else {
      for (const fn of highRiskFields) {
        const fi = getFieldInfo(fn);
        const tags: string[] = [];
        if (fi?.isKey) tags.push('主键');
        if (fi?.isSensitive) tags.push('敏感');
        desc += `  · ${getFieldPrefix(fi || { name: fn })}${fn}  [${selectedNode.name}]  (${tags.join('/')})\n`;
      }
    }
    desc += '\n';

    desc += '━━━━━━━━━━━━━━━━━━━━━━\n';
    desc += `批量下线影响评估报告（共 ${selectedFieldNames.length} 个字段）\n`;
    desc += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    desc += `- 选中字段数: ${selectedFieldNames.length}\n`;
    desc += `- 高风险字段数: ${highRiskFields.length}\n`;
    desc += `- 共同影响报表: ${affectedReports.map((r) => r.name).join(', ') || '无'}\n`;
    desc += `- 风险等级: ${riskLevel}\n\n`;

    desc += '--- 各字段影响详情（按风险排序）---\n';
    for (const fn of sortedFields) {
      const fi = getFieldInfo(fn);
      const tags: string[] = [];
      if (fi?.isKey) tags.push('主键');
      if (fi?.isSensitive) tags.push('敏感');
      const tagStr = tags.length > 0 ? ` [${tags.join('/')}]` : '';
      desc += `\n▶ 字段：${selectedNode.name}.${fn}${tagStr}\n`;

      let fieldNodeCount = 0;
      for (const [nid, affectedList] of nodeToAffectedMap.entries()) {
        const relevant = affectedList.filter((a) => a.sourceFields.includes(fn));
        if (relevant.length === 0) continue;
        fieldNodeCount++;
        const n = getNodeById(nid);
        if (fieldNodeCount === 1) desc += `  下游影响节点：\n`;
        desc += `  【${fieldNodeCount}】${n?.name || nid} (${typeLabels[n?.type || 'table']}):\n`;
        for (const rel of relevant) {
          desc += `    · ${rel.field}`;
          if (rel.transform) desc += ` [${rel.transform}]`;
          if (rel.chain && rel.chain.length > 0) {
            desc += `\n      血缘: ${rel.chain.join(' ← ')}`;
          }
          desc += '\n';
        }
      }
      if (fieldNodeCount === 0) {
        desc += `  （无直接下游字段级影响）\n`;
      }
    }

    if (extraDesc) {
      desc += `\n\n补充说明: ${extraDesc}`;
    }

    return desc;
  };

  const handleGenerateTask = () => {
    if (!selectedNode) return;

    if (evalMode === 'batch') {
      if (batchSelectedFields.length === 0) {
        message.warning('请先选择要下线的字段');
        return;
      }
      const risk = batchImpactAnalysis?.riskLevel || 'medium';
      const dueDays = risk === 'high' ? 3 : risk === 'medium' ? 7 : 14;
      genForm.setFieldsValue({
        priority: batchImpactAnalysis?.highRiskFields.length ? 'high' : risk,
        title: buildBatchTaskTitle(),
        relatedNodeId: selectedNode.id,
        dueDate: dayjs().add(dueDays, 'day'),
      });
    } else {
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
    }
    setGenerateOpen(true);
  };

  const handleGenSubmit = async () => {
    try {
      const values = await genForm.validateFields();
      if (selectedNode && impactAnalysis) {
        if (evalMode === 'batch' && batchImpactAnalysis) {
          const fullDesc = buildBatchTaskDescription(values.description);
          const priority =
            batchImpactAnalysis.highRiskFields.length > 0 ? 'high' : batchImpactAnalysis.riskLevel;
          const dueDays = priority === 'high' ? 3 : priority === 'medium' ? 7 : 14;
          addTask({
            title: values.title,
            description: fullDesc,
            priority,
            status: 'todo',
            relatedNodeId: selectedNode.id,
            relatedFields: [...batchSelectedFields],
            assignee: values.assignee,
            dueDate: values.dueDate ? values.dueDate.valueOf() : dayjs().add(dueDays, 'day').valueOf(),
          });
          message.success('已生成批量整改任务到任务清单');
          setGenerateOpen(false);
        } else {
          let fieldImpactDesc = '';
          if (selectedField && impactAnalysis.affectedFields.size > 0) {
            fieldImpactDesc = `\n\n--- 字段级影响详情（${selectedNode.name}.${selectedField} 下线影响）---\n`;
            let idx = 1;
            for (const [nid, list] of impactAnalysis.affectedFields.entries()) {
              const n = getNodeById(nid);
              fieldImpactDesc += `\n【${idx++}】${n?.name || nid} (${typeLabels[n?.type || 'table']}):\n`;
              list.forEach((fd) => {
                fieldImpactDesc += `  · ${fd.field}`;
                if (fd.transform) fieldImpactDesc += ` [${fd.transform}]`;
                if (fd.chain && fd.chain.length > 0) {
                  fieldImpactDesc += `\n    血缘: ${fd.chain.join(' ← ')}`;
                }
                fieldImpactDesc += '\n';
              });
            }
          }
          addTask({
            title: values.title,
            description: `${selectedNode.name} ${scenario} 影响评估：
- 影响节点数: ${impactAnalysis.totalAffected}
- 涉及报表: ${impactAnalysis.reports.map((r) => r.name).join(', ') || '无'}
- 涉及下游表: ${impactAnalysis.tables.map((t) => t.name).join(', ') || '无'}
- 风险等级: ${impactAnalysis.riskLevel}
${values.description ? `\n补充说明: ${values.description}` : ''}
${selectedField ? `\n变更字段: ${selectedNode.name}.${selectedField}` : ''}${fieldImpactDesc}`,
            priority: values.priority,
            status: 'todo',
            relatedNodeId: selectedNode.id,
            relatedFields: selectedField ? [selectedField] : undefined,
            assignee: values.assignee,
            dueDate: values.dueDate.valueOf(),
          });
          message.success('已生成整改任务到任务清单');
          setGenerateOpen(false);
        }
      }
    } catch (e) {
      // noop
    }
  };

  const buildDownstreamColumns = () => {
    const baseCols = [
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
    ];

    if (evalMode === 'batch' && batchImpactAnalysis) {
      baseCols.push({
        title: '受哪些选中字段影响',
        key: 'sourceFields',
        render: (_: unknown, record: DataNode) => {
          const fieldSet = batchImpactAnalysis.nodeToFieldsMap.get(record.id);
          if (!fieldSet || fieldSet.size === 0) return <>-</>;
          return (
            <Space wrap size={4}>
              {Array.from(fieldSet).map((fn) => {
                const fi = getFieldInfo(fn);
                const prefix = getFieldPrefix(fi || { name: fn });
                const isHR = isHighRiskField(fi);
                return (
                  <Tag
                    key={fn}
                    color={isHR ? 'red' : 'blue'}
                    style={{ fontSize: 11 }}
                  >
                    {prefix}{fn}
                  </Tag>
                );
              })}
            </Space>
          );
        },
      });
    }

    baseCols.push({
      title: '关联字段',
      key: 'fields',
      render: (_: unknown, record: DataNode) => {
        let fieldData;
        if (evalMode === 'batch' && batchImpactAnalysis) {
          fieldData = batchImpactAnalysis.nodeToAffectedMap.get(record.id);
        } else {
          fieldData = impactAnalysis?.affectedFields.get(record.id);
        }
        if (!fieldData || fieldData.length === 0) return <>-</>;
        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {fieldData.map((fd, idx) => (
              <div key={idx} style={{ lineHeight: 1.4 }}>
                <Space wrap>
                  <Tag color={fd.transform ? 'orange' : 'magenta'}>
                    {fd.field}
                  </Tag>
                  {fd.transform && (
                    <Tag color="geekblue" style={{ fontSize: 11 }}>
                      {fd.transform.length > 20 ? fd.transform.slice(0, 20) + '...' : fd.transform}
                    </Tag>
                  )}
                </Space>
              </div>
            ))}
          </Space>
        );
      },
    });

    baseCols.push({
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      render: (t: string) => (
        <span style={{ color: '#8c8c8c', fontSize: 12 }}>{t || '-'}</span>
      ),
    });

    return baseCols;
  };

  const renderStatsRow = () => {
    if (evalMode === 'batch' && batchImpactAnalysis) {
      return (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card className="stat-card table" size="small">
              <Statistic
                title="选中字段数"
                value={batchImpactAnalysis.selectedFieldNames.length}
                valueStyle={{ color: '#1677ff' }}
                prefix={<DatabaseOutlined />}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card className="stat-card report" size="small">
              <Statistic
                title="共同影响报表"
                value={batchImpactAnalysis.affectedReports.length}
                prefix={<BarChartOutlined />}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card className="stat-card script" size="small">
              <Statistic
                title="共同影响任务"
                value={batchImpactAnalysis.affectedTasks.length}
                valueStyle={{ color: '#fa8c16' }}
                prefix={<ThunderboltOutlined />}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card className="stat-card critical" size="small">
              <Statistic
                title="涉及负责人"
                value={batchImpactAnalysis.affectedOwners.length}
                valueStyle={{ color: '#722ed1' }}
                prefix={<TeamOutlined />}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Space>
                <div
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    background: riskConfig[batchImpactAnalysis.riskLevel].bg,
                    border: `1px solid ${riskConfig[batchImpactAnalysis.riskLevel].border}`,
                    color: riskConfig[batchImpactAnalysis.riskLevel].color,
                    fontWeight: 600,
                  }}
                >
                  <SafetyOutlined /> 风险等级：{riskConfig[batchImpactAnalysis.riskLevel].text}
                </div>
                <div style={{ flex: 1 }}>
                  <Progress
                    percent={riskConfig[batchImpactAnalysis.riskLevel].progress}
                    strokeColor={riskConfig[batchImpactAnalysis.riskLevel].color}
                    size="small"
                    showInfo={false}
                  />
                </div>
              </Space>
            </Card>
          </Col>
        </Row>
      );
    }

    return (
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card className="stat-card table" size="small">
            <Statistic title="下游影响节点" value={impactAnalysis?.totalAffected ?? 0} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card className="stat-card report" size="small">
            <Statistic title="涉及报表" value={impactAnalysis?.reports.length ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card className="stat-card script" size="small">
            <Statistic title="涉及脚本" value={impactAnalysis?.scripts.length ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card className="stat-card critical" size="small">
            <Statistic title="涉及关键节点" value={impactAnalysis?.critical.length ?? 0} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Space>
              <div
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  background: riskConfig[currentRiskLevel].bg,
                  border: `1px solid ${riskConfig[currentRiskLevel].border}`,
                  color: riskConfig[currentRiskLevel].color,
                  fontWeight: 600,
                }}
              >
                <SafetyOutlined /> 风险等级：{riskConfig[currentRiskLevel].text}
              </div>
              <div style={{ flex: 1 }}>
                <Progress
                  percent={riskConfig[currentRiskLevel].progress}
                  strokeColor={riskConfig[currentRiskLevel].color}
                  size="small"
                  showInfo={false}
                />
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    );
  };

  const renderHighRiskAlert = () => {
    const level = currentRiskLevel;
    if (level !== 'high') return null;

    if (evalMode === 'batch' && batchImpactAnalysis) {
      const hrf = batchImpactAnalysis.highRiskFields;
      return (
        <Alert
          type="error"
          showIcon
          icon={<WarningFilled />}
          message="高风险批量变更！"
          description={`本次批量下线包含 ${hrf.length} 个高风险字段（${hrf.join('、')}），将影响 ${batchImpactAnalysis.affectedReports.length} 个报表，需严格评估变更窗口并提前通知 ${batchImpactAnalysis.affectedOwners.length} 位负责人`}
          style={{ marginBottom: 16 }}
        />
      );
    }

    return (
      <Alert
        type="error"
        showIcon
        icon={<WarningFilled />}
        message="高风险变更！"
        description={`该变更将影响 ${impactAnalysis?.reports.length ?? 0} 个报表和 ${impactAnalysis?.critical.length ?? 0} 个关键指标节点，需要严格评估变更窗口，并提前通知相关业务方`}
        style={{ marginBottom: 16 }}
      />
    );
  };

  const renderDownstreamTable = () => {
    const dataSource =
      evalMode === 'batch'
        ? batchImpactAnalysis?.allDownstream || []
        : impactAnalysis?.downstream || [];

    const hasData = dataSource.length > 0;

    return (
      <Card
        size="small"
        title={
          <Space>
            <DownOutlined style={{ color: '#ff4d4f' }} />
            下游影响链路（{dataSource.length}）
          </Space>
        }
        styles={{ body: { padding: 8 } }}
      >
        <Table
          size="small"
          rowKey="id"
          dataSource={dataSource}
          columns={buildDownstreamColumns()}
          pagination={{ pageSize: 6 }}
          locale={{ emptyText: '无下游影响' }}
        />
        {!hasData && evalMode === 'batch' && batchSelectedFields.length > 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无下游影响" />
        )}
      </Card>
    );
  };

  const renderKeyReportsList = () => {
    if (evalMode === 'batch' && batchImpactAnalysis) {
      const reports = batchImpactAnalysis.affectedReports;
      const criticalNodes = batchImpactAnalysis.allDownstream.filter(
        (n) => n.isCritical && n.type !== 'report'
      );
      const combined = [...reports, ...criticalNodes];
      return (
        <Card
          size="small"
          title={
            <Space>
              <ExclamationCircleOutlined style={{ color: '#1677ff' }} />
              关键指标与报表详细清单
            </Space>
          }
        >
          {combined.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="未涉及关键指标和报表"
            />
          ) : (
            <List
              size="small"
              dataSource={combined}
              renderItem={(item) => (
                <div className={`impact-chain ${currentRiskLevel}`}>
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
      );
    }

    return (
      <Card
        size="small"
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#1677ff' }} />
            关键指标与报表详细清单
          </Space>
        }
      >
        {(!impactAnalysis || (impactAnalysis.reports.length === 0 && impactAnalysis.critical.length === 0)) ? (
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
    );
  };

  const isGenerateDisabled = useMemo(() => {
    if (!selectedNode) return true;
    if (evalMode === 'batch') {
      return batchSelectedFields.length === 0;
    }
    return false;
  }, [selectedNode, evalMode, batchSelectedFields.length]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="window-card">
        <div className="window-header">
          <WarningOutlined style={{ color: '#ff4d4f' }} />
          <span className="window-title">影响评估 - 模拟字段下线/变更</span>
          <div style={{ flex: 1 }} />
          <Button
            type="primary"
            danger={currentRiskLevel === 'high'}
            icon={<PlusOutlined />}
            onClick={handleGenerateTask}
            disabled={isGenerateDisabled}
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
                  onChange={handleNodeChange}
                  optionFilterProp="label"
                  size="large"
                  options={nodes.map((n) => ({
                    value: n.id,
                    label: `[${typeLabels[n.type]}] ${n.name}${n.isCritical ? ' ⚠️关键' : ''}`,
                  }))}
                />
              </Col>
              <Col span={4}>
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
              <Col span={4}>
                <div style={{ fontWeight: 500, marginBottom: 8, color: '#595959' }}>
                  评估模式
                </div>
                <Segmented
                  block
                  value={evalMode}
                  onChange={(v) => handleEvalModeChange(v as EvalMode)}
                  options={[
                    { value: 'single', label: '单字段评估' },
                    { value: 'batch', label: '批量字段下线' },
                  ]}
                  size="large"
                />
              </Col>
              <Col span={8}>
                <div style={{ fontWeight: 500, marginBottom: 8, color: '#595959' }}>
                  3. 选择具体字段{evalMode === 'batch' ? '（可多选）' : '（可选）'}
                </div>
                {evalMode === 'single' ? (
                  <Select
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    placeholder="字段级精确评估，不选则评估整个节点"
                    value={selectedField}
                    onChange={handleFieldChange}
                    size="large"
                    disabled={!selectedNode}
                    options={
                      selectedNode?.fields?.map((f) => ({
                        value: f.name,
                        label: getFieldLabel(f),
                      })) || []
                    }
                  />
                ) : (
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    placeholder="选择要下线的多个字段（可多选）"
                    value={batchSelectedFields}
                    onChange={handleBatchFieldsChange}
                    size="large"
                    disabled={!selectedNode}
                    maxTagCount="responsive"
                    tagRender={(props) => {
                      const { label, value, closable, onClose } = props;
                      const fi = selectedNode?.fields?.find((f) => f.name === value);
                      const isHR = isHighRiskField(fi);
                      return (
                        <Tag
                          closable={closable}
                          onClose={onClose}
                          color={isHR ? 'red' : 'blue'}
                          style={{ marginInlineEnd: 4 }}
                        >
                          {getFieldPrefix(fi || { name: value as string })}{label}
                        </Tag>
                      );
                    }}
                    options={
                      selectedNode?.fields?.map((f) => ({
                        value: f.name,
                        label: getFieldLabel(f),
                      })) || []
                    }
                  />
                )}
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
                    <li>可选择「单字段评估」或「批量字段下线」模式</li>
                    <li>批量模式支持多字段选择，主键/敏感字段会高亮标识</li>
                    <li>系统会自动递归分析所有下游依赖的节点</li>
                    <li>可评估风险等级并生成整改任务</li>
                    <li>报表和关键指标节点将触发高风险告警</li>
                  </ul>
                }
                style={{ maxWidth: 500, margin: '0 auto' }}
              />
            </Empty>
          ) : (
            <div>
              {renderStatsRow()}
              {renderHighRiskAlert()}

              <Row gutter={16}>
                <Col span={12}>
                  {renderDownstreamTable()}
                </Col>
                <Col span={12}>
                  {renderKeyReportsList()}
                  <Divider />
                  <Card
                    size="small"
                    title={
                      <Space>
                        <CheckCircleOutlined style={{ color: '#52c41a' }} />
                        上游依赖（{impactAnalysis?.upstream.length ?? 0}）
                      </Space>
                    }
                  >
                    {!impactAnalysis || impactAnalysis.upstream.length === 0 ? (
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
          )}
        </div>
      </div>

      <Modal
        title={<Space><ThunderboltOutlined />生成整改任务</Space>}
        open={generateOpen}
        onOk={handleGenSubmit}
        onCancel={() => setGenerateOpen(false)}
        okText="生成任务"
        width={evalMode === 'batch' ? 720 : 520}
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
          {evalMode === 'batch' && batchImpactAnalysis && batchImpactAnalysis.highRiskFields.length > 0 && (
            <Alert
              type="warning"
              showIcon
              icon={<WarningFilled />}
              message={`包含 ${batchImpactAnalysis.highRiskFields.length} 个高风险字段`}
              description={`主键/敏感字段：${batchImpactAnalysis.highRiskFields.join('、')}，优先级将自动设为 high，截止日期 3 天内`}
              style={{ marginBottom: 12 }}
            />
          )}
          <Alert
            type="info"
            showIcon
            message="系统会自动附加影响评估摘要"
            description={
              evalMode === 'batch'
                ? '包含高风险字段清单、各字段影响详情、血缘链路、影响报表等信息'
                : '包含影响节点数、涉及报表、风险等级等信息'
            }
          />
        </Form>
      </Modal>
    </div>
  );
}

export default ImpactPanel;
