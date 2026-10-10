import { LanguageDefinition, Token, SuggestionItem } from '../types';
import { runPythonSandbox } from '../../utils/codeRunner';

export const PYTHON_SUGGESTIONS: SuggestionItem[] = [
  { label: 'def', type: 'keyword', detail: '定义函数', insertText: 'def function_name():\n    pass' },
  { label: 'class', type: 'keyword', detail: '定义类', insertText: 'class ClassName:\n    def __init__(self):\n        pass' },
  { label: 'return', type: 'keyword', detail: '返回值' },
  { label: 'import', type: 'keyword', detail: '导入模块' },
  { label: 'from', type: 'keyword', detail: '来源模块' },
  { label: 'as', type: 'keyword', detail: '重命名' },
  { label: 'if', type: 'keyword', detail: '条件分支', insertText: 'if condition:\n    pass' },
  { label: 'elif', type: 'keyword', detail: '条件分支' },
  { label: 'else:', type: 'keyword', detail: '否则分支' },
  { label: 'for', type: 'keyword', detail: '循环', insertText: 'for item in iterable:\n    pass' },
  { label: 'while', type: 'keyword', detail: '循环' },
  { label: 'in', type: 'keyword', detail: '包含判断' },
  { label: 'try:', type: 'keyword', detail: '异常处理', insertText: 'try:\n    pass\nexcept Exception as e:\n    pass' },
  { label: 'except', type: 'keyword', detail: '捕获异常' },
  { label: 'finally:', type: 'keyword', detail: '最终执行' },
  { label: 'with', type: 'keyword', detail: '上下文管理' },
  { label: 'lambda', type: 'keyword', detail: '匿名函数' },
  { label: 'pass', type: 'keyword', detail: '占位语句' },
  { label: 'break', type: 'keyword', detail: '跳出循环' },
  { label: 'continue', type: 'keyword', detail: '继续循环' },
  { label: 'yield', type: 'keyword', detail: '生成器产出' },
  { label: 'global', type: 'keyword', detail: '全局变量' },
  { label: 'raise', type: 'keyword', detail: '抛出异常' },
  { label: 'print', type: 'builtin', detail: '打印输出', insertText: 'print()' },
  { label: 'display', type: 'builtin', detail: '富文本/图表输出', insertText: 'display()' },
  { label: 'plt.show', type: 'builtin', detail: '显示图表', insertText: 'plt.show()' },
  { label: 'len', type: 'builtin', detail: '元素长度' },
  { label: 'range', type: 'builtin', detail: '序列范围' },
  { label: 'input', type: 'builtin', detail: '终端输入' },
  { label: 'isinstance', type: 'builtin', detail: '类型判断' },
  { label: 'enumerate', type: 'builtin', detail: '枚举迭代' },
  { label: 'zip', type: 'builtin', detail: '组合迭代' },
  { label: 'list', type: 'builtin', detail: '列表类型' },
  { label: 'dict', type: 'builtin', detail: '字典类型' },
  { label: 'set', type: 'builtin', detail: '集合类型' },
  { label: 'str', type: 'builtin', detail: '字符串类型' },
  { label: 'int', type: 'builtin', detail: '整数类型' },
  { label: 'float', type: 'builtin', detail: '浮点类型' },
  { label: 'True', type: 'builtin', detail: '布尔真' },
  { label: 'False', type: 'builtin', detail: '布尔假' },
  { label: 'None', type: 'builtin', detail: '空对象' },
  { label: 'self', type: 'builtin', detail: '实例引用' },
  { label: 'tkinter', type: 'builtin', detail: 'Tkinter GUI 图形库' },
  { label: 'turtle', type: 'builtin', detail: '海龟绘图模块' },
  { label: 'hardware', type: 'builtin', detail: '硬件与传感器接口' },
  { label: 'device', type: 'builtin', detail: '设备与硬件调用' },
  { label: 'tk.Tk', type: 'builtin', detail: '创建 Tkinter 窗口', insertText: 'root = tk.Tk()' },
  { label: 'tk.Label', type: 'builtin', detail: '文本标签控件', insertText: 'label = tk.Label(root, text="")' },
  { label: 'tk.Button', type: 'builtin', detail: '按钮控件', insertText: 'btn = tk.Button(root, text="", command=fn)' },
  { label: 'tk.Entry', type: 'builtin', detail: '单行输入框', insertText: 'entry = tk.Entry(root)' },
  { label: 'tk.Text', type: 'builtin', detail: '多行文本框', insertText: 'text = tk.Text(root, width=30, height=5)' },
  { label: 'tk.Canvas', type: 'builtin', detail: '绘图画布', insertText: 'canvas = tk.Canvas(root, width=300, height=200)' },
  { label: 'tk.Checkbutton', type: 'builtin', detail: '复选框控件' },
  { label: 'tk.Radiobutton', type: 'builtin', detail: '单选框控件' },
  { label: 'tk.Scale', type: 'builtin', detail: '滑动条控件' },
  { label: 'tk.Listbox', type: 'builtin', detail: '列表框控件' },
  { label: 'tk.StringVar', type: 'builtin', detail: '字符串变量', insertText: 'var = tk.StringVar()' },
  { label: 'ttk.Combobox', type: 'builtin', detail: '下拉选择框' },
  { label: 'ttk.Progressbar', type: 'builtin', detail: '进度条控件' },
  { label: 'ttk.Notebook', type: 'builtin', detail: '多标签页控件' },
  { label: 'messagebox', type: 'builtin', detail: '消息弹窗 (showinfo, showwarning)' }
];

export function tokenizePython(code: string): Token[] {
  if (!code) return [{ type: 'text', content: '' }];
  const tokens: Token[] = [];
  const pyRegex = /(#[^\n]*|'''[\s\S]*?(?:'''|$)|"""[\s\S]*?(?:"""|$))|([rfbRFB]?"(?:[^"\n\\]|\\.)*(?:"|(?=\n)|$)|[rfbRFB]?'(?:[^'\n\\]|\\.)*(?:'|(?=\n)|$))|(\b(?:def|class|if|elif|else|for|while|in|import|from|as|return|try|except|finally|with|lambda|pass|break|continue|yield|async|await|global|nonlocal|raise|is|not|and|or|assert|del)\b)|(\b(?:True|False|None)\b)|(\b(?:print|len|range|int|str|float|list|dict|set|tuple|enumerate|zip|sum|min|max|map|filter|input|type|isinstance|abs|round|open|super|self)\b)|(-?\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\())|([+\-*\/%=&|<>!~^]+)|([{}()\[\];:,.\`])|(\s+)|([a-zA-Z_][a-zA-Z0-9_]*)/g;

  let lastIndex = 0;
  let match;
  while ((match = pyRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: code.substring(lastIndex, match.index) });
    }
    const [full, comment, str, kw, boolVal, builtIn, num, fn, op, punct, space] = match;
    if (comment) tokens.push({ type: 'comment', content: comment });
    else if (str) tokens.push({ type: 'string', content: str });
    else if (kw) tokens.push({ type: 'keyword', content: kw });
    else if (boolVal || num) tokens.push({ type: 'number', content: full });
    else if (builtIn) tokens.push({ type: 'function', content: builtIn });
    else if (fn) tokens.push({ type: 'function', content: fn });
    else if (op) tokens.push({ type: 'operator', content: op });
    else if (punct) tokens.push({ type: 'punctuation', content: punct });
    else if (space) tokens.push({ type: 'text', content: space });
    else tokens.push({ type: 'text', content: full });

    lastIndex = pyRegex.lastIndex;
    if (match[0].length === 0) pyRegex.lastIndex++;
  }
  if (lastIndex < code.length) {
    tokens.push({ type: 'text', content: code.substring(lastIndex) });
  }
  return tokens;
}

export const pythonDefinition: LanguageDefinition = {
  id: 'python',
  name: 'Python',
  extensions: ['.py', '.pyw'],
  entryPriorities: [
    'main.py', 'app.py', 'index.py', 'run.py',
    'src/main.py', 'src/app.py'
  ],
  executionType: 'python-sandbox',
  runnable: true,
  tokenize: tokenizePython,
  suggestions: PYTHON_SUGGESTIONS,
  runner: async (ctx) => {
    const promptHandler = ctx.promptHandler || (async () => '');
    return runPythonSandbox(
      ctx.file.content,
      ctx.packages || [],
      promptHandler,
      ctx.onLog,
      ctx.pythonEngine || 'auto',
      ctx.files
    );
  }
};
