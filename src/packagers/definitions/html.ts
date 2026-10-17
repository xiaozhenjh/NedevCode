import { PackagerDefinition } from '../types';
import { buildHtmlBundle } from '../../utils/codeRunner';

export const htmlPackager: PackagerDefinition = {
  id: 'single-html',
  name: '单文件 HTML',
  description: '将样式、逻辑与虚拟文件系统编译为纯单文件，双击在任意浏览器离线运行',
  category: 'local',
  supportedLanguages: ['html', 'javascript', 'typescript', 'css'],
  artifactExtension: '.html',
  icon: 'Globe',
  isAvailableForProject: (project) => {
    const hasHtmlFile = project.files.some((f) => f.name.toLowerCase().endsWith('.html') || f.language === 'html');
    const isWebLang = ['html', 'javascript', 'typescript', 'css'].includes(project.language);
    const isWebExec = project.executionType === 'html-preview' || project.executionType === 'canvas-animation';
    return hasHtmlFile || isWebLang || isWebExec;
  },
  package: async (project, _options, onProgress) => {
    onProgress?.({
      step: '正在分析主入口与静态依赖资源...',
      percent: 25,
      status: 'running'
    });

    const bundledHtml = buildHtmlBundle(project.files, project.npmPackages || []);

    onProgress?.({
      step: '正在编译内嵌虚拟文件系统与离线执行脚本...',
      percent: 75,
      status: 'running'
    });

    const blob = new Blob([bundledHtml], { type: 'text/html;charset=utf-8' });
    const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'app'}.standalone.html`;

    onProgress?.({
      step: '单文件离线可运行 HTML 打包完成',
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
