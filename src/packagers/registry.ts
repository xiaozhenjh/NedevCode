import { CodeProject } from '../types';
import { PackagerDefinition, PackagerOptions, PackagerResult, PackagingProgress } from './types';
import { zipPackager } from './definitions/zip';
import { htmlPackager } from './definitions/html';
import { webDistPackager } from './definitions/webDist';
import { pythonZipappPackager, pythonSdistPackager } from './definitions/python';
import { nodePackager } from './definitions/node';
import { markdownPackager } from './definitions/markdown';
import { shellPackager } from './definitions/shell';
import { sqlPackager } from './definitions/sql';

// 导入插件化云打包器
import { cloudPythonPyInstallerPackager } from './definitions/cloudPythonPyInstaller';
import { cloudPythonWheelPackager } from './definitions/cloudPythonWheel';
import { cloudPythonDockerPackager } from './definitions/cloudPythonDocker';
import { cloudWebAndroidApkPackager } from './definitions/cloudWebAndroidApk';
import { cloudWebDesktopPackager } from './definitions/cloudWebDesktop';
import { cloudNodeBinaryPackager } from './definitions/cloudNodeBinary';
import { cloudUniversalReleasePackager } from './definitions/cloudUniversalRelease';

export class PackagerRegistry {
  private packagers: Map<string, PackagerDefinition> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults() {
    // 1. 注册本地通用与多语言打包器
    this.register(zipPackager);
    this.register(htmlPackager);
    this.register(webDistPackager);
    this.register(pythonZipappPackager);
    this.register(pythonSdistPackager);
    this.register(nodePackager);
    this.register(markdownPackager);
    this.register(shellPackager);
    this.register(sqlPackager);

    // 2. 注册插件化云打包器 (针对特定语言严谨路由)
    this.register(cloudPythonPyInstallerPackager);
    this.register(cloudPythonWheelPackager);
    this.register(cloudPythonDockerPackager);
    this.register(cloudWebAndroidApkPackager);
    this.register(cloudWebDesktopPackager);
    this.register(cloudNodeBinaryPackager);
    this.register(cloudUniversalReleasePackager);
  }

  /**
   * 动态注册新的打包器插件
   */
  public register(packager: PackagerDefinition): void {
    this.packagers.set(packager.id, packager);
  }

  /**
   * 获取指定 ID 的打包器
   */
  public get(id: string): PackagerDefinition | undefined {
    return this.packagers.get(id);
  }

  /**
   * 获取所有已注册打包器
   */
  public getAll(): PackagerDefinition[] {
    return Array.from(this.packagers.values());
  }

  /**
   * 根据当前项目的语言、文件类型及配置动态获取适用的打包器列表
   */
  public getPackagersForProject(
    project: CodeProject,
    category?: 'local' | 'cloud'
  ): PackagerDefinition[] {
    const list = Array.from(this.packagers.values()).filter((p) => {
      if (category && p.category !== category) return false;
      return p.isAvailableForProject(project);
    });

    // 排序优先级：特定语言专属打包器排在前面，通用打包器随后
    return list.sort((a, b) => {
      const aIsSpecific = a.supportedLanguages !== 'all';
      const bIsSpecific = b.supportedLanguages !== 'all';
      if (aIsSpecific && !bIsSpecific) return -1;
      if (!aIsSpecific && bIsSpecific) return 1;
      return 0;
    });
  }

  /**
   * 统一执行打包调度
   */
  public async execute(
    packagerId: string,
    project: CodeProject,
    options: PackagerOptions = {},
    onProgress?: (progress: PackagingProgress) => void
  ): Promise<PackagerResult> {
    const packager = this.packagers.get(packagerId);
    if (!packager) {
      throw new Error(`未找到 ID 为 [${packagerId}] 的打包器`);
    }

    return await packager.package(project, options, onProgress);
  }
}

export const packagerRegistry = new PackagerRegistry();
