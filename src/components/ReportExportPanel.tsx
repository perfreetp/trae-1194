import { useState, useMemo } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Tabs,
  Row,
  Col,
  Statistic,
  App as AntApp,
  Tag,
  Checkbox,
  Divider,
  Alert,
  List,
  Tree,
  Empty,
  Progress,
  Radio,
  Segmented,
  Avatar,
  Tooltip,
} from 'antd';
import {
  ExportOutlined,
  FileMarkdownOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  FileOutlined,
  SafetyOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  CodeOutlined,
  UserOutlined,
  PrinterOutlined,
  Html5Outlined,
  WarningOutlined,
  TeamOutlined,
  ApiOutlined,
  HistoryOutlined,
  SolutionOutlined,
  UnorderedListOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import { useLineageStore } from '../store/lineageStore';
import type { DataNode, NodeType, FieldInfo, TaskItem, Snapshot } from '../types';
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

type ExportMode = 'lineage' | 'businessImpact';
type ImpactSection = 'upstream' | 'owner' | 'fieldSource' | 'snapshot' | 'tasks';
type ImpactExportFormat = 'markdown' | 'html' | 'excel';

const DEFAULT_IMPACT_SECTIONS: ImpactSection[] = [
  'upstream',
  'owner',
  'fieldSource',
  'snapshot',
  'tasks',
];

const IMPACT_SECTION_LABELS: Record<ImpactSection, string> = {
  upstream: '上游加工链路',
  owner: '负责人信息',
  fieldSource: '字段来源追踪',
  snapshot: '最近快照变化',
  tasks: '相关整改任务',
};

function ReportExportPanel() {
  const {
    nodes,
    edges,
    snapshots,
    tasks,
    getUpstreamNodes,
    getDownstreamNodes,
    getFieldUpstream,
    getNodeById,
    compareSnapshots,
    exportData,
  } = useLineageStore();
  const { message } = AntApp.useApp();

  const [exportMode, setExportMode] = useState<ExportMode>('lineage');

  const [reportType, setReportType] = useState<'full' | 'node' | 'impact' | 'technical'>(
    'full'
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [includeFields, setIncludeFields] = useState(true);
  const [includeRelations, setIncludeRelations] = useState(true);
  const [includeTasks, setIncludeTasks] = useState(false);
  const [includeCritical, setIncludeCritical] = useState(true);
  const [selectedNodeTypes, setSelectedNodeTypes] = useState<NodeType[]>([
    'table',
    'file',
    'report',
    'script',
  ]);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json' | 'excel' | 'html'>(
    'markdown'
  );
  const [author, setAuthor] = useState('数据血缘分析器');
  const [title, setTitle] = useState('数据血缘分析报告');
  const [previewContent, setPreviewContent] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  const [impactNodeId, setImpactNodeId] = useState<string | undefined>(undefined);
  const [impactSections, setImpactSections] = useState<ImpactSection[]>(DEFAULT_IMPACT_SECTIONS);
  const [impactExportFormat, setImpactExportFormat] = useState<ImpactExportFormat>('markdown');

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  const impactNode = impactNodeId ? nodes.find((n) => n.id === impactNodeId) : null;

  const criticalOrReportNodes = useMemo(
    () => nodes.filter((n) => n.type === 'report' || n.isCritical),
    [nodes]
  );

  const stats = useMemo(
    () => ({
      totalNodes: nodes.length,
      totalEdges: edges.length,
      tables: nodes.filter((n) => n.type === 'table').length,
      files: nodes.filter((n) => n.type === 'file').length,
      reports: nodes.filter((n) => n.type === 'report').length,
      scripts: nodes.filter((n) => n.type === 'script').length,
      critical: nodes.filter((n) => n.isCritical).length,
      withOwner: nodes.filter((n) => n.owner).length,
      avgFields:
        nodes.filter((n) => n.fields?.length).length > 0
          ? Math.round(
              nodes.reduce((sum, n) => sum + (n.fields?.length || 0), 0) /
                nodes.filter((n) => n.fields?.length).length
            )
          : 0,
    }),
    [nodes, edges]
  );

  const getNodeLevelMap = (nodeId: string): Map<string, number> => {
    const levelMap = new Map<string, number>();
    const visited = new Set<string>();
    const queue: Array<{ id: string; level: number }> = [{ id: nodeId, level: 0 }];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      const incoming = edges.filter((e) => e.target === current.id);
      for (const edge of incoming) {
        if (!visited.has(edge.source)) {
          const nextLevel = current.level + 1;
          if (!levelMap.has(edge.source) || levelMap.get(edge.source)! > nextLevel) {
            levelMap.set(edge.source, nextLevel);
          }
          queue.push({ id: edge.source, level: nextLevel });
        }
      }
    }
    return levelMap;
  };

  const buildTreeData = () => {
    return nodes
      .filter((n) => selectedNodeTypes.includes(n.type))
      .map((n) => {
        const upstream = getUpstreamNodes(n.id);
        const downstream = getDownstreamNodes(n.id);
        const children = [];
        if (n.fields && n.fields.length > 0 && includeFields) {
          children.push({
            title: `字段 (${n.fields.length})`,
            key: `${n.id}-fields`,
            children: n.fields.map((f, i) => ({
              title: (
                <Space>
                  <code>{f.name}</code>
                  {f.type && <Tag color="blue">{f.type}</Tag>}
                  {f.isKey && <Tag color="red">PK</Tag>}
                  {f.description && (
                    <span style={{ color: '#8c8c8c' }}>{f.description}</span>
                  )}
                </Space>
              ),
              key: `${n.id}-f-${i}`,
            })),
          });
        }
        return {
          title: (
            <Space>
              {typeIcons[n.type]}
              <strong>{n.name}</strong>
              <Tag>{typeLabels[n.type]}</Tag>
              {n.isCritical && <Tag color="red">关键指标</Tag>}
              {n.owner && (
                <span style={{ color: '#8c8c8c' }}>
                  <UserOutlined /> {n.owner}
                </span>
              )}
            </Space>
          ),
          key: n.id,
          children,
        };
      });
  };

  const getLatestSnapshotChanges = (nodeId: string): {
    snapshot: Snapshot | null;
    summary: string[];
    addedFields: FieldInfo[];
    removedFields: FieldInfo[];
    changedFields: Array<{ name: string; props: string[] }>;
  } => {
    if (snapshots.length === 0) {
      return { snapshot: null, summary: [], addedFields: [], removedFields: [], changedFields: [] };
    }
    const sorted = [...snapshots].sort((a, b) => b.createdAt - a.createdAt);
    const latest = sorted[0];
    const currentNode = getNodeById(nodeId);
    const snapNode = latest.nodes.find((n) => n.id === nodeId);

    const summary: string[] = [];
    const addedFields: FieldInfo[] = [];
    const removedFields: FieldInfo[] = [];
    const changedFields: Array<{ name: string; props: string[] }> = [];

    if (!snapNode && currentNode) {
      summary.push(`节点「${currentNode.name}」在快照后新增`);
    } else if (snapNode && !currentNode) {
      summary.push(`节点「${snapNode.name}」在快照后被删除`);
    } else if (snapNode && currentNode) {
      const oldFields = snapNode.fields || [];
      const newFields = currentNode.fields || [];
      const oldFieldMap = new Map(oldFields.map((f) => [f.name, f]));
      const newFieldMap = new Map(newFields.map((f) => [f.name, f]));
      const oldNames = new Set(oldFields.map((f) => f.name));
      const newNames = new Set(newFields.map((f) => f.name));

      for (const f of newFields) {
        if (!oldNames.has(f.name)) addedFields.push(f);
      }
      for (const f of oldFields) {
        if (!newNames.has(f.name)) removedFields.push(f);
      }
      for (const f of newFields) {
        if (oldNames.has(f.name)) {
          const oldF = oldFieldMap.get(f.name)!;
          const changedProps: string[] = [];
          const allKeys = new Set([...Object.keys(oldF), ...Object.keys(f)]) as Set<keyof FieldInfo>;
          for (const key of allKeys) {
            if (JSON.stringify(oldF[key]) !== JSON.stringify(f[key])) {
              changedProps.push(key);
            }
          }
          if (changedProps.length > 0) {
            changedFields.push({ name: f.name, props: changedProps });
          }
        }
      }

      if (addedFields.length > 0) summary.push(`新增字段 ${addedFields.length} 个`);
      if (removedFields.length > 0) summary.push(`删除字段 ${removedFields.length} 个`);
      if (changedFields.length > 0) summary.push(`变更字段 ${changedFields.length} 个`);
      if (snapNode.owner !== currentNode.owner) {
        summary.push(`负责人变更：${snapNode.owner || '-'} → ${currentNode.owner || '-'}`);
      }
      if (snapNode.description !== currentNode.description) {
        summary.push(`描述信息已更新`);
      }
      if (summary.length === 0) {
        summary.push(`节点无变化`);
      }
    }

    return { snapshot: latest, summary, addedFields, removedFields, changedFields };
  };

  const getRelatedTasks = (nodeId: string): TaskItem[] => {
    return tasks.filter(
      (t) =>
        t.relatedNodeId === nodeId ||
        (t.relatedFields && t.relatedFields.length > 0 && getNodeById(nodeId)?.fields?.some((f) => t.relatedFields!.includes(f.name)))
    );
  };

  const getOwnerList = (node: DataNode): Array<{ owner: string; nodes: string[] }> => {
    const upstream = getUpstreamNodes(node.id);
    const allNodes = [node, ...upstream];
    const ownerMap = new Map<string, string[]>();
    for (const n of allNodes) {
      if (n.owner) {
        if (!ownerMap.has(n.owner)) ownerMap.set(n.owner, []);
        ownerMap.get(n.owner)!.push(n.name);
      }
    }
    return Array.from(ownerMap.entries()).map(([owner, nodeList]) => ({ owner, nodes: nodeList }));
  };

  const generateBusinessImpactMarkdown = (targetNode: DataNode): string => {
    const lines: string[] = [];
    const now = dayjs().format('YYYY年MM月DD日 HH:mm:ss');
    const includeUpstream = impactSections.includes('upstream');
    const includeOwner = impactSections.includes('owner');
    const includeFieldSource = impactSections.includes('fieldSource');
    const includeSnapshot = impactSections.includes('snapshot');
    const includeTasksSection = impactSections.includes('tasks');

    lines.push(`# ${targetNode.name} 业务影响说明书`);
    lines.push('');
    lines.push(`> 生成时间：${now}  `);
    lines.push(`> 生成人：${author}  `);
    lines.push('');

    lines.push('## 基本信息');
    lines.push('');
    lines.push(`- **节点类型**：${typeLabels[targetNode.type]}`);
    lines.push(`- **负责人**：${targetNode.owner || '-'}`);
    lines.push(`- **标签**：${targetNode.tags?.map((t) => `\`${t}\``).join('、') || '-'}`);
    lines.push(`- **描述**：${targetNode.description || '-'}`);
    if (targetNode.isCritical) {
      lines.push(`- **关键节点**：🚩 是（关键业务指标/报表）`);
    }
    lines.push('');

    if (includeUpstream) {
      lines.push('---');
      lines.push('');
      lines.push('## 一、上游血缘链路');
      lines.push('');
      const upstream = getUpstreamNodes(targetNode.id);
      const levelMap = getNodeLevelMap(targetNode.id);
      if (upstream.length === 0) {
        lines.push('> 无上游依赖（数据源节点）');
        lines.push('');
      } else {
        const sortedUpstream = [...upstream].sort(
          (a, b) => (levelMap.get(a.id) || 0) - (levelMap.get(b.id) || 0)
        );
        lines.push('| 层级 | 节点名 | 类型 | 负责人 | 更新时间 |');
        lines.push('| ---: | --- | --- | --- | --- |');
        sortedUpstream.forEach((n, idx) => {
          const level = levelMap.get(n.id) || (idx + 1);
          lines.push(
            `| L${level} | **${n.name}** | ${typeLabels[n.type]} | ${n.owner || '-'} | ${dayjs(n.updatedAt).format('YYYY-MM-DD HH:mm')} |`
          );
        });
        lines.push('');
        const chainText = [...sortedUpstream].reverse().map((u) => `**${u.name}**`).join(' → ');
        lines.push(`> 加工链路：${chainText} → **${targetNode.name}**`);
        lines.push('');
      }
    }

    if (includeFieldSource) {
      lines.push('---');
      lines.push('');
      lines.push('## 二、字段来源追踪');
      lines.push('');
      const fields = targetNode.fields || [];
      if (fields.length === 0) {
        lines.push('> 节点未定义字段');
        lines.push('');
      } else {
        lines.push('| 目标字段 | 转换逻辑 | 来源表 | 来源字段 | 口径说明 |');
        lines.push('| --- | --- | --- | --- | --- |');
        for (const f of fields) {
          const fieldUpstream = getFieldUpstream(targetNode.id, f.name);
          if (fieldUpstream.length === 0) {
            lines.push(
              `| \`${f.name}\` | 直接定义 | - | - | ${f.description?.replace(/\|/g, '\\|') || '-'} |`
            );
          } else {
            fieldUpstream.forEach((up, idx) => {
              const logic = up.transform || (idx === 0 ? '直接映射' : '间接传递');
              lines.push(
                `| ${idx === 0 ? `\`${f.name}\`` : ''} | ${logic} | ${up.node.name} | \`${up.field}\` | ${f.description?.replace(/\|/g, '\\|') || (idx === 0 ? '-' : '')} |`
              );
            });
          }
        }
        lines.push('');
      }
    }

    if (includeSnapshot) {
      lines.push('---');
      lines.push('');
      lines.push('## 三、最近一次快照变化');
      lines.push('');
      const changes = getLatestSnapshotChanges(targetNode.id);
      if (!changes.snapshot) {
        lines.push('> 暂无快照记录，无法对比变化');
        lines.push('');
      } else {
        lines.push(`> 快照名称：**${changes.snapshot.name}**，创建时间：${dayjs(changes.snapshot.createdAt).format('YYYY-MM-DD HH:mm:ss')}`);
        lines.push('');
        lines.push('### 变化摘要');
        lines.push('');
        changes.summary.forEach((s) => lines.push(`- ${s}`));
        lines.push('');
        if (changes.addedFields.length > 0) {
          lines.push('#### 新增字段');
          lines.push('');
          lines.push('| 字段名 | 类型 | 说明 |');
          lines.push('| --- | --- | --- |');
          changes.addedFields.forEach((f) => {
            lines.push(`| \`${f.name}\` | ${f.type || '-'} | ${f.description || '-'} |`);
          });
          lines.push('');
        }
        if (changes.removedFields.length > 0) {
          lines.push('#### 删除字段');
          lines.push('');
          lines.push('| 字段名 | 类型 | 说明 |');
          lines.push('| --- | --- | --- |');
          changes.removedFields.forEach((f) => {
            lines.push(`| ~~\`${f.name}\`~~ | ${f.type || '-'} | ${f.description || '-'} |`);
          });
          lines.push('');
        }
        if (changes.changedFields.length > 0) {
          lines.push('#### 变更字段');
          lines.push('');
          lines.push('| 字段名 | 变更属性 |');
          lines.push('| --- | --- |');
          changes.changedFields.forEach((c) => {
            lines.push(`| \`${c.name}\` | ${c.props.join('、')} |`);
          });
          lines.push('');
        }
      }
    }

    if (includeTasksSection) {
      lines.push('---');
      lines.push('');
      lines.push('## 四、相关整改任务');
      lines.push('');
      const relatedTasks = getRelatedTasks(targetNode.id);
      if (relatedTasks.length === 0) {
        lines.push('> 暂无关联整改任务');
        lines.push('');
      } else {
        lines.push('| 标题 | 优先级 | 状态 | 负责人 |');
        lines.push('| --- | --- | --- | --- |');
        const prMap = { high: '🔴 高', medium: '🟡 中', low: '🟢 低' };
        const stMap = { todo: '待处理', doing: '处理中', done: '✅ 完成' };
        relatedTasks.forEach((t) => {
          lines.push(
            `| ${t.title} | ${prMap[t.priority]} | ${stMap[t.status]} | ${t.assignee || '-'} |`
          );
        });
        lines.push('');
      }
    }

    if (includeOwner) {
      lines.push('---');
      lines.push('');
      lines.push('## 五、责任方清单');
      lines.push('');
      const owners = getOwnerList(targetNode);
      if (owners.length === 0) {
        lines.push('> 无负责人信息');
        lines.push('');
      } else {
        lines.push('| 序号 | 负责人 | 负责节点 |');
        lines.push('| ---: | --- | --- |');
        owners.forEach((o, i) => {
          lines.push(`| ${i + 1} | ${o.owner} | ${o.nodes.map((n) => `\`${n}\``).join('、')} |`);
        });
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
    lines.push('## 附录：完整字段清单');
    lines.push('');
    const fields = targetNode.fields || [];
    if (fields.length === 0) {
      lines.push('> 节点未定义字段');
      lines.push('');
    } else {
      lines.push('| 序号 | 字段名 | 类型 | 主键 | 敏感 | 业务规则 | 说明 |');
      lines.push('| ---: | --- | --- | --- | --- | --- | --- |');
      fields.forEach((f, i) => {
        lines.push(
          `| ${i + 1} | \`${f.name}\` | ${f.type || '-'} | ${f.isKey ? '✅' : '-'} | ${f.isSensitive ? '🔴' : '-'} | ${f.businessRule?.replace(/\|/g, '\\|') || '-'} | ${f.description?.replace(/\|/g, '\\|') || '-'} |`
        );
      });
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push(`> 📌 本报告由「数据血缘分析器」自动生成  `);
    lines.push(`> 生成时间：${now}`);

    return lines.join('\n');
  };

  const generateBusinessImpactHTML = (targetNode: DataNode): string => {
    const md = generateBusinessImpactMarkdown(targetNode);
    const includeUpstream = impactSections.includes('upstream');
    const includeSnapshot = impactSections.includes('snapshot');
    const changes = getLatestSnapshotChanges(targetNode.id);
    const hasChanges = changes.summary.length > 0 && changes.summary[0] !== '节点无变化';
    const hasHighRisk = targetNode.isCritical;
    const warningBanner = hasHighRisk
      ? `<div style="background: linear-gradient(135deg, #fff1f0 0%, #fff2e8 100%); border: 1px solid #ffa39e; border-radius: 12px; padding: 16px 20px; margin: 20px 0; display: flex; align-items: center; gap: 12px;">
           <div style="width: 48px; height: 48px; background: #ff4d4f; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">⚠️</div>
           <div>
             <div style="font-size: 16px; font-weight: 600; color: #cf1322;">关键业务节点</div>
             <div style="color: #873800; margin-top: 4px;">该节点为关键业务指标/报表，任何变更需严格评估业务影响</div>
           </div>
         </div>`
      : '';
    const riskBadge = hasHighRisk
      ? `<span style="background: #ff4d4f; color: white; padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; margin-left: 10px;">🔴 高风险</span>`
      : `<span style="background: #52c41a; color: white; padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; margin-left: 10px;">🟢 一般</span>`;

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${targetNode.name} 业务影响说明书</title>
<style>
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; max-width: 1080px; margin: 0 auto; padding: 40px 24px; line-height: 1.8; color: #1f2937; background: #f5f7fa; }
.page-container { background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
h1 { color: #1677ff; border-bottom: 3px solid #1677ff; padding-bottom: 16px; margin-top: 0; display: flex; align-items: center; }
h2 { color: #0958d9; margin-top: 40px; border-left: 5px solid #1677ff; padding-left: 16px; font-size: 22px; background: linear-gradient(90deg, #f0f7ff 0%, transparent 100%); padding-top: 8px; padding-bottom: 8px; border-radius: 0 8px 8px 0; }
h3 { color: #1d4ed8; margin-top: 24px; font-size: 18px; }
h4 { color: #1e40af; margin-top: 16px; font-size: 16px; }
code { background: #f3f4f6; padding: 2px 8px; border-radius: 6px; font-family: Consolas, Monaco, monospace; color: #dc2626; font-size: 13px; }
pre { background: #0f172a; color: #e2e8f0; padding: 20px; border-radius: 10px; overflow-x: auto; }
pre code { background: transparent; color: inherit; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
th { background: linear-gradient(135deg, #1677ff 0%, #0958d9 100%); color: white; padding: 12px 14px; text-align: left; font-weight: 500; font-size: 13px; }
td { padding: 10px 14px; border-bottom: 1px solid #f0f0f0; }
tr:nth-child(even) td { background: #fafbfc; }
tr:hover td { background: #f0f7ff; }
blockquote { border-left: 5px solid #1677ff; background: linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 100%); padding: 14px 20px; margin: 16px 0; color: #0958d9; border-radius: 0 10px 10px 0; }
hr { border: none; border-top: 1px dashed #d1d5db; margin: 32px 0; }
.tag { display: inline-block; padding: 2px 10px; border-radius: 6px; font-size: 12px; background: #eef2ff; color: #4338ca; margin: 0 4px; font-weight: 500; }
.tag-critical { background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; }
.info-card { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin: 16px 0; }
.info-row { display: flex; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; }
.info-row:last-child { border-bottom: none; }
.info-label { width: 120px; color: #64748b; font-weight: 500; flex-shrink: 0; }
.info-value { flex: 1; color: #0f172a; }
.metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 20px 0; }
.metric-card { background: linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%); border-radius: 12px; padding: 20px; border: 1px solid #bae6fd; }
.metric-value { font-size: 28px; font-weight: 700; color: #0369a1; }
.metric-label { font-size: 13px; color: #075985; margin-top: 4px; }
.danger-text { color: #dc2626; font-weight: 500; }
.warning-text { color: #d97706; font-weight: 500; }
.success-text { color: #059669; font-weight: 500; }
del { color: #9ca3af; text-decoration-thickness: 2px; }
.footer { text-align: center; padding-top: 32px; margin-top: 40px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 13px; }
</style>
</head>
<body>
<div class="page-container">
${warningBanner}
${mdToBusinessImpactHTML(md, riskBadge)}
<div class="footer">
  📌 本报告由「数据血缘分析器」自动生成 · ${dayjs().format('YYYY年MM月DD日 HH:mm:ss')}
</div>
</div>
</body>
</html>`;
    return html;
  };

  const mdToBusinessImpactHTML = (md: string, riskBadge: string): string => {
    let html = md;
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, (m, title) => `<h1>${title}${riskBadge}</h1>`);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul style="margin: 12px 0; padding-left: 24px;">${m}</ul>`);
    html = html.replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => `<td>${c.trim()}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    });
    html = html.replace(/(<tr>.*<\/tr>\n?)+/g, (m) => {
      if (m.includes('<th>') || m.includes('<td>---')) {
        return `<table>${m.replace(/<td>[-:]+<\/td>/g, '')}</table>`;
      }
      return `<table>${m}</table>`;
    });
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    return html;
  };

  const exportBusinessImpactExcel = async (targetNode: DataNode): Promise<void> => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const includeUpstream = impactSections.includes('upstream');
    const includeOwner = impactSections.includes('owner');
    const includeFieldSource = impactSections.includes('fieldSource');
    const includeSnapshot = impactSections.includes('snapshot');
    const includeTasksSection = impactSections.includes('tasks');

    const basicInfo = [
      { 项目: '节点名称', 内容: targetNode.name },
      { 项目: '节点类型', 内容: typeLabels[targetNode.type] },
      { 项目: '负责人', 内容: targetNode.owner || '-' },
      { 项目: '标签', 内容: targetNode.tags?.join('、') || '-' },
      { 项目: '是否关键节点', 内容: targetNode.isCritical ? '是' : '否' },
      { 项目: '描述', 内容: targetNode.description || '-' },
      { 项目: '创建时间', 内容: dayjs(targetNode.createdAt).format('YYYY-MM-DD HH:mm:ss') },
      { 项目: '更新时间', 内容: dayjs(targetNode.updatedAt).format('YYYY-MM-DD HH:mm:ss') },
      { 项目: '报告生成时间', 内容: dayjs().format('YYYY-MM-DD HH:mm:ss') },
      { 项目: '生成人', 内容: author },
    ];
    const owners = includeOwner ? getOwnerList(targetNode) : [];
    const ownerRows = owners.length > 0
      ? [
          { 项目: '', 内容: '' },
          { 项目: '【责任方清单】', 内容: '' },
          ...owners.flatMap((o, i) => [
            { 项目: `  ${i + 1}. 负责人`, 内容: o.owner },
            { 项目: `     负责节点`, 内容: o.nodes.join('；') },
          ]),
        ]
      : [];
    const ws1 = XLSX.utils.json_to_sheet([...basicInfo, ...ownerRows]);
    XLSX.utils.book_append_sheet(wb, ws1, '基本信息');

    if (includeUpstream) {
      const upstream = getUpstreamNodes(targetNode.id);
      const levelMap = getNodeLevelMap(targetNode.id);
      const sortedUpstream = [...upstream].sort(
        (a, b) => (levelMap.get(a.id) || 0) - (levelMap.get(b.id) || 0)
      );
      const ws2 = XLSX.utils.json_to_sheet(
        sortedUpstream.length === 0
          ? [{ 层级: '-', 节点名: '无上游依赖', 类型: '-', 负责人: '-', 更新时间: '-' }]
          : sortedUpstream.map((n, idx) => ({
              层级: `L${levelMap.get(n.id) || (idx + 1)}`,
              节点名: n.name,
              类型: typeLabels[n.type],
              负责人: n.owner || '',
              标签: n.tags?.join('、') || '',
              关键节点: n.isCritical ? '是' : '否',
              更新时间: dayjs(n.updatedAt).format('YYYY-MM-DD HH:mm:ss'),
              描述: n.description || '',
            }))
      );
      XLSX.utils.book_append_sheet(wb, ws2, '上游血缘节点');
    }

    if (includeFieldSource) {
      const fields = targetNode.fields || [];
      const fieldSourceRows: any[] = [];
      if (fields.length === 0) {
        fieldSourceRows.push({ 目标字段: '-', 转换逻辑: '节点未定义字段', 来源表: '-', 来源字段: '-', 口径说明: '-' });
      } else {
        for (const f of fields) {
          const fieldUpstream = getFieldUpstream(targetNode.id, f.name);
          if (fieldUpstream.length === 0) {
            fieldSourceRows.push({
              目标字段: f.name,
              字段类型: f.type || '',
              转换逻辑: '直接定义',
              来源表: '-',
              来源字段: '-',
              口径说明: f.description || '',
            });
          } else {
            fieldUpstream.forEach((up, idx) => {
              fieldSourceRows.push({
                目标字段: idx === 0 ? f.name : '',
                字段类型: idx === 0 ? (f.type || '') : '',
                转换逻辑: up.transform || (idx === 0 ? '直接映射' : '间接传递'),
                来源表: up.node.name,
                来源字段: up.field,
                口径说明: idx === 0 ? (f.description || '') : '',
              });
            });
          }
        }
      }
      const ws3 = XLSX.utils.json_to_sheet(fieldSourceRows);
      XLSX.utils.book_append_sheet(wb, ws3, '字段来源追踪');
    }

    if (includeSnapshot) {
      const changes = getLatestSnapshotChanges(targetNode.id);
      const snapshotRows: any[] = [];
      if (!changes.snapshot) {
        snapshotRows.push({ 项目: '快照信息', 内容: '暂无快照记录' });
      } else {
        snapshotRows.push({ 项目: '快照名称', 内容: changes.snapshot.name });
        snapshotRows.push({ 项目: '快照描述', 内容: changes.snapshot.description || '-' });
        snapshotRows.push({ 项目: '快照创建时间', 内容: dayjs(changes.snapshot.createdAt).format('YYYY-MM-DD HH:mm:ss') });
        snapshotRows.push({ 项目: '', 内容: '' });
        snapshotRows.push({ 项目: '【变化摘要】', 内容: '' });
        changes.summary.forEach((s, i) => {
          snapshotRows.push({ 项目: `  ${i + 1}.`, 内容: s });
        });
        if (changes.addedFields.length > 0) {
          snapshotRows.push({ 项目: '', 内容: '' });
          snapshotRows.push({ 项目: '【新增字段】', 内容: '' });
          changes.addedFields.forEach((f) => {
            snapshotRows.push({ 项目: `  字段名：${f.name}`, 内容: `类型：${f.type || '-'}，说明：${f.description || '-'}` });
          });
        }
        if (changes.removedFields.length > 0) {
          snapshotRows.push({ 项目: '', 内容: '' });
          snapshotRows.push({ 项目: '【删除字段】', 内容: '' });
          changes.removedFields.forEach((f) => {
            snapshotRows.push({ 项目: `  字段名：${f.name}`, 内容: `类型：${f.type || '-'}，说明：${f.description || '-'}` });
          });
        }
        if (changes.changedFields.length > 0) {
          snapshotRows.push({ 项目: '', 内容: '' });
          snapshotRows.push({ 项目: '【变更字段】', 内容: '' });
          changes.changedFields.forEach((c) => {
            snapshotRows.push({ 项目: `  字段名：${c.name}`, 内容: `变更属性：${c.props.join('、')}` });
          });
        }
      }
      const ws4 = XLSX.utils.json_to_sheet(snapshotRows);
      XLSX.utils.book_append_sheet(wb, ws4, '最近快照变化');
    }

    if (includeTasksSection) {
      const relatedTasks = getRelatedTasks(targetNode.id);
      const ws5 = XLSX.utils.json_to_sheet(
        relatedTasks.length === 0
          ? [{ 标题: '暂无关联整改任务', 优先级: '-', 状态: '-', 负责人: '-', 描述: '-', 创建时间: '-', 截止日期: '-' }]
          : relatedTasks.map((t) => ({
              标题: t.title,
              优先级: { high: '高', medium: '中', low: '低' }[t.priority],
              状态: { todo: '待处理', doing: '处理中', done: '完成' }[t.status],
              负责人: t.assignee || '',
              描述: t.description || '',
              关联字段: t.relatedFields?.join('、') || '',
              创建时间: dayjs(t.createdAt).format('YYYY-MM-DD HH:mm:ss'),
              截止日期: t.dueDate ? dayjs(t.dueDate).format('YYYY-MM-DD') : '',
            }))
      );
      XLSX.utils.book_append_sheet(wb, ws5, '相关整改任务');
    }

    const fields = targetNode.fields || [];
    const ws6 = XLSX.utils.json_to_sheet(
      fields.length === 0
        ? [{ 序号: '-', 字段名: '节点未定义字段', 类型: '-', 主键: '-', 敏感: '-', 业务规则: '-', 说明: '-' }]
        : fields.map((f, i) => ({
            序号: i + 1,
            字段名: f.name,
            类型: f.type || '',
            主键: f.isKey ? '是' : '否',
            敏感字段: f.isSensitive ? '是' : '否',
            业务规则: f.businessRule || '',
            说明: f.description || '',
          }))
    );
    XLSX.utils.book_append_sheet(wb, ws6, '完整字段清单');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileName = `${targetNode.name}_业务影响说明书_${dayjs().format('YYYYMMDD')}.xlsx`;
    saveBlob(blob, fileName);
  };

  const generateMarkdownReport = (): string => {
    const lines: string[] = [];
    const now = dayjs().format('YYYY年MM月DD日 HH:mm:ss');

    lines.push(`# ${title}`);
    lines.push('');
    lines.push(`> 生成时间：${now}  `);
    lines.push(`> 生成人：${author}  `);
    lines.push(
      `> 数据概览：节点 ${stats.totalNodes} 个，关系 ${stats.totalEdges} 条，关键指标 ${stats.critical} 个`
    );
    lines.push('');
    lines.push('---');
    lines.push('');

    lines.push('## 1. 概览统计');
    lines.push('');
    lines.push('| 指标 | 数量 | 说明 |');
    lines.push('| --- | ---: | --- |');
    lines.push(`| 数据表 | ${stats.tables} | 物理表/虚拟表 |`);
    lines.push(`| 报表看板 | ${stats.reports} | 业务报表/指标看板 |`);
    lines.push(`| 加工脚本 | ${stats.scripts} | SQL/Python 加工任务 |`);
    lines.push(`| 数据文件 | ${stats.files} | CSV/Excel 等离线文件 |`);
    lines.push(`| 关键指标 | ${stats.critical} | 标记为关键的节点 |`);
    lines.push(`| 血缘关系 | ${stats.totalEdges} | 上下游依赖总数 |`);
    lines.push(`| 平均字段数 | ${stats.avgFields} | 已定义字段的节点平均 |`);
    lines.push('');

    if (reportType === 'full' || reportType === 'node') {
      lines.push('---');
      lines.push('');
      lines.push('## 2. 数据节点清单');
      lines.push('');

      const filtered = nodes.filter((n) => selectedNodeTypes.includes(n.type));
      const byType: Record<string, DataNode[]> = {};
      filtered.forEach((n) => {
        if (!byType[n.type]) byType[n.type] = [];
        byType[n.type].push(n);
      });

      (['table', 'report', 'script', 'file'] as NodeType[]).forEach((type) => {
        const list = byType[type];
        if (!list || list.length === 0) return;
        lines.push(`### 2.${Object.keys(byType).indexOf(type) + 1} ${typeLabels[type]} (${list.length})`);
        lines.push('');
        lines.push('| 名称 | 负责人 | 标签 | 字段数 | 说明 |');
        lines.push('| --- | --- | --- | ---:| --- |');
        list.forEach((n) => {
          lines.push(
            `| ${n.isCritical ? '🚩 ' : ''}**${n.name}** | ${n.owner || '-'} | ${
              n.tags?.map((t) => `\`${t}\``).join(' ') || '-'
            } | ${n.fields?.length || 0} | ${n.description?.replace(/\|/g, '\\|') || '-'} |`
          );
        });
        lines.push('');
      });

      if (includeFields) {
        lines.push('---');
        lines.push('');
        lines.push('## 3. 字段级血缘说明');
        lines.push('');
        filtered
          .filter((n) => n.fields && n.fields.length > 0)
          .forEach((n) => {
            lines.push(`### 3.x ${n.name} 字段定义`);
            lines.push('');
            lines.push('| 序号 | 字段名 | 类型 | 主键 | 说明 |');
            lines.push('| ---:| --- | --- | --- | --- |');
            n.fields!.forEach((f, i) => {
              lines.push(
                `| ${i + 1} | \`${f.name}\` | ${f.type || '-'} | ${
                  f.isKey ? '✅' : '-'
                } | ${f.description?.replace(/\|/g, '\\|') || '-'} |`
              );
            });
            lines.push('');

            const downstream = getDownstreamNodes(n.id);
            if (downstream.length > 0) {
              lines.push(`> 下游影响：${downstream.map((d) => `**${d.name}**`).join(' → ')}`);
              lines.push('');
            }
          });
      }
    }

    if (reportType === 'full' || reportType === 'technical') {
      lines.push('---');
      lines.push('');
      lines.push('## 4. 血缘关系链路');
      lines.push('');
      lines.push('### 4.1 关键指标链路追踪');
      lines.push('');
      const criticals = nodes.filter((n) => n.isCritical);
      criticals.forEach((c) => {
        const upstream = getUpstreamNodes(c.id);
        lines.push(`#### ${c.name}`);
        lines.push('');
        if (upstream.length > 0) {
          const chain = [...upstream]
            .reverse()
            .map((u) => `**${u.name}**`);
          chain.push(`**${c.name}**`);
          lines.push(chain.join(' → '));
        } else {
          lines.push(`无上游依赖（数据源节点）`);
        }
        lines.push('');
        lines.push(`- 负责人：${c.owner || '-'}`);
        lines.push(`- 说明：${c.description || '-'}`);
        lines.push('');
      });
    }

    if (includeTasks && tasks.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## 5. 整改任务清单');
      lines.push('');
      lines.push('| 优先级 | 标题 | 负责人 | 状态 | 截止日期 |');
      lines.push('| --- | --- | --- | --- | --- |');
      tasks.forEach((t) => {
        const prMap = { high: '🔴 高', medium: '🟡 中', low: '🟢 低' };
        const stMap = { todo: '待处理', doing: '处理中', done: '✅完成' };
        lines.push(
          `| ${prMap[t.priority]} | ${t.title} | ${t.assignee || '-'} | ${stMap[t.status]} | ${
            t.dueDate ? dayjs(t.dueDate).format('YYYY-MM-DD') : '-'
          } |`
        );
      });
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('> 📌 本报告由「数据血缘分析器」自动生成  ');
    lines.push(`> 生成时间：${now}`);

    return lines.join('\n');
  };

  const generateHTMLReport = (): string => {
    const md = generateMarkdownReport();
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; max-width: 960px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #1f2937; }
h1 { color: #1677ff; border-bottom: 2px solid #1677ff; padding-bottom: 12px; }
h2 { color: #0958d9; margin-top: 36px; border-left: 4px solid #1677ff; padding-left: 12px; }
h3 { color: #1d4ed8; margin-top: 24px; }
code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: Consolas, Monaco, monospace; color: #dc2626; }
table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px; }
th { background: #f0f7ff; padding: 10px 12px; border: 1px solid #bae0ff; text-align: left; }
td { padding: 8px 12px; border: 1px solid #e5e7eb; }
tr:nth-child(even) { background: #fafafa; }
blockquote { border-left: 4px solid #1677ff; background: #f0f7ff; padding: 12px 20px; margin: 16px 0; color: #0958d9; border-radius: 0 8px 8px 0; }
hr { border: none; border-top: 1px dashed #d1d5db; margin: 28px 0; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; background: #eef2ff; color: #4338ca; margin: 0 2px; }
</style>
</head>
<body>
${mdToHTML(md)}
</body>
</html>`;
    return html;
  };

  const mdToHTML = (md: string): string => {
    let html = md;
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
    html = html.replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => `<td>${c.trim()}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    });
    html = html.replace(/(<tr>.*<\/tr>\n?)+/g, (m) => `<table>${m}</table>`);
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = html.replace(/\n/g, '<br/>');
    return `<p>${html}</p>`;
  };

  const handleGeneratePreview = () => {
    setIsGenerating(true);
    setTimeout(() => {
      if (exportMode === 'businessImpact') {
        if (!impactNode) {
          message.warning('请先选择一个关键报表/节点');
          setIsGenerating(false);
          return;
        }
        if (impactExportFormat === 'excel') {
          setPreviewContent('Excel 格式将在导出时生成，此处预览 Markdown 内容。\n\n' + generateBusinessImpactMarkdown(impactNode));
        } else if (impactExportFormat === 'html') {
          setPreviewContent(generateBusinessImpactHTML(impactNode));
        } else {
          setPreviewContent(generateBusinessImpactMarkdown(impactNode));
        }
      } else {
        if (exportFormat === 'markdown' || exportFormat === 'html') {
          setPreviewContent(
            exportFormat === 'html' ? generateHTMLReport() : generateMarkdownReport()
          );
        } else if (exportFormat === 'json') {
          setPreviewContent(
            JSON.stringify(
              {
                title,
                author,
                generatedAt: Date.now(),
                stats,
                nodes: nodes.filter((n) => selectedNodeTypes.includes(n.type)),
                edges: includeRelations ? edges : undefined,
                tasks: includeTasks ? tasks : undefined,
              },
              null,
              2
            )
          );
        } else {
          setPreviewContent('Excel 格式将在导出时生成，此处预览摘要数据。\n\n' + generateMarkdownReport());
        }
      }
      setIsGenerating(false);
      message.success('报告已生成预览');
    }, 500);
  };

  const handleExport = async () => {
    if (exportMode === 'businessImpact') {
      if (!impactNode) {
        message.warning('请先选择一个关键报表/节点');
        return;
      }
      const baseFileName = `${impactNode.name}_业务影响说明书_${dayjs().format('YYYYMMDD')}`;
      try {
        if (impactExportFormat === 'excel') {
          await exportBusinessImpactExcel(impactNode);
          message.success('业务影响说明书 (Excel) 已导出');
          return;
        }
        let content = '';
        let fileName = baseFileName;
        let type = 'text/plain';
        if (impactExportFormat === 'markdown') {
          content = generateBusinessImpactMarkdown(impactNode);
          fileName += '.md';
          type = 'text/markdown';
        } else {
          content = generateBusinessImpactHTML(impactNode);
          fileName += '.html';
          type = 'text/html';
        }
        const blob = new Blob([content], { type: `${type};charset=utf-8` });
        saveBlob(blob, fileName);
        message.success(`业务影响说明书已导出：${fileName}`);
      } catch (e) {
        message.error('导出失败：' + (e instanceof Error ? e.message : String(e)));
      }
      return;
    }

    let fileName = `${title}_${dayjs().format('YYYYMMDD')}`;
    let content = '';
    let type = 'text/plain';

    switch (exportFormat) {
      case 'markdown':
        content = generateMarkdownReport();
        fileName += '.md';
        type = 'text/markdown';
        break;
      case 'html':
        content = generateHTMLReport();
        fileName += '.html';
        type = 'text/html';
        break;
      case 'json':
        content = JSON.stringify(
          {
            title,
            author,
            generatedAt: Date.now(),
            stats,
            exportData: exportData(),
            tasks: includeTasks ? tasks : undefined,
            snapshots,
          },
          null,
          2
        );
        fileName += '.json';
        type = 'application/json';
        break;
      case 'excel':
        try {
          const XLSX = await import('xlsx');
          const wb = XLSX.utils.book_new();
          const ws1 = XLSX.utils.json_to_sheet(
            nodes
              .filter((n) => selectedNodeTypes.includes(n.type))
              .map((n) => ({
                名称: n.name,
                类型: typeLabels[n.type],
                负责人: n.owner || '',
                标签: n.tags?.join(',') || '',
                字段数: n.fields?.length || 0,
                关键指标: n.isCritical ? '是' : '否',
                说明: n.description || '',
                上游: getUpstreamNodes(n.id).map((u) => u.name).join(';'),
                下游: getDownstreamNodes(n.id).map((d) => d.name).join(';'),
              }))
          );
          XLSX.utils.book_append_sheet(wb, ws1, '数据节点');
          if (includeRelations) {
            const ws2 = XLSX.utils.json_to_sheet(
              edges.map((e) => ({
                源节点: getNodeName(e.source),
                源字段: e.sourceField || '',
                目标节点: getNodeName(e.target),
                目标字段: e.targetField || '',
                关系类型: e.type || 'direct',
                转换逻辑: e.transformLogic || '',
              }))
            );
            XLSX.utils.book_append_sheet(wb, ws2, '血缘关系');
          }
          if (includeTasks) {
            const ws3 = XLSX.utils.json_to_sheet(
              tasks.map((t) => ({
                优先级: { high: '高', medium: '中', low: '低' }[t.priority],
                标题: t.title,
                描述: t.description || '',
                状态: { todo: '待处理', doing: '处理中', done: '完成' }[t.status],
                负责人: t.assignee || '',
                截止日期: t.dueDate ? dayjs(t.dueDate).format('YYYY-MM-DD') : '',
              }))
            );
            XLSX.utils.book_append_sheet(wb, ws3, '任务清单');
          }
          const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([excelBuffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });
          saveBlob(blob, fileName + '.xlsx');
          message.success('Excel 报告已导出');
          return;
        } catch (e) {
          message.warning('Excel 导出失败，降级为 Markdown 导出');
          content = generateMarkdownReport();
          fileName += '.md';
        }
        break;
    }

    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    saveBlob(blob, fileName);
    message.success(`报告已导出：${fileName}`);
  };

  const getNodeName = (id: string): string => nodes.find((n) => n.id === id)?.name || id;

  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const iconMap = {
    markdown: <FileMarkdownOutlined />,
    json: <FileTextOutlined />,
    excel: <FileExcelOutlined />,
    html: <Html5Outlined />,
  };
  const labelMap = {
    markdown: 'Markdown',
    json: 'JSON',
    excel: 'Excel',
    html: 'HTML',
  };
  const impactIconMap: Record<ImpactExportFormat, React.ReactNode> = {
    markdown: <FileMarkdownOutlined />,
    excel: <FileExcelOutlined />,
    html: <Html5Outlined />,
  };
  const impactLabelMap: Record<ImpactExportFormat, string> = {
    markdown: 'Markdown',
    excel: 'Excel',
    html: 'HTML',
  };

  const renderLineageConfig = () => (
    <Row gutter={16}>
      <Col span={9}>
        <Card size="small" title="基础信息">
          <Form layout="vertical">
            <Form.Item label="报告标题">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Form.Item>
            <Form.Item label="生成人/团队">
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </Form.Item>
            <Form.Item label="报告类型">
              <Segmented
                block
                value={reportType}
                onChange={(v) => setReportType(v as any)}
                options={[
                  { value: 'full', label: '完整报告' },
                  { value: 'node', label: '节点清单' },
                  { value: 'impact', label: '血缘链路' },
                  { value: 'technical', label: '技术文档' },
                ]}
              />
            </Form.Item>
            <Form.Item label="导出格式">
              <Radio.Group
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  {(Object.keys(iconMap) as Array<keyof typeof iconMap>).map((k) => (
                    <Radio.Button key={k} value={k} style={{ width: '100%', textAlign: 'left', padding: '6px 12px' }}>
                      <Space>
                        {iconMap[k]} <strong>{labelMap[k]}</strong>
                      </Space>
                    </Radio.Button>
                  ))}
                </Space>
              </Radio.Group>
            </Form.Item>
          </Form>
        </Card>

        <Card size="small" title="包含内容" style={{ marginTop: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Checkbox
              checked={includeFields}
              onChange={(e) => setIncludeFields(e.target.checked)}
            >
              字段定义与说明
            </Checkbox>
            <Checkbox
              checked={includeRelations}
              onChange={(e) => setIncludeRelations(e.target.checked)}
            >
              详细血缘关系
            </Checkbox>
            <Checkbox
              checked={includeCritical}
              onChange={(e) => setIncludeCritical(e.target.checked)}
            >
              高亮关键指标
            </Checkbox>
            <Checkbox
              checked={includeTasks}
              onChange={(e) => setIncludeTasks(e.target.checked)}
            >
              整改任务清单 ({tasks.length})
            </Checkbox>
            <Divider style={{ margin: '4px 0' }} />
            <div style={{ fontSize: 12, color: '#595959' }}>包含节点类型：</div>
            <Checkbox.Group
              value={selectedNodeTypes}
              onChange={(v) => setSelectedNodeTypes(v as any)}
              options={[
                { label: '数据表', value: 'table' },
                { label: '报表', value: 'report' },
                { label: '脚本', value: 'script' },
                { label: '文件', value: 'file' },
              ]}
            />
          </Space>
        </Card>
      </Col>

      <Col span={15}>
        <Card size="small" title="数据概览" style={{ marginBottom: 12 }}>
          <Row gutter={[12, 12]}>
            <Col span={6}>
              <div className="stat-card table">
                <div className="stat-value">{stats.tables}</div>
                <div className="stat-label">数据表</div>
              </div>
            </Col>
            <Col span={6}>
              <div className="stat-card report">
                <div className="stat-value">{stats.reports}</div>
                <div className="stat-label">报表看板</div>
              </div>
            </Col>
            <Col span={6}>
              <div className="stat-card script">
                <div className="stat-value">{stats.scripts}</div>
                <div className="stat-label">加工脚本</div>
              </div>
            </Col>
            <Col span={6}>
              <div className="stat-card edge">
                <div className="stat-value">{stats.totalEdges}</div>
                <div className="stat-label">血缘关系</div>
              </div>
            </Col>
          </Row>
          <Alert
            type="success"
            showIcon
            style={{ marginTop: 12 }}
            message={
              <Space>
                <CheckCircleOutlined />
                已收集
                <Tag color="red">{stats.critical} 关键指标</Tag>
                <Tag color="blue">{stats.withOwner}/{stats.totalNodes} 已指派负责人</Tag>
                <Tag color="cyan">平均 {stats.avgFields} 字段/节点</Tag>
              </Space>
            }
          />
        </Card>

        <Card
          size="small"
          title="报告结构预览"
          extra={
            <Button size="small" onClick={handleGeneratePreview} loading={isGenerating}>
              {iconMap[exportFormat]} 生成预览
            </Button>
          }
        >
          {!previewContent ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="点击「生成预览」查看完整报告内容"
              style={{ padding: 40 }}
            />
          ) : (
            <pre
              className="code-block"
              style={{ maxHeight: 520, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
            >
              {previewContent.slice(0, 10000)}
              {previewContent.length > 10000 && (
                <span style={{ color: '#faad14' }}>
                  {'\n\n'}... 报告过长（{previewContent.length}字符），完整内容请导出文件查看
                </span>
              )}
            </pre>
          )}
        </Card>
      </Col>
    </Row>
  );

  const renderBusinessImpactConfig = () => {
    const nodeOptions = criticalOrReportNodes.map((n) => ({
      value: n.id,
      label: (
        <Space>
          {typeIcons[n.type]}
          <span>{n.name}</span>
          <Tag color={n.type === 'report' ? 'blue' : 'red'}>
            {n.type === 'report' ? '报表' : '关键'}
          </Tag>
          {n.owner && <span style={{ color: '#8c8c8c' }}>{n.owner}</span>}
        </Space>
      ),
    }));
    return (
      <Row gutter={16}>
        <Col span={9}>
          <Card size="small" title="选择目标节点">
            <Form layout="vertical">
              <Form.Item
                label={
                  <Space>
                    <ApartmentOutlined /> 关键报表/节点
                    <Tag color="geekblue" style={{ marginLeft: 0 }}>
                      共 {criticalOrReportNodes.length} 个
                    </Tag>
                  </Space>
                }
                required
                tooltip="仅展示报表类型或标记为关键指标的节点"
              >
                <Select
                  showSearch
                  placeholder="请选择要分析的报表/关键节点"
                  optionFilterProp="label"
                  value={impactNodeId}
                  onChange={(v) => setImpactNodeId(v)}
                  options={nodeOptions}
                  style={{ width: '100%' }}
                  size="large"
                  allowClear
                  listHeight={400}
                />
              </Form.Item>
              {impactNode && (
                <Alert
                  type={impactNode.isCritical ? 'warning' : 'info'}
                  showIcon
                  icon={impactNode.isCritical ? <WarningOutlined /> : <BarChartOutlined />}
                  style={{ marginTop: 4, marginBottom: 8 }}
                  message={
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Space>
                        <strong>{impactNode.name}</strong>
                        <Tag>{typeLabels[impactNode.type]}</Tag>
                        {impactNode.isCritical && <Tag color="red">关键指标</Tag>}
                      </Space>
                      {impactNode.owner && (
                        <span style={{ fontSize: 12 }}>
                          <UserOutlined /> {impactNode.owner}
                        </span>
                      )}
                      {impactNode.description && (
                        <span style={{ fontSize: 12, color: '#595959' }}>
                          {impactNode.description}
                        </span>
                      )}
                    </Space>
                  }
                />
              )}
            </Form>
          </Card>

          <Card
            size="small"
            title={
              <Space>
                <UnorderedListOutlined /> 影响范围选项
              </Space>
            }
            style={{ marginTop: 12 }}
          >
            <Checkbox.Group
              value={impactSections}
              onChange={(v) => setImpactSections(v as ImpactSection[])}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {(['upstream', 'fieldSource', 'owner', 'snapshot', 'tasks'] as ImpactSection[]).map(
                  (sec) => (
                    <Checkbox key={sec} value={sec}>
                      <Space>
                        {sec === 'upstream' && <ApiOutlined />}
                        {sec === 'fieldSource' && <DatabaseOutlined />}
                        {sec === 'owner' && <TeamOutlined />}
                        {sec === 'snapshot' && <HistoryOutlined />}
                        {sec === 'tasks' && <SolutionOutlined />}
                        <strong>{IMPACT_SECTION_LABELS[sec]}</strong>
                      </Space>
                    </Checkbox>
                  )
                )}
              </Space>
            </Checkbox.Group>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button
                type="link"
                size="small"
                onClick={() => setImpactSections(DEFAULT_IMPACT_SECTIONS)}
              >
                全选
              </Button>
              <Button
                type="link"
                size="small"
                onClick={() => setImpactSections([])}
              >
                清空
              </Button>
            </div>
          </Card>

          <Card
            size="small"
            title={
              <Space>
                <ExportOutlined /> 导出格式
              </Space>
            }
            style={{ marginTop: 12 }}
          >
            <Radio.Group
              value={impactExportFormat}
              onChange={(e) => setImpactExportFormat(e.target.value)}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {(Object.keys(impactIconMap) as ImpactExportFormat[]).map((k) => (
                  <Radio.Button
                    key={k}
                    value={k}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 14px',
                    }}
                  >
                    <Space>
                      {impactIconMap[k]}
                      <strong>{impactLabelMap[k]}</strong>
                      <Tag color={k === 'excel' ? 'green' : k === 'html' ? 'orange' : 'blue'}>
                        {k === 'excel' && '多 Sheet 表格'}
                        {k === 'html' && '内联样式网页'}
                        {k === 'markdown' && '结构化文本'}
                      </Tag>
                    </Space>
                  </Radio.Button>
                ))}
              </Space>
            </Radio.Group>
          </Card>

          {impactNode && (
            <Card
              size="small"
              title={
                <Space>
                  <BarChartOutlined /> 快速统计
                </Space>
              }
              style={{ marginTop: 12 }}
            >
              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <div className="stat-card table" style={{ padding: '12px' }}>
                    <div className="stat-value" style={{ fontSize: 20 }}>
                      {getUpstreamNodes(impactNode.id).length}
                    </div>
                    <div className="stat-label" style={{ fontSize: 12 }}>上游节点</div>
                  </div>
                </Col>
                <Col span={12}>
                  <div className="stat-card report" style={{ padding: '12px' }}>
                    <div className="stat-value" style={{ fontSize: 20 }}>
                      {impactNode.fields?.length || 0}
                    </div>
                    <div className="stat-label" style={{ fontSize: 12 }}>关联字段</div>
                  </div>
                </Col>
                <Col span={12}>
                  <div className="stat-card script" style={{ padding: '12px' }}>
                    <div className="stat-value" style={{ fontSize: 20 }}>
                      {getRelatedTasks(impactNode.id).length}
                    </div>
                    <div className="stat-label" style={{ fontSize: 12 }}>整改任务</div>
                  </div>
                </Col>
                <Col span={12}>
                  <div className="stat-card edge" style={{ padding: '12px' }}>
                    <div className="stat-value" style={{ fontSize: 20 }}>
                      {getOwnerList(impactNode).length}
                    </div>
                    <div className="stat-label" style={{ fontSize: 12 }}>责任方</div>
                  </div>
                </Col>
              </Row>
            </Card>
          )}
        </Col>

        <Col span={15}>
          <Card
            size="small"
            title="报告内容预览"
            extra={
              <Space>
                {impactNode && impactExportFormat === 'html' && (
                  <Tooltip title="在新窗口打开 HTML 预览">
                    <Button
                      size="small"
                      icon={<PrinterOutlined />}
                      onClick={() => {
                        const html = generateBusinessImpactHTML(impactNode);
                        const w = window.open('', '_blank');
                        if (w) {
                          w.document.write(html);
                          w.document.close();
                        }
                      }}
                    >
                      浏览器预览
                    </Button>
                  </Tooltip>
                )}
                <Button
                  size="small"
                  type="primary"
                  onClick={handleGeneratePreview}
                  loading={isGenerating}
                  disabled={!impactNode}
                >
                  {impactIconMap[impactExportFormat]} 生成预览
                </Button>
              </Space>
            }
          >
            {!impactNode ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical">
                    <span>请先在左侧选择一个关键报表/节点</span>
                    <Tag color="blue">报表类型节点</Tag>
                    <Tag color="red">标记为关键的节点</Tag>
                  </Space>
                }
                style={{ padding: 80 }}
              />
            ) : !previewContent ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="点击「生成预览」查看业务影响说明书内容"
                style={{ padding: 80 }}
              />
            ) : impactExportFormat === 'html' ? (
              <div
                style={{
                  maxHeight: 640,
                  overflow: 'auto',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 8,
                  background: '#f5f7fa',
                }}
              >
                <iframe
                  srcDoc={previewContent}
                  style={{
                    width: '100%',
                    height: 600,
                    border: 'none',
                    background: 'white',
                    borderRadius: 4,
                  }}
                  title="HTML Preview"
                />
              </div>
            ) : (
              <pre
                className="code-block"
                style={{ maxHeight: 640, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              >
                {previewContent.slice(0, 15000)}
                {previewContent.length > 15000 && (
                  <span style={{ color: '#faad14' }}>
                    {'\n\n'}... 报告过长（{previewContent.length}字符），完整内容请导出文件查看
                  </span>
                )}
              </pre>
            )}
          </Card>

          {snapshots.length > 0 && impactNode && (
            <Card
              size="small"
              title={
                <Space>
                  <HistoryOutlined /> 最近快照
                </Space>
              }
              style={{ marginTop: 12 }}
            >
              <Alert
                type={
                  getLatestSnapshotChanges(impactNode.id).summary.length > 0 &&
                  getLatestSnapshotChanges(impactNode.id).summary[0] !== '节点无变化'
                    ? 'warning'
                    : 'success'
                }
                showIcon
                message={
                  <Space direction="vertical" size={4}>
                    {(() => {
                      const ch = getLatestSnapshotChanges(impactNode.id);
                      return (
                        <>
                          <Space>
                            <strong>{ch.snapshot?.name}</strong>
                            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                              {dayjs(ch.snapshot?.createdAt).format('YYYY-MM-DD HH:mm')}
                            </span>
                          </Space>
                          {ch.summary.map((s, i) => (
                            <span key={i} style={{ fontSize: 13 }}>
                              • {s}
                            </span>
                          ))}
                        </>
                      );
                    })()}
                  </Space>
                }
              />
            </Card>
          )}

          {impactNode && getRelatedTasks(impactNode.id).length > 0 && (
            <Card
              size="small"
              title={
                <Space>
                  <SolutionOutlined /> 关联整改任务
                  <Tag color="orange">{getRelatedTasks(impactNode.id).length}</Tag>
                </Space>
              }
              style={{ marginTop: 12 }}
            >
              <List
                size="small"
                dataSource={getRelatedTasks(impactNode.id).slice(0, 5)}
                renderItem={(t) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          style={{
                            background: t.priority === 'high' ? '#ff4d4f' : t.priority === 'medium' ? '#faad14' : '#52c41a',
                          }}
                        >
                          {t.priority === 'high' ? '!' : t.priority === 'medium' ? '~' : '✓'}
                        </Avatar>
                      }
                      title={
                        <Space>
                          <span>{t.title}</span>
                          <Tag
                            color={
                              t.status === 'done' ? 'green' : t.status === 'doing' ? 'blue' : 'default'
                            }
                          >
                            {t.status === 'done' ? '已完成' : t.status === 'doing' ? '处理中' : '待处理'}
                          </Tag>
                        </Space>
                      }
                      description={
                        <span style={{ fontSize: 12 }}>
                          {t.assignee ? `负责人：${t.assignee}` : '未指派'}
                          {t.dueDate ? ` · 截止：${dayjs(t.dueDate).format('MM-DD')}` : ''}
                        </span>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          )}
        </Col>
      </Row>
    );
  };

  const previewFormatIcon =
    exportMode === 'businessImpact'
      ? impactIconMap[impactExportFormat]
      : iconMap[exportFormat];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="window-card">
        <div className="window-header">
          <ExportOutlined style={{ color: '#faad14' }} />
          <span className="window-title">报告导出</span>
          <div style={{ flex: 1 }} />
          <Space>
            {exportMode === 'businessImpact' && impactExportFormat === 'html' && impactNode && (
              <Button
                icon={<PrinterOutlined />}
                onClick={() => {
                  const html = generateBusinessImpactHTML(impactNode);
                  const w = window.open('', '_blank');
                  if (w) {
                    w.document.write(html);
                    w.document.close();
                  }
                }}
                disabled={!impactNode}
              >
                打印预览
              </Button>
            )}
            {exportMode === 'lineage' && (
              <Button
                icon={<PrinterOutlined />}
                onClick={() => {
                  const w = window.open('', '_blank');
                  if (w) {
                    w.document.write(generateHTMLReport());
                    w.document.close();
                  }
                }}
                disabled={nodes.length === 0}
              >
                打印预览
              </Button>
            )}
            <Button
              type="primary"
              icon={<ExportOutlined />}
              onClick={handleExport}
              disabled={nodes.length === 0 || (exportMode === 'businessImpact' && !impactNode)}
            >
              导出{previewFormatIcon}
            </Button>
          </Space>
        </div>

        <div className="window-body">
          {nodes.length === 0 ? (
            <Empty description="暂无数据，先导入数据源再生成报告" style={{ padding: 60 }} />
          ) : (
            <Tabs
              size="large"
              defaultActiveKey="lineage"
              activeKey={exportMode}
              onChange={(k) => {
                setExportMode(k as ExportMode);
                setPreviewContent('');
              }}
              items={[
                {
                  key: 'lineage',
                  label: (
                    <Space>
                      <SafetyOutlined /> 血缘说明书
                      <Tag color="blue">原模式</Tag>
                    </Space>
                  ),
                  children: (
                    <Tabs
                      size="small"
                      defaultActiveKey="config"
                      items={[
                        {
                          key: 'config',
                          label: (
                            <Space>
                              <UnorderedListOutlined /> 报告配置
                            </Space>
                          ),
                          children: renderLineageConfig(),
                        },
                        {
                          key: 'tree',
                          label: (
                            <Space>
                              <DatabaseOutlined /> 节点层级树
                            </Space>
                          ),
                          children: (
                            <Card size="small">
                              {nodes.length === 0 ? (
                                <Empty />
                              ) : (
                                <Tree
                                  blockNode
                                  showLine={{ showLeafIcon: false }}
                                  defaultExpandAll={false}
                                  treeData={buildTreeData()}
                                  style={{ maxHeight: 640, overflow: 'auto' }}
                                />
                              )}
                            </Card>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'businessImpact',
                  label: (
                    <Space>
                      <WarningOutlined /> 业务影响说明书
                      <Tag color="magenta">新</Tag>
                    </Space>
                  ),
                  children: renderBusinessImpactConfig(),
                },
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default ReportExportPanel;
