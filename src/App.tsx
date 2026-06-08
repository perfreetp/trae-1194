import { useState, useEffect } from 'react';
import { Menu, Button, App as AntApp } from 'antd';
import {
  DatabaseOutlined,
  FileSearchOutlined,
  ForkOutlined,
  SearchOutlined,
  WarningOutlined,
  CameraOutlined,
  UnorderedListOutlined,
  ExportOutlined,
  ExperimentOutlined,
  ReloadOutlined,
  GithubOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useLineageStore } from './store/lineageStore';
import DataSourcePanel from './components/DataSourcePanel';
import ScriptParserPanel from './components/ScriptParserPanel';
import LineageCanvasPanel from './components/LineageCanvasPanel';
import NodeSearchPanel from './components/NodeSearchPanel';
import ImpactPanel from './components/ImpactPanel';
import SnapshotPanel from './components/SnapshotPanel';
import TaskPanel from './components/TaskPanel';
import ReportExportPanel from './components/ReportExportPanel';

type WindowKey =
  | 'datasource'
  | 'parser'
  | 'canvas'
  | 'search'
  | 'impact'
  | 'snapshot'
  | 'task'
  | 'report';

const menuItems: Required<MenuProps>['items'] = [
  {
    key: 'datasource',
    icon: <DatabaseOutlined />,
    label: '数据源导入',
  },
  {
    key: 'parser',
    icon: <FileSearchOutlined />,
    label: '脚本解析',
  },
  {
    key: 'canvas',
    icon: <ForkOutlined />,
    label: '血缘画布',
  },
  {
    key: 'search',
    icon: <SearchOutlined />,
    label: '节点搜索',
  },
  {
    key: 'impact',
    icon: <WarningOutlined />,
    label: '影响评估',
  },
  {
    key: 'snapshot',
    icon: <CameraOutlined />,
    label: '变更快照',
  },
  {
    key: 'task',
    icon: <UnorderedListOutlined />,
    label: '任务清单',
  },
  {
    key: 'report',
    icon: <ExportOutlined />,
    label: '报告导出',
  },
];

function App() {
  const [activeWindow, setActiveWindow] = useState<WindowKey>('canvas');
  const { loadDemoData, nodes, edges } = useLineageStore();
  const { message } = AntApp.useApp();

  useEffect(() => {
    if (nodes.length === 0) {
      loadDemoData();
      message.success('已加载示例数据');
    }
  }, []);

  const renderWindow = () => {
    switch (activeWindow) {
      case 'datasource':
        return <DataSourcePanel />;
      case 'parser':
        return <ScriptParserPanel />;
      case 'canvas':
        return <LineageCanvasPanel />;
      case 'search':
        return <NodeSearchPanel />;
      case 'impact':
        return <ImpactPanel />;
      case 'snapshot':
        return <SnapshotPanel />;
      case 'task':
        return <TaskPanel />;
      case 'report':
        return <ReportExportPanel />;
      default:
        return <LineageCanvasPanel />;
    }
  };

  return (
    <div className="app-container">
      <div className="app-header">
        <div className="app-logo">
          <ForkOutlined style={{ fontSize: 22 }} />
          <span>数据血缘分析器</span>
        </div>
        <div className="app-header-actions">
          <Button
            type="text"
            style={{ color: 'white' }}
            icon={<ExperimentOutlined />}
            onClick={() => {
              loadDemoData();
              message.success('已重新加载示例数据');
            }}
          >
            示例数据
          </Button>
          <Button
            type="text"
            style={{ color: 'white' }}
            icon={<ReloadOutlined />}
            onClick={() => {
              if (confirm('确定清空所有数据吗？')) {
                useLineageStore.getState().importData({ nodes: [], edges: [] });
                message.success('已清空');
              }
            }}
          >
            清空数据
          </Button>
          <Button
            type="text"
            style={{ color: 'white' }}
            icon={<GithubOutlined />}
            onClick={() => message.info('v1.0.0 数据血缘分析器')}
          >
            v1.0.0
          </Button>
        </div>
      </div>

      <div className="app-body">
        <div className="app-sidebar">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[activeWindow]}
            onClick={({ key }) => setActiveWindow(key as WindowKey)}
            items={menuItems}
            style={{ height: '100%' }}
          />
        </div>

        <div className="app-content">{renderWindow()}</div>
      </div>
    </div>
  );
}

export default App;
