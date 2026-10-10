import { LanguageDefinition, Token } from '../types';
import { runJsonSandbox } from '../../utils/codeRunner';

export function tokenizeJson(code: string): Token[] {
  if (!code) return [{ type: 'text', content: '' }];
  const tokens: Token[] = [];
  const jsonRegex = /("(?:[^"\n\\]|\\.)*"(?=\s*:))|("(?:[^"\n\\]|\\.)*(?:"|(?=\n)|$))|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\],:])|(\s+)/g;

  let lastIndex = 0;
  let match;
  while ((match = jsonRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: code.substring(lastIndex, match.index) });
    }
    const [full, key, str, num, bool, punct] = match;
    if (key) tokens.push({ type: 'attr', content: key });
    else if (str) tokens.push({ type: 'string', content: str });
    else if (num || bool) tokens.push({ type: 'number', content: full });
    else if (punct) tokens.push({ type: 'punctuation', content: punct });
    else tokens.push({ type: 'text', content: full });

    lastIndex = jsonRegex.lastIndex;
    if (match[0].length === 0) jsonRegex.lastIndex++;
  }
  if (lastIndex < code.length) {
    tokens.push({ type: 'text', content: code.substring(lastIndex) });
  }
  return tokens;
}

export const jsonDefinition: LanguageDefinition = {
  id: 'json',
  name: 'JSON',
  extensions: ['.json'],
  executionType: 'json-sandbox',
  runnable: true,
  tokenize: tokenizeJson,
  format: (code: string) => {
    try {
      const parsed = JSON.parse(code);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return code;
    }
  },
  runner: async (ctx) => {
    return runJsonSandbox(ctx.file.content, ctx.file.name, ctx.onLog);
  }
};
