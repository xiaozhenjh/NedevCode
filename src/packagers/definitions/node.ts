import JSZip from 'jszip';
import { PackagerDefinition } from '../types';

export const nodePackager: PackagerDefinition = {
  id: 'node-bundle',
  name: 'Node 应用包',
  description: '标准 Node.js / NPM 运行包，包含 package.json、CLI 引导入口及依赖声明',
  category: 'local',
  supportedLanguages: ['javascript', 'typescript'],
  artifactExtension: '.zip',
  icon: 'Terminal',
  isAvailableForProject: (project) => {
    return (
      ['javascript', 'typescript'].includes(project.language) ||
      project.files.some((f) => f.name.endsWith('.js') || f.name.endsWith('.ts') || f.name === 'package.json')
    );
  },
  package: async (project, _options, onProgress) => {
    onProgress?.({
      step: '正在构建 Node.js 应用程序目录...',
      percent: 25,
      status: 'running'
    });

    const zip = new JSZip();
    const cleanPkgName = (project.title || 'node-app')
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-');

    // 1. 写入所有工程文件
    for (const file of project.files) {
      if (file.content && file.content.startsWith('data:') && file.content.includes(';base64,')) {
        const base64Data = file.content.split(';base64,')[1];
        zip.file(file.name, base64Data, { base64: true });
      } else {
        zip.file(file.name, file.content || '');
      }
    }

    // 2. 识别主入口文件
    const entryFile =
      project.files.find((f) => f.isEntry) ||
      project.files.find((f) => f.name === 'index.js' || f.name === 'main.js' || f.name === 'app.js') ||
      project.files.find((f) => f.name.endsWith('.js') || f.name.endsWith('.ts')) ||
      project.files[0];

    const entryPath = entryFile ? entryFile.name : 'index.js';

    // 3. 自动生成 package.json
    if (!project.files.some((f) => f.name === 'package.json')) {
      const deps: Record<string, string> = {};
      (project.npmPackages || []).forEach((pkg) => {
        deps[pkg] = 'latest';
      });

      const pkgJson = {
        name: cleanPkgName,
        version: '1.0.0',
        description: project.description || 'Node.js application',
        main: entryPath,
        type: 'module',
        bin: {
          [cleanPkgName]: `./${entryPath}`
        },
        scripts: {
          start: `node ${entryPath}`
        },
        dependencies: deps
      };

      zip.file('package.json', JSON.stringify(pkgJson, null, 2));
    }

    onProgress?.({
      step: '正在打包压缩 Node.js 归档...',
      percent: 75,
      status: 'running'
    });

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const filename = `${cleanPkgName}-node.zip`;

    onProgress?.({
      step: 'Node.js 应用程序包构建完成',
      percent: 100,
      status: 'success',
      downloadName: filename
    });

    return {
      blob,
      filename
    };
  }
};
