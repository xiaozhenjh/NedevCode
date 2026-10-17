import { PackagerDefinition } from '../types';
import { runGitHubCloudWorkflow } from '../../services/githubCloudBuildRunner';

/**
 * Python Docker 容器镜像归档云打包器
 */
export const cloudPythonDockerPackager: PackagerDefinition = {
  id: 'cloud-python-docker',
  name: 'Python Docker 容器镜像归档',
  description: '在云端构建隔离容器环境并导出生产 Docker 镜像归档 (.tar.gz)，可直接在服务器导入部署',
  category: 'cloud',
  supportedLanguages: ['python'],
  artifactExtension: '.tar.gz',
  icon: 'Box',
  fields: [
    {
      key: 'baseImage',
      label: '基础镜像',
      type: 'text',
      defaultValue: 'python:3.11-slim',
      placeholder: 'python:3.11-slim',
      helpText: 'Docker 基础运行环境镜像'
    },
    {
      key: 'port',
      label: '暴露端口',
      type: 'number',
      defaultValue: 8000,
      placeholder: '8000',
      helpText: '容器对外服务监听端口'
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

    const safeTitle = (project.title || 'app').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const baseImage = options.extraConfig?.baseImage || 'python:3.11-slim';
    const port = options.extraConfig?.port || 8000;

    const detectedEntry =
      project.files.find((f) => f.isEntry && f.name.endsWith('.py'))?.name ||
      project.files.find((f) => f.name === 'main.py' || f.name === 'app.py')?.name ||
      'main.py';

    const workflowFileName = 'build-python-docker.yml';
    const workflowContent = `name: Build Python Docker Image
on:
  workflow_dispatch:

jobs:
  docker-build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Ensure Dockerfile
        run: |
          if [ ! -f "Dockerfile" ]; then
            cat << 'EOF' > Dockerfile
FROM ${baseImage}
WORKDIR /app
COPY . .
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi
EXPOSE ${port}
CMD ["python", "${detectedEntry}"]
EOF
          fi

      - name: Build Docker Image
        run: |
          docker build -t ${safeTitle}:latest .

      - name: Export Docker Image Tarball
        run: |
          mkdir -p output
          docker save ${safeTitle}:latest | gzip > output/${safeTitle}-docker-image.tar.gz

      - name: Upload Docker Image Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${safeTitle}-docker-image
          path: output/${safeTitle}-docker-image.tar.gz
`;

    return await runGitHubCloudWorkflow({
      project,
      packagerId: 'cloud-python-docker',
      packagerName: 'Python Docker 容器镜像归档',
      token: token.trim(),
      workflowFileName,
      workflowContent,
      artifactExpectedName: `${safeTitle}-docker-image.zip`,
      customRepoName,
      branch,
      onProgress,
      onUpdateGitConfig
    });
  }
};
