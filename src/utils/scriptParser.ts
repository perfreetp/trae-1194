function splitByCommaRespectParens(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inDoubleQuote && ch === "'") {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }
    if (!inSingleQuote && ch === '"') {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      continue;
    }
    if (inSingleQuote || inDoubleQuote) {
      current += ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function extractTableAndField(
  expr: string,
  tableAliases: Map<string, string>
): { sourceTable: string; sourceField: string } | null {
  const cleaned = expr
    .replace(/`/g, '')
    .replace(/"/g, '')
    .replace(/\[/g, '')
    .replace(/\]/g, '');
  const m = cleaned.match(/([\w]+)\.([\w]+)/);
  if (m) {
    const [, ref, field] = m;
    const table = tableAliases.get(ref) || ref;
    return { sourceTable: table, sourceField: field };
  }
  const m2 = cleaned.match(/\b([\w]+)\b/);
  if (m2) {
    return { sourceTable: '', sourceField: m2[1] };
  }
  return null;
}

const AGGREGATE_FUNCS = new Set([
  'SUM', 'COUNT', 'AVG', 'MIN', 'MAX',
  'GROUP_CONCAT', 'STDDEV', 'VARIANCE',
  'COLLECT_SET', 'COLLECT_LIST', 'PERCENTILE',
]);

const TRANSFORM_FUNCS = new Set([
  'DATE', 'DATETIME', 'TIMESTAMP', 'DATE_FORMAT',
  'CAST', 'CONVERT', 'SUBSTRING', 'SUBSTR',
  'CONCAT', 'CONCAT_WS', 'TRIM', 'LTRIM', 'RTRIM',
  'UPPER', 'LOWER', 'ROUND', 'CEIL', 'FLOOR',
  'ABS', 'LENGTH', 'CHAR_LENGTH', 'SPLIT',
  'REPLACE', 'REGEXP_REPLACE', 'COALESCE', 'NVL',
  'IF', 'CASE', 'WHEN', 'IFNULL', 'NULLIF',
]);

function detectTransform(expr: string): { type: 'aggregate' | 'transform' | 'direct'; label: string } | null {
  const upper = expr.toUpperCase();
  for (const fn of AGGREGATE_FUNCS) {
    const re = new RegExp(`\\b${fn}\\s*\\(`, 'i');
    if (re.test(upper)) {
      const inner = expr.match(new RegExp(`${fn}\\s*\\(([^)]*(?:\\([^)]*\\)[^)]*)*)\\)`, 'i'));
      const argStr = inner ? inner[1].trim() : '';
      return {
        type: 'aggregate',
        label: `${fn.toUpperCase()}(${argStr})`,
      };
    }
  }
  for (const fn of TRANSFORM_FUNCS) {
    const re = new RegExp(`\\b${fn}\\s*\\(`, 'i');
    if (re.test(upper)) {
      const inner = expr.match(new RegExp(`${fn}\\s*\\(([^)]*(?:\\([^)]*\\)[^)]*)*)\\)`, 'i'));
      const argStr = inner ? inner[1].trim() : '';
      return {
        type: 'transform',
        label: `${fn.toUpperCase()}(${argStr})`,
      };
    }
  }
  return null;
}

function parseSelectItem(
  raw: string,
  tableAliases: Map<string, string>
): {
  sourceTable: string;
  sourceField: string;
  targetField: string;
  transform?: string;
  edgeType?: 'direct' | 'transform' | 'aggregate';
} | null {
  if (!raw) return null;
  let expr = raw;
  let alias = '';

  const asMatch = raw.match(/\s+AS\s+([`"\[\w.\]]+)$/i);
  if (asMatch) {
    alias = asMatch[1].replace(/[`"\[\]\.]/g, '');
    expr = raw.slice(0, raw.length - asMatch[0].length).trim();
  } else {
    const spaceMatch = raw.match(/\s+([\w]+)$/);
    if (spaceMatch) {
      const candidate = spaceMatch[1];
      const leftPart = raw.slice(0, raw.length - spaceMatch[0].length).trim();
      if (/[+\-*/()=<>]/.test(leftPart) || /^\w+\s*\(/.test(leftPart)) {
        alias = candidate;
        expr = leftPart;
      }
    }
  }

  const tf = detectTransform(expr);
  const extracted = extractTableAndField(expr, tableAliases);

  let targetField = alias || extracted?.sourceField || expr.replace(/\s+/g, '_');
  if (!alias && extracted?.sourceField) {
    targetField = extracted.sourceField;
  }

  let transform: string | undefined;
  let edgeType: 'direct' | 'transform' | 'aggregate' = 'direct';
  if (tf) {
    let friendlyDesc = tf.label;
    if (tf.type === 'aggregate') {
      if (tf.label.toUpperCase().startsWith('COUNT('))
        friendlyDesc = `${tf.label} 计数`;
      else if (tf.label.toUpperCase().startsWith('SUM('))
        friendlyDesc = `${tf.label} 汇总`;
      else if (tf.label.toUpperCase().startsWith('AVG('))
        friendlyDesc = `${tf.label} 平均值`;
      else friendlyDesc = `${tf.label} 聚合计算`;
    } else {
      if (tf.label.toUpperCase().startsWith('DATE('))
        friendlyDesc = `${tf.label} 日期转换`;
      else if (tf.label.toUpperCase().startsWith('DATE_FORMAT('))
        friendlyDesc = `${tf.label} 日期格式化`;
      else if (tf.label.toUpperCase().startsWith('CAST(') || tf.label.toUpperCase().startsWith('CONVERT('))
        friendlyDesc = `${tf.label} 类型转换`;
      else friendlyDesc = `${tf.label} 计算`;
    }
    transform = friendlyDesc;
    edgeType = tf.type;
  } else if (!/^[\w.`"\[\]]+$/.test(expr.trim())) {
    transform = `${expr.trim()} 表达式计算`;
    edgeType = 'transform';
  }

  return {
    sourceTable: extracted?.sourceTable || '',
    sourceField: extracted?.sourceField || '',
    targetField,
    transform,
    edgeType,
  };
}

export function parseSQL(sql: string): {
  tables: string[];
  outputTable?: string;
  fieldRelations: Array<{
    sourceTable: string;
    sourceField: string;
    targetField: string;
    transform?: string;
    edgeType?: 'direct' | 'transform' | 'aggregate';
  }>;
} {
  const result: {
    tables: string[];
    outputTable?: string;
    fieldRelations: Array<{
      sourceTable: string;
      sourceField: string;
      targetField: string;
      transform?: string;
      edgeType?: 'direct' | 'transform' | 'aggregate';
    }>;
  } = {
    tables: [],
    fieldRelations: [],
  };

  const cleanSql = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  const insertMatch = cleanSql.match(
    /INSERT\s+(?:INTO\s+|OVERWRITE\s+)?([`"[\w.]+)/i
  );
  if (insertMatch) {
    result.outputTable = insertMatch[1]
      .replace(/[`"\[\]]/g, '')
      .split('.')
      .pop()!;
  }

  const createMatch = cleanSql.match(
    /CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"[\w.]+)/i
  );
  if (createMatch && !result.outputTable) {
    result.outputTable = createMatch[1]
      .replace(/[`"\[\]]/g, '')
      .split('.')
      .pop()!;
  }

  const fromRegex = /FROM\s+([`"[\w.]+)(?:\s+(?:AS\s+)?([\w]+))?/gi;
  const joinRegex =
    /(?:LEFT\s+|RIGHT\s+|INNER\s+|OUTER\s+|CROSS\s+|FULL\s+)?JOIN\s+([`"[\w.]+)(?:\s+(?:AS\s+)?([\w]+))?/gi;

  const tableAliases = new Map<string, string>();

  let match;
  while ((match = fromRegex.exec(cleanSql)) !== null) {
    const tableName = match[1].replace(/[`"\[\]]/g, '').split('.').pop()!;
    const alias = match[2];
    if (tableName && !result.tables.includes(tableName)) {
      result.tables.push(tableName);
    }
    if (alias && tableName) {
      tableAliases.set(alias, tableName);
    }
  }

  while ((match = joinRegex.exec(cleanSql)) !== null) {
    const tableName = match[1].replace(/[`"\[\]]/g, '').split('.').pop()!;
    const alias = match[2];
    if (tableName && !result.tables.includes(tableName)) {
      result.tables.push(tableName);
    }
    if (alias && tableName) {
      tableAliases.set(alias, tableName);
    }
  }

  const selectMatch = cleanSql.match(/SELECT\s+([\s\S]*?)\s+FROM\s+/i);
  if (selectMatch) {
    const selectClause = selectMatch[1];
    const items = splitByCommaRespectParens(selectClause);
    for (const item of items) {
      const parsed = parseSelectItem(item, tableAliases);
      if (!parsed) continue;
      if (!parsed.sourceField || parsed.sourceField === '*') continue;
      let sourceTable = parsed.sourceTable;
      if (!sourceTable && result.tables.length === 1) {
        sourceTable = result.tables[0];
      }
      if (sourceTable && parsed.targetField) {
        result.fieldRelations.push({
          sourceTable,
          sourceField: parsed.sourceField,
          targetField: parsed.targetField,
          transform: parsed.transform,
          edgeType: parsed.edgeType,
        });
      }
    }
  }

  return result;
}

export function parsePythonScript(script: string): {
  imports: string[];
  dataFrames: string[];
  fileOperations: string[];
} {
  const result = {
    imports: [] as string[],
    dataFrames: [] as string[],
    fileOperations: [] as string[],
  };

  const importRegex = /^(?:import|from)\s+([\w.]+)/gm;
  let match;
  while ((match = importRegex.exec(script)) !== null) {
    if (!result.imports.includes(match[1])) {
      result.imports.push(match[1]);
    }
  }

  const dfRegex = /(\w+)\s*=\s*pd\.(?:read_|DataFrame)/g;
  while ((match = dfRegex.exec(script)) !== null) {
    if (!result.dataFrames.includes(match[1])) {
      result.dataFrames.push(match[1]);
    }
  }

  const fileRegex = /(?:read_csv|read_excel|read_sql|to_csv|to_excel|to_sql)\s*\(\s*['"]([^'"]+)['"]/g;
  while ((match = fileRegex.exec(script)) !== null) {
    if (!result.fileOperations.includes(match[1])) {
      result.fileOperations.push(match[1]);
    }
  }

  return result;
}

export function inferNodeType(filename: string): 'table' | 'file' | 'script' {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['sql', 'hql', 'py', 'ipynb', 'js', 'ts'].includes(ext || '')) {
    return 'script';
  }
  if (['csv', 'xlsx', 'xls', 'json', 'parquet', 'txt'].includes(ext || '')) {
    return 'file';
  }
  return 'file';
}
