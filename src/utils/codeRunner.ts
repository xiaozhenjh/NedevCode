import { ConsoleLogItem, ExecutionResult, ProjectFile, PythonEnginePreference, VisualOutputData } from '../types';

/**
 * Resolve project file by path or name, supporting relative prefixes and extensions
 */
export function resolveProjectFile(
  pathOrName: string,
  files: ProjectFile[]
): ProjectFile | undefined {
  if (!files || files.length === 0 || !pathOrName) return undefined;
  const clean = pathOrName.trim().replace(/^\.\//, '').replace(/^\//, '');
  const baseName = clean.split('/').pop() || clean;

  // 1. Direct name or path match
  let match = files.find(
    (f) =>
      f.name === clean ||
      f.name === pathOrName ||
      (f.path && (f.path === clean || f.path === pathOrName))
  );
  if (match) return match;

  // 2. Base name match
  match = files.find((f) => f.name === baseName);
  if (match) return match;

  // 3. Match with common extensions
  const extensions = ['.js', '.ts', '.json', '.py', '.jsx', '.tsx', '.mjs', '.cjs', '.txt', '.html', '.css'];
  for (const ext of extensions) {
    match = files.find(
      (f) =>
        f.name === clean + ext ||
        f.name === baseName + ext ||
        (f.path && f.path === clean + ext)
    );
    if (match) return match;
  }

  // 4. Match directory index
  for (const ext of ['.js', '.ts', '.json', '.py']) {
    match = files.find(
      (f) =>
        f.name === `${clean}/index${ext}` ||
        (f.path && f.path === `${clean}/index${ext}`)
    );
    if (match) return match;
  }

  return undefined;
}

/**
 * Strips TypeScript types and transpiles TypeScript-specific constructs to plain JavaScript
 */
export function stripTypeScript(source: string): string {
  let code = source;

  // 1. Remove interfaces: interface Name<T> extends Foo { ... }
  code = code.replace(/\binterface\s+[A-Za-z0-9_$]+(?:\s*<[^>]+>)?(?:\s+extends[^{]+)?\s*\{[\s\S]*?\}/g, '');

  // 2. Remove type aliases: type Name<T> = ...;
  code = code.replace(/\btype\s+[A-Za-z0-9_$]+(?:\s*<[^>]+>)?\s*=[\s\S]*?;/g, '');

  // 3. Remove declare statements
  code = code.replace(/\bdeclare\s+(?:const|let|var|function|class|module|namespace|global)\b[^;]+;/g, '');

  // 4. Transpile enums: enum Direction { Up = 1, Down, Left, Right }
  code = code.replace(/\benum\s+([A-Za-z0-9_$]+)\s*\{([^}]+)\}/g, (_match, name, body) => {
    const members = body.split(',').map((m: string) => m.trim()).filter(Boolean);
    let curVal = 0;
    const lines: string[] = [`var ${name} = (function(${name}) {`];
    for (const m of members) {
      const parts = m.split('=').map((s: string) => s.trim());
      const k = parts[0];
      const v = parts[1];
      if (v !== undefined) {
        const num = Number(v);
        if (!isNaN(num)) {
          curVal = num;
          lines.push(`  ${name}[${name}["${k}"] = ${v}] = "${k}";`);
          curVal++;
        } else {
          lines.push(`  ${name}["${k}"] = ${v};`);
        }
      } else {
        lines.push(`  ${name}[${name}["${k}"] = ${curVal}] = "${k}";`);
        curVal++;
      }
    }
    lines.push(`  return ${name};`);
    lines.push(`})(${name} || {});`);
    return lines.join('\n');
  });

  // 5. Remove 'as [const|type]' and 'satisfies [type]'
  code = code.replace(/\s+as\s+(?:const|[A-Za-z0-9_$]+(?:\s*<[^>]+>)?(?:\[\])*)/g, '');
  code = code.replace(/\s+satisfies\s+[A-Za-z0-9_$]+(?:\s*<[^>]+>)?(?:\[\])*/g, '');

  // 6. Remove non-null assertion operator: foo!.bar -> foo.bar
  code = code.replace(/([A-Za-z0-9_$)\]])!(\s*[.[(])/g, '$1$2');

  // 7. Remove class access modifiers
  code = code.replace(/^\s*(?:public|private|protected|readonly|override|abstract)\s+/gm, '');

  // 8. Remove generic parameters in function definitions
  code = code.replace(/(function(?:\s+[A-Za-z0-9_$]+)?)\s*<[A-Za-z0-9_$,\s=]+>\s*\(/g, '$1(');

  // 9. Remove function return type annotations: ): returnType { or ): returnType =>
  code = code.replace(/(\)\s*):\s*[A-Za-z0-9_$<>[\]|&\s]+(?=\s*(=>|\{))/g, '$1 ');

  // 10. Remove parameter types in function signatures: (a: string, b: number = 1) -> (a, b = 1)
  code = code.replace(/(\b[a-zA-Z0-9_$]+\??)\s*:\s*[A-Za-z0-9_$<>[\]|&?]+(\s*[,)=])/g, (_m, param, after) => {
    const cleanParam = param.replace(/\?$/, '');
    return cleanParam + after;
  });

  // 11. Remove variable type annotations: const a: number = 1; let b: string;
  code = code.replace(/\b(const|let|var)\s+([A-Za-z0-9_$]+)\s*:\s*[A-Za-z0-9_$<>[\]|&]+(\s*=|\s*;)/g, '$1 $2$3');

  // 12. Remove generic type arguments on instantiations: new Set<string>() -> new Set()
  code = code.replace(/new\s+([A-Za-z0-9_$.]+)\s*<[A-Za-z0-9_$,\s<>]+>\s*\(/g, 'new $1(');

  return code;
}

/**
 * Transpiles ES Module import/export statements and TypeScript into CommonJS format
 */
export function transpileModuleCode(source: string): string {
  let transformed = stripTypeScript(source);

  // 1. Transform side-effect imports: import 'path';
  transformed = transformed.replace(
    /^\s*import\s+['"]([^'"]+)['"]\s*;?/gm,
    'require("$1");'
  );

  // 2. Transform namespace imports: import * as name from 'path';
  transformed = transformed.replace(
    /^\s*import\s+\*\s+as\s+([a-zA-Z0-9_$]+)\s+from\s+['"]([^'"]+)['"]\s*;?/gm,
    'const $1 = require("$2");'
  );

  // 3. Transform combined default & named imports: import def, { a, b as c } from 'path';
  transformed = transformed.replace(
    /^\s*import\s+([a-zA-Z0-9_$]+)\s*,\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]\s*;?/gm,
    (_match, defName, named, path) => {
      const namedBindings = named
        .split(',')
        .map((s: string) => {
          const parts = s.trim().split(/\s+as\s+/);
          return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : parts[0].trim();
        })
        .filter(Boolean)
        .join(', ');
      return `const _req_${defName} = require("${path}"); const ${defName} = _req_${defName}.default !== undefined ? _req_${defName}.default : _req_${defName}; const { ${namedBindings} } = _req_${defName};`;
    }
  );

  // 4. Transform named imports: import { a, b as c } from 'path';
  transformed = transformed.replace(
    /^\s*import\s+\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]\s*;?/gm,
    (_match, named, path) => {
      const namedBindings = named
        .split(',')
        .map((s: string) => {
          const parts = s.trim().split(/\s+as\s+/);
          return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : parts[0].trim();
        })
        .filter(Boolean)
        .join(', ');
      return `const { ${namedBindings} } = require("${path}");`;
    }
  );

  // 5. Transform default imports: import def from 'path';
  transformed = transformed.replace(
    /^\s*import\s+([a-zA-Z0-9_$]+)\s+from\s+['"]([^'"]+)['"]\s*;?/gm,
    'const _mod_$1 = require("$2"); const $1 = _mod_$1.default !== undefined ? _mod_$1.default : _mod_$1;'
  );

  // 6. Transform export default
  transformed = transformed.replace(
    /^\s*export\s+default\s+([^;]+);?/gm,
    'const _defaultExport = ($1); module.exports.default = _defaultExport; if (typeof _defaultExport === "object" && _defaultExport !== null && !Array.isArray(_defaultExport)) { Object.assign(module.exports, _defaultExport); }'
  );

  // 7. Transform export const/let/var
  transformed = transformed.replace(
    /^\s*export\s+(const|let|var)\s+([a-zA-Z0-9_$]+)\s*=/gm,
    '$1 $2 = module.exports.$2 ='
  );

  // 8. Transform export function
  transformed = transformed.replace(
    /^\s*export\s+(async\s+)?function\s+([a-zA-Z0-9_$]+)/gm,
    '$1function $2'
  );
  transformed = transformed.replace(
    /^\s*(async\s+)?function\s+([a-zA-Z0-9_$]+)/gm,
    (match, _async, name) => `${match}; module.exports.${name} = ${name};`
  );

  // 9. Transform export class
  transformed = transformed.replace(
    /^\s*export\s+class\s+([a-zA-Z0-9_$]+)/gm,
    'class $1'
  );
  transformed = transformed.replace(
    /^\s*class\s+([a-zA-Z0-9_$]+)/gm,
    (match, name) => `${match}; module.exports.${name} = ${name};`
  );

  // 10. Transform export { a, b as c }
  transformed = transformed.replace(
    /^\s*export\s+\{([^}]+)\}\s*;?/gm,
    (_match, named) => {
      const assignments = named
        .split(',')
        .map((s: string) => {
          const parts = s.trim().split(/\s+as\s+/);
          const local = parts[0].trim();
          const exported = parts.length === 2 ? parts[1].trim() : local;
          return local ? `module.exports.${exported} = ${local};` : '';
        })
        .filter(Boolean)
        .join(' ');
      return assignments;
    }
  );

  return transformed;
}

/**
 * Real device and hardware API bridge for web/mobile environment
 */
export function createHardwareBridge(pushLog?: (level: ConsoleLogItem['level'], msg: string, data?: unknown, visual?: VisualOutputData) => void) {
  return {
    vibrate: (pattern: number | number[] = 200) => {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        return navigator.vibrate(pattern);
      }
      pushLog?.('warn', '当前环境或设备不支持硬件震动 (navigator.vibrate)');
      return false;
    },

    getBattery: async () => {
      if (typeof navigator !== 'undefined' && typeof (navigator as any).getBattery === 'function') {
        const b = await (navigator as any).getBattery();
        return {
          level: b.level,
          charging: b.charging,
          chargingTime: b.chargingTime,
          dischargingTime: b.dischargingTime
        };
      }
      throw new Error('当前环境或浏览器不支持 Battery Status API');
    },

    getLocation: (options?: PositionOptions): Promise<{
      latitude: number;
      longitude: number;
      accuracy: number;
      altitude: number | null;
      altitudeAccuracy: number | null;
      heading: number | null;
      speed: number | null;
      timestamp: number;
    }> => {
      return new Promise((resolve, reject) => {
        if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                altitude: pos.coords.altitude,
                altitudeAccuracy: pos.coords.altitudeAccuracy,
                heading: pos.coords.heading,
                speed: pos.coords.speed,
                timestamp: pos.timestamp
              });
            },
            (err) => reject(new Error(`获取地理位置失败 (${err.code}): ${err.message}`)),
            options || { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        } else {
          reject(new Error('当前环境不支持 Geolocation API'));
        }
      });
    },

    getDeviceInfo: () => {
      const nav = typeof navigator !== 'undefined' ? navigator : ({} as any);
      const scr = typeof window !== 'undefined' && window.screen ? window.screen : ({} as any);
      return {
        cores: nav.hardwareConcurrency || 1,
        memoryGB: (nav as any).deviceMemory || null,
        platform: nav.platform || 'unknown',
        userAgent: nav.userAgent || '',
        language: nav.language || '',
        online: !!nav.onLine,
        maxTouchPoints: nav.maxTouchPoints || 0,
        screen: {
          width: scr.width || 0,
          height: scr.height || 0,
          availWidth: scr.availWidth || 0,
          availHeight: scr.availHeight || 0,
          colorDepth: scr.colorDepth || 24,
          pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
          orientation: scr.orientation ? scr.orientation.type : 'unknown'
        }
      };
    },

    getNetworkInfo: () => {
      const nav = typeof navigator !== 'undefined' ? navigator : ({} as any);
      const conn = (nav as any).connection || (nav as any).mozConnection || (nav as any).webkitConnection;
      return {
        online: !!nav.onLine,
        downlink: conn?.downlink ?? null,
        effectiveType: conn?.effectiveType ?? (nav.onLine ? 'online' : 'offline'),
        rtt: conn?.rtt ?? null,
        saveData: !!conn?.saveData
      };
    },

    isOnline: () => {
      return typeof navigator !== 'undefined' ? navigator.onLine : true;
    },

    beep: async (frequency = 440, duration = 0.2, type: OscillatorType = 'sine') => {
      const AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
      if (!AudioContextClass) throw new Error('当前环境不支持 Web Audio API');
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
      return new Promise((r) => setTimeout(r, duration * 1000));
    },

    speak: (text: string, lang = 'zh-CN', rate = 1, pitch = 1) => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        return new Promise((resolve) => {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(String(text));
          u.lang = lang;
          u.rate = rate;
          u.pitch = pitch;
          u.onend = () => resolve(true);
          u.onerror = () => resolve(false);
          window.speechSynthesis.speak(u);
        });
      }
      throw new Error('当前环境不支持 SpeechSynthesis 语音朗读');
    },

    listMediaDevices: async () => {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
        const devs = await navigator.mediaDevices.enumerateDevices();
        return devs.map((d) => ({
          deviceId: d.deviceId,
          kind: d.kind,
          label: d.label || (d.kind === 'videoinput' ? '摄像头' : d.kind === 'audioinput' ? '麦克风' : '音频输出')
        }));
      }
      throw new Error('当前环境不支持 navigator.mediaDevices.enumerateDevices');
    },

    copyToClipboard: async (text: string) => {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(String(text));
        return true;
      }
      throw new Error('当前环境不支持 navigator.clipboard.writeText');
    },

    readFromClipboard: async () => {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        return await navigator.clipboard.readText();
      }
      throw new Error('当前环境不支持 navigator.clipboard.readText');
    },

    getStorageEstimate: async () => {
      if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
        const est = await navigator.storage.estimate();
        const quota = est.quota || 0;
        const usage = est.usage || 0;
        return {
          quotaBytes: quota,
          usageBytes: usage,
          quotaMB: parseFloat((quota / (1024 * 1024)).toFixed(2)),
          usageMB: parseFloat((usage / (1024 * 1024)).toFixed(2)),
          usagePercent: quota ? parseFloat(((usage / quota) * 100).toFixed(2)) : 0
        };
      }
      throw new Error('当前环境不支持 navigator.storage.estimate');
    },

    getOrientation: (): Promise<{ alpha: number | null; beta: number | null; gamma: number | null; absolute: boolean }> => {
      return new Promise((resolve) => {
        if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
          resolve({ alpha: null, beta: null, gamma: null, absolute: false });
          return;
        }
        let resolved = false;
        const handler = (e: DeviceOrientationEvent) => {
          if (!resolved) {
            resolved = true;
            window.removeEventListener('deviceorientation', handler);
            resolve({
              alpha: e.alpha !== null ? parseFloat(Number(e.alpha).toFixed(1)) : null,
              beta: e.beta !== null ? parseFloat(Number(e.beta).toFixed(1)) : null,
              gamma: e.gamma !== null ? parseFloat(Number(e.gamma).toFixed(1)) : null,
              absolute: !!e.absolute
            });
          }
        };
        window.addEventListener('deviceorientation', handler);
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            window.removeEventListener('deviceorientation', handler);
            resolve({ alpha: null, beta: null, gamma: null, absolute: false });
          }
        }, 500);
      });
    },

    getMotion: (): Promise<{
      acceleration: { x: number | null; y: number | null; z: number | null };
      accelerationIncludingGravity: { x: number | null; y: number | null; z: number | null };
      rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null;
      interval: number | null;
    }> => {
      return new Promise((resolve) => {
        if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
          resolve({
            acceleration: { x: null, y: null, z: null },
            accelerationIncludingGravity: { x: null, y: null, z: null },
            rotationRate: null,
            interval: null
          });
          return;
        }
        let resolved = false;
        const handler = (e: DeviceMotionEvent) => {
          if (!resolved) {
            resolved = true;
            window.removeEventListener('devicemotion', handler);
            resolve({
              acceleration: {
                x: e.acceleration?.x != null ? parseFloat(Number(e.acceleration.x).toFixed(2)) : null,
                y: e.acceleration?.y != null ? parseFloat(Number(e.acceleration.y).toFixed(2)) : null,
                z: e.acceleration?.z != null ? parseFloat(Number(e.acceleration.z).toFixed(2)) : null
              },
              accelerationIncludingGravity: {
                x: e.accelerationIncludingGravity?.x != null ? parseFloat(Number(e.accelerationIncludingGravity.x).toFixed(2)) : null,
                y: e.accelerationIncludingGravity?.y != null ? parseFloat(Number(e.accelerationIncludingGravity.y).toFixed(2)) : null,
                z: e.accelerationIncludingGravity?.z != null ? parseFloat(Number(e.accelerationIncludingGravity.z).toFixed(2)) : null
              },
              rotationRate: e.rotationRate
                ? {
                    alpha: e.rotationRate.alpha != null ? parseFloat(Number(e.rotationRate.alpha).toFixed(1)) : null,
                    beta: e.rotationRate.beta != null ? parseFloat(Number(e.rotationRate.beta).toFixed(1)) : null,
                    gamma: e.rotationRate.gamma != null ? parseFloat(Number(e.rotationRate.gamma).toFixed(1)) : null
                  }
                : null,
              interval: e.interval ?? null
            });
          }
        };
        window.addEventListener('devicemotion', handler);
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            window.removeEventListener('devicemotion', handler);
            resolve({
              acceleration: { x: null, y: null, z: null },
              accelerationIncludingGravity: { x: null, y: null, z: null },
              rotationRate: null,
              interval: null
            });
          }
        }, 500);
      });
    },

    requestWakeLock: async () => {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        try {
          const lock = await (navigator as any).wakeLock.request('screen');
          (window as any).__currentWakeLock = lock;
          pushLog?.('system', '屏幕常亮已激活');
          return true;
        } catch (e: any) {
          pushLog?.('warn', `无法激活屏幕常亮: ${e.message}`);
          return false;
        }
      }
      pushLog?.('warn', '当前环境或设备不支持 Screen Wake Lock API');
      return false;
    },

    releaseWakeLock: async () => {
      const lock = (window as any).__currentWakeLock;
      if (lock && typeof lock.release === 'function') {
        await lock.release();
        (window as any).__currentWakeLock = null;
        pushLog?.('system', '屏幕常亮已解除');
        return true;
      }
      return false;
    },

    takePhoto: async (options?: { facingMode?: 'user' | 'environment'; width?: number; height?: number; display?: boolean }): Promise<{
      dataUrl: string;
      width: number;
      height: number;
    }> => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('当前环境或设备不支持摄像头访问 (getUserMedia)');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: options?.facingMode || 'user',
          width: options?.width ? { ideal: options.width } : undefined,
          height: options?.height ? { ideal: options.height } : undefined
        }
      });
      try {
        const video = document.createElement('video');
        video.playsInline = true;
        video.muted = true;
        video.srcObject = stream;
        await video.play();
        await new Promise((r) => setTimeout(r, 200));

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        const dataUrl = canvas.toDataURL('image/png');

        if (options?.display !== false) {
          pushLog?.('visual', '[摄像头拍摄照片]', undefined, {
            type: 'image',
            title: '摄像头拍摄照片',
            content: dataUrl
          });
        }
        return {
          dataUrl,
          width: canvas.width,
          height: canvas.height
        };
      } finally {
        stream.getTracks().forEach((track) => track.stop());
      }
    },

    toggleTorch: async (enable: boolean) => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('当前环境不支持摄像头闪光灯控制');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      try {
        const track = stream.getVideoTracks()[0];
        const capabilities = (track as any).getCapabilities ? (track as any).getCapabilities() : {};
        if (!capabilities.torch) {
          throw new Error('当前设备不支持手电筒/补光灯硬件控制');
        }
        await (track as any).applyConstraints({ advanced: [{ torch: enable }] });
        pushLog?.('system', `手电筒/补光灯已${enable ? '开启' : '关闭'}`);
        return true;
      } finally {
        if (!enable) {
          stream.getTracks().forEach((t) => t.stop());
        }
      }
    },

    listenSpeech: (options?: { lang?: string; timeout?: number }): Promise<string> => {
      return new Promise((resolve, reject) => {
        const SpeechRec = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
        if (!SpeechRec) {
          reject(new Error('当前浏览器环境不支持 Web Speech 语音识别'));
          return;
        }
        const recognition = new SpeechRec();
        recognition.lang = options?.lang || 'zh-CN';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        let hasResult = false;
        const timer = setTimeout(() => {
          if (!hasResult) {
            try { recognition.stop(); } catch {}
            reject(new Error('语音识别超时，未检测到有效语音'));
          }
        }, (options?.timeout || 10) * 1000);

        recognition.onresult = (event: any) => {
          hasResult = true;
          clearTimeout(timer);
          const transcript = event.results[0][0].transcript;
          pushLog?.('log', `[语音识别]: ${transcript}`);
          resolve(transcript);
        };

        recognition.onerror = (err: any) => {
          clearTimeout(timer);
          reject(new Error(`语音识别失败: ${err.error || err.message}`));
        };

        recognition.start();
        pushLog?.('system', '正在监听麦克风语音输入...');
      });
    },

    getGamepads: () => {
      if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        const pads = navigator.getGamepads();
        const results = [];
        for (let i = 0; i < pads.length; i++) {
          const p = pads[i];
          if (p) {
            results.push({
              index: p.index,
              id: p.id,
              connected: p.connected,
              buttons: Array.from(p.buttons).map((b) => ({ pressed: b.pressed, value: b.value })),
              axes: Array.from(p.axes)
            });
          }
        }
        return results;
      }
      return [];
    },

    showHardwareStatus: async () => {
      const dev = (createHardwareBridge(pushLog)).getDeviceInfo();
      let battery = null;
      try {
        battery = await (createHardwareBridge(pushLog)).getBattery();
      } catch {}
      const network = (createHardwareBridge(pushLog)).getNetworkInfo();
      let storage = null;
      try {
        storage = await (createHardwareBridge(pushLog)).getStorageEstimate();
      } catch {}
      let orientation = null;
      try {
        orientation = await (createHardwareBridge(pushLog)).getOrientation();
      } catch {}

      const payload = {
        device: dev,
        battery,
        network,
        storage,
        screen: dev.screen,
        orientation: (orientation && orientation.alpha !== null) ? orientation : null
      };

      pushLog?.('visual', '[设备硬件与传感器监控]', undefined, {
        type: 'hardware',
        title: '设备硬件与传感器状态',
        content: JSON.stringify(payload)
      });
      return payload;
    }
  };
}

/**
 * Helper to manage Tkinter interactive windows
 */
export function createTkWindowHelper(pushLog: (level: ConsoleLogItem['level'], msg: string, data?: unknown, visual?: VisualOutputData) => void) {
  return (winId: string, title: string) => {
    (window as any).__tkActiveBodies = (window as any).__tkActiveBodies || new Map<string, HTMLElement>();

    let body = (window as any).__tkActiveBodies.get(winId);
    if (!body) {
      body = document.createElement('div');
      body.id = `tk-window-body-${winId}`;
      body.className = 'tk-window-body p-4 bg-[var(--bg-secondary)] min-h-[90px] flex flex-col items-center justify-center gap-2.5 overflow-x-auto w-full';
      (window as any).__tkActiveBodies.set(winId, body);
    }

    pushLog('visual', `[Tkinter GUI: ${title || '窗口'}]`, undefined, {
      type: 'gui',
      title: title || 'Tkinter 窗口',
      content: winId
    });

    return body;
  };
}

export function runJavaScriptSandbox(
  code: string,
  npmPackages: string[] = [],
  onLog: (log: ConsoleLogItem) => void,
  projectFiles: ProjectFile[] = [],
  onPrompt?: (promptText: string) => Promise<string>
): Promise<ExecutionResult> {
  return new Promise(async (resolve) => {
    const logs: ConsoleLogItem[] = [];
    
    // Clear any existing Tkinter bodies to prevent conflicts on re-run
    if (typeof window !== 'undefined') {
      (window as any).__tkActiveBodies = new Map<string, HTMLElement>();
    }

    const timers: Record<string, number> = {};

    const pushLog = (
      level: ConsoleLogItem['level'],
      message: string,
      data?: unknown,
      visual?: VisualOutputData
    ) => {
      const item: ConsoleLogItem = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        level,
        message,
        timestamp: Date.now(),
        data,
        visual
      };
      logs.push(item);
      onLog(item);
    };

    const pushVisual = (
      type: VisualOutputData['type'],
      content: string,
      title?: string,
      extra?: { columns?: string[]; rows?: any[] }
    ) => {
      const visual: VisualOutputData = {
        type,
        content,
        title,
        columns: extra?.columns,
        rows: extra?.rows
      };
      const label = title || (type === 'image' ? '[图像输出]' : type === 'table' ? '[表格展示]' : '[可视化输出]');
      pushLog('visual', label, undefined, visual);
    };

    const promptFn = async (promptMsg = '请输入:') => {
      const p = String(promptMsg);
      pushLog('log', p);
      let res = '';
      if (onPrompt) {
        res = await onPrompt(p);
      } else {
        res = window.prompt(p) ?? '';
      }
      pushLog('info', `> ${res}`);
      return res;
    };

    const displayFn = (item: any, options?: { title?: string; type?: VisualOutputData['type'] }) => {
      if (item === null || item === undefined) return;
      if (options?.type) {
        pushVisual(options.type, String(item), options.title);
        return;
      }
      if (typeof item === 'object' && typeof item.toDataURL === 'function') {
        pushVisual('image', item.toDataURL(), options?.title || 'Canvas 绘图');
        return;
      }
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed.startsWith('data:image/') || /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|svg)/i.test(trimmed)) {
          pushVisual('image', trimmed, options?.title || '图像');
        } else if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
          pushVisual('html', trimmed, options?.title);
        } else {
          customConsole.log(item);
        }
        return;
      }
      if (Array.isArray(item) && item.length > 0 && typeof item[0] === 'object' && item[0] !== null) {
        const cols = Array.from(new Set(item.flatMap((d) => Object.keys(d))));
        const rows = item.map((d) => cols.map((c) => d[c]));
        pushVisual('table', '', options?.title || '数据表格', { columns: cols, rows });
        return;
      }
      if (typeof item === 'object' && Array.isArray(item.columns) && Array.isArray(item.rows)) {
        pushVisual('table', '', options?.title || '数据表格', { columns: item.columns, rows: item.rows });
        return;
      }
      customConsole.log(item);
    };

    const showHtmlFn = (html: string, title?: string) => pushVisual('html', String(html), title);
    const showImageFn = (src: string, title?: string) => pushVisual('image', String(src), title);
    const showTableFn = (columnsOrData: any, rows?: any[], title?: string) => {
      if (Array.isArray(columnsOrData) && rows) {
        pushVisual('table', '', title, { columns: columnsOrData, rows });
      } else {
        displayFn(columnsOrData, { title });
      }
    };
    const showAlertFn = (msg: string, title?: string) => pushVisual('alert', String(msg), title);
    const createCanvasFn = (width = 300, height = 200) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      (canvas as any).show = (title?: string) => {
        pushVisual('image', canvas.toDataURL(), title || 'Canvas 绘图');
      };
      return canvas;
    };

    const customConsole = {
      log: (...args: unknown[]) => {
        const msg = args.map(a => formatLogArg(a)).join(' ');
        pushLog('log', msg, args.length === 1 ? args[0] : args);
      },
      info: (...args: unknown[]) => {
        const msg = args.map(a => formatLogArg(a)).join(' ');
        pushLog('info', msg, args.length === 1 ? args[0] : args);
      },
      warn: (...args: unknown[]) => {
        const msg = args.map(a => formatLogArg(a)).join(' ');
        pushLog('warn', msg, args.length === 1 ? args[0] : args);
      },
      error: (...args: unknown[]) => {
        const msg = args.map(a => formatLogArg(a)).join(' ');
        pushLog('error', msg, args.length === 1 ? args[0] : args);
      },
      table: (data: unknown) => {
        try {
          if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
            const cols = Array.from(new Set(data.flatMap((d) => Object.keys(d))));
            const rows = data.map((d) => cols.map((c) => d[c]));
            pushVisual('table', '', '表格展示', { columns: cols, rows });
            return;
          } else if (typeof data === 'object' && data !== null) {
            const cols = ['键 (Key)', '值 (Value)'];
            const rows = Object.entries(data).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
            pushVisual('table', '', '表格展示', { columns: cols, rows });
            return;
          }
          const msg = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
          pushLog('info', '[表格展示] ' + msg, data);
        } catch {
          pushLog('info', String(data), data);
        }
      },
      time: (label = 'default') => {
        timers[label] = performance.now();
      },
      timeEnd: (label = 'default') => {
        if (timers[label]) {
          const elapsed = (performance.now() - timers[label]).toFixed(2);
          pushLog('info', `${label}: ${elapsed}ms`);
          delete timers[label];
        }
      },
      clear: () => {
        logs.length = 0;
        pushLog('system', '控制台已清空');
      }
    };

    const hardware = createHardwareBridge(pushLog);
    const device = hardware;

    const startTime = performance.now();

    try {
      // Load NPM packages dynamically via CDN if specified
      if (npmPackages && npmPackages.length > 0) {
        pushLog('system', `正在加载 NPM 依赖模块: ${npmPackages.join(', ')} ...`);
        await loadNpmScripts(npmPackages, pushLog);
        pushLog('system', 'NPM 依赖库加载就绪。');
      }

      // Module resolution cache
      const moduleCache: Record<string, { exports: any }> = {};

      // Local CommonJS / ES module require resolver
      const localRequire = (request: string) => {
        if (!request) throw new Error('require() 缺少模块名参数');

        // 1. Check local project files
        const matchedFile = resolveProjectFile(request, projectFiles);
        if (matchedFile) {
          // If already cached, return exports
          if (moduleCache[matchedFile.id]) {
            return moduleCache[matchedFile.id].exports;
          }

          // JSON file handling
          if (matchedFile.language === 'json' || matchedFile.name.endsWith('.json')) {
            try {
              const parsed = JSON.parse(matchedFile.content);
              moduleCache[matchedFile.id] = { exports: parsed };
              return parsed;
            } catch (err: any) {
              throw new Error(`解析 JSON 模块 [${matchedFile.name}] 失败: ${err?.message || err}`);
            }
          }

          // JavaScript / TypeScript module handling
          const moduleObj = { exports: {} };
          moduleCache[matchedFile.id] = moduleObj;

          const transpiled = transpileModuleCode(matchedFile.content);
          const hasInnerAwait = /\bawait\s+/.test(transpiled);

          try {
            if (hasInnerAwait) {
              const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
              const moduleFn = new AsyncFunction(
                'exports',
                'require',
                'module',
                '__filename',
                '__dirname',
                'console',
                'performance',
                'setTimeout',
                'setInterval',
                `"use strict";\n${transpiled}`
              );
              // Note: Top-level synchronous execution will initiate async module
              moduleFn(
                moduleObj.exports,
                localRequire,
                moduleObj,
                matchedFile.name,
                '/',
                customConsole,
                performance,
                setTimeout,
                setInterval
              );
            } else {
              const moduleFn = new Function(
                'exports',
                'require',
                'module',
                '__filename',
                '__dirname',
                'console',
                'performance',
                'setTimeout',
                'setInterval',
                `"use strict";\n${transpiled}`
              );
              moduleFn(
                moduleObj.exports,
                localRequire,
                moduleObj,
                matchedFile.name,
                '/',
                customConsole,
                performance,
                setTimeout,
                setInterval
              );
            }
          } catch (mErr: any) {
            throw new Error(`执行模块 [${matchedFile.name}] 失败: ${mErr?.message || mErr}`);
          }

          return moduleObj.exports;
        }

        if (request === 'readline' || request === 'readline/promises') {
          return {
            createInterface: () => {
              const rl = {
                question: (promptText: string, callback?: (answer: string) => void) => {
                  return promptFn(promptText).then((ans) => {
                    if (callback) callback(ans);
                    return ans;
                  });
                },
                close: () => {},
                on: (_event: string, _handler: Function) => rl
              };
              return rl;
            }
          };
        }

        if (request === 'hardware' || request === 'device') {
          return hardware;
        }

        // 2. Check window globals for NPM CDN packages
        const win = window as any;
        const cleanPkg = request.trim().replace(/^@?[a-z0-9_-]+\//, '');
        const camelPkg = cleanPkg.replace(/-([a-z])/g, (_g) => _g[1].toUpperCase());

        if (win[request] !== undefined) return win[request];
        if (win[cleanPkg] !== undefined) return win[cleanPkg];
        if (win[camelPkg] !== undefined) return win[camelPkg];
        if ((request === 'lodash' || request === 'underscore') && win._) return win._;
        if (request === 'dayjs' && win.dayjs) return win.dayjs;
        if (request === 'axios' && win.axios) return win.axios;

        throw new Error(
          `找不到模块 '${request}'。若是同一项目文件，请检查文件名（例如 './${request}'）；若是第三方库，请在包管理器中添加依赖。`
        );
      };

      // Transpile entry file code
      const transpiledCode = transpileModuleCode(code);
      const hasAwait = /\bawait\s+/.test(transpiledCode);

      // Create entry module
      const entryModule = { exports: {} };

      let executor: Function;
      if (hasAwait) {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        executor = new AsyncFunction(
          'exports',
          'require',
          'module',
          '__filename',
          '__dirname',
          'console',
          'performance',
          'setTimeout',
          'setInterval',
          'prompt',
          'input',
          'display',
          'showHtml',
          'showImage',
          'showTable',
          'showAlert',
          'createCanvas',
          'device',
          'hardware',
          `"use strict";\n${transpiledCode}`
        );
      } else {
        executor = new Function(
          'exports',
          'require',
          'module',
          '__filename',
          '__dirname',
          'console',
          'performance',
          'setTimeout',
          'setInterval',
          'prompt',
          'input',
          'display',
          'showHtml',
          'showImage',
          'showTable',
          'showAlert',
          'createCanvas',
          'device',
          'hardware',
          `"use strict";\nreturn (function() {\n${transpiledCode}\n})();`
        );
      }

      const result = await executor(
        entryModule.exports,
        localRequire,
        entryModule,
        'index.js',
        '/',
        customConsole,
        performance,
        setTimeout,
        setInterval,
        promptFn,
        promptFn,
        displayFn,
        showHtmlFn,
        showImageFn,
        showTableFn,
        showAlertFn,
        createCanvasFn,
        device,
        hardware
      );

      const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));

      resolve({
        status: 'success',
        executionTimeMs,
        logs,
        returnValue: result !== undefined ? formatLogArg(result) : undefined
      });
    } catch (err: unknown) {
      const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
      const errorObj = err as Error;

      const stackLines = errorObj.stack ? errorObj.stack.split('\n') : [];
      let line: number | undefined = undefined;
      let col: number | undefined = undefined;

      for (const st of stackLines) {
        const match = /<anonymous>:(\d+):(\d+)/.exec(st) || /eval at <anonymous>.*:(\d+):(\d+)/.exec(st);
        if (match) {
          line = parseInt(match[1], 10);
          col = parseInt(match[2], 10);
          break;
        }
      }

      pushLog('error', `运行时错误: ${errorObj.message}`);

      resolve({
        status: 'error',
        executionTimeMs,
        error: {
          message: errorObj.message,
          line,
          column: col,
          stack: errorObj.stack
        },
        logs
      });
    }
  });
}

// Helper to inject a script element safely with retry
async function loadScriptTag(url: string, id: string): Promise<void> {
  const existing = document.getElementById(id);
  if (existing) return;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`无法从 CDN 加载脚本: ${url}`));
    document.head.appendChild(script);
  });
}

// Dynamically load npm package UMD / bundle via CDN
async function loadNpmScripts(
  packages: string[],
  pushLog: (level: ConsoleLogItem['level'], msg: string) => void
): Promise<void> {
  for (const pkg of packages) {
    const cleanPkg = pkg.trim();
    if (!cleanPkg) continue;

    const scriptId = 'npm-pkg-' + cleanPkg.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (document.getElementById(scriptId)) {
      continue;
    }

    await new Promise<void>((resolve) => {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://cdn.jsdelivr.net/npm/${cleanPkg}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        const fallbackScript = document.createElement('script');
        fallbackScript.id = scriptId;
        fallbackScript.src = `https://unpkg.com/${cleanPkg}`;
        fallbackScript.async = true;
        fallbackScript.onload = () => resolve();
        fallbackScript.onerror = () => {
          pushLog('warn', `依赖包 ${cleanPkg} 加载失败，请检查包名是否正确或网络连接`);
          resolve();
        };
        document.head.appendChild(fallbackScript);
      };
      document.head.appendChild(script);
    });
  }
}

// Cache name in browser CacheStorage
const RUNTIME_CACHE_NAME = 'python-runtime-cache-v1';

/**
 * Fetch a resource from CDN with browser CacheStorage local cache
 */
async function fetchWithLocalCache(
  url: string,
  onStatusUpdate?: (msg: string) => void
): Promise<Response> {
  const fileName = url.split('/').pop() || url;
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      const cachedResponse = await cache.match(url);
      if (cachedResponse) {
        return cachedResponse;
      }
      onStatusUpdate?.(`正在加载 Python 运行时资源并写入本地缓存: ${fileName}`);
      const networkResponse = await fetch(url);
      if (networkResponse.ok) {
        try {
          await cache.put(url, networkResponse.clone());
        } catch {
          // ignore cache put errors in restricted WebViews
        }
      }
      return networkResponse;
    } catch {
      return fetch(url);
    }
  }
  return fetch(url);
}

// ----------------- Pure JS Python Engine (Skulpt) for low-version WebViews -----------------
let skulptPromise: Promise<any> | null = null;

async function ensureSkulptLoaded(onStatusUpdate?: (msg: string) => void): Promise<any> {
  if (skulptPromise) return skulptPromise;

  skulptPromise = (async () => {
    if (typeof (window as any).Sk !== 'undefined') {
      return (window as any).Sk;
    }

    onStatusUpdate?.('正在加载本地纯 JS Python 3 解释器 (Skulpt)...');
    
    // Load Skulpt core and standard library from local path
    await loadScriptTag('/libs/skulpt/skulpt.min.js', 'skulpt-core');
    await loadScriptTag('/libs/skulpt/skulpt-stdlib.js', 'skulpt-stdlib');
    
    const Sk = (window as any).Sk;
    if (!Sk) {
      throw new Error('Skulpt Python 运行时加载失败');
    }
    return Sk;
  })();

  return skulptPromise;
}

async function runSkulptPython(
  code: string,
  onInputPrompt: (promptText: string) => Promise<string>,
  pushLog: (level: ConsoleLogItem['level'], msg: string, data?: unknown, visual?: VisualOutputData) => void,
  onStatusUpdate?: (msg: string) => void,
  projectFiles: ProjectFile[] = []
): Promise<ExecutionResult> {
  const startTime = performance.now();
  const logs: ConsoleLogItem[] = [];

  const localPushLog = (level: ConsoleLogItem['level'], message: string, data?: unknown, visual?: VisualOutputData) => {
    pushLog(level, message, data, visual);
  };

  try {
    const Sk = await ensureSkulptLoaded(onStatusUpdate);

    let lineBuffer = '';
    const outHandler = (text: string) => {
      lineBuffer += text;
      if (lineBuffer.includes('\n')) {
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';
        for (const l of lines) {
          if (l !== '') localPushLog('log', l);
        }
      }
    };

    const builtinRead = (x: string) => {
      // 1. Check local project files
      const matched = resolveProjectFile(x, projectFiles);
      if (matched) {
        return matched.content;
      }

      // 2. Check Skulpt standard library
      if (Sk.builtinFiles !== undefined && Sk.builtinFiles['files'][x] !== undefined) {
        return Sk.builtinFiles['files'][x];
      }

      throw new Error(`找不到模块或文件: '${x}'`);
    };

    // Invalidate cached modules in Skulpt so updated files are freshly reloaded
    if ((Sk as any).sysmodules && projectFiles && projectFiles.length > 0) {
      for (const f of projectFiles) {
        const mod = f.name.replace(/\.[^/.]+$/, '').split('/').pop();
        if (mod) {
          if ((Sk as any).sysmodules.mp$load) delete (Sk as any).sysmodules.mp$load[mod];
          if ((Sk as any).sysmodules.mp$entries) delete (Sk as any).sysmodules.mp$entries[mod];
        }
      }
    }

    Sk.configure({
      output: outHandler,
      read: builtinRead,
      inputfun: async (promptText: string) => {
        if (lineBuffer) {
          localPushLog('log', lineBuffer);
          lineBuffer = '';
        }
        const val = await onInputPrompt(promptText || '');
        return val;
      },
      inputfunTakesPrompt: true,
      retaeval: true,
      __future__: Sk.python3
    });

    try {
      (Sk.builtins as any).display = new (Sk.builtin as any).func((obj: any) => {
        const val = Sk.ffi.remapToJs(obj);
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (trimmed.startsWith('data:image/') || /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|svg)/i.test(trimmed)) {
            pushLog('visual', '[图像输出]', undefined, { type: 'image', content: trimmed, title: '图像' });
          } else if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
            pushLog('visual', '[富文本展示]', undefined, { type: 'html', content: trimmed, title: '富文本展示' });
          } else {
            localPushLog('log', val);
          }
        } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
          const cols = Object.keys(val[0]);
          const rows = val.map((item: any) => cols.map((c) => item[c]));
          pushLog('visual', '[数据表格]', undefined, { type: 'table', content: '', title: '数据表格', columns: cols, rows });
        } else {
          localPushLog('log', typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val));
        }
      });
    } catch {}

    await Sk.misceval.asyncToPromise(() => {
      return Sk.importMainWithBody('<stdin>', false, code, true);
    });

    if (lineBuffer) {
      localPushLog('log', lineBuffer);
      lineBuffer = '';
    }

    const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
    return {
      status: 'success',
      executionTimeMs,
      logs
    };
  } catch (err: any) {
    const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
    const msg = err ? (err.toString ? err.toString() : String(err)) : '未知执行异常';
    localPushLog('error', `Python 异常: ${msg}`);

    let line: number | undefined = undefined;
    if (err && typeof err === 'object' && 'lineno' in err) {
      line = err.lineno;
    } else {
      const match = /line (\d+)/i.exec(msg);
      if (match) line = parseInt(match[1], 10);
    }

    return {
      status: 'error',
      executionTimeMs,
      error: {
        message: msg,
        line,
        stack: err?.stack
      },
      logs
    };
  }
}

// ----------------- WebAssembly Pyodide Engine -----------------
let pyodideInstancePromise: Promise<any> | null = null;

async function getPyodideInstance(onStatusUpdate?: (msg: string) => void): Promise<any> {
  // Check if WebAssembly is supported in this environment
  if (typeof WebAssembly === 'undefined' || typeof WebAssembly.instantiate !== 'function') {
    throw new Error('当前 Webview 环境不支持 WebAssembly');
  }

  if (pyodideInstancePromise) {
    return pyodideInstancePromise;
  }

    pyodideInstancePromise = (async () => {
    try {
      if (typeof (window as any).loadPyodide !== 'function') {
        onStatusUpdate?.('正在加载本地 Python 运行时内核 (Pyodide)...');
        await loadScriptTag('/libs/pyodide/pyodide.js', 'pyodide-core');
      }
 
      onStatusUpdate?.('正在初始化 Python 运行时 (启用本地资源优先)...');
      const pyodide = await (window as any).loadPyodide({
        indexURL: '/libs/pyodide/',
        _fetch: (url: string) => fetchWithLocalCache(url, onStatusUpdate)
      });
      onStatusUpdate?.('Python 运行时已就绪。');
      return pyodide;
    } catch (err) {
      pyodideInstancePromise = null;
      throw err;
    }
  })();

  return pyodideInstancePromise;
}

export async function runPythonSandbox(
  code: string,
  packages: string[] = [],
  onInputPrompt: (promptText: string) => Promise<string>,
  onLog: (log: ConsoleLogItem) => void,
  enginePreference: PythonEnginePreference = 'auto',
  projectFiles: ProjectFile[] = []
): Promise<ExecutionResult> {
  const logs: ConsoleLogItem[] = [];
  
  // Clear any existing Tkinter bodies to prevent conflicts on re-run
  if (typeof window !== 'undefined') {
    (window as any).__tkActiveBodies = new Map<string, HTMLElement>();
  }

  const pushLog = (level: ConsoleLogItem['level'], message: string, data?: unknown, visual?: VisualOutputData) => {
    const item: ConsoleLogItem = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      level,
      message,
      timestamp: Date.now(),
      data,
      visual
    };
    logs.push(item);
    onLog(item);
  };

  const startTime = performance.now();
  pushLog('system', '核心引擎：Python Sandbox (Pyodide) 启动中...');
  const hasWasm = typeof WebAssembly !== 'undefined' && typeof WebAssembly.instantiate === 'function';

  // 1. Force Skulpt (Pure JS)
  if (enginePreference === 'skulpt') {
    pushLog('system', '当前配置: 强制使用 Skulpt (纯 JS) Python 解释器运行...');
    if (!hasWasm) {
      pushLog('info', '说明: 当前环境不支持 WebAssembly (Wasm)，已按设置运行纯 JS 兼容引擎。');
    }
    const res = await runSkulptPython(code, onInputPrompt, pushLog, (status) => pushLog('system', status), projectFiles);
    return {
      ...res,
      logs
    };
  }

  // 2. Force Pyodide (Wasm)
  if (enginePreference === 'wasm') {
    pushLog('system', '当前配置: 强制使用 Pyodide (Wasm) Python 完整运行时...');
    if (!hasWasm) {
      pushLog('error', '提示: 当前环境不支持 WebAssembly (Wasm)，无法运行 Pyodide 引擎。请在「设置」中切换为「Skulpt (纯 JS)」引擎或「自动检测」模式。');
      const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
      return {
        status: 'error',
        executionTimeMs,
        error: {
          message: '当前环境不支持 WebAssembly (Wasm)，无法启动 Pyodide 运行时。请在「设置」中切换为 Skulpt 纯 JS 引擎。'
        },
        logs
      };
    }
  }

  // 3. Auto Detection or Forced Wasm when supported
  let pyodide: any = null;

  if (hasWasm) {
    try {
      if (enginePreference === 'auto') {
        pushLog('system', '准备运行 Python 代码 (WebAssembly Pyodide)...');
      }
      pyodide = await Promise.race([
        getPyodideInstance((status) => pushLog('system', status)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Pyodide WASM 加载超时')), 8000))
      ]);
    } catch (e: any) {
      if (enginePreference === 'wasm') {
        // Forced Wasm failed
        pushLog('error', `Pyodide (Wasm) 初始化失败: ${e?.message || e}`);
        const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
        return {
          status: 'error',
          executionTimeMs,
          error: {
            message: `Pyodide (Wasm) 初始化失败: ${e?.message || e}`
          },
          logs
        };
      } else {
        // Auto fallback
        pushLog('system', `提示: WebAssembly 运行时受限 (${e?.message || e})，已自动切换为兼容纯 JS Python 解释器 (Skulpt)...`);
        pyodide = null;
      }
    }
  } else {
    // hasWasm is false in Auto mode
    pushLog('system', '提示: 检测到当前环境不支持 WebAssembly (Wasm)，已自动切换为兼容纯 JS Python 解释器 (Skulpt)。');
  }

  // If Pyodide is not available (low-version Webview or timeout), use pure JS Skulpt engine
  if (!pyodide) {
    const res = await runSkulptPython(code, onInputPrompt, pushLog, (status) => pushLog('system', status), projectFiles);
    return {
      ...res,
      logs
    };
  }

  // Pyodide Execution Flow
  try {
    pushLog('system', '正在准备执行环境...');
    pyodide.setStdout({
      batched: (text: string) => {
        if (text) pushLog('log', text);
      }
    });

    pyodide.setStderr({
      batched: (text: string) => {
        if (text) pushLog('error', text);
      }
    });

    const syncInputBridge = (promptMsg: string) => {
      const p = promptMsg || '';
      if (p) {
        pushLog('log', p);
      }
      let userVal = '';
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        userVal = window.prompt(p || '请输入内容:') ?? '';
      }
      pushLog('info', `> ${userVal}`);
      return userVal;
    };
    (window as any).__syncPythonInputBridge = syncInputBridge;
    (window as any)._syncPythonInputBridge = syncInputBridge;

    const onPythonVisualOutput = (
      type: string,
      content: string,
      title?: string,
      tableData?: string
    ) => {
      let visual: VisualOutputData = {
        type: type as any,
        content,
        title
      };
      if (type === 'table' && tableData) {
        try {
          const parsed = JSON.parse(tableData);
          visual.columns = parsed.columns;
          visual.rows = parsed.rows;
        } catch {}
      }
      const item: ConsoleLogItem = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        level: 'visual',
        message: title || (type === 'image' ? '[图表输出]' : type === 'table' ? '[数据表格]' : '[富文本展示]'),
        timestamp: Date.now(),
        visual
      };
      logs.push(item);
      onLog(item);
    };
    (window as any).__onPythonVisualOutput = onPythonVisualOutput;
    (window as any)._onPythonVisualOutput = onPythonVisualOutput;

    const hwBridge = createHardwareBridge(pushLog);
    (window as any).__hardwareBridge = hwBridge;
    (window as any)._hardwareBridge = hwBridge;

    const tkWindowHelper = createTkWindowHelper(pushLog);
    (window as any).__createTkWindow = tkWindowHelper;
    (window as any)._createTkWindow = tkWindowHelper;

    const tkMsgbox = (type: string, title: string, message: string) => {
      pushLog('visual', `[${title}]: ${message}`, undefined, {
        type: 'alert',
        title,
        content: message
      });
    };
    (window as any).__showTkMessagebox = tkMsgbox;
    (window as any)._showTkMessagebox = tkMsgbox;

    const tkConfirm = (title: string, message: string) => {
      const msg = title ? `${title}\n\n${message}` : message;
      return typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(msg) : true;
    };
    (window as any).__showTkConfirm = tkConfirm;
    (window as any)._showTkConfirm = tkConfirm;

    const tkPrompt = (title: string, promptText: string) => {
      const msg = title ? `${title}\n\n${promptText}` : promptText;
      return typeof window !== 'undefined' && typeof window.prompt === 'function' ? window.prompt(msg) : '';
    };
    (window as any).__showTkPrompt = tkPrompt;
    (window as any)._showTkPrompt = tkPrompt;

    // Auto-detect common libraries in code
    const needsMatplotlib = /import\s+matplotlib|from\s+matplotlib|plt\./.test(code);
    const needsPandas = /import\s+pandas|from\s+pandas|pd\./.test(code);
    const needsNumpy = /import\s+numpy|from\s+numpy|np\./.test(code);

    if (needsMatplotlib && !packages.includes('matplotlib')) {
      pushLog('system', '检测到图表绘制代码，正在装载 Matplotlib 库...');
      try {
        await pyodide.loadPackage('matplotlib');
      } catch (mErr: any) {
        pushLog('warn', `Matplotlib 加载提示: ${mErr?.message || mErr}`);
      }
    }
    if (needsPandas && !packages.includes('pandas')) {
      try {
        await pyodide.loadPackage('pandas');
      } catch {}
    }
    if (needsNumpy && !packages.includes('numpy')) {
      try {
        await pyodide.loadPackage('numpy');
      } catch {}
    }

    // Synchronize all project files into Pyodide Emscripten Virtual File System
    if (projectFiles && projectFiles.length > 0) {
      for (const file of projectFiles) {
        const filePath = file.name.trim();
        if (!filePath) continue;

        // Ensure parent directory exists in pyodide.FS
        const parts = filePath.split('/');
        if (parts.length > 1) {
          let currentDir = '';
          for (let i = 0; i < parts.length - 1; i++) {
            currentDir += (currentDir ? '/' : '') + parts[i];
            try {
              pyodide.FS.mkdir(currentDir);
            } catch {}
          }
        }

        try {
          pyodide.FS.writeFile(filePath, file.content, { encoding: 'utf8' });
        } catch {
          try {
            const baseName = filePath.split('/').pop() || filePath;
            pyodide.FS.writeFile(baseName, file.content, { encoding: 'utf8' });
          } catch {}
        }
      }

      // Configure sys.path and clear cached modules in sys.modules for live reloading
      const moduleNamesToReset = projectFiles
        .map((f) => f.name.replace(/\.[^/.]+$/, '').split('/').pop())
        .filter(Boolean);

      await pyodide.runPythonAsync(`
import sys
if '.' not in sys.path:
    sys.path.insert(0, '.')
if '/' not in sys.path:
    sys.path.insert(0, '/')

# Invalidate cache for project modules to support live reloading
for mod_name in ${JSON.stringify(moduleNamesToReset)}:
    if mod_name in sys.modules:
        del sys.modules[mod_name]
`);
    }

    if (packages && packages.length > 0) {
      pushLog('system', `正在检查并安装 Python 包: ${packages.join(', ')} ...`);
      try {
        const pyVer = pyodide.version || '0.26.2';
        console.log('[Debug] Pyodide Version:', pyVer);
        
        let micropipSuccessfullyLoaded = false;
        
        // Stage 1: Try loading from local/default index
        try {
          pushLog('system', `[包管理器] 正在初始化 (尝试从 Pyodide 发行版加载)...`);
          // Use array to be safer with some Pyodide versions
          await pyodide.loadPackage(['micropip']);
          micropipSuccessfullyLoaded = true;
          pushLog('system', '[包管理器] 核心组件已加载。');
        } catch (e: any) {
          console.warn('Local micropip load failed:', e);
          pushLog('system', '[包管理器] 本地加载失败，尝试从备用镜像源修复...');
          
          // Stage 2: Fallback to CDN URLs
          const cdnCandidates = [
            `https://cdn.jsdelivr.net/pyodide/v${pyVer}/full/micropip-0.7.0-py3-none-any.whl`,
            `https://cdn.jsdelivr.net/pyodide/v0.26.2/full/micropip-0.7.0-py3-none-any.whl`,
            `https://cdn.jsdelivr.net/pyodide/v0.26.0/full/micropip-0.6.0-py3-none-any.whl`,
            'https://files.pythonhosted.org/packages/py3/m/micropip/micropip-0.7.0-py3-none-any.whl'
          ];
          
          for (const url of cdnCandidates) {
            try {
              pushLog('system', `[包管理器] 尝试下载修复包: ${url.split('/').pop()}...`);
              await pyodide.loadPackage(url);
              micropipSuccessfullyLoaded = true;
              break;
            } catch (cdnErr) {
              console.warn(`CDN load failed for ${url}:`, cdnErr);
            }
          }
        }

        if (!micropipSuccessfullyLoaded) {
          throw new Error('包管理器 (micropip) 加载失败，请确保网络通畅。');
        }
        
        // Stage 3: Direct Import Verification
        pushLog('system', '[包管理器] 正在验证环境就绪状态...');
        await pyodide.runPythonAsync(`
import sys
import importlib
try:
    import micropip
except ImportError:
    # Forced path check for Pyodide 0.26+ (Python 3.12)
    import os
    for p in [p for p in sys.path if 'site-packages' in p]:
        if os.path.exists(os.path.join(p, 'micropip')):
            break
    else:
        # If still not found, try to find it in the usual place
        lib_path = '/lib/python3.12/site-packages'
        if os.path.exists(lib_path) and lib_path not in sys.path:
            sys.path.append(lib_path)
            importlib.invalidate_caches()
    import micropip
`);
        
        const micropip = pyodide.pyimport('micropip');
        pushLog('system', '[包管理器] 运行环境已就绪，开始安装项目依赖...');
        
        for (const pkg of packages) {
          const cleanPkg = pkg.trim();
          if (!cleanPkg) continue;
          try {
            pushLog('info', `正在加载/安装模块 [${cleanPkg}] ...`);
            try {
              await pyodide.loadPackage(cleanPkg);
            } catch {
              await micropip.install(cleanPkg);
            }
            pushLog('info', `模块 [${cleanPkg}] 安装就绪。`);
          } catch (pkgErr: any) {
            pushLog('warn', `安装模块 [${cleanPkg}] 警告: ${pkgErr?.message || pkgErr}`);
          }
        }
      } catch (err: any) {
        pushLog('warn', `Python 包管理器 micropip 初始化提示: ${err?.message || err}`);
      }
    }

    await pyodide.runPythonAsync(`
import builtins
import js
import sys
import io
import base64
import types

# 1. User input and sys.stdin support
def _custom_input(prompt=''):
    p_str = str(prompt) if prompt is not None else ''
    val = js._syncPythonInputBridge(p_str)
    return str(val if val is not None else '')

builtins.input = _custom_input

class _CustomStdin:
    def readline(self):
        return builtins.input() + chr(10)
    def read(self, n=-1):
        return builtins.input()
    def readlines(self):
        lines = []
        while True:
            try:
                line = builtins.input()
                if not line:
                    break
                lines.append(line + chr(10))
            except Exception:
                break
        return lines

sys.stdin = _CustomStdin()

# 2. Rich non-command-line visual display support
def _custom_display(obj=None, *args, **kwargs):
    if obj is None:
        return
    
    # 2.1 Pandas DataFrame / Series
    if hasattr(obj, 'to_html') and callable(getattr(obj, 'to_html')):
        try:
            html_table = obj.to_html(classes='dataframe-output', border=0)
            js._onPythonVisualOutput('html', str(html_table), '数据表展示', '')
            return
        except Exception:
            pass

    # 2.2 Objects with _repr_html_
    if hasattr(obj, '_repr_html_') and callable(getattr(obj, '_repr_html_')):
        try:
            html_repr = obj._repr_html_()
            if html_repr:
                js._onPythonVisualOutput('html', str(html_repr), '富文本展示', '')
                return
        except Exception:
            pass

    # 2.3 Objects with _repr_svg_
    if hasattr(obj, '_repr_svg_') and callable(getattr(obj, '_repr_svg_')):
        try:
            svg_repr = obj._repr_svg_()
            if svg_repr:
                js._onPythonVisualOutput('html', str(svg_repr), 'SVG 矢量图', '')
                return
        except Exception:
            pass

    # 2.4 Objects with _repr_png_
    if hasattr(obj, '_repr_png_') and callable(getattr(obj, '_repr_png_')):
        try:
            png_bytes = obj._repr_png_()
            if isinstance(png_bytes, bytes):
                b64 = base64.b64encode(png_bytes).decode('utf-8')
                js._onPythonVisualOutput('image', f"data:image/png;base64,{b64}", '图像输出', '')
                return
        except Exception:
            pass

    # 2.5 IPython Display objects
    cls_name = getattr(getattr(obj, '__class__', None), '__name__', '')
    if cls_name == 'HTML':
        js._onPythonVisualOutput('html', str(getattr(obj, 'data', obj)), 'HTML 输出', '')
        return
    if cls_name == 'SVG':
        js._onPythonVisualOutput('html', str(getattr(obj, 'data', obj)), 'SVG 输出', '')
        return
    if cls_name == 'Image':
        url = getattr(obj, 'url', None)
        data = getattr(obj, 'data', None)
        if url:
            js._onPythonVisualOutput('image', str(url), '图像', '')
            return
        elif data:
            if isinstance(data, bytes):
                b64 = base64.b64encode(data).decode('utf-8')
                js._onPythonVisualOutput('image', f"data:image/png;base64,{b64}", '图像', '')
            else:
                js._onPythonVisualOutput('image', str(data), '图像', '')
            return

    # 2.6 List of dicts (tabular data)
    if isinstance(obj, list) and len(obj) > 0 and isinstance(obj[0], dict):
        import json
        cols = list(obj[0].keys())
        rows = [[item.get(c, '') for c in cols] for item in obj]
        js._onPythonVisualOutput('table', '', '数据表格', json.dumps({'columns': cols, 'rows': rows}))
        return

    # 2.7 Fallback to normal print
    print(repr(obj))

builtins.display = _custom_display

# 3. IPython.display compatibility shim
if 'IPython' not in sys.modules:
    _ipython = types.ModuleType('IPython')
    _display_mod = types.ModuleType('IPython.display')
    
    class _HTML:
        def __init__(self, data=''): self.data = str(data); self.format = 'html'
        def _repr_html_(self): return self.data
    class _Image:
        def __init__(self, data=None, url=None): self.data = data; self.url = url; self.format = 'image'
    class _SVG:
        def __init__(self, data=''): self.data = str(data); self.format = 'svg'
        def _repr_svg_(self): return self.data
    class _Markdown:
        def __init__(self, data=''): self.data = str(data); self.format = 'markdown'
        def _repr_html_(self): return f"<div class='markdown-repr'>{self.data}</div>"

    _display_mod.display = _custom_display
    _display_mod.HTML = _HTML
    _display_mod.Image = _Image
    _display_mod.SVG = _SVG
    _display_mod.Markdown = _Markdown
    _ipython.display = _display_mod
    sys.modules['IPython'] = _ipython
    sys.modules['IPython.display'] = _display_mod

# 4. Matplotlib chart interception
def _hook_matplotlib():
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        
        def _show(*args, **kwargs):
            fig_nums = plt.get_fignums()
            if not fig_nums:
                return
            for num in fig_nums:
                fig = plt.figure(num)
                buf = io.BytesIO()
                fig.savefig(buf, format='png', bbox_inches='tight', dpi=120)
                buf.seek(0)
                b64_str = base64.b64encode(buf.read()).decode('utf-8')
                suptitle = getattr(fig, '_suptitle', None)
                title = suptitle.get_text() if suptitle else f"图表 #{num}"
                js._onPythonVisualOutput('image', f"data:image/png;base64,{b64_str}", title, '')
            plt.close('all')

        plt.show = _show
    except Exception:
        pass

_hook_matplotlib()

# 5. Hardware & Device API module
def _setup_hardware_support():
    import sys, types, js

    mod = types.ModuleType('hardware')

    def vibrate(pattern=200):
        try:
            return bool(js._hardwareBridge.vibrate(pattern))
        except Exception:
            return False

    async def get_battery():
        res = await js._hardwareBridge.getBattery()
        return res.to_py()

    async def get_location(high_accuracy=True, timeout=10):
        opts = js.eval(f"({{ enableHighAccuracy: {str(high_accuracy).lower()}, timeout: {int(timeout * 1000)} }})")
        res = await js._hardwareBridge.getLocation(opts)
        return res.to_py()

    def get_device_info():
        res = js._hardwareBridge.getDeviceInfo()
        return res.to_py()

    def is_online():
        return bool(js._hardwareBridge.getNetworkInfo().online)

    def get_network_info():
        res = js._hardwareBridge.getNetworkInfo()
        return res.to_py()

    async def get_orientation():
        res = await js._hardwareBridge.getOrientation()
        return res.to_py()

    async def get_motion():
        res = await js._hardwareBridge.getMotion()
        return res.to_py()

    async def request_wake_lock():
        return bool(await js._hardwareBridge.requestWakeLock())

    async def release_wake_lock():
        return bool(await js._hardwareBridge.releaseWakeLock())

    async def take_photo(facing_mode='user', width=None, height=None, display=True):
        opts = js.eval(f"({{ facingMode: '{facing_mode}', display: {str(display).lower()} }})")
        res = await js._hardwareBridge.takePhoto(opts)
        return res.to_py()

    async def toggle_torch(enable=True):
        return bool(await js._hardwareBridge.toggleTorch(bool(enable)))

    async def listen_speech(lang='zh-CN', timeout=10):
        opts = js.eval(f"({{ lang: '{lang}', timeout: {int(timeout)} }})")
        res = await js._hardwareBridge.listenSpeech(opts)
        return str(res)

    def get_gamepads():
        res = js._hardwareBridge.getGamepads()
        return res.to_py()

    async def show_hardware_status():
        res = await js._hardwareBridge.showHardwareStatus()
        return res.to_py()

    async def beep(frequency=440, duration=0.2, waveform='sine'):
        await js._hardwareBridge.beep(frequency, duration, waveform)
        return True

    async def speak(text, lang='zh-CN', rate=1.0, pitch=1.0):
        await js._hardwareBridge.speak(str(text), lang, rate, pitch)
        return True

    async def list_media_devices():
        res = await js._hardwareBridge.listMediaDevices()
        return res.to_py()

    async def copy_to_clipboard(text):
        await js._hardwareBridge.copyToClipboard(str(text))
        return True

    async def read_from_clipboard():
        res = await js._hardwareBridge.readFromClipboard()
        return str(res)

    async def get_storage_estimate():
        res = await js._hardwareBridge.getStorageEstimate()
        return res.to_py()

    mod.vibrate = vibrate
    mod.get_battery = get_battery
    mod.get_location = get_location
    mod.get_device_info = get_device_info
    mod.is_online = is_online
    mod.get_network_info = get_network_info
    mod.get_orientation = get_orientation
    mod.get_motion = get_motion
    mod.request_wake_lock = request_wake_lock
    mod.release_wake_lock = release_wake_lock
    mod.take_photo = take_photo
    mod.toggle_torch = toggle_torch
    mod.listen_speech = listen_speech
    mod.get_gamepads = get_gamepads
    mod.show_hardware_status = show_hardware_status
    mod.beep = beep
    mod.speak = speak
    mod.list_media_devices = list_media_devices
    mod.copy_to_clipboard = copy_to_clipboard
    mod.read_from_clipboard = read_from_clipboard
    mod.get_storage_estimate = get_storage_estimate

    sys.modules['hardware'] = mod
    sys.modules['device'] = mod

_setup_hardware_support()

# 6. Tkinter GUI Support
def _setup_tkinter_support():
    import sys, types, js, math
    from pyodide.ffi import create_proxy

    _tk_mod = types.ModuleType('tkinter')
    _win_seq = [0]
    _timer_seq = [0]

    class Tk:
        def __init__(self, title="Tkinter Window", **kwargs):
            _win_seq[0] += 1
            self._id = f"win_{_win_seq[0]}"
            self._title = str(title)
            self._elem = js._createTkWindow(self._id, self._title)
            self._proxies = []
            self._timers = {}

        def title(self, title):
            self._title = str(title)
            title_span = js.document.querySelector(f"#tk-window-title-{self._id}")
            if title_span:
                title_span.innerText = self._title

        def geometry(self, geom):
            pass

        def configure(self, **kwargs):
            if 'bg' in kwargs:
                self._elem.style.backgroundColor = kwargs['bg']
            if 'padx' in kwargs:
                self._elem.style.paddingLeft = f"{kwargs['padx']}px"
                self._elem.style.paddingRight = f"{kwargs['padx']}px"
            if 'pady' in kwargs:
                self._elem.style.paddingTop = f"{kwargs['pady']}px"
                self._elem.style.paddingBottom = f"{kwargs['pady']}px"
            if 'menu' in kwargs:
                # Basic menu implementation - just show as buttons for now
                menu = kwargs['menu']
                if menu and hasattr(menu, '_items'):
                    menu_bar = js.document.createElement('div')
                    menu_bar.className = 'tk-menubar w-full flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-1 mb-2'
                    for item in menu._items:
                        if 'label' in item:
                            btn = js.document.createElement('button')
                            btn.innerText = item['label']
                            btn.className = 'text-[10px] px-1.5 py-0.5 hover:bg-[var(--bg-secondary)] rounded'
                            if 'command' in item and callable(item['command']):
                                btn.onclick = create_proxy(item['command'])
                            menu_bar.appendChild(btn)
                    self._elem.prepend(menu_bar)

        config = configure

        def resizable(self, width=True, height=True):
            pass

        def minsize(self, width, height):
            if self._elem:
                self._elem.style.minWidth = f"{width}px"
                self._elem.style.minHeight = f"{height}px"

        def maxsize(self, width, height):
            if self._elem:
                self._elem.style.maxWidth = f"{width}px"
                self._elem.style.maxHeight = f"{height}px"

        def withdraw(self):
            if self._elem: self._elem.style.display = 'none'

        def deiconify(self):
            if self._elem: self._elem.style.display = 'flex'

        def after(self, ms, func, *args):
            _timer_seq[0] += 1
            t_id = _timer_seq[0]
            def timer_cb():
                if t_id in self._timers:
                    del self._timers[t_id]
                try:
                    func(*args)
                except Exception as e:
                    js.console.error(f"[Tkinter Timer Error]: {e}")
            proxy = create_proxy(lambda: timer_cb())
            self._proxies.append(proxy)
            js_timer_id = js.setTimeout(proxy, int(ms))
            self._timers[t_id] = (js_timer_id, proxy)
            return t_id

        def after_cancel(self, timer_id):
            if timer_id in self._timers:
                js_timer_id, proxy = self._timers.pop(timer_id)
                js.clearTimeout(js_timer_id)
                try:
                    proxy.destroy()
                except Exception:
                    pass

        def bind(self, event, handler):
            if callable(handler):
                proxy = create_proxy(lambda e: handler(e))
                self._proxies.append(proxy)
                ev = 'click' if '<Button' in event else 'keydown' if '<Key' in event else event.replace('<', '').replace('>', '')
                self._elem.addEventListener(ev, proxy)

        def mainloop(self, n=0):
            pass

        def quit(self):
            pass

        def destroy(self):
            for t_id, (js_t, p) in list(self._timers.items()):
                js.clearTimeout(js_t)
                try: p.destroy()
                except Exception: pass
            self._timers.clear()
            for p in self._proxies:
                try: p.destroy()
                except Exception: pass
            self._proxies.clear()
            frame = js.document.getElementById(f"tk-window-frame-{self._id}")
            if frame: frame.remove()
            if self._elem: self._elem.remove()

        def update(self):
            pass

        update_idletasks = update

    class Toplevel(Tk):
        def __init__(self, master=None, title="子窗口", **kwargs):
            super().__init__(title=title, **kwargs)

    class Widget:
        def __init__(self, parent):
            self.master = parent
            self._parent = parent
            self._elem = None

        def _get_target_elem(self):
            if self._parent:
                if hasattr(self._parent, '_elem') and self._parent._elem:
                    return self._parent._elem
            return None

        def pack(self, **kwargs):
            target = self._get_target_elem()
            if self._elem and target:
                target.appendChild(self._elem)
                side = kwargs.get('side', 'top')
                if side in ('left', 'right'):
                    self._elem.style.display = 'inline-block'
                    if side == 'left':
                        self._elem.style.float = 'left'
                    else:
                        self._elem.style.float = 'right'
                fill = kwargs.get('fill', 'none')
                if fill in ('x', 'both'):
                    self._elem.style.width = '100%'
                if fill in ('y', 'both'):
                    self._elem.style.height = '100%'
                padx = kwargs.get('padx')
                if padx is not None:
                    self._elem.style.marginLeft = f"{padx}px"
                    self._elem.style.marginRight = f"{padx}px"
                pady = kwargs.get('pady')
                if pady is not None:
                    self._elem.style.marginTop = f"{pady}px"
                    self._elem.style.marginBottom = f"{pady}px"
            return self

        def grid(self, row=0, column=0, rowspan=1, columnspan=1, padx=0, pady=0, sticky="", **kwargs):
            target = self._get_target_elem()
            if self._elem and target:
                target.appendChild(self._elem)
                self._elem.style.gridRowStart = str(row + 1)
                self._elem.style.gridRowEnd = f"span {rowspan}"
                self._elem.style.gridColumnStart = str(column + 1)
                self._elem.style.gridColumnEnd = f"span {columnspan}"
                if target.style.display != 'grid':
                    target.style.display = 'grid'
                    target.style.gap = '6px'
                if padx:
                    self._elem.style.marginLeft = f"{padx}px"
                    self._elem.style.marginRight = f"{padx}px"
                if pady:
                    self._elem.style.marginTop = f"{pady}px"
                    self._elem.style.marginBottom = f"{pady}px"
                if 'w' in sticky and 'e' in sticky:
                    self._elem.style.width = '100%'
            return self

        def place(self, x=0, y=0, width=None, height=None, **kwargs):
            target = self._get_target_elem()
            if self._elem and target:
                target.appendChild(self._elem)
                target.style.position = 'relative'
                self._elem.style.position = 'absolute'
                self._elem.style.left = f"{x}px"
                self._elem.style.top = f"{y}px"
                if width is not None:
                    self._elem.style.width = f"{width}px"
                if height is not None:
                    self._elem.style.height = f"{height}px"
            return self

        def configure(self, **kwargs):
            if not self._elem:
                return
            if 'text' in kwargs:
                self._elem.innerText = str(kwargs['text'])
            if 'bg' in kwargs or 'background' in kwargs:
                self._elem.style.backgroundColor = kwargs.get('bg') or kwargs.get('background')
            if 'fg' in kwargs or 'foreground' in kwargs:
                self._elem.style.color = kwargs.get('fg') or kwargs.get('foreground')
            if 'state' in kwargs:
                self._elem.disabled = (kwargs['state'] == 'disabled')
            if 'width' in kwargs:
                self._elem.style.width = f"{kwargs['width'] * 8}px" if isinstance(kwargs['width'], int) else str(kwargs['width'])
            if 'height' in kwargs:
                self._elem.style.height = f"{kwargs['height'] * 18}px" if isinstance(kwargs['height'], int) else str(kwargs['height'])

        config = configure

        def cget(self, key):
            if not self._elem: return ""
            if key == 'text': return self._elem.innerText
            return ""

        def bind(self, event, handler):
            if self._elem and callable(handler):
                proxy = create_proxy(lambda e: handler(e))
                if hasattr(self.master, '_proxies'):
                    self.master._proxies.append(proxy)
                ev = 'click' if '<Button' in event else 'keydown' if '<Key' in event else event.replace('<', '').replace('>', '')
                self._elem.addEventListener(ev, proxy)

        def focus(self):
            if self._elem and hasattr(self._elem, 'focus'):
                self._elem.focus()

        focus_set = focus

        def destroy(self):
            if self._elem:
                self._elem.remove()

        def winfo_width(self):
            return self._elem.clientWidth if self._elem else 0

        def winfo_height(self):
            return self._elem.clientHeight if self._elem else 0

        def after(self, ms, func, *args):
            if hasattr(self.master, 'after'):
                return self.master.after(ms, func, *args)
            return js.setTimeout(create_proxy(lambda: func(*args)), int(ms))

    class Label(Widget):
        def __init__(self, master, text="", fg=None, bg=None, font=None, **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('div')
            self._elem.innerText = str(text)
            self._elem.className = 'tk-label text-xs text-[var(--text-primary)] py-0.5 leading-normal select-text text-center'
            if fg: self._elem.style.color = fg
            if bg: self._elem.style.backgroundColor = bg
            if 'textvariable' in kwargs and kwargs['textvariable']:
                tv = kwargs['textvariable']
                self._elem.innerText = str(tv.get())
                tv.trace_add('write', lambda *a: self.configure(text=tv.get()))

    class Button(Widget):
        def __init__(self, master, text="", command=None, bg=None, fg=None, state='normal', **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('button')
            self._elem.type = 'button'
            self._elem.innerText = str(text)
            self._elem.className = 'tk-button px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] cursor-pointer transition-colors shadow-sm shrink-0 whitespace-nowrap active:scale-95'
            if command and callable(command):
                proxy = create_proxy(lambda e: command())
                if hasattr(master, '_proxies'):
                    master._proxies.append(proxy)
                self._elem.onclick = proxy
            if bg: self._elem.style.backgroundColor = bg
            if fg: self._elem.style.color = fg
            if state == 'disabled': self._elem.disabled = True

    class Entry(Widget):
        def __init__(self, master, width=None, show=None, textvariable=None, **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('input')
            self._elem.type = 'password' if show == '*' else 'text'
            self._elem.className = 'tk-entry px-2.5 py-1.5 rounded-lg text-xs font-mono-code border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none min-w-0 focus:border-[var(--brand)]'
            if width: self._elem.size = width
            if textvariable:
                self._elem.value = str(textvariable.get())
                proxy = create_proxy(lambda e: textvariable.set(self._elem.value))
                if hasattr(master, '_proxies'): master._proxies.append(proxy)
                self._elem.oninput = proxy
                textvariable.trace_add('write', lambda *a: self._set_val(textvariable.get()))

        def _set_val(self, v):
            if self._elem and self._elem.value != str(v):
                self._elem.value = str(v)

        def get(self):
            return str(self._elem.value)

        def delete(self, first, last=None):
            self._elem.value = ''

        def insert(self, index, string):
            self._elem.value = str(string)

    class Text(Widget):
        def __init__(self, master, width=30, height=5, **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('textarea')
            self._elem.cols = width
            self._elem.rows = height
            self._elem.className = 'tk-textarea p-2.5 rounded-lg text-xs font-mono-code border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none min-w-0 focus:border-[var(--brand)] resize-y'

        def get(self, start="1.0", end="end"):
            return str(self._elem.value)

        def insert(self, index, text):
            self._elem.value += str(text)

        def delete(self, start="1.0", end="end"):
            self._elem.value = ''

        def see(self, index):
            self._elem.scrollTop = self._elem.scrollHeight

    class Checkbutton(Widget):
        def __init__(self, master, text="", variable=None, command=None, onvalue=1, offvalue=0, **kwargs):
            super().__init__(master)
            self.var = variable
            self.onvalue = onvalue
            self.offvalue = offvalue
            self._wrap = js.document.createElement('label')
            self._wrap.className = 'flex items-center space-x-2 text-xs text-[var(--text-primary)] cursor-pointer py-1'
            self._input = js.document.createElement('input')
            self._input.type = 'checkbox'
            self._input.className = 'accent-[var(--brand)] rounded cursor-pointer'
            if variable:
                self._input.checked = (variable.get() == onvalue)
            def on_change(e):
                val = onvalue if self._input.checked else offvalue
                if variable: variable.set(val)
                if command and callable(command): command()
            proxy = create_proxy(on_change)
            if hasattr(master, '_proxies'): master._proxies.append(proxy)
            self._input.onchange = proxy
            self._span = js.document.createElement('span')
            self._span.innerText = str(text)
            self._wrap.appendChild(self._input)
            self._wrap.appendChild(self._span)
            self._elem = self._wrap

        def select(self):
            self._input.checked = True
            if self.var: self.var.set(self.onvalue)

        def deselect(self):
            self._input.checked = False
            if self.var: self.var.set(self.offvalue)

        def toggle(self):
            if self._input.checked: self.deselect()
            else: self.select()

    class Radiobutton(Widget):
        def __init__(self, master, text="", variable=None, value=None, command=None, **kwargs):
            super().__init__(master)
            self.var = variable
            self.val = value
            self._wrap = js.document.createElement('label')
            self._wrap.className = 'flex items-center space-x-2 text-xs text-[var(--text-primary)] cursor-pointer py-1'
            self._input = js.document.createElement('input')
            self._input.type = 'radio'
            self._input.name = f"rb_grp_{id(variable) if variable else id(master)}"
            self._input.className = 'accent-[var(--brand)] cursor-pointer'
            if variable and value is not None:
                self._input.checked = (variable.get() == value)
            def on_change(e):
                if self._input.checked and variable and value is not None:
                    variable.set(value)
                if command and callable(command): command()
            proxy = create_proxy(on_change)
            if hasattr(master, '_proxies'): master._proxies.append(proxy)
            self._input.onchange = proxy
            self._span = js.document.createElement('span')
            self._span.innerText = str(text)
            self._wrap.appendChild(self._input)
            self._wrap.appendChild(self._span)
            self._elem = self._wrap

        def select(self):
            self._input.checked = True
            if self.var and self.val is not None:
                self.var.set(self.val)

    class Scale(Widget):
        def __init__(self, master, from_=0, to=100, orient="horizontal", command=None, variable=None, label="", **kwargs):
            super().__init__(master)
            self._wrap = js.document.createElement('div')
            self._wrap.className = 'flex flex-col gap-1 py-1 w-full max-w-xs'
            if label:
                self._lbl = js.document.createElement('div')
                self._lbl.className = 'text-[11px] text-[var(--text-secondary)] font-mono-code'
                self._lbl.innerText = str(label)
                self._wrap.appendChild(self._lbl)
            self._input = js.document.createElement('input')
            self._input.type = 'range'
            self._input.min = str(from_)
            self._input.max = str(to)
            self._input.className = 'accent-[var(--brand)] cursor-pointer w-full'
            self._val_disp = js.document.createElement('span')
            self._val_disp.className = 'text-[10px] text-[var(--text-tertiary)] font-mono-code text-right'
            init_val = variable.get() if variable else from_
            self._input.value = str(init_val)
            self._val_disp.innerText = str(init_val)
            def on_input(e):
                cur = self._input.value
                self._val_disp.innerText = str(cur)
                if variable: variable.set(float(cur) if '.' in cur else int(cur))
                if command and callable(command): command(cur)
            proxy = create_proxy(on_input)
            if hasattr(master, '_proxies'): master._proxies.append(proxy)
            self._input.oninput = proxy
            self._wrap.appendChild(self._input)
            self._wrap.appendChild(self._val_disp)
            self._elem = self._wrap

        def get(self):
            v = self._input.value
            return float(v) if '.' in v else int(v)

        def set(self, val):
            self._input.value = str(val)
            self._val_disp.innerText = str(val)

    class Listbox(Widget):
        def __init__(self, master, selectmode="browse", **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('select')
            self._elem.size = kwargs.get('height', 5)
            self._elem.className = 'tk-listbox p-2 rounded-lg text-xs font-mono-code border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none min-w-[120px] focus:border-[var(--brand)]'
            self._items = []

        def insert(self, index, *items):
            for it in items:
                opt = js.document.createElement('option')
                opt.value = str(it)
                opt.innerText = str(it)
                self._elem.appendChild(opt)
                self._items.append(str(it))

        def delete(self, first, last=None):
            self._elem.innerHTML = ''
            self._items.clear()

        def get(self, first, last=None):
            if isinstance(first, int) and 0 <= first < len(self._items):
                return self._items[first]
            return tuple(self._items)

        def curselection(self):
            idx = self._elem.selectedIndex
            return (idx,) if idx >= 0 else ()

        def size(self):
            return len(self._items)

    class Scrollbar(Widget):
        def __init__(self, master, orient="vertical", command=None, **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('div')
            self._elem.className = 'hidden'

        def set(self, *args):
            pass

    class Spinbox(Widget):
        def __init__(self, master, from_=0, to=100, **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('input')
            self._elem.type = 'number'
            self._elem.min = str(from_)
            self._elem.max = str(to)
            self._elem.className = 'tk-spinbox px-2 py-1 rounded-lg text-xs font-mono-code border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none min-w-[70px]'

        def get(self):
            return self._elem.value

        def set(self, val):
            self._elem.value = str(val)

    class OptionMenu(Widget):
        def __init__(self, master, variable, default, *values):
            super().__init__(master)
            self._elem = js.document.createElement('select')
            self._elem.className = 'tk-select px-2.5 py-1.5 rounded-lg text-xs font-mono-code border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none'
            all_opts = [default] + list(values)
            for v in all_opts:
                opt = js.document.createElement('option')
                opt.value = str(v)
                opt.innerText = str(v)
                if str(v) == str(default): opt.selected = True
                self._elem.appendChild(opt)
            variable.set(default)
            def on_change(e):
                variable.set(self._elem.value)
            proxy = create_proxy(on_change)
            if hasattr(master, '_proxies'): master._proxies.append(proxy)
            self._elem.onchange = proxy

    class Menu:
        def __init__(self, master=None, **kwargs):
            self.master = master
            self._items = []
        def add_command(self, label="", command=None, **kwargs):
            self._items.append({'label': label, 'command': command})
        def add_separator(self):
            self._items.append({'separator': True})
        def add_cascade(self, label="", menu=None, **kwargs):
            self._items.append({'label': label, 'menu': menu})
    
    class Menubutton(Widget):
        def __init__(self, master, text="", menu=None, **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('button')
            self._elem.innerText = str(text)
            self._elem.className = 'tk-menubutton px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]'

    class Frame(Widget):
        def __init__(self, master, bg=None, **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('div')
            self._elem.className = 'tk-frame flex flex-wrap items-center justify-center gap-2 p-1.5 rounded'
            if bg: self._elem.style.backgroundColor = bg

    class LabelFrame(Widget):
        def __init__(self, master, text="", bg=None, **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('fieldset')
            self._elem.className = 'tk-labelframe border border-[var(--border-subtle)] rounded-lg p-2.5 my-1 flex flex-col gap-2'
            self._leg = js.document.createElement('legend')
            self._leg.className = 'text-[11px] font-semibold text-[var(--text-secondary)] px-1'
            self._leg.innerText = str(text)
            self._elem.appendChild(self._leg)
            if bg: self._elem.style.backgroundColor = bg

    class Canvas(Widget):
        def __init__(self, master, width=300, height=200, bg="white", **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('canvas')
            self._elem.width = width
            self._elem.height = height
            self._elem.className = 'tk-canvas rounded-lg border border-[var(--border-subtle)] max-w-full shadow-sm'
            self._elem.style.backgroundColor = bg
            self._ctx = self._elem.getContext('2d')
            self._item_counter = 0

        def create_line(self, x1, y1, x2, y2, fill="black", width=1, dash=None, **kwargs):
            self._ctx.beginPath()
            self._ctx.strokeStyle = fill
            self._ctx.lineWidth = width
            if dash:
                try: self._ctx.setLineDash(list(dash))
                except Exception: pass
            else:
                self._ctx.setLineDash([])
            self._ctx.moveTo(x1, y1)
            self._ctx.lineTo(x2, y2)
            self._ctx.stroke()
            self._item_counter += 1
            return self._item_counter

        def create_rectangle(self, x1, y1, x2, y2, fill=None, outline="black", width=1, **kwargs):
            if fill:
                self._ctx.fillStyle = fill
                self._ctx.fillRect(min(x1, x2), min(y1, y2), abs(x2 - x1), abs(y2 - y1))
            if outline:
                self._ctx.strokeStyle = outline
                self._ctx.lineWidth = width
                self._ctx.strokeRect(min(x1, x2), min(y1, y2), abs(x2 - x1), abs(y2 - y1))
            self._item_counter += 1
            return self._item_counter

        def create_oval(self, x1, y1, x2, y2, fill=None, outline="black", width=1, **kwargs):
            self._ctx.beginPath()
            rx = abs(x2 - x1) / 2.0
            ry = abs(y2 - y1) / 2.0
            cx = min(x1, x2) + rx
            cy = min(y1, y2) + ry
            self._ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.283185307179586)
            if fill:
                self._ctx.fillStyle = fill
                self._ctx.fill()
            if outline:
                self._ctx.strokeStyle = outline
                self._ctx.lineWidth = width
                self._ctx.stroke()
            self._item_counter += 1
            return self._item_counter

        def create_circle(self, x, y, r, fill=None, outline="black", width=1, **kwargs):
            return self.create_oval(x - r, y - r, x + r, y + r, fill=fill, outline=outline, width=width)

        def create_arc(self, x1, y1, x2, y2, start=0, extent=90, fill=None, outline="black", width=1, **kwargs):
            self._ctx.beginPath()
            rx = abs(x2 - x1) / 2.0
            ry = abs(y2 - y1) / 2.0
            cx = min(x1, x2) + rx
            cy = min(y1, y2) + ry
            s_rad = -math.radians(start)
            e_rad = -math.radians(start + extent)
            self._ctx.arc(cx, cy, rx, s_rad, e_rad, True)
            if fill:
                self._ctx.fillStyle = fill
                self._ctx.fill()
            if outline:
                self._ctx.strokeStyle = outline
                self._ctx.lineWidth = width
                self._ctx.stroke()
            self._item_counter += 1
            return self._item_counter

        def create_polygon(self, *points, fill=None, outline="black", width=1, **kwargs):
            pts = []
            if len(points) == 1 and isinstance(points[0], (list, tuple)):
                points = points[0]
            for i in range(0, len(points), 2):
                if i + 1 < len(points):
                    pts.append((points[i], points[i + 1]))
            if not pts: return 0
            self._ctx.beginPath()
            self._ctx.moveTo(pts[0][0], pts[0][1])
            for p in pts[1:]:
                self._ctx.lineTo(p[0], p[1])
            self._ctx.closePath()
            if fill:
                self._ctx.fillStyle = fill
                self._ctx.fill()
            if outline:
                self._ctx.strokeStyle = outline
                self._ctx.lineWidth = width
                self._ctx.stroke()
            self._item_counter += 1
            return self._item_counter

        def create_text(self, x, y, text="", fill="black", font="12px sans-serif", anchor="center", **kwargs):
            self._ctx.fillStyle = fill
            self._ctx.font = font
            self._ctx.textAlign = "center" if anchor == "center" else "left" if "w" in anchor else "right"
            self._ctx.fillText(str(text), x, y)
            self._item_counter += 1
            return self._item_counter

        def delete(self, tag):
            if tag == "all":
                self._ctx.clearRect(0, 0, self._elem.width, self._elem.height)

    # ttk widgets submodule
    _ttk = types.ModuleType('tkinter.ttk')
    _ttk.Button = Button
    _ttk.Label = Label
    _ttk.Entry = Entry
    _ttk.Checkbutton = Checkbutton
    _ttk.Radiobutton = Radiobutton
    _ttk.Frame = Frame
    _ttk.LabelFrame = LabelFrame
    _ttk.Scale = Scale
    _ttk.Scrollbar = Scrollbar

    class TTKCombobox(Widget):
        def __init__(self, master, values=(), **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('select')
            self._elem.className = 'ttk-combobox px-2.5 py-1.5 rounded-lg text-xs font-mono-code border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none min-w-[120px]'
            self._values = list(values)
            for v in self._values:
                opt = js.document.createElement('option')
                opt.value = str(v)
                opt.innerText = str(v)
                self._elem.appendChild(opt)

        def current(self, newindex=None):
            if newindex is not None:
                self._elem.selectedIndex = int(newindex)
            return self._elem.selectedIndex

        def get(self):
            return self._elem.value

        def set(self, val):
            self._elem.value = str(val)

    class TTKProgressbar(Widget):
        def __init__(self, master, length=200, maximum=100, mode="determinate", value=0, **kwargs):
            super().__init__(master)
            self._wrap = js.document.createElement('div')
            self._wrap.className = 'w-full bg-[var(--bg-tertiary)] rounded-full h-3 overflow-hidden border border-[var(--border-subtle)] my-1'
            self._wrap.style.maxWidth = f"{length}px"
            self._bar = js.document.createElement('div')
            self._bar.className = 'bg-[var(--brand)] h-full transition-all duration-200'
            self._maximum = float(maximum)
            self._value = float(value)
            self._update_bar()
            self._wrap.appendChild(self._bar)
            self._elem = self._wrap
            self._timer = None

        def _update_bar(self):
            pct = max(0, min(100, (self._value / self._maximum) * 100)) if self._maximum > 0 else 0
            self._bar.style.width = f"{pct}%"

        def step(self, amount=1):
            self._value = (self._value + amount) % (self._maximum + 1)
            self._update_bar()

        def start(self, interval=50):
            def run():
                self.step(2)
            proxy = create_proxy(run)
            self._timer = js.setInterval(proxy, interval or 50)

        def stop(self):
            if self._timer:
                js.clearInterval(self._timer)
                self._timer = None

        def configure(self, **kwargs):
            if 'value' in kwargs:
                self._value = float(kwargs['value'])
                self._update_bar()
            if 'maximum' in kwargs:
                self._maximum = float(kwargs['maximum'])
                self._update_bar()

        config = configure

    class TTKNotebook(Widget):
        def __init__(self, master, **kwargs):
            super().__init__(master)
            self._wrap = js.document.createElement('div')
            self._wrap.className = 'ttk-notebook w-full border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-primary)] my-2'
            self._tab_bar = js.document.createElement('div')
            self._tab_bar.className = 'flex border-b border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 gap-1 select-none overflow-x-auto'
            self._tab_content = js.document.createElement('div')
            self._tab_content.className = 'p-3'
            self._wrap.appendChild(self._tab_bar)
            self._wrap.appendChild(self._tab_content)
            self._elem = self._wrap
            self._pages = []
            self._buttons = []

        def add(self, child, text="Tab"):
            btn = js.document.createElement('button')
            btn.type = 'button'
            btn.innerText = str(text)
            btn.className = 'px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] border-b-2 border-transparent hover:text-[var(--text-primary)] transition-all cursor-pointer whitespace-nowrap'
            idx = len(self._pages)
            def on_tab_click():
                self.select(idx)
            proxy = create_proxy(lambda e: on_tab_click())
            btn.onclick = proxy
            self._tab_bar.appendChild(btn)
            self._buttons.append(btn)
            self._pages.append(child)
            if hasattr(child, '_elem') and child._elem:
                self._tab_content.appendChild(child._elem)
            if len(self._pages) == 1:
                self.select(0)
            else:
                if hasattr(child, '_elem') and child._elem:
                    child._elem.style.display = 'none'

        def select(self, tab_id):
            idx = int(tab_id)
            for i, p in enumerate(self._pages):
                if hasattr(p, '_elem') and p._elem:
                    p._elem.style.display = 'block' if i == idx else 'none'
            for i, b in enumerate(self._buttons):
                if i == idx:
                    b.className = 'px-3 py-1.5 text-xs font-semibold text-[var(--brand)] border-b-2 border-[var(--brand)] transition-all cursor-pointer whitespace-nowrap'
                else:
                    b.className = 'px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] border-b-2 border-transparent hover:text-[var(--text-primary)] transition-all cursor-pointer whitespace-nowrap'

    class TTKSeparator(Widget):
        def __init__(self, master, orient="horizontal", **kwargs):
            super().__init__(master)
            self._elem = js.document.createElement('hr')
            self._elem.className = 'border-t border-[var(--border-subtle)] my-2 w-full'

    _ttk.Combobox = TTKCombobox
    _ttk.Progressbar = TTKProgressbar
    _ttk.Notebook = TTKNotebook
    _ttk.Separator = TTKSeparator

    class Variable:
        def __init__(self, value=None):
            self._val = value
            self._callbacks = []

        def get(self): return self._val
        def set(self, val):
            self._val = val
            for cb in self._callbacks:
                try: cb()
                except Exception: pass

        def trace_add(self, mode, callback):
            self._callbacks.append(callback)

        def trace(self, mode, callback):
            self.trace_add(mode, callback)

    class StringVar(Variable):
        def __init__(self, value=""): super().__init__(str(value))
        def get(self): return str(self._val)
        def set(self, v): super().set(str(v))

    class IntVar(Variable):
        def __init__(self, value=0): super().__init__(int(value))
        def get(self): return int(self._val)
        def set(self, v): super().set(int(v))

    class DoubleVar(Variable):
        def __init__(self, value=0.0): super().__init__(float(value))
        def get(self): return float(self._val)
        def set(self, v): super().set(float(v))

    class BooleanVar(Variable):
        def __init__(self, value=False): super().__init__(bool(value))
        def get(self): return bool(self._val)
        def set(self, v): super().set(bool(v))

    class MessageBox:
        @staticmethod
        def showinfo(title="信息", message=""):
            js._showTkMessagebox('info', str(title), str(message))
        @staticmethod
        def showwarning(title="警告", message=""):
            js._showTkMessagebox('warn', str(title), str(message))
        @staticmethod
        def showerror(title="错误", message=""):
            js._showTkMessagebox('error', str(title), str(message))
        @staticmethod
        def askyesno(title="确认", message=""):
            return bool(js._showTkConfirm(str(title), str(message)))
        @staticmethod
        def askokcancel(title="确认", message=""):
            return bool(js._showTkConfirm(str(title), str(message)))
        @staticmethod
        def askquestion(title="问题", message=""):
            return "yes" if js._showTkConfirm(str(title), str(message)) else "no"
        @staticmethod
        def askretrycancel(title="重试", message=""):
            return bool(js._showTkConfirm(str(title), str(message)))

    _msgbox = MessageBox()

    class SimpleDialog:
        @staticmethod
        def askstring(title="输入", prompt="请输入内容:", **kwargs):
            res = js._showTkPrompt(str(title), str(prompt))
            return str(res) if res is not None else ""
        @staticmethod
        def askinteger(title="输入整数", prompt="请输入整数:", **kwargs):
            res = js._showTkPrompt(str(title), str(prompt))
            try: return int(res)
            except Exception: return None
        @staticmethod
        def askfloat(title="输入浮点数", prompt="请输入数字:", **kwargs):
            res = js._showTkPrompt(str(title), str(prompt))
            try: return float(res)
            except Exception: return None

    _simpledialog = SimpleDialog()

    class FileDialog:
        @staticmethod
        def askopenfilename(**kwargs):
            return "file.txt"
        @staticmethod
        def asksaveasfilename(**kwargs):
            return "output.txt"

    _filedialog = FileDialog()

    _tk_mod.Tk = Tk
    _tk_mod.Toplevel = Toplevel
    _tk_mod.Widget = Widget
    _tk_mod.Label = Label
    _tk_mod.Button = Button
    _tk_mod.Entry = Entry
    _tk_mod.Text = Text
    _tk_mod.Checkbutton = Checkbutton
    _tk_mod.Radiobutton = Radiobutton
    _tk_mod.Scale = Scale
    _tk_mod.Listbox = Listbox
    _tk_mod.Scrollbar = Scrollbar
    _tk_mod.Spinbox = Spinbox
    _tk_mod.OptionMenu = OptionMenu
    _tk_mod.Menu = Menu
    _tk_mod.Menubutton = Menubutton
    _tk_mod.Frame = Frame
    _tk_mod.LabelFrame = LabelFrame
    _tk_mod.Canvas = Canvas
    _tk_mod.StringVar = StringVar
    _tk_mod.IntVar = IntVar
    _tk_mod.DoubleVar = DoubleVar
    _tk_mod.BooleanVar = BooleanVar
    _tk_mod.messagebox = _msgbox
    _tk_mod.simpledialog = _simpledialog
    _tk_mod.filedialog = _filedialog
    _tk_mod.ttk = _ttk
    _tk_mod.END = "end"
    _tk_mod.INSERT = "insert"
    _tk_mod.CURRENT = "current"
    _tk_mod.ALL = "all"
    _tk_mod.LEFT = "left"
    _tk_mod.RIGHT = "right"
    _tk_mod.TOP = "top"
    _tk_mod.BOTTOM = "bottom"
    _tk_mod.CENTER = "center"
    _tk_mod.X = "x"
    _tk_mod.Y = "y"
    _tk_mod.BOTH = "both"
    _tk_mod.NORMAL = "normal"
    _tk_mod.DISABLED = "disabled"
    _tk_mod.ACTIVE = "active"
    _tk_mod.HORIZONTAL = "horizontal"
    _tk_mod.VERTICAL = "vertical"
    _tk_mod.TRUE = True
    _tk_mod.FALSE = False

    sys.modules['tkinter'] = _tk_mod
    sys.modules['tkinter.messagebox'] = _msgbox
    sys.modules['tkinter.simpledialog'] = _simpledialog
    sys.modules['tkinter.filedialog'] = _filedialog
    sys.modules['tkinter.ttk'] = _ttk

    # 7. Turtle Graphics Module Shim
    _turtle_mod = types.ModuleType('turtle')
    _global_turtle_state = {'root': None, 'canvas': None, 'pen': None}

    class Turtle:
        def __init__(self, canvas=None):
            if canvas is None:
                if not _global_turtle_state['root']:
                    _global_turtle_state['root'] = Tk(title="Turtle 海龟绘图")
                    c = Canvas(_global_turtle_state['root'], width=400, height=300, bg="white")
                    c.pack()
                    _global_turtle_state['canvas'] = c
                self._canvas = _global_turtle_state['canvas']
            else:
                self._canvas = canvas
            self._x = 200.0
            self._y = 150.0
            self._angle = 0.0
            self._pen_down = True
            self._color = "black"
            self._fill_color = "black"
            self._width = 2
            self._speed = 3
            self._visible = True
            self._fill_points = []

        def forward(self, dist):
            rad = math.radians(self._angle)
            nx = self._x + dist * math.cos(rad)
            ny = self._y - dist * math.sin(rad)
            if self._pen_down:
                self._canvas.create_line(self._x, self._y, nx, ny, fill=self._color, width=self._width)
            self._x, self._y = nx, ny

        fd = forward

        def backward(self, dist):
            self.forward(-dist)

        bk = backward
        back = backward

        def right(self, angle):
            self._angle = (self._angle - angle) % 360.0

        rt = right

        def left(self, angle):
            self._angle = (self._angle + angle) % 360.0

        lt = left

        def penup(self):
            self._pen_down = False

        pu = penup
        up = penup

        def pendown(self):
            self._pen_down = True

        pd = pendown
        down = pendown

        def color(self, c, fc=None):
            self._color = str(c)
            self._fill_color = str(fc) if fc else str(c)

        pencolor = lambda self, c: setattr(self, '_color', str(c))
        fillcolor = lambda self, c: setattr(self, '_fill_color', str(c))

        def pensize(self, w):
            self._width = int(w)

        width = pensize

        def circle(self, radius, extent=360, steps=36):
            step_len = (2.0 * math.pi * radius * (extent / 360.0)) / steps
            step_angle = extent / steps
            for _ in range(steps):
                self.forward(step_len)
                self.left(step_angle)

        def dot(self, size=6, color=None):
            c = color or self._color
            self._canvas.create_circle(self._x, self._y, size / 2.0, fill=c, outline=c)

        def goto(self, x, y):
            nx = 200.0 + float(x)
            ny = 150.0 - float(y)
            if self._pen_down:
                self._canvas.create_line(self._x, self._y, nx, ny, fill=self._color, width=self._width)
            self._x, self._y = nx, ny

        setpos = goto
        setposition = goto

        def clear(self):
            self._canvas.delete("all")

        def reset(self):
            self.clear()
            self._x, self._y = 200.0, 150.0
            self._angle = 0.0

        def speed(self, s):
            self._speed = s

        def hideturtle(self):
            self._visible = False

        ht = hideturtle

        def showturtle(self):
            self._visible = True

        st = showturtle

    def _get_default_turtle():
        if not _global_turtle_state['pen']:
            _global_turtle_state['pen'] = Turtle()
        return _global_turtle_state['pen']

    _turtle_mod.Turtle = Turtle
    _turtle_mod.forward = lambda d: _get_default_turtle().forward(d)
    _turtle_mod.fd = _turtle_mod.forward
    _turtle_mod.backward = lambda d: _get_default_turtle().backward(d)
    _turtle_mod.bk = _turtle_mod.backward
    _turtle_mod.back = _turtle_mod.backward
    _turtle_mod.right = lambda a: _get_default_turtle().right(a)
    _turtle_mod.rt = _turtle_mod.right
    _turtle_mod.left = lambda a: _get_default_turtle().left(a)
    _turtle_mod.lt = _turtle_mod.left
    _turtle_mod.penup = lambda: _get_default_turtle().penup()
    _turtle_mod.pu = _turtle_mod.penup
    _turtle_mod.up = _turtle_mod.penup
    _turtle_mod.pendown = lambda: _get_default_turtle().pendown()
    _turtle_mod.pd = _turtle_mod.pendown
    _turtle_mod.down = _turtle_mod.pendown
    _turtle_mod.color = lambda c, fc=None: _get_default_turtle().color(c, fc)
    _turtle_mod.pensize = lambda w: _get_default_turtle().pensize(w)
    _turtle_mod.width = _turtle_mod.pensize
    _turtle_mod.circle = lambda r, e=360, s=36: _get_default_turtle().circle(r, e, s)
    _turtle_mod.dot = lambda s=6, c=None: _get_default_turtle().dot(s, c)
    _turtle_mod.goto = lambda x, y: _get_default_turtle().goto(x, y)
    _turtle_mod.setpos = _turtle_mod.goto
    _turtle_mod.setposition = _turtle_mod.goto
    _turtle_mod.clear = lambda: _get_default_turtle().clear()
    _turtle_mod.reset = lambda: _get_default_turtle().reset()
    _turtle_mod.speed = lambda s: _get_default_turtle().speed(s)
    _turtle_mod.done = lambda: None
    _turtle_mod.mainloop = lambda: None

    sys.modules['turtle'] = _turtle_mod

_setup_tkinter_support()
`);

    const pyResult = await pyodide.runPythonAsync(code);

    // Flush any pending figures from matplotlib
    try {
      await pyodide.runPythonAsync(`
try:
    if 'matplotlib.pyplot' in sys.modules:
        import matplotlib.pyplot as plt
        if plt.get_fignums():
            plt.show()
except Exception:
    pass
`);
    } catch {}
    const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));

    let formattedReturn: string | undefined = undefined;
    if (pyResult !== undefined && pyResult !== null) {
      if (typeof pyResult.toJs === 'function') {
        try {
          formattedReturn = formatLogArg(pyResult.toJs());
          pyResult.destroy?.();
        } catch {
          formattedReturn = String(pyResult);
        }
      } else {
        formattedReturn = String(pyResult);
      }
    }

    return {
      status: 'success',
      executionTimeMs,
      logs,
      returnValue: formattedReturn
    };
  } catch (err: any) {
    const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
    let msg = err?.message || String(err);
    
    // Debug info for developer (can be seen in console)
    console.log('Python execution error caught:', msg);

    // Broad regex for AttributeError related to tkinter
    if (/AttributeError[:：]\s*module 'tkinter(\.ttk)?' (has no attribute|没有属性) '([^']+)'/.test(msg)) {
      const attrMatch = /attribute '([^']+)'/.exec(msg) || /属性 '([^']+)'/.exec(msg);
      const attr = attrMatch ? attrMatch[1] : '该组件';
      const mod = msg.includes('tkinter.ttk') ? 'tkinter.ttk' : 'tkinter';
      msg = `【兼容性提示】${mod} 目前尚未支持 '${attr}' 组件或属性。我们正在加紧完善对 Tkinter 控件库的支持。`;
    }

    pushLog('error', `Python 异常: ${msg}`);

    let line: number | undefined = undefined;
    const lineMatch = /File "<exec>", line (\d+)/.exec(msg) || /line (\d+)/.exec(msg);
    if (lineMatch) {
      line = parseInt(lineMatch[1], 10);
    }

    return {
      status: 'error',
      executionTimeMs,
      error: {
        message: msg,
        line,
        stack: err?.stack
      },
      logs
    };
  }
}

export function formatLogArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (typeof arg === 'function') return `[Function: ${arg.name || 'anonymous'}]`;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return Object.prototype.toString.call(arg);
  }
}

export function buildHtmlBundle(files: ProjectFile[], npmPackages: string[] = []): string {
  const htmlFile =
    files.find((f) => f.isEntry && (f.language === 'html' || f.name.endsWith('.html') || f.name.endsWith('.htm'))) ||
    files.find((f) => f.language === 'html' || f.name.endsWith('.html') || f.name.endsWith('.htm')) ||
    files[0];
  const cssFiles = files.filter((f) => f.language === 'css' || f.name.endsWith('.css'));
  const jsFiles = files.filter(
    (f) =>
      (f.language === 'javascript' || f.language === 'typescript' || f.name.endsWith('.js')) &&
      f.id !== htmlFile?.id
  );

  let rawHtml = htmlFile?.content || '<html><body><div id="app"></div></body></html>';

  // Inject console relay script into iframe
  const consoleRelay = `
  <script>
    (function() {
      function sendLog(level, args) {
        try {
          var formatted = Array.prototype.slice.call(args).map(function(item) {
            if (item === null) return 'null';
            if (item === undefined) return 'undefined';
            if (typeof item === 'object') {
              try { return JSON.stringify(item); } catch(e) { return String(item); }
            }
            return String(item);
          }).join(' ');

          window.parent.postMessage({
            type: 'APP_CONSOLE_LOG',
            level: level,
            message: formatted,
            timestamp: Date.now()
          }, '*');
        } catch(e) {}
      }

      var origLog = console.log;
      var origInfo = console.info;
      var origWarn = console.warn;
      var origError = console.error;

      console.log = function() { sendLog('log', arguments); origLog && origLog.apply(console, arguments); };
      console.info = function() { sendLog('info', arguments); origInfo && origInfo.apply(console, arguments); };
      console.warn = function() { sendLog('warn', arguments); origWarn && origWarn.apply(console, arguments); };
      console.error = function() { sendLog('error', arguments); origError && origError.apply(console, arguments); };

      window.onerror = function(msg, url, line, col, err) {
        sendLog('error', ['[运行时错误] ' + msg + ' (第 ' + line + ' 行)']);
        return false;
      };
    })();
  </script>
  `;

  // Virtual file system for cross-referencing and fetch() interception
  const virtualFilesMap: Record<string, { content: string; mime: string }> = {};
  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    let mime = 'text/plain';
    if (ext === 'json') mime = 'application/json';
    else if (ext === 'html') mime = 'text/html';
    else if (ext === 'css') mime = 'text/css';
    else if (ext === 'js' || ext === 'ts') mime = 'application/javascript';
    else if (ext === 'png') mime = 'image/png';
    else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
    else if (ext === 'gif') mime = 'image/gif';
    else if (ext === 'svg') mime = 'image/svg+xml';
    else if (ext === 'webp') mime = 'image/webp';
    else if (ext === 'ico') mime = 'image/x-icon';
    else if (ext === 'mp4') mime = 'video/mp4';
    else if (ext === 'webm') mime = 'video/webm';
    else if (ext === 'ogg') mime = 'video/ogg';
    else if (ext === 'mov') mime = 'video/quicktime';

    virtualFilesMap[f.name] = { content: f.content, mime };
    virtualFilesMap['./' + f.name] = { content: f.content, mime };
    virtualFilesMap['/' + f.name] = { content: f.content, mime };
  }

  // Replace relative image and video references in HTML with data URLs
  for (const f of files) {
    const isMedia = f.content.startsWith('data:') || f.language === 'image' || f.language === 'video' || /\.(png|jpe?g|gif|webp|svg|ico|avif|mp4|webm|ogg|mov)$/i.test(f.name);
    if (isMedia) {
      let srcUrl = f.content;
      if (!srcUrl.startsWith('data:') && !srcUrl.startsWith('http')) {
        if (f.name.toLowerCase().endsWith('.svg')) {
          srcUrl = `data:image/svg+xml;utf8,${encodeURIComponent(f.content)}`;
        } else {
          const ext = f.name.split('.').pop()?.toLowerCase() || 'png';
          const mime = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : `image/${ext}`;
          srcUrl = `data:${mime};base64,${f.content}`;
        }
      }
      const escaped = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const baseName = f.name.split('/').pop() || f.name;
      const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const srcRegex = new RegExp(`(src=["'])(?:\\.\\/)?(?:${escaped}|${escapedBase})(["'])`, 'gi');
      rawHtml = rawHtml.replace(srcRegex, `$1${srcUrl}$2`);
      const hrefRegex = new RegExp(`(href=["'])(?:\\.\\/)?(?:${escaped}|${escapedBase})(["'])`, 'gi');
      rawHtml = rawHtml.replace(hrefRegex, `$1${srcUrl}$2`);
      const urlRegex = new RegExp(`(url\\(["']?)(?:\\.\\/)?(?:${escaped}|${escapedBase})(["']?\\))`, 'gi');
      rawHtml = rawHtml.replace(urlRegex, `$1${srcUrl}$2`);
    }
  }

  const vfsScript = `
  <script>
    (function() {
      var __VFS__ = ${JSON.stringify(virtualFilesMap)};
      var origFetch = window.fetch;
      window.fetch = function(url, opts) {
        if (typeof url === 'string') {
          var key = url.trim();
          var matched = __VFS__[key] || __VFS__[key.replace(/^\\.\\//, '')];
          if (matched) {
            return Promise.resolve(new Response(matched.content, {
              status: 200,
              headers: { 'Content-Type': matched.mime }
            }));
          }
        }
        return origFetch.apply(this, arguments);
      };
    })();
  </script>
  `;

  // Inject NPM CDN packages
  let npmScriptsBlock = '';
  if (npmPackages && npmPackages.length > 0) {
    for (const pkg of npmPackages) {
      const cleanPkg = pkg.trim();
      if (!cleanPkg) continue;
      npmScriptsBlock += `<script src="https://cdn.jsdelivr.net/npm/${cleanPkg}"></script>\n`;
    }
  }

  // Replace external link tags for CSS files if matched
  const matchedCssIds = new Set<string>();
  for (const cf of cssFiles) {
    const escaped = cf.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkRegex = new RegExp(`<link[^>]*href=["'](?:\\.\\/)?${escaped}["'][^>]*>`, 'gi');
    if (linkRegex.test(rawHtml)) {
      rawHtml = rawHtml.replace(linkRegex, `<style id="${cf.name}">\n${cf.content}\n</style>`);
      matchedCssIds.add(cf.id);
    }
  }

  // Inject remaining CSS files
  let cssBlock = '';
  for (const cf of cssFiles) {
    if (!matchedCssIds.has(cf.id)) {
      cssBlock += `<style id="${cf.name}">\n${cf.content}\n</style>\n`;
    }
  }

  // Replace external script tags for JS files if matched
  const matchedJsIds = new Set<string>();
  for (const jf of jsFiles) {
    const escaped = jf.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const scriptRegex = new RegExp(`<script[^>]*src=["'](?:\\.\\/)?${escaped}["'][^>]*>\\s*<\\/script>`, 'gi');
    if (scriptRegex.test(rawHtml)) {
      rawHtml = rawHtml.replace(scriptRegex, `<script id="${jf.name}">\n${jf.content}\n</script>`);
      matchedJsIds.add(jf.id);
    }
  }

  // Inject remaining JS files
  let jsBlock = '';
  for (const jf of jsFiles) {
    if (!matchedJsIds.has(jf.id)) {
      jsBlock += `<script id="${jf.name}">\n${jf.content}\n</script>\n`;
    }
  }

  // If head exists, inject into head, else wrap
  if (rawHtml.includes('<head>')) {
    rawHtml = rawHtml.replace('<head>', `<head>${consoleRelay}${vfsScript}${npmScriptsBlock}${cssBlock}`);
  } else if (rawHtml.includes('<html>')) {
    rawHtml = rawHtml.replace('<html>', `<html><head>${consoleRelay}${vfsScript}${npmScriptsBlock}${cssBlock}</head>`);
  } else {
    rawHtml = `<!DOCTYPE html><html><head>${consoleRelay}${vfsScript}${npmScriptsBlock}${cssBlock}</head><body>${rawHtml}</body></html>`;
  }

  if (rawHtml.includes('</body>')) {
    rawHtml = rawHtml.replace('</body>', `${jsBlock}</body>`);
  } else {
    rawHtml = `${rawHtml}${jsBlock}`;
  }

  return rawHtml;
}

import { customSmartFormat, formatCodeAsync } from './autoIndentEngine';

export { formatCodeAsync };

export function formatCode(code: string, language: string, tabSize: number = 2): string {
  return customSmartFormat(code, language, tabSize);
}

/**
 * Executes and validates Markdown document
 */
export function runMarkdownSandbox(
  content: string,
  filename: string,
  onLog: (log: ConsoleLogItem) => void
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const lines = content.split('\n');
    const lineCount = lines.length;
    const charCount = content.length;
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const headings = lines.filter((l) => /^\s*#{1,6}\s+/.test(l));
    const codeBlocks = Math.floor((content.match(/```/g) || []).length / 2);
    const links = (content.match(/\[.*?\]\(.*?\)/g) || []).length;
    const images = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;
    const tables = lines.filter((l) => /^\s*\|.*\|\s*$/.test(l)).length;

    const pushLog = (level: ConsoleLogItem['level'], message: string) => {
      const item: ConsoleLogItem = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        level,
        message,
        timestamp: Date.now()
      };
      onLog(item);
    };

    pushLog('system', `[Markdown] 正在解析文档: ${filename || 'README.md'}`);
    pushLog('info', `文档统计: 共 ${lineCount} 行，${charCount} 字符，约 ${wordCount} 个词。`);
    if (headings.length > 0) {
      pushLog('info', `结构纲要: 包含 ${headings.length} 处标题 (首标题: "${headings[0].replace(/^#+\s*/, '').slice(0, 30)}")`);
    }
    if (codeBlocks > 0) {
      pushLog('info', `代码高亮: 包含 ${codeBlocks} 处独立代码块。`);
    }
    if (tables > 0) {
      pushLog('info', `表格结构: 包含格式化表格数据。`);
    }
    if (links > 0 || images > 0) {
      pushLog('info', `资源链接: 包含 ${links} 处超链接，${images} 处图片引用。`);
    }
    pushLog('system', 'Markdown 文档渲染就绪！可切换至「预览」视图查看排版效果。');

    const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
    resolve({
      status: 'success',
      executionTimeMs,
      logs: []
    });
  });
}

/**
 * Executes a Shell script in simulated Unix terminal environment
 */
export async function runShellSandbox(
  script: string,
  projectFiles: ProjectFile[],
  onLog: (log: ConsoleLogItem) => void,
  onPrompt?: (promptText: string) => Promise<string>
): Promise<ExecutionResult> {
  const startTime = performance.now();
  const logs: ConsoleLogItem[] = [];

  const pushLog = (level: ConsoleLogItem['level'], message: string) => {
    const item: ConsoleLogItem = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      level,
      message,
      timestamp: Date.now()
    };
    logs.push(item);
    onLog(item);
  };

  pushLog('system', '正在启动 Shell 沙箱环境 (Bash 兼容)...');
  const envVars: Record<string, string> = {
    USER: 'developer',
    HOME: '/workspace',
    PWD: '/workspace/project',
    SHELL: '/bin/bash',
    PATH: '/usr/local/bin:/usr/bin:/bin',
    LANG: 'zh_CN.UTF-8'
  };

  const lines = script.split('\n');
  const currentPwd = '/workspace/project';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('#')) continue;

    const expandVars = (str: string): string => {
      return str.replace(/\$\{?([a-zA-Z_][a-zA-Z0-9_]*)\}?/g, (_m, varName) => {
        return envVars[varName] !== undefined ? envVars[varName] : '';
      });
    };

    const assignMatch = rawLine.match(/^(?:export\s+)?([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      let val = assignMatch[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      envVars[varName] = expandVars(val);
      continue;
    }

    const expanded = expandVars(rawLine);
    const parts = expanded.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    if (cmd === 'echo') {
      let output = args.join(' ');
      if ((output.startsWith('"') && output.endsWith('"')) || (output.startsWith("'") && output.endsWith("'"))) {
        output = output.slice(1, -1);
      }
      pushLog('log', output);
    } else if (cmd === 'pwd') {
      pushLog('log', currentPwd);
    } else if (cmd === 'date') {
      pushLog('log', new Date().toLocaleString());
    } else if (cmd === 'whoami') {
      pushLog('log', envVars.USER);
    } else if (cmd === 'uname') {
      pushLog('log', 'Linux sandbox-runtime 6.1.0-x86_64');
    } else if (cmd === 'clear') {
      // clear
    } else if (cmd === 'ls' || cmd === 'dir') {
      const fileList = projectFiles.map((f) => {
        const size = (f.content?.length || 0) + 'B';
        return `${f.name.padEnd(20)} ${size.padStart(8)}`;
      });
      pushLog('log', `目录清单 [${currentPwd}]:\n` + fileList.join('\n'));
    } else if (cmd === 'cat') {
      const targetName = args[0];
      if (!targetName) {
        pushLog('error', 'cat: 缺少文件名参数');
      } else {
        const file = projectFiles.find((f) => f.name === targetName || f.name.endsWith('/' + targetName));
        if (file) {
          pushLog('log', file.content);
        } else {
          pushLog('error', `cat: ${targetName}: 没有那个文件或目录`);
        }
      }
    } else if (cmd === 'wc') {
      const targetName = args.find((a) => !a.startsWith('-'));
      if (!targetName) {
        pushLog('error', 'wc: 缺少文件名');
      } else {
        const file = projectFiles.find((f) => f.name === targetName);
        if (file) {
          const lCount = file.content.split('\n').length;
          const wCount = file.content.trim().split(/\s+/).filter(Boolean).length;
          const cCount = file.content.length;
          pushLog('log', ` ${lCount}  ${wCount} ${cCount} ${targetName}`);
        } else {
          pushLog('error', `wc: ${targetName}: 没有那个文件`);
        }
      }
    } else if (cmd === 'grep') {
      const keyword = args[0];
      const targetName = args[1];
      if (!keyword || !targetName) {
        pushLog('error', 'grep: 用法 grep <关键词> <文件名>');
      } else {
        const file = projectFiles.find((f) => f.name === targetName);
        if (file) {
          const matched = file.content.split('\n').filter((l) => l.includes(keyword));
          if (matched.length > 0) {
            pushLog('log', matched.join('\n'));
          }
        } else {
          pushLog('error', `grep: ${targetName}: 文件不存在`);
        }
      }
    } else if (cmd === 'read') {
      let promptText = '请输入:';
      let varNames: string[] = [];
      for (let j = 0; j < args.length; j++) {
        if (args[j] === '-p' && j + 1 < args.length) {
          promptText = args[j + 1].replace(/^["']|["']$/g, '');
          j++;
        } else if (args[j] === '-r' || args[j] === '-s') {
          continue;
        } else if (!args[j].startsWith('-')) {
          varNames.push(args[j]);
        }
      }
      if (varNames.length === 0) varNames = ['REPLY'];

      let inputVal = '';
      if (onPrompt) {
        inputVal = await onPrompt(promptText);
      } else {
        inputVal = window.prompt(promptText) ?? '';
      }
      envVars[varNames[0]] = inputVal || '';
      pushLog('info', `[输入 ${varNames[0]}]: ${inputVal}`);
    } else if (cmd === 'help') {
      pushLog('info', '支持的 Shell 命令: echo, pwd, date, whoami, uname, ls, cat, wc, grep, read, clear, export, VAR=val');
    } else {
      pushLog('log', `[sh] ${expanded}`);
    }
  }

  pushLog('system', 'Shell 脚本运行结束 (退出码: 0)');
  const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
  return {
    status: 'success',
    executionTimeMs,
    logs
  };
}

/**
 * Validates and displays JSON data structure
 */
export function runJsonSandbox(
  content: string,
  filename: string,
  onLog: (log: ConsoleLogItem) => void
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const pushLog = (level: ConsoleLogItem['level'], message: string, data?: unknown) => {
      const item: ConsoleLogItem = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        level,
        message,
        timestamp: Date.now(),
        data
      };
      onLog(item);
    };

    pushLog('system', `[JSON 引擎] 正在校验并解析: ${filename || 'data.json'}`);

    try {
      const parsed = JSON.parse(content);
      const isArr = Array.isArray(parsed);
      const isObj = typeof parsed === 'object' && parsed !== null && !isArr;
      const sizeBytes = new Blob([content]).size;

      pushLog('info', `JSON 语法校验通过！文档大小: ${sizeBytes} 字节`);
      if (isArr) {
        pushLog('info', `根数据类型: 数组 (Array)，包含 ${parsed.length} 个元素。`);
        if (parsed.length > 0 && typeof parsed[0] === 'object') {
          pushLog('info', '[数据结构展示]:\n' + JSON.stringify(parsed.slice(0, 5), null, 2));
        } else {
          pushLog('info', '[数据项]:\n' + JSON.stringify(parsed, null, 2));
        }
      } else if (isObj) {
        const keys = Object.keys(parsed);
        pushLog('info', `根数据类型: 对象 (Object)，包含 ${keys.length} 个顶级属性: [${keys.slice(0, 8).join(', ')}${keys.length > 8 ? '...' : ''}]`);
        pushLog('info', '[格式化内容]:\n' + JSON.stringify(parsed, null, 2));
      } else {
        pushLog('info', `基本数据类型值: ${String(parsed)}`);
      }

      resolve({
        status: 'success',
        executionTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
        logs: []
      });
    } catch (err: any) {
      pushLog('error', `JSON 语法错误: ${err?.message || err}`);
      resolve({
        status: 'error',
        executionTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
        logs: [],
        error: err?.message || 'JSON 语法错误'
      });
    }
  });
}

/**
 * Simulates an in-memory SQL execution sandbox
 */
export function runSqlSandbox(
  sqlText: string,
  onLog: (log: ConsoleLogItem) => void
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const pushLog = (level: ConsoleLogItem['level'], message: string) => {
      const item: ConsoleLogItem = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        level,
        message,
        timestamp: Date.now()
      };
      onLog(item);
    };

    pushLog('system', '[SQL 引擎] 正在启动内存数据库沙箱...');

    const tables: Record<string, { columns: string[]; rows: Record<string, any>[] }> = {};
    const statements = sqlText
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--'));

    try {
      for (const stmt of statements) {
        if (/^CREATE\s+TABLE/i.test(stmt)) {
          const match = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]+)\)/i);
          if (match) {
            const tableName = match[1];
            const colDefs = match[2].split(',').map((c) => c.trim().split(/\s+/)[0]);
            tables[tableName] = { columns: colDefs, rows: [] };
            pushLog('info', `表 [${tableName}] 创建成功，定义字段: (${colDefs.join(', ')})`);
          }
        } else if (/^INSERT\s+INTO/i.test(stmt)) {
          const match = stmt.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)(?:\s*\(([^)]+)\))?\s*VALUES\s*\(([\s\S]+)\)/i);
          if (match) {
            const tableName = match[1];
            const table = tables[tableName];
            if (!table) {
              pushLog('error', `表 [${tableName}] 不存在`);
              continue;
            }
            const values = match[3].split(',').map((v) => {
              const val = v.trim();
              if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
                return val.slice(1, -1);
              }
              const num = Number(val);
              return isNaN(num) ? val : num;
            });
            const cols = match[2] ? match[2].split(',').map((c) => c.trim()) : table.columns;
            const row: Record<string, any> = {};
            cols.forEach((c, idx) => {
              row[c] = values[idx] !== undefined ? values[idx] : null;
            });
            table.rows.push(row);
            pushLog('info', `插入 1 行记录到表 [${tableName}]`);
          }
        } else if (/^SELECT/i.test(stmt)) {
          const match = stmt.match(/SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([a-zA-Z0-9_]+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?$/i);
          if (match) {
            const fieldsStr = match[1].trim();
            const tableName = match[2].trim();
            const whereClause = match[3]?.trim();
            const orderCol = match[4]?.trim();
            const orderDir = match[5]?.toUpperCase() || 'ASC';
            const limit = match[6] ? parseInt(match[6], 10) : undefined;

            const table = tables[tableName];
            if (!table) {
              pushLog('error', `表 [${tableName}] 不存在`);
              continue;
            }

            let resultRows = [...table.rows];
            if (whereClause) {
              const condMatch = whereClause.match(/([a-zA-Z0-9_]+)\s*(=|>|<|>=|<=|!=)\s*(.+)/);
              if (condMatch) {
                const [, col, op, valStr] = condMatch;
                let val: any = valStr.trim();
                if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
                  val = val.slice(1, -1);
                } else if (!isNaN(Number(val))) {
                  val = Number(val);
                }
                resultRows = resultRows.filter((r) => {
                  const cell = r[col];
                  if (op === '=') return cell == val;
                  if (op === '>') return cell > val;
                  if (op === '<') return cell < val;
                  if (op === '>=') return cell >= val;
                  if (op === '<=') return cell <= val;
                  if (op === '!=') return cell != val;
                  return true;
                });
              }
            }

            if (orderCol) {
              resultRows.sort((a, b) => {
                if (a[orderCol] < b[orderCol]) return orderDir === 'DESC' ? 1 : -1;
                if (a[orderCol] > b[orderCol]) return orderDir === 'DESC' ? -1 : 1;
                return 0;
              });
            }

            if (limit !== undefined) {
              resultRows = resultRows.slice(0, limit);
            }

            const targetCols = fieldsStr === '*' ? table.columns : fieldsStr.split(',').map((f) => f.trim());
            const headerLine = targetCols.map((c) => c.padEnd(14)).join(' | ');
            const divider = targetCols.map(() => '--------------').join('-+-');
            const dataLines = resultRows.map((r) =>
              targetCols.map((c) => String(r[c] !== undefined ? r[c] : 'NULL').padEnd(14)).join(' | ')
            );
            pushLog('info', `查询结果 (${resultRows.length} 行):\n${headerLine}\n${divider}\n${dataLines.join('\n')}`);
          } else {
            pushLog('info', `执行查询: ${stmt}`);
          }
        } else {
          pushLog('info', `已执行: ${stmt}`);
        }
      }

      pushLog('system', 'SQL 语句执行完毕。');
      resolve({
        status: 'success',
        executionTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
        logs: []
      });
    } catch (err: any) {
      pushLog('error', `SQL 执行异常: ${err?.message || err}`);
      resolve({
        status: 'error',
        executionTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
        logs: [],
        error: err?.message || 'SQL 执行异常'
      });
    }
  });
}
