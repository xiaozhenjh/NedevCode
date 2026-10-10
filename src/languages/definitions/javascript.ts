import { LanguageDefinition, Token, SuggestionItem } from '../types';
import { runJavaScriptSandbox } from '../../utils/codeRunner';

export const COMMON_JS_KEYWORDS: SuggestionItem[] = [
  { label: 'const', type: 'keyword', detail: '常量声明' },
  { label: 'let', type: 'keyword', detail: '变量声明' },
  { label: 'var', type: 'keyword', detail: '变量声明' },
  { label: 'function', type: 'keyword', detail: '函数定义', insertText: 'function name() {\n  \n}' },
  { label: 'return', type: 'keyword', detail: '返回值' },
  { label: 'async', type: 'keyword', detail: '异步函数' },
  { label: 'await', type: 'keyword', detail: '等待 Promise' },
  { label: 'import', type: 'keyword', detail: '导入模块' },
  { label: 'export', type: 'keyword', detail: '导出模块' },
  { label: 'default', type: 'keyword', detail: '默认导出' },
  { label: 'from', type: 'keyword', detail: '模块来源' },
  { label: 'if', type: 'keyword', detail: '条件分支', insertText: 'if (condition) {\n  \n}' },
  { label: 'else', type: 'keyword', detail: '否则分支' },
  { label: 'for', type: 'keyword', detail: '循环', insertText: 'for (let i = 0; i < length; i++) {\n  \n}' },
  { label: 'while', type: 'keyword', detail: '循环' },
  { label: 'switch', type: 'keyword', detail: '多分支选择' },
  { label: 'case', type: 'keyword', detail: '分支项' },
  { label: 'try', type: 'keyword', detail: '异常捕获', insertText: 'try {\n  \n} catch (error) {\n  \n}' },
  { label: 'catch', type: 'keyword', detail: '捕获处理' },
  { label: 'finally', type: 'keyword', detail: '最终块' },
  { label: 'class', type: 'keyword', detail: '类声明' },
  { label: 'extends', type: 'keyword', detail: '类继承' },
  { label: 'typeof', type: 'keyword', detail: '类型检测' },
  { label: 'instanceof', type: 'keyword', detail: '实例检测' },
  { label: 'console.log', type: 'builtin', detail: '日志输出', insertText: 'console.log();' },
  { label: 'console.error', type: 'builtin', detail: '错误输出' },
  { label: 'console.warn', type: 'builtin', detail: '警告输出' },
  { label: 'console.table', type: 'builtin', detail: '表格输出展示' },
  { label: 'prompt', type: 'builtin', detail: '等待用户输入', insertText: 'await prompt()' },
  { label: 'display', type: 'builtin', detail: '富文本/表格展示', insertText: 'display()' },
  { label: 'showImage', type: 'builtin', detail: '输出展示图像', insertText: 'showImage()' },
  { label: 'Promise', type: 'builtin', detail: 'Promise 对象' },
  { label: 'JSON.stringify', type: 'builtin', detail: '序列化 JSON' },
  { label: 'JSON.parse', type: 'builtin', detail: '解析 JSON' },
  { label: 'Math.floor', type: 'builtin', detail: '向下取整' },
  { label: 'Math.max', type: 'builtin', detail: '最大值' },
  { label: 'Math.min', type: 'builtin', detail: '最小值' },
  { label: 'Object.keys', type: 'builtin', detail: '获取键名' },
  { label: 'Object.values', type: 'builtin', detail: '获取键值' },
  { label: 'Array.isArray', type: 'builtin', detail: '数组检测' },
  { label: 'setTimeout', type: 'builtin', detail: '延时回调' },
  { label: 'setInterval', type: 'builtin', detail: '定时回调' },
  { label: 'document.getElementById', type: 'builtin', detail: '获取元素' },
  { label: 'document.querySelector', type: 'builtin', detail: '选择元素' },
  { label: 'addEventListener', type: 'builtin', detail: '事件监听' },
  { label: 'hardware', type: 'builtin', detail: '硬件与传感器接口' },
  { label: 'device', type: 'builtin', detail: '设备信息与硬件调用' },
  { label: 'hardware.vibrate', type: 'builtin', detail: '设备震动 (ms)' },
  { label: 'hardware.getBattery', type: 'builtin', detail: '获取电池状态' },
  { label: 'hardware.getLocation', type: 'builtin', detail: '获取高精度位置' },
  { label: 'hardware.getOrientation', type: 'builtin', detail: '获取陀螺仪倾角' },
  { label: 'hardware.getMotion', type: 'builtin', detail: '获取加速度感应' },
  { label: 'hardware.requestWakeLock', type: 'builtin', detail: '保持屏幕常亮' },
  { label: 'hardware.takePhoto', type: 'builtin', detail: '摄像头抓拍照片' },
  { label: 'hardware.toggleTorch', type: 'builtin', detail: '手电筒闪光灯开关' },
  { label: 'hardware.listenSpeech', type: 'builtin', detail: '语音识别转文字' },
  { label: 'hardware.beep', type: 'builtin', detail: '蜂鸣器音调发声' },
  { label: 'hardware.speak', type: 'builtin', detail: '语音合成朗读' },
  { label: 'hardware.showHardwareStatus', type: 'builtin', detail: '展示硬件监控卡片' }
];

export function tokenizeJavaScript(code: string): Token[] {
  if (!code) return [{ type: 'text', content: '' }];
  const tokens: Token[] = [];
  const jsRegex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\n\\]|\\.)*(?:"|(?=\n)|$)|'(?:[^'\n\\]|\\.)*(?:'|(?=\n)|$)|`(?:[^`\\]|\\.)*(?:`|$))|(\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|default|class|extends|new|this|typeof|instanceof|import|export|from|as|async|await|try|catch|finally|throw|interface|type|enum|public|private|protected|static|readonly)\b)|(\b(?:true|false|null|undefined|NaN|Infinity)\b)|(-?\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())|([+\-*\/%=&|<>!?:^~]+)|([{}()\[\];,.\`])|(\s+)|([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  let lastIndex = 0;
  let match;
  while ((match = jsRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: code.substring(lastIndex, match.index) });
    }
    const [full, comment, str, kw, boolVal, num, fn, op, punct] = match;
    if (comment) tokens.push({ type: 'comment', content: comment });
    else if (str) tokens.push({ type: 'string', content: str });
    else if (kw) tokens.push({ type: 'keyword', content: kw });
    else if (boolVal || num) tokens.push({ type: 'number', content: full });
    else if (fn) tokens.push({ type: 'function', content: fn });
    else if (op) tokens.push({ type: 'operator', content: op });
    else if (punct) tokens.push({ type: 'punctuation', content: punct });
    else tokens.push({ type: 'text', content: full });

    lastIndex = jsRegex.lastIndex;
    if (match[0].length === 0) jsRegex.lastIndex++;
  }
  if (lastIndex < code.length) {
    tokens.push({ type: 'text', content: code.substring(lastIndex) });
  }
  return tokens;
}

export const javascriptDefinition: LanguageDefinition = {
  id: 'javascript',
  name: 'JavaScript',
  extensions: ['.js', '.jsx', '.mjs', '.cjs'],
  entryPriorities: [
    'index.js', 'main.js', 'app.js',
    'src/index.js', 'src/main.js', 'src/app.js'
  ],
  executionType: 'js-sandbox',
  runnable: true,
  tokenize: tokenizeJavaScript,
  suggestions: COMMON_JS_KEYWORDS,
  runner: async (ctx) => {
    return runJavaScriptSandbox(ctx.file.content, ctx.npmPackages || [], ctx.onLog, ctx.files, ctx.promptHandler);
  }
};

export const typescriptDefinition: LanguageDefinition = {
  id: 'typescript',
  name: 'TypeScript',
  extensions: ['.ts', '.tsx'],
  entryPriorities: [
    'index.ts', 'main.ts', 'app.ts',
    'src/index.ts', 'src/main.ts', 'src/app.ts',
    'App.tsx', 'src/App.tsx', 'index.tsx', 'src/index.tsx'
  ],
  executionType: 'js-sandbox',
  runnable: true,
  tokenize: tokenizeJavaScript,
  suggestions: [
    ...COMMON_JS_KEYWORDS,
    { label: 'interface', type: 'keyword', detail: '接口定义', insertText: 'interface Name {\n  \n}' },
    { label: 'type', type: 'keyword', detail: '类型别名' },
    { label: 'enum', type: 'keyword', detail: '枚举定义' },
    { label: 'readonly', type: 'keyword', detail: '只读修饰符' },
    { label: 'private', type: 'keyword', detail: '私有修饰符' },
    { label: 'public', type: 'keyword', detail: '公有修饰符' },
    { label: 'protected', type: 'keyword', detail: '保护修饰符' },
    { label: 'as', type: 'keyword', detail: '类型断言' },
    { label: 'satisfies', type: 'keyword', detail: '类型校验' }
  ],
  runner: async (ctx) => {
    return runJavaScriptSandbox(ctx.file.content, ctx.npmPackages || [], ctx.onLog, ctx.files, ctx.promptHandler);
  }
};
