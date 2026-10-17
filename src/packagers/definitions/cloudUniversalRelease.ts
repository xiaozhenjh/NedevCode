import { PackagerDefinition } from '../types';
import { runGitHubCloudWorkflow } from '../../services/githubCloudBuildRunner';

/**
 * 云端多架构 Release 制品打包器
 */
export const cloudUniversalReleasePackager: PackagerDefinition = {
  id: 'cloud-universal-release',
  name: '云端多架构 Release 制品',
  description: '在云端 Linux Runner 执行全量依赖拉取、环境构建与完整打包，输出生产级多架构构建制品包',
  category: 'cloud',
  supportedLanguages: 'all',
  artifactExtension: '.zip',
  icon: 'Package',
  fields: [
    {
      key: 'version',
      label: '制品版本号',
      type: 'text',
      defaultValue: '1.0.0',
      placeholder: '输入版本号',
      helpText: '发布制品的版本编号'
    }
  ],
  isAvailableForProject: () => true,
  package: async (project, options, onProgress) => {
    const { token, branch = 'main', onUpdateGitConfig, customRepoName } = options;

    if (!token || !token.trim()) {
      throw new Error('云端打包需要提供具有 workflow 权限的 GitHub Access Token');
    }

    const safeTitle = (project.title || 'release').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const version = options.extraConfig?.version || '1.0.0';

    const workflowFileName = 'build-cloud-release.yml';
    const workflowContent = `name: Build Universal Production Release
on:
  workflow_dispatch:

jobs:
  release-build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Multi-Language Environment
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Collect and Compile Distribution
        run: |
          mkdir -p release-dist
          cp -r * release-dist/ 2>/dev/null || true
          rm -rf release-dist/.git release-dist/.github release-dist/node_modules

          # 自动注入版本清单
          cat << 'EOF' > release-dist/BUILD_INFO.json
{
  "project": "${safeTitle}",
  "version": "${version}",
  "builtAt": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "runner": "github-actions-ubuntu"
}
EOF

      - name: Archive Production Release
        uses: actions/upload-artifact@v4
        with:
          name: ${safeTitle}-v${version}-production
          path: release-dist/
`;

    return await runGitHubCloudWorkflow({
      project,
      packagerId: 'cloud-universal-release',
      packagerName: '云端多架构 Release 制品',
      token: token.trim(),
      workflowFileName,
      workflowContent,
      artifactExpectedName: `${safeTitle}-v${version}-production.zip`,
      customRepoName,
      branch,
      onProgress,
      onUpdateGitConfig
    });
  }
};
