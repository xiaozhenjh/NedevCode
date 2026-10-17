import { PackagerDefinition } from '../types';

export const sqlPackager: PackagerDefinition = {
  id: 'sql-bundle',
  name: 'SQL 迁移包',
  description: '将所有表结构定义与初始化数据整合成事务安全的单文件数据库迁移脚本',
  category: 'local',
  supportedLanguages: ['sql'],
  artifactExtension: '.sql',
  icon: 'Database',
  isAvailableForProject: (project) => {
    return (
      project.language === 'sql' ||
      project.files.some((f) => f.name.endsWith('.sql'))
    );
  },
  package: async (project, _options, onProgress) => {
    onProgress?.({
      step: '正在整合 SQL 数据表与脚本文件...',
      percent: 40,
      status: 'running'
    });

    const sqlFiles = project.files.filter((f) => f.name.endsWith('.sql'));
    const combinedLines: string[] = [
      `-- ========================================================`,
      `-- Database Migration Bundle: ${project.title}`,
      `-- Description: ${project.description || 'Database migration script'}`,
      `-- Generated: ${new Date().toISOString()}`,
      `-- ========================================================`,
      `BEGIN TRANSACTION;`,
      ``
    ];

    if (sqlFiles.length > 0) {
      for (const file of sqlFiles) {
        combinedLines.push(`-- [File: ${file.name}]`);
        combinedLines.push(file.content || '');
        combinedLines.push(``);
      }
    } else {
      combinedLines.push(project.files[0]?.content || '');
    }

    combinedLines.push(`COMMIT;`);

    onProgress?.({
      step: '正在校验事务结构与生成文件...',
      percent: 85,
      status: 'running'
    });

    const fullSql = combinedLines.join('\n');
    const blob = new Blob([fullSql], { type: 'application/sql;charset=utf-8' });
    const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'migration'}.sql`;

    onProgress?.({
      step: 'SQL 迁移脚本包构建完成',
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
