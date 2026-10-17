import JSZip from 'jszip';
import { PackagerDefinition } from '../types';

export const zipPackager: PackagerDefinition = {
  id: 'zip-archive',
  name: '工程 ZIP 包',
  description: '标准多目录源码归档，包含所有代码文件、多媒体数据及完整目录树',
  category: 'local',
  supportedLanguages: 'all',
  artifactExtension: '.zip',
  icon: 'FileArchive',
  isAvailableForProject: () => true,
  package: async (project, _options, onProgress) => {
    onProgress?.({
      step: '正在构建 ZIP 文件目录树...',
      percent: 20,
      status: 'running'
    });

    const zip = new JSZip();

    if (project.folders && Array.isArray(project.folders)) {
      for (const folder of project.folders) {
        if (folder && folder.trim()) {
          zip.folder(folder.trim());
        }
      }
    }

    onProgress?.({
      step: `正在写入 ${project.files.length} 个项目文件...`,
      percent: 50,
      status: 'running'
    });

    for (const file of project.files) {
      if (file.content && file.content.startsWith('data:') && file.content.includes(';base64,')) {
        const base64Data = file.content.split(';base64,')[1];
        zip.file(file.name, base64Data, { base64: true });
      } else {
        zip.file(file.name, file.content || '');
      }
    }

    onProgress?.({
      step: '正在压缩并生成二进制数据...',
      percent: 85,
      status: 'running'
    });

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'project'}.zip`;

    onProgress?.({
      step: 'ZIP 源码包构建完成',
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
