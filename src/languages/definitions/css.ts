import { LanguageDefinition, Token, SuggestionItem } from '../types';

export const CSS_SUGGESTIONS: SuggestionItem[] = [
  { label: 'color', type: 'keyword', detail: '字体颜色', insertText: 'color: #;' },
  { label: 'background', type: 'keyword', detail: '背景' },
  { label: 'background-color', type: 'keyword', detail: '背景色彩' },
  { label: 'font-size', type: 'keyword', detail: '字号大小', insertText: 'font-size: 14px;' },
  { label: 'font-weight', type: 'keyword', detail: '字体粗细' },
  { label: 'font-family', type: 'keyword', detail: '字体族' },
  { label: 'margin', type: 'keyword', detail: '外边距' },
  { label: 'padding', type: 'keyword', detail: '内边距' },
  { label: 'border', type: 'keyword', detail: '边框样式', insertText: 'border: 1px solid #;' },
  { label: 'border-radius', type: 'keyword', detail: '圆角半径', insertText: 'border-radius: 8px;' },
  { label: 'display', type: 'keyword', detail: '显示模式' },
  { label: 'flex', type: 'keyword', detail: '弹性布局' },
  { label: 'flex-direction', type: 'keyword', detail: '主轴方向' },
  { label: 'align-items', type: 'keyword', detail: '交叉轴对齐' },
  { label: 'justify-content', type: 'keyword', detail: '主轴对齐' },
  { label: 'position', type: 'keyword', detail: '定位模式' },
  { label: 'relative', type: 'keyword', detail: '相对定位' },
  { label: 'absolute', type: 'keyword', detail: '绝对定位' },
  { label: 'fixed', type: 'keyword', detail: '固定定位' },
  { label: 'width', type: 'keyword', detail: '宽度' },
  { label: 'height', type: 'keyword', detail: '高度' },
  { label: 'opacity', type: 'keyword', detail: '不透明度' },
  { label: 'overflow', type: 'keyword', detail: '溢出剪裁' },
  { label: 'z-index', type: 'keyword', detail: '层叠顺序' },
  { label: 'cursor', type: 'keyword', detail: '光标手势' },
  { label: 'transition', type: 'keyword', detail: '平滑过渡' },
  { label: 'transform', type: 'keyword', detail: '矩阵形变' },
  { label: 'box-shadow', type: 'keyword', detail: '盒阴影' }
];

export function tokenizeCss(code: string): Token[] {
  if (!code) return [{ type: 'text', content: '' }];
  const tokens: Token[] = [];
  const cssRegex = /(\/\*[\s\S]*?\*\/)|("(?:[^"\n\\]|\\.)*(?:"|(?=\n)|$)|'(?:[^'\n\\]|\\.)*(?:'|(?=\n)|$))|(@[a-zA-Z\-]+)|([a-zA-Z\-]+(?=\s*:))|(-?\d+(?:\.\d+)?(?:px|em|rem|vh|vw|%|s|ms)?)|([:;{}])|(\s+)|([^:;{}\s]+)/g;

  let lastIndex = 0;
  let match;
  while ((match = cssRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: code.substring(lastIndex, match.index) });
    }
    const [full, comment, str, kw, prop, num, punct, space, text] = match;
    if (comment) tokens.push({ type: 'comment', content: comment });
    else if (str) tokens.push({ type: 'string', content: str });
    else if (kw) tokens.push({ type: 'keyword', content: kw });
    else if (prop) tokens.push({ type: 'attr', content: prop });
    else if (num) tokens.push({ type: 'number', content: full });
    else if (punct) tokens.push({ type: 'punctuation', content: punct });
    else if (space) tokens.push({ type: 'text', content: space });
    else tokens.push({ type: 'text', content: text });

    lastIndex = cssRegex.lastIndex;
    if (match[0].length === 0) cssRegex.lastIndex++;
  }
  if (lastIndex < code.length) {
    tokens.push({ type: 'text', content: code.substring(lastIndex) });
  }
  return tokens;
}

export const cssDefinition: LanguageDefinition = {
  id: 'css',
  name: 'CSS',
  extensions: ['.css'],
  runnable: false,
  unsupportedReason: (file) => `入口文件 "${file.name}" 为样式表，无法独立运行。请将 HTML 网页或代码脚本设置为主入口。`,
  tokenize: tokenizeCss,
  suggestions: CSS_SUGGESTIONS
};
