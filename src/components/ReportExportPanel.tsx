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

function ReportExportPanel() {
  const {
    nodes,
    edges,
    snapshots,
    tasks,
    getUpstreamNodes,
    getDownstreamNodes,
    exportData,
  } = useLineageStore();
  const { message } = AntApp.useApp();

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

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;

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
      setIsGenerating(false);
      message.success('报告已生成预览');
    }, 500);
  };

  const handleExport = async () => {
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="window-card">
        <div className="window-header">
          <ExportOutlined style={{ color: '#faad14' }} />
          <span className="window-title">报告导出 / 血缘说明书</span>
          <div style={{ flex: 1 }} />
          <Space>
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
            <Button
              type="primary"
              icon={<ExportOutlined />}
              onClick={handleExport}
              disabled={nodes.length === 0}
            >
              导出报告
            </Button>
          </Space>
        </div>

        <div className="window-body">
          {nodes.length === 0 ? (
            <Empty description="暂无数据，先导入数据源再生成报告" style={{ padding: 60 }} />
          ) : (
            <Tabs
              size="large"
              defaultActiveKey="config"
              items={[
                {
                  key: 'config',
                  label: (
                    <Space>
                      <SafetyOutlined /> 报告配置
                    </Space>
                  ),
                  children: (
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
                                <Space direction="vertical">
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
                  ),
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
          )}
        </div>
      </div>
    </div>
  );
}

export default ReportExportPanel;
