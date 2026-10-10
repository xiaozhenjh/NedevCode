import { LanguageDefinition, Token, SuggestionItem } from '../types';
import { runSqlSandbox } from '../../utils/codeRunner';

export const SQL_SUGGESTIONS: SuggestionItem[] = [
  { label: 'SELECT', type: 'keyword', detail: '数据查询' },
  { label: 'FROM', type: 'keyword', detail: '指定数据表' },
  { label: 'WHERE', type: 'keyword', detail: '条件筛选' },
  { label: 'INSERT INTO', type: 'keyword', detail: '写入记录' },
  { label: 'VALUES', type: 'keyword', detail: '插入数据值' },
  { label: 'UPDATE', type: 'keyword', detail: '数据更新' },
  { label: 'SET', type: 'keyword', detail: '设置字段值' },
  { label: 'DELETE FROM', type: 'keyword', detail: '删除记录' },
  { label: 'CREATE TABLE', type: 'keyword', detail: '创建表' },
  { label: 'JOIN', type: 'keyword', detail: '多表连接' },
  { label: 'GROUP BY', type: 'keyword', detail: '分组聚合' },
  { label: 'ORDER BY', type: 'keyword', detail: '结果排序' },
  { label: 'LIMIT', type: 'keyword', detail: '返回条数' }
];

export function tokenizeSql(code: string): Token[] {
  if (!code) return [{ type: 'text', content: '' }];
  const tokens: Token[] = [];
  const sqlRegex = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\n\\]|\\.)*(?:'|(?=\n)|$)|"(?:[^'\n\\]|\\.)*(?:"|(?=\n)|$))|(\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|INDEX|VIEW|DATABASE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|AND|OR|NOT|IN|BETWEEN|LIKE|IS|NULL|UNION|ALL|PRIMARY|KEY|FOREIGN|REFERENCES|DEFAULT|INT|INTEGER|TEXT|VARCHAR|BOOLEAN|DATE|TIMESTAMP)\b)|(-?\b\d+(?:\.\d+)?\b)|([=<>!+\-*\/%,;()]+)|(\s+)|([a-zA-Z_][a-zA-Z0-9_]*)/gi;

  let lastIndex = 0;
  let match;
  while ((match = sqlRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: code.substring(lastIndex, match.index) });
    }
    const [full, comment, str, kw, num, op, space, text] = match;
    if (comment) tokens.push({ type: 'comment', content: comment });
    else if (str) tokens.push({ type: 'string', content: str });
    else if (kw) tokens.push({ type: 'keyword', content: kw });
    else if (num) tokens.push({ type: 'number', content: full });
    else if (op) tokens.push({ type: 'operator', content: op });
    else if (space) tokens.push({ type: 'text', content: space });
    else tokens.push({ type: 'text', content: text || full });

    lastIndex = sqlRegex.lastIndex;
    if (match[0].length === 0) sqlRegex.lastIndex++;
  }
  if (lastIndex < code.length) {
    tokens.push({ type: 'text', content: code.substring(lastIndex) });
  }
  return tokens;
}

export const sqlDefinition: LanguageDefinition = {
  id: 'sql',
  name: 'SQL',
  extensions: ['.sql'],
  entryPriorities: ['main.sql', 'schema.sql', 'init.sql'],
  executionType: 'sql-sandbox',
  runnable: true,
  tokenize: tokenizeSql,
  suggestions: SQL_SUGGESTIONS,
  runner: async (ctx) => {
    return runSqlSandbox(ctx.file.content, ctx.onLog);
  }
};
