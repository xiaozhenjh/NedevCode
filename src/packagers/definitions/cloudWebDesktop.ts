import { PackagerDefinition } from '../types';
import { runGitHubCloudWorkflow } from '../../services/githubCloudBuildRunner';

/**
 * 桌面跨平台发行版云打包器 (Web Desktop Distribution)
 */
export const cloudWebDesktopPackager: PackagerDefinition = {
  id: 'cloud-web-desktop',
  name: '桌面跨平台应用发行版',
  description: '在云端 Linux/Windows 环境构建打包桌面端跨平台安装包与静态分发资源',
  category: 'cloud',
  supportedLanguages: ['html', 'javascript', 'typescript'],
  artifactExtension: '.zip',
  icon: 'Globe',
  fields: [
    {
      key: 'version',
      label: '发布版本号',
      type: 'text',
      defaultValue: '1.0.0',
      placeholder: '输入版本号',
      helpText: '桌面发行版本号'
    }
  ],
  isAvailableForProject: (project) => {
    return ['html', 'javascript', 'typescript'].includes(project.language) ||
      project.files.some((f) => f.name.endsWith('.html') || f.name.endsWith('.js'));
  },
  package: async (project, options, onProgress) => {
    const { token, branch = 'main', onUpdateGitConfig, customRepoName } = options;

    if (!token || !token.trim()) {
      throw new Error('云端打包需要提供具有 workflow 权限的 GitHub Access Token');
    }

    const safeTitle = (project.title || 'app').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const version = options.extraConfig?.version || '1.0.0';

    const workflowFileName = 'build-desktop-dist.yml';
    const workflowContent = `name: Build Desktop Distribution
on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Build Web Application
        run: |
          mkdir -p output/bundle
          cp -r * output/bundle/ 2>/dev/null || true
          rm -rf output/bundle/.git output/bundle/.github output/bundle/node_modules

      - name: Generate Desktop Manifest
        run: |
          cat << 'EOF' > output/bundle/app-manifest.json
{
  "name": "${safeTitle}",
  "version": "${version}",
  "main": "index.html",
  "window": {
    "width": 1200,
    "height": 800,
    "resizable": true
  }
}
EOF

      - name: Package Desktop Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${safeTitle}-desktop-dist
          path: output/bundle/
`;

    return await runGitHubCloudWorkflow({
      project,
      packagerId: 'cloud-web-desktop',
      packagerName: '桌面跨平台应用发行版',
      token: token.trim(),
      workflowFileName,
      workflowContent,
      artifactExpectedName: `${safeTitle}-desktop-dist.zip`,
      customRepoName,
      branch,
      onProgress,
      onUpdateGitConfig
    });
  }
};
