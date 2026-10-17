import { PackagerDefinition } from '../types';
import { runGitHubCloudWorkflow } from '../../services/githubCloudBuildRunner';

/**
 * Python 独立二进制可执行包云打包器 (PyInstaller)
 * 在云端 Ubuntu 环境将 Python 脚本与依赖打包为无需 Python 环境的单一可执行文件
 */
export const cloudPythonPyInstallerPackager: PackagerDefinition = {
  id: 'cloud-python-pyinstaller',
  name: 'Python 独立可执行二进制包 (PyInstaller)',
  description: '在云端将 Python 代码及第三方库编译为单一免安装二进制可执行文件，可在目标系统上直接执行',
  category: 'cloud',
  supportedLanguages: ['python'],
  artifactExtension: '.bin',
  icon: 'Terminal',
  fields: [
    {
      key: 'entryFile',
      label: '主入口文件',
      type: 'text',
      defaultValue: 'main.py',
      placeholder: '输入主入口文件名',
      helpText: '指定 PyInstaller 编译的主程序脚本'
    },
    {
      key: 'appName',
      label: '生成二进制名称',
      type: 'text',
      defaultValue: '',
      placeholder: '输入输出文件名',
      helpText: '输出可执行文件的文件名'
    },
    {
      key: 'oneFile',
      label: '打包为单文件 (Onefile)',
      type: 'boolean',
      defaultValue: true,
      helpText: '将所有解释器与依赖封包在单一可执行文件中'
    },
    {
      key: 'extraPip',
      label: '附加 Pip 依赖包 (空格分隔)',
      type: 'text',
      defaultValue: '',
      placeholder: '输入额外依赖项，空格分隔',
      helpText: '需要云端 Runner 额外安装的 Python 第三方库'
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

    // 确定入口文件
    const detectedEntry =
      project.files.find((f) => f.isEntry && f.name.endsWith('.py'))?.name ||
      project.files.find((f) => f.name === 'main.py' || f.name === 'app.py')?.name ||
      project.files.find((f) => f.name.endsWith('.py'))?.name ||
      'main.py';

    const entryFile = options.entryFile?.trim() || options.extraConfig?.entryFile?.trim() || detectedEntry;
    const safeTitle = (options.appName?.trim() || options.extraConfig?.appName?.trim() || project.title || 'app')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const isOneFile = options.extraConfig?.oneFile !== false;
    const extraPip = options.extraConfig?.extraPip?.trim() || '';

    // 生成自动化工作流配置
    const workflowFileName = 'build-python-pyinstaller.yml';
    const workflowContent = `name: Build Python Executable Binary
on:
  workflow_dispatch:
    inputs:
      appName:
        description: 'Output Binary Name'
        required: false
        default: '${safeTitle}'
      entryFile:
        description: 'Main Entry File'
        required: false
        default: '${entryFile}'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install PyInstaller and Dependencies
        run: |
          python -m pip install --upgrade pip setuptools wheel
          pip install pyinstaller
          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
          ${extraPip ? `pip install ${extraPip}` : ''}

      - name: Compile Standalone Executable
        run: |
          ENTRY_TARGET="${entryFile}"
          if [ ! -f "$ENTRY_TARGET" ]; then
            # 若指定入口不存在，自动寻找第一个 .py 文件
            FIRST_PY=$(find . -maxdepth 2 -name "*.py" | head -n 1)
            if [ -n "$FIRST_PY" ]; then
              ENTRY_TARGET="$FIRST_PY"
            else
              echo "Error: Python entry file not found!"
              exit 1
            fi
          fi
          echo "Building executable with PyInstaller from: $ENTRY_TARGET"
          pyinstaller --clean --noconfirm ${isOneFile ? '--onefile' : '--onedir'} --name "${safeTitle}" "$ENTRY_TARGET"

      - name: Verify and Archive Artifacts
        run: |
          ls -la dist/
          chmod +x dist/${safeTitle}* 2>/dev/null || true

      - name: Upload Binary Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${safeTitle}-linux-x86_64
          path: dist/
`;

    return await runGitHubCloudWorkflow({
      project,
      packagerId: 'cloud-python-pyinstaller',
      packagerName: 'Python 独立可执行二进制包 (PyInstaller)',
      token: token.trim(),
      workflowFileName,
      workflowContent,
      workflowInputs: {
        appName: safeTitle,
        entryFile
      },
      artifactExpectedName: `${safeTitle}-linux-x86_64.zip`,
      customRepoName,
      branch,
      onProgress,
      onUpdateGitConfig
    });
  }
};
