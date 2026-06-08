export function parseSQL(sql: string): {
  tables: string[];
  outputTable?: string;
  fieldRelations: Array<{
    sourceTable: string;
    sourceField: string;
    targetField: string;
    transform?: string;
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
    const fieldPattern =
      /(?:([\w]+)\.)?([\w*]+)(?:\s+(?:AS\s+)?([\w]+))?/g;
    let fieldMatch;
    while ((fieldMatch = fieldPattern.exec(selectClause)) !== null) {
      const [, tableRef, field, alias] = fieldMatch;
      if (field === '*') continue;
      const targetField = alias || field;
      let sourceTable = tableRef ? tableAliases.get(tableRef) || tableRef : '';
      if (!sourceTable && result.tables.length === 1) {
        sourceTable = result.tables[0];
      }
      const aggregateMatch =
        selectClause.match(
          new RegExp(
            `(SUM|COUNT|AVG|MIN|MAX|GROUP_CONCAT)\\s*\\([^)]*${field}[^)]*\\)`,
            'i'
          )
        );
      const transform = aggregateMatch ? aggregateMatch[1].toUpperCase() + '()' : undefined;
      if (sourceTable && field) {
        result.fieldRelations.push({
          sourceTable,
          sourceField: field,
          targetField,
          transform,
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
