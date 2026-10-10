import { LanguageDefinition, Token, SuggestionItem } from '../types';
import { tokenizeJavaScript } from './javascript';
import { tokenizeCss } from './css';

export const HTML_SUGGESTIONS: SuggestionItem[] = [
  { label: 'doctype', type: 'keyword', detail: 'HTML5 声明', insertText: '<!DOCTYPE html>' },
  { label: 'html', type: 'keyword', detail: '根节点', insertText: '<html lang="zh-CN">\n  \n</html>' },
  { label: 'head', type: 'keyword', detail: '头部块' },
  { label: 'body', type: 'keyword', detail: '主体块' },
  { label: 'div', type: 'keyword', detail: '块级容器', insertText: '<div class=""></div>' },
  { label: 'span', type: 'keyword', detail: '行内容器', insertText: '<span class=""></span>' },
  { label: 'script', type: 'keyword', detail: '脚本块', insertText: '<script>\n  \n</script>' },
  { label: 'style', type: 'keyword', detail: '样式块', insertText: '<style>\n  \n</style>' },
  { label: 'button', type: 'keyword', detail: '按钮元素', insertText: '<button type="button"></button>' },
  { label: 'input', type: 'keyword', detail: '输入框元素', insertText: '<input type="text" placeholder="" />' },
  { label: 'form', type: 'keyword', detail: '表单元素' },
  { label: 'label', type: 'keyword', detail: '文本标签' },
  { label: 'header', type: 'keyword', detail: '页头元素' },
  { label: 'footer', type: 'keyword', detail: '页脚元素' },
  { label: 'section', type: 'keyword', detail: '章节区块' },
  { label: 'p', type: 'keyword', detail: '段落' },
  { label: 'h1', type: 'keyword', detail: '主标题' },
  { label: 'h2', type: 'keyword', detail: '二级标题' },
  { label: 'a', type: 'keyword', detail: '超链接', insertText: '<a href="#"></a>' },
  { label: 'img', type: 'keyword', detail: '图像', insertText: '<img src="" alt="" />' },
  { label: 'ul', type: 'keyword', detail: '无序列表' },
  { label: 'li', type: 'keyword', detail: '列表项' }
];

export function tokenizeHtmlPure(code: string): Token[] {
  const htmlRegex = /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z0-9\-]+)|(\s+[a-zA-Z\-]+(?==))|("(?:[^"\n\\]|\\.)*(?:"|(?=\n)|$)|'(?:[^'\n\\]|\\.)*(?:'|(?=\n)|$))|([<>\/=])|([^<>\s="']+)|(\s+)/g;
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match;
  while ((match = htmlRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: code.substring(lastIndex, match.index) });
    }
    const [full, comment, tag, attr, str, punct, text] = match;
    if (comment) tokens.push({ type: 'comment', content: comment });
    else if (tag) tokens.push({ type: 'tag', content: tag });
    else if (attr) tokens.push({ type: 'attr', content: attr });
    else if (str) tokens.push({ type: 'string', content: str });
    else if (punct) tokens.push({ type: 'punctuation', content: punct });
    else if (text) tokens.push({ type: 'text', content: text });
    else tokens.push({ type: 'text', content: full });

    lastIndex = htmlRegex.lastIndex;
    if (match[0].length === 0) htmlRegex.lastIndex++;
  }
  if (lastIndex < code.length) {
    tokens.push({ type: 'text', content: code.substring(lastIndex) });
  }
  return tokens;
}

export function tokenizeHtml(code: string): Token[] {
  if (!code) return [{ type: 'text', content: '' }];
  const tokens: Token[] = [];
  const blockRegex = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)|(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;
  let lastIndex = 0;
  let match;

  while ((match = blockRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(...tokenizeHtmlPure(code.substring(lastIndex, match.index)));
    }

    if (match[1]) {
      tokens.push(...tokenizeHtmlPure(match[1]));
      if (match[2]) tokens.push(...tokenizeJavaScript(match[2]));
      tokens.push(...tokenizeHtmlPure(match[3]));
    } else if (match[4]) {
      tokens.push(...tokenizeHtmlPure(match[4]));
      if (match[5]) tokens.push(...tokenizeCss(match[5]));
      tokens.push(...tokenizeHtmlPure(match[6]));
    }

    lastIndex = blockRegex.lastIndex;
  }

  if (lastIndex < code.length) {
    tokens.push(...tokenizeHtmlPure(code.substring(lastIndex)));
  }
  return tokens;
}

export const htmlDefinition: LanguageDefinition = {
  id: 'html',
  name: 'HTML',
  extensions: ['.html', '.htm'],
  entryPriorities: ['index.html', 'main.html', 'app.html', 'src/index.html'],
  executionType: 'html-preview',
  runnable: true,
  hasPreview: true,
  tokenize: tokenizeHtml,
  suggestions: HTML_SUGGESTIONS,
  runner: async (ctx) => {
    ctx.onLog({
      id: 'sys-start-' + Date.now(),
      level: 'system',
      message: '正在构建并装载 Web UI 运行沙箱...',
      timestamp: Date.now()
    });

    return new Promise((resolve) => {
      setTimeout(() => {
        ctx.onLog({
          id: 'sys-ok-' + Date.now(),
          level: 'info',
          message: '沙箱装载完成，界面渲染运行中。',
          timestamp: Date.now()
        });
        resolve({
          status: 'success',
          executionTimeMs: 12,
          logs: []
        });
      }, 150);
    });
  }
};
