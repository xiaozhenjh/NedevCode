import { LanguageDefinition, Token } from '../types';
import { runMarkdownSandbox } from '../../utils/codeRunner';

export function tokenizeMarkdown(code: string): Token[] {
  if (!code) return [{ type: 'text', content: '' }];
  const tokens: Token[] = [];
  const mdRegex = /(^#{1,6}\s[^\n]*)|(`[^`\n]+`)|(\*\*.*?\*\*|\*.*?\*)|(!?\[[^\]]*\]\([^)]*\))|(^>[\s\S]*?)|(^\s*[-*+]\s|^\s*\d+\.\s)|(\s+)|([^\s`*#[\]()!>]+)/g;

  let lastIndex = 0;
  let match;
  while ((match = mdRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: code.substring(lastIndex, match.index) });
    }
    const [full, header, inlineCode, boldItalic, link, quote, list, space, text] = match;
    if (header) tokens.push({ type: 'keyword', content: header });
    else if (inlineCode) tokens.push({ type: 'string', content: inlineCode });
    else if (boldItalic) tokens.push({ type: 'attr', content: boldItalic });
    else if (link) tokens.push({ type: 'function', content: link });
    else if (quote) tokens.push({ type: 'comment', content: quote });
    else if (list) tokens.push({ type: 'operator', content: list });
    else if (space) tokens.push({ type: 'text', content: space });
    else tokens.push({ type: 'text', content: text || full });

    lastIndex = mdRegex.lastIndex;
    if (match[0].length === 0) mdRegex.lastIndex++;
  }
  if (lastIndex < code.length) {
    tokens.push({ type: 'text', content: code.substring(lastIndex) });
  }
  return tokens;
}

export const markdownDefinition: LanguageDefinition = {
  id: 'markdown',
  name: 'Markdown',
  extensions: ['.md', '.markdown'],
  entryPriorities: ['README.md', 'readme.md', 'index.md'],
  executionType: 'markdown-preview',
  hasPreview: true,
  runnable: true,
  tokenize: tokenizeMarkdown,
  runner: async (ctx) => {
    return runMarkdownSandbox(ctx.file.content, ctx.file.name, ctx.onLog);
  }
};
