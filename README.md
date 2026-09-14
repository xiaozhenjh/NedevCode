# 代码空间 (CodeSpace)

轻量级移动端代码查看、编辑与运行应用。

## 功能特性

- **代码编辑**：支持多种编程语言的语法高亮。
- **本地运行**：内置代码运行沙盒，支持 HTML/JS 预览。
- **项目管理**：支持创建、重命名、移动和删除本地项目。
- **Git 集成**：支持从 GitHub 克隆项目以及将更改推送到远程仓库。
- **跨平台支持**：
  - **Web 端**：直接在浏览器中使用。
  - **单文件版**：可导出的独立 HTML 文件，包含完整应用逻辑。
  - **Android 端**：原生 APK 支持，提供更佳的移动端体验。

## 自动化构建与发布

本仓库已配置 GitHub Actions，每当有代码推送到 `main` 分支时，会自动执行以下操作：

1.  **构建单文件版**：生成 `codespace-single.html`。
2.  **构建 Android 版**：生成 `codespace.apk`。
3.  **自动发布**：在 GitHub Releases 页面创建新版本并上传上述附件。

## 开发与构建

### 环境要求

- Node.js 20+
- npm (或 bun)

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建项目

- **标准构建** (输出到 `dist/`):
  ```bash
  npm run build
  ```
- **单文件构建** (输出 `dist/index.html`):
  ```bash
  npm run build:single
  ```

### Android 开发

1.  确保已安装 Android Studio 和 SDK。
2.  同步 Capacitor 状态：
    ```bash
    npx cap sync
    ```
3.  在 Android Studio 中打开并运行：
    ```bash
    npx cap open android
    ```

## 许可证

MIT
