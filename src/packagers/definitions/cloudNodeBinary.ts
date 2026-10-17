import { PackagerDefinition } from '../types';
import { runGitHubCloudWorkflow } from '../../services/githubCloudBuildRunner';

/**
 * Node.js 独立可执行二进制包云打包器
 */
export const cloudNodeBinaryPackager: PackagerDefinition = {
  id: 'cloud-node-binary',
  name: 'Node.js 独立可执行二进制包',
  description: '在云端将 Node.js / TypeScript 项目编译为单文件原生二进制可执行文件，无需安装 Node.js 运行时',
  category: 'cloud',
  supportedLanguages: ['javascript', 'typescript'],
  artifactExtension: '.bin',
  icon: 'Terminal',
  fields: [
    {
      key: 'entryFile',
      label: '启动入口脚本',
      type: 'text',
      defaultValue: 'index.js',
      placeholder: 'index.js 或 main.js',
      helpText: 'Node.js 启动执行的入口文件'
    }
  ],
  isAvailableForProject: (project) => {
    return ['javascript', 'typescript'].includes(project.language) ||
      project.files.some((f) => f.name.endsWith('.js') || f.name.endsWith('.ts'));
  },
  package: async (project, options, onProgress) => {
    const { token, branch = 'main', onUpdateGitConfig, customRepoName } = options;

    if (!token || !token.trim()) {
      throw new Error('云端打包需要提供具有 workflow 权限的 GitHub Access Token');
    }

    const safeTitle = (project.title || 'node-app').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const entryFile = options.extraConfig?.entryFile || 'index.js';

    const workflowFileName = 'build-node-binary.yml';
    const workflowContent = `name: Build Node Standalone Binary
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

      - name: Install Dependencies
        run: |
          npm install -g @yao-pkg/pkg
          if [ -f package.json ]; then npm install; fi

      - name: Compile Executable Binary
        run: |
          TARGET_ENTRY="${entryFile}"
          if [ ! -f "$TARGET_ENTRY" ]; then
            TARGET_ENTRY=$(find . -maxdepth 2 -name "*.js" | head -n 1)
          fi
          echo "Packaging: $TARGET_ENTRY"
          pkg "$TARGET_ENTRY" --targets node20-linux-x64 --output "output/${safeTitle}"

      - name: Upload Binary Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${safeTitle}-linux-binary
          path: output/
`;

    return await runGitHubCloudWorkflow({
      project,
      packagerId: 'cloud-node-binary',
      packagerName: 'Node.js 独立可执行二进制包',
      token: token.trim(),
      workflowFileName,
      workflowContent,
      artifactExpectedName: `${safeTitle}-linux-binary.zip`,
      customRepoName,
      branch,
      onProgress,
      onUpdateGitConfig
    });
  }
};
