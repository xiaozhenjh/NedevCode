import { PackagerDefinition } from '../types';
import { runGitHubCloudWorkflow } from '../../services/githubCloudBuildRunner';

/**
 * Android 原生 APK 云打包器 (Capacitor + Android SDK + Gradle)
 * 严格针对前端 Web 项目 (HTML/JS/TS/CSS)，绝不向 Python 或后端脚本提供
 */
export const cloudWebAndroidApkPackager: PackagerDefinition = {
  id: 'cloud-web-android-apk',
  name: 'Android 原生 APK (Capacitor)',
  description: '在云端通过 Java 17、Capacitor CLI 与 Gradle 编译打包移动端 Android 原生 APK 安装包',
  category: 'cloud',
  supportedLanguages: ['html', 'javascript', 'typescript', 'css'],
  artifactExtension: '.apk',
  icon: 'Smartphone',
  fields: [
    {
      key: 'packageName',
      label: 'Android 包名 (Package ID)',
      type: 'text',
      defaultValue: '',
      placeholder: '输入应用包名',
      helpText: '唯一标识 Android 应用的 ID 命名'
    },
    {
      key: 'appName',
      label: '应用显示名称',
      type: 'text',
      defaultValue: '',
      placeholder: '输入应用显示名称',
      helpText: '在手机桌面上显示的应用名称'
    }
  ],
  isAvailableForProject: (project) => {
    // 严格限制：只对 Web 前端语言生效，排他性校验
    const webLangs = new Set(['html', 'javascript', 'typescript', 'css']);
    if (webLangs.has(project.language)) return true;
    return project.files.some(
      (f) => f.name.endsWith('.html') || (f.name.endsWith('.js') && !f.name.endsWith('.py'))
    );
  },
  package: async (project, options, onProgress) => {
    const { token, branch = 'main', onUpdateGitConfig, customRepoName } = options;

    if (!token || !token.trim()) {
      throw new Error('云端打包需要提供具有 workflow 权限的 GitHub Access Token');
    }

    const safeTitle = (project.title || 'app').replace(/[^a-zA-Z0-9]/g, '');
    const appName = options.appName?.trim() || options.extraConfig?.appName?.trim() || project.title || 'App';
    const pkgName = options.extraConfig?.packageName?.trim() || `com.code.${safeTitle.toLowerCase() || 'app'}`;

    const workflowFileName = 'build-android-apk.yml';
    const workflowContent = `name: Build Android APK
on:
  workflow_dispatch:

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Prepare Web Assets
        run: |
          mkdir -p dist
          cp -r * dist/ 2>/dev/null || true
          rm -rf dist/.git dist/node_modules dist/.github

      - name: Initialize Capacitor Android Project
        run: |
          npm install -g @capacitor/cli @capacitor/core @capacitor/android
          npx cap init "${appName}" "${pkgName}" --web-dir dist || true
          npx cap add android || true
          npx cap sync android || true

      - name: Build Android Debug APK
        run: |
          cd android
          chmod +x gradlew
          ./gradlew assembleDebug

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${safeTitle}-debug-apk
          path: android/app/build/outputs/apk/debug/*.apk
`;

    return await runGitHubCloudWorkflow({
      project,
      packagerId: 'cloud-web-android-apk',
      packagerName: 'Android 原生 APK (Capacitor)',
      token: token.trim(),
      workflowFileName,
      workflowContent,
      artifactExpectedName: `${safeTitle}-debug-apk.zip`,
      customRepoName,
      branch,
      onProgress,
      onUpdateGitConfig
    });
  }
};
