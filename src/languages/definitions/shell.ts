import { LanguageDefinition, Token, SuggestionItem } from '../types';
import { runShellSandbox } from '../../utils/codeRunner';

export const SHELL_SUGGESTIONS: SuggestionItem[] = [
  { label: 'echo', type: 'keyword', detail: '标准输出' },
  { label: 'export', type: 'keyword', detail: '导出变量' },
  { label: 'source', type: 'keyword', detail: '环境加载' },
  { label: 'chmod', type: 'keyword', detail: '权限修改' },
  { label: 'mkdir -p', type: 'keyword', detail: '创建多级目录' },
  { label: 'grep', type: 'keyword', detail: '正则匹配' },
  { label: 'cat', type: 'keyword', detail: '查看文件' }
];

export function tokenizeShell(code: string): Token[] {
  if (!code) return [{ type: 'text', content: '' }];
  const tokens: Token[] = [];
  const shRegex = /(#[^\n]*)|("(?:[^"\n\\]|\\.)*(?:"|(?=\n)|$)|'(?:[^'\n\\]|\\.)*(?:'|(?=\n)|$))|(\b(?:echo|if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|select|return|exit|export|read|local|source|pwd|cd|ls|cat|mkdir|rm|touch|grep|head|tail|date|whoami|uname)\b)|(\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?)|(-?\b\d+\b)|([|&;<>()`$]+)|(\s+)|([^\s#"'|&;<>()`$]+)/g;

  let lastIndex = 0;
  let match;
  while ((match = shRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: code.substring(lastIndex, match.index) });
    }
    const [full, comment, str, kw, variable, num, op, space, text] = match;
    if (comment) tokens.push({ type: 'comment', content: comment });
    else if (str) tokens.push({ type: 'string', content: str });
    else if (kw) tokens.push({ type: 'keyword', content: kw });
    else if (variable) tokens.push({ type: 'attr', content: variable });
    else if (num) tokens.push({ type: 'number', content: full });
    else if (op) tokens.push({ type: 'operator', content: op });
    else if (space) tokens.push({ type: 'text', content: space });
    else tokens.push({ type: 'text', content: text || full });

    lastIndex = shRegex.lastIndex;
    if (match[0].length === 0) shRegex.lastIndex++;
  }
  if (lastIndex < code.length) {
    tokens.push({ type: 'text', content: code.substring(lastIndex) });
  }
  return tokens;
}

export const shellDefinition: LanguageDefinition = {
  id: 'shell',
  name: 'Shell',
  extensions: ['.sh', '.bash', '.zsh'],
  entryPriorities: ['main.sh', 'run.sh', 'index.sh'],
  executionType: 'shell-sandbox',
  runnable: true,
  tokenize: tokenizeShell,
  suggestions: SHELL_SUGGESTIONS,
  runner: async (ctx) => {
    return runShellSandbox(ctx.file.content, ctx.files, ctx.onLog, ctx.promptHandler);
  }
};
