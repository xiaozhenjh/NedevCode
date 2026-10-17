import { PackagerDefinition } from '../types';
import { runGitHubCloudWorkflow } from '../../services/githubCloudBuildRunner';

/**
 * Python 生产 Wheel & 源码包云打包器
 */
export const cloudPythonWheelPackager: PackagerDefinition = {
  id: 'cloud-python-wheel',
  name: 'Python 生产 Wheel & 源码分发包',
  description: '在云端通过标准 build 模块打包 PEP 517 生产级 Wheel (.whl) 二进制分发包与 tar.gz 源码包',
  category: 'cloud',
  supportedLanguages: ['python'],
  artifactExtension: '.whl',
  icon: 'Box',
  fields: [
    {
      key: 'version',
      label: '模块版本号',
      type: 'text',
      defaultValue: '0.1.0',
      placeholder: '输入版本号',
      helpText: 'Python 包的版本号 (PEP 440)'
    }
  ],
  isAvailableForProject: (project) => {
    return (
      project.language === 'python' ||
      project.files.some((f) => f.name.toLowerCase().endsWith('.py') || f.language === 'python')
    );
  },
  package: async (project, options, onProgress) => {
    const { token, branch = 'main', onUpdateGitConfig, customRepoName } = options;

    if (!token || !token.trim()) {
      throw new Error('云端打包需要提供具有 workflow 权限的 GitHub Access Token');
    }

    const safeTitle = (project.title || 'package').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const version = options.version?.trim() || options.extraConfig?.version?.trim() || '0.1.0';

    const workflowFileName = 'build-python-wheel.yml';
    const workflowContent = `name: Build Python Wheel Distribution
on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install PEP 517 Build Tools
        run: |
          python -m pip install --upgrade pip build wheel setuptools

      - name: Ensure Package Config
        run: |
          if [ ! -f "pyproject.toml" ] && [ ! -f "setup.py" ]; then
            echo "Generating minimal pyproject.toml..."
            cat << 'EOF' > pyproject.toml
[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "${safeTitle}"
version = "${version}"
description = "Packaged Python Module"
readme = "README.md"
requires-python = ">=3.8"
EOF
          fi
          if [ ! -f "README.md" ]; then
            echo "# ${safeTitle}" > README.md
          fi

      - name: Build Wheel and Source Distribution
        run: |
          python -m build

      - name: Verify Dist Files
        run: |
          ls -la dist/

      - name: Upload Wheel Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${safeTitle}-wheel-dist
          path: dist/
`;

    return await runGitHubCloudWorkflow({
      project,
      packagerId: 'cloud-python-wheel',
      packagerName: 'Python 生产 Wheel & 源码分发包',
      token: token.trim(),
      workflowFileName,
      workflowContent,
      artifactExpectedName: `${safeTitle}-wheel-dist.zip`,
      customRepoName,
      branch,
      onProgress,
      onUpdateGitConfig
    });
  }
};
