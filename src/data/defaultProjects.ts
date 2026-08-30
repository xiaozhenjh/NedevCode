import { CodeProject } from '../types';

export const DEFAULT_PROJECTS: CodeProject[] = [
  {
    id: 'ui-components-demo',
    title: '响应式交互控件演示',
    description: '演示常用交互按钮、计数器状态及交互反馈。',
    language: 'javascript',
    executionType: 'html-preview',
    tags: ['组件', 'UI交互', '状态'],
    createdAt: Date.now() - 3600000 * 24,
    updatedAt: Date.now() - 3600000 * 2,
    activeFileId: 'main-js',
    files: [
      {
        id: 'index-html',
        name: 'index.html',
        language: 'html',
        isEntry: true,
        content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Noto Sans SC", sans-serif;
      background: #f7f8fa;
      color: #191919;
      padding: 16px;
      user-select: none;
    }
    .card {
      background: #ffffff;
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.04);
      border: 1px solid #e5e8ed;
    }
    .card-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #191919;
    }
    .badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 500;
      color: #0a59f7;
      background: rgba(10, 89, 247, 0.08);
      padding: 4px 10px;
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 20px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      background: #0a59f7;
      color: #ffffff;
      transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s;
    }
    .btn:active {
      transform: scale(0.96);
      opacity: 0.85;
    }
    .btn-secondary {
      background: #f0f2f5;
      color: #191919;
      margin-left: 8px;
    }
    .counter-val {
      font-size: 36px;
      font-weight: 700;
      color: #0a59f7;
      margin: 12px 0;
    }
    .toggle-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
    }
    .switch {
      position: relative;
      width: 48px;
      height: 28px;
      background: #bcc1c8;
      border-radius: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .switch.on {
      background: #0a59f7;
    }
    .switch-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 24px;
      height: 24px;
      background: #ffffff;
      border-radius: 12px;
      transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .switch.on .switch-knob {
      transform: translateX(20px);
    }
    .log-box {
      background: #16181b;
      color: #a0a6b0;
      font-family: monospace;
      font-size: 12px;
      padding: 12px;
      border-radius: 12px;
      max-height: 120px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">响应式状态</div>
    <div class="card-title">计数器组件</div>
    <div class="counter-val" id="countDisplay">0</div>
    <div>
      <button class="btn" id="incBtn">增加计数</button>
      <button class="btn btn-secondary" id="resetBtn">重置</button>
    </div>
  </div>

  <div class="card">
    <div class="card-title">系统特性开关</div>
    <div class="toggle-row">
      <span>微动效模式</span>
      <div class="switch on" id="togglePhysics"><div class="switch-knob"></div></div>
    </div>
    <div class="toggle-row">
      <span>低延迟渲染通道</span>
      <div class="switch" id="toggleRender"><div class="switch-knob"></div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">事件输出流</div>
    <div class="log-box" id="eventLogs">
      [系统启动] 交互环境初始化完成
    </div>
  </div>

  <script src="script.js"></script>
</body>
</html>`
      },
      {
        id: 'main-js',
        name: 'script.js',
        language: 'javascript',
        content: `let count = 0;
const countDisplay = document.getElementById('countDisplay');
const incBtn = document.getElementById('incBtn');
const resetBtn = document.getElementById('resetBtn');
const eventLogs = document.getElementById('eventLogs');

function logEvent(msg) {
  const time = new Date().toTimeString().split(' ')[0];
  const item = document.createElement('div');
  item.textContent = '[' + time + '] ' + msg;
  eventLogs.appendChild(item);
  eventLogs.scrollTop = eventLogs.scrollHeight;
  console.log('[UI Event]', msg);
}

incBtn.addEventListener('click', () => {
  count += 1;
  countDisplay.textContent = count;
  logEvent('计数更新为: ' + count);
});

resetBtn.addEventListener('click', () => {
  count = 0;
  countDisplay.textContent = count;
  logEvent('计数已重置为 0');
});

document.querySelectorAll('.switch').forEach(sw => {
  sw.addEventListener('click', () => {
    sw.classList.toggle('on');
    const isOn = sw.classList.contains('on');
    logEvent(sw.id + ' 状态切换为: ' + (isOn ? '开启' : '关闭'));
  });
});

console.info('演示应用加载完成，准备交互。');`
      }
    ]
  },
  {
    id: 'particle-physics-canvas',
    title: '物理粒子引擎画布',
    description: 'HTML5 Canvas 粒子动力学仿真，支持触摸引力与速度向量计算。',
    language: 'javascript',
    executionType: 'html-preview',
    tags: ['Canvas', '物理仿真', '动画'],
    createdAt: Date.now() - 3600000 * 48,
    updatedAt: Date.now() - 3600000 * 5,
    activeFileId: 'particles-js',
    files: [
      {
        id: 'particles-html',
        name: 'index.html',
        language: 'html',
        isEntry: true,
        content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000000;
      color: #ffffff;
      font-family: -apple-system, sans-serif;
      overflow: hidden;
      touch-action: none;
    }
    #canvas {
      display: block;
      width: 100vw;
      height: 100vh;
    }
    .hud {
      position: absolute;
      top: 16px;
      left: 16px;
      background: rgba(22, 24, 27, 0.85);
      border: 1px solid #292d34;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 12px;
      pointer-events: none;
    }
    .hud-title {
      font-weight: 700;
      color: #317af7;
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="hud">
    <div class="hud-title">粒子物理仿真</div>
    <div>粒子总数: <span id="particleCount">80</span></div>
    <div>FPS: <span id="fpsDisplay">60</span></div>
    <div style="color:#a0a6b0; margin-top:4px;">触摸或点击屏幕产生引力场</div>
  </div>
  <canvas id="canvas"></canvas>
  <script src="particles.js"></script>
</body>
</html>`
      },
      {
        id: 'particles-js',
        name: 'particles.js',
        language: 'javascript',
        content: `const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const fpsDisplay = document.getElementById('fpsDisplay');

let width = (canvas.width = window.innerWidth);
let height = (canvas.height = window.innerHeight);

window.addEventListener('resize', () => {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
});

const particles = [];
const PARTICLE_COUNT = 80;
const mouse = { x: width / 2, y: height / 2, active: false };

class Particle {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    this.radius = Math.random() * 2.5 + 1.5;
    this.color = Math.random() > 0.5 ? '#317af7' : '#ffffff';
  }
  update() {
    if (mouse.active) {
      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 180 && dist > 10) {
        this.vx += (dx / dist) * 0.15;
        this.vy += (dy / dist) * 0.15;
      }
    }
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.98;
    this.vy *= 0.98;

    if (this.x < 0) { this.x = width; }
    if (this.x > width) { this.x = 0; }
    if (this.y < 0) { this.y = height; }
    if (this.y > height) { this.y = 0; }
  }
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

for (let i = 0; i < PARTICLE_COUNT; i++) {
  particles.push(new Particle());
}

function handlePointer(e) {
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  mouse.x = clientX;
  mouse.y = clientY;
  mouse.active = true;
}

window.addEventListener('mousemove', handlePointer);
window.addEventListener('touchstart', handlePointer);
window.addEventListener('touchmove', handlePointer);
window.addEventListener('touchend', () => { mouse.active = false; });
window.addEventListener('mouseup', () => { mouse.active = false; });

let lastTime = performance.now();
let frames = 0;

function animate(now) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < particles.length; i++) {
    particles[i].update();
    particles[i].draw();

    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 90) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = 'rgba(49, 122, 247, ' + (1 - dist / 90) * 0.3 + ')';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }

  frames++;
  if (now - lastTime >= 1000) {
    fpsDisplay.textContent = frames;
    frames = 0;
    lastTime = now;
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
console.log('粒子引擎已初始化，粒子数量:', PARTICLE_COUNT);`
      }
    ]
  },
  {
    id: 'algorithm-sandbox',
    title: '算法与数据结构操场',
    description: '快速排序、二分查找与斐波那契数列算法性能分析及控制台追踪。',
    language: 'javascript',
    executionType: 'js-sandbox',
    tags: ['算法', '性能测试', '控制台'],
    createdAt: Date.now() - 3600000 * 12,
    updatedAt: Date.now() - 3600000 * 1,
    activeFileId: 'algo-main',
    files: [
      {
        id: 'algo-main',
        name: 'algorithms.js',
        language: 'javascript',
        isEntry: true,
        content: `// 算法与性能测试套件

// 1. 快速排序实现
function quickSort(arr) {
  if (arr.length <= 1) return arr;
  const pivot = arr[Math.floor(arr.length / 2)];
  const left = arr.filter(x => x < pivot);
  const middle = arr.filter(x => x === pivot);
  const right = arr.filter(x => x > pivot);
  return [...quickSort(left), ...middle, ...quickSort(right)];
}

// 2. 二分查找实现
function binarySearch(arr, target) {
  let low = 0;
  let high = arr.length - 1;
  let steps = 0;

  while (low <= high) {
    steps++;
    const mid = Math.floor((low + high) / 2);
    if (arr[mid] === target) {
      return { index: mid, steps };
    }
    if (arr[mid] < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return { index: -1, steps };
}

// 生成随机数组进行测试
console.info('=== 开始执行算法性能基准测试 ===');

const testSize = 20;
const rawData = Array.from({ length: testSize }, () => Math.floor(Math.random() * 100));

console.log('原始无序数组:', rawData);

const startTime = performance.now();
const sortedData = quickSort(rawData);
const sortDuration = (performance.now() - startTime).toFixed(3);

console.log('快速排序完成:', sortedData);
console.log('排序耗时:', sortDuration, 'ms');

// 二分查找测试
const targetValue = sortedData[Math.floor(testSize / 2)];
const searchResult = binarySearch(sortedData, targetValue);

console.log('查找目标值:', targetValue);
console.log('二分查找命中索引:', searchResult.index, '比较次数:', searchResult.steps);

// 斐波那契数列记忆化生成
function fibonacci(n, memo = {}) {
  if (n in memo) return memo[n];
  if (n <= 1) return n;
  memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo);
  return memo[n];
}

const fibSeq = Array.from({ length: 10 }, (_, i) => fibonacci(i));
console.log('斐波那契前10项:', fibSeq);

console.info('=== 测试完成，所有算法执行无异常 ===');
return { sortedData, searchResult, fibSeq };`
      }
    ]
  },
  {
    id: 'calculator-app',
    title: '轻量响应式计算器',
    description: '基于标准样式的移动端计算器，支持四则运算与历史记录。',
    language: 'javascript',
    executionType: 'html-preview',
    tags: ['应用', '工具', '计算器'],
    createdAt: Date.now() - 3600000 * 72,
    updatedAt: Date.now() - 3600000 * 8,
    activeFileId: 'calc-html',
    files: [
      {
        id: 'calc-html',
        name: 'index.html',
        language: 'html',
        isEntry: true,
        content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Noto Sans SC", sans-serif;
      background: #f7f8fa;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 16px;
    }
    .calc-box {
      width: 100%;
      max-width: 340px;
      background: #ffffff;
      border-radius: 24px;
      padding: 20px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.06);
      border: 1px solid #e5e8ed;
    }
    .display {
      background: #f0f2f5;
      border-radius: 16px;
      padding: 16px;
      text-align: right;
      margin-bottom: 16px;
    }
    .history {
      font-size: 14px;
      color: #8e9297;
      min-height: 20px;
    }
    .result {
      font-size: 32px;
      font-weight: 700;
      color: #191919;
      margin-top: 4px;
      overflow-x: auto;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
    .btn {
      height: 52px;
      border-radius: 16px;
      border: none;
      font-size: 18px;
      font-weight: 600;
      background: #f0f2f5;
      color: #191919;
      cursor: pointer;
      transition: transform 0.15s, opacity 0.15s;
    }
    .btn:active {
      transform: scale(0.94);
      opacity: 0.8;
    }
    .btn.op {
      background: rgba(10, 89, 247, 0.1);
      color: #0a59f7;
    }
    .btn.primary {
      background: #0a59f7;
      color: #ffffff;
    }
    .btn.clear {
      color: #e84026;
      background: rgba(232, 64, 38, 0.1);
    }
  </style>
</head>
<body>
  <div class="calc-box">
    <div class="display">
      <div class="history" id="history"></div>
      <div class="result" id="result">0</div>
    </div>
    <div class="grid">
      <button class="btn clear" onclick="calcClear()">C</button>
      <button class="btn op" onclick="calcOp('+/-')">+/-</button>
      <button class="btn op" onclick="calcOp('%')">%</button>
      <button class="btn op" onclick="calcOp('/')">/</button>

      <button class="btn" onclick="calcNum('7')">7</button>
      <button class="btn" onclick="calcNum('8')">8</button>
      <button class="btn" onclick="calcNum('9')">9</button>
      <button class="btn op" onclick="calcOp('*')">*</button>

      <button class="btn" onclick="calcNum('4')">4</button>
      <button class="btn" onclick="calcNum('5')">5</button>
      <button class="btn" onclick="calcNum('6')">6</button>
      <button class="btn op" onclick="calcOp('-')">-</button>

      <button class="btn" onclick="calcNum('1')">1</button>
      <button class="btn" onclick="calcNum('2')">2</button>
      <button class="btn" onclick="calcNum('3')">3</button>
      <button class="btn op" onclick="calcOp('+')">+</button>

      <button class="btn" style="grid-column: span 2;" onclick="calcNum('0')">0</button>
      <button class="btn" onclick="calcNum('.')">.</button>
      <button class="btn primary" onclick="calcEquals()">=</button>
    </div>
  </div>

  <script>
    let currentInput = '0';
    let prevInput = '';
    let operation = null;
    const resultEl = document.getElementById('result');
    const historyEl = document.getElementById('history');

    function updateView() {
      resultEl.textContent = currentInput;
      historyEl.textContent = prevInput + (operation ? ' ' + operation : '');
    }

    function calcNum(n) {
      if (currentInput === '0' && n !== '.') {
        currentInput = n;
      } else {
        if (n === '.' && currentInput.includes('.')) return;
        currentInput += n;
      }
      updateView();
    }

    function calcClear() {
      currentInput = '0';
      prevInput = '';
      operation = null;
      updateView();
    }

    function calcOp(op) {
      if (op === '+/-') {
        currentInput = String(-parseFloat(currentInput));
        updateView();
        return;
      }
      if (op === '%') {
        currentInput = String(parseFloat(currentInput) / 100);
        updateView();
        return;
      }
      if (operation !== null) calcEquals();
      prevInput = currentInput;
      currentInput = '0';
      operation = op;
      updateView();
    }

    function calcEquals() {
      if (!operation || prevInput === '') return;
      const prev = parseFloat(prevInput);
      const curr = parseFloat(currentInput);
      let res = 0;
      switch(operation) {
        case '+': res = prev + curr; break;
        case '-': res = prev - curr; break;
        case '*': res = prev * curr; break;
        case '/': res = curr !== 0 ? prev / curr : '错误'; break;
      }
      historyEl.textContent = prevInput + ' ' + operation + ' ' + currentInput + ' =';
      currentInput = String(res);
      prevInput = '';
      operation = null;
      resultEl.textContent = currentInput;
      console.log('计算结果:', res);
    }
  </script>
</body>
</html>`
      }
    ]
  },
  {
    id: 'python-data-analysis',
    title: 'Python 数据统计与算法',
    description: '使用 Python 3 进行数据列表分析、斐波那契数列计算与多维字典处理。',
    language: 'python',
    executionType: 'python-sandbox',
    tags: ['Python', '算法', '统计分析'],
    createdAt: Date.now() - 3600000 * 12,
    updatedAt: Date.now() - 3600000 * 1,
    activeFileId: 'main-py',
    files: [
      {
        id: 'main-py',
        name: 'main.py',
        language: 'python',
        isEntry: true,
        content: `# Python 3 综合运算与数据分析脚本

def fibonacci(n):
    """计算斐波那契数列前 n 项"""
    if n <= 0:
        return []
    fib = [0, 1]
    while len(fib) < n:
        fib.append(fib[-1] + fib[-2])
    return fib[:n]

def analyze_scores(scores):
    """对成绩数据进行聚合统计分析"""
    count = len(scores)
    if count == 0:
        return None
    total = sum(scores)
    avg = round(total / count, 2)
    highest = max(scores)
    lowest = min(scores)
    
    # 评级分布
    levels = {"优秀(90+)": 0, "良好(80-89)": 0, "及格(60-79)": 0, "需努力(<60)": 0}
    for s in scores:
        if s >= 90:
            levels["优秀(90+)"] += 1
        elif s >= 80:
            levels["良好(80-89)"] += 1
        elif s >= 60:
            levels["及格(60-79)"] += 1
        else:
            levels["需努力(<60)"] += 1
            
    return {
        "样本数量": count,
        "总分": total,
        "平均分": avg,
        "最高分": highest,
        "最低分": lowest,
        "分布情况": levels
    }

# 1. 斐波那契计算演示
fib_seq = fibonacci(10)
print("斐波那契数列前10项:", fib_seq)

# 2. 数据分析运算
class_scores = [88, 92, 75, 63, 99, 84, 58, 91, 79, 85, 96, 68]
print("原始成绩单:", class_scores)

stats = analyze_scores(class_scores)
print("统计报告:")
for key, value in stats.items():
    print(f"  - {key}: {value}")
`
      }
    ]
  }
];
