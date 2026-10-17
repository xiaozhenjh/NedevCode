import JSZip from 'jszip';
import { PackagerDefinition } from '../types';
import { buildHtmlBundle } from '../../utils/codeRunner';

export const webDistPackager: PackagerDefinition = {
  id: 'web-dist',
  name: '生产分发包',
  description: '包含静态产物、离线入口与 Manifest 配置文件，可直接部署至任何静态服务器',
  category: 'local',
  supportedLanguages: ['html', 'javascript', 'typescript', 'css'],
  artifactExtension: '.zip',
  icon: 'Package',
  isAvailableForProject: (project) => {
    const hasHtmlFile = project.files.some((f) => f.name.toLowerCase().endsWith('.html') || f.language === 'html');
    const isWebLang = ['html', 'javascript', 'typescript', 'css'].includes(project.language);
    return hasHtmlFile || isWebLang;
  },
  package: async (project, _options, onProgress) => {
    onProgress?.({
      step: '正在构建 Web 生产静态分发包目录...',
      percent: 20,
      status: 'running'
    });

    const zip = new JSZip();
    const dist = zip.folder('dist') || zip;

    onProgress?.({
      step: '正在整合离线运行入口与静态资源...',
      percent: 50,
      status: 'running'
    });

    const bundledHtml = buildHtmlBundle(project.files, project.npmPackages || []);
    dist.file('index.html', bundledHtml);

    for (const file of project.files) {
      if (file.name !== 'index.html') {
        if (file.content && file.content.startsWith('data:') && file.content.includes(';base64,')) {
          const base64Data = file.content.split(';base64,')[1];
          dist.file(file.name, base64Data, { base64: true });
        } else {
          dist.file(file.name, file.content || '');
        }
      }
    }

    const manifest = {
      name: project.title,
      short_name: project.title,
      start_url: './index.html',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#3b82f6'
    };
    dist.file('manifest.json', JSON.stringify(manifest, null, 2));

    onProgress?.({
      step: '正在压缩生成 Web 生产归档 ZIP...',
      percent: 85,
      status: 'running'
    });

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'web'}-dist.zip`;

    onProgress?.({
      step: 'Web 生产静态分发包构建完成',
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
