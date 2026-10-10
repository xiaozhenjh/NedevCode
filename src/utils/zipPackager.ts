import JSZip from 'jszip';
import { CodeProject } from '../types';

function addFileToZip(zip: JSZip, path: string, content: string) {
  if (content && content.startsWith('data:') && content.includes(';base64,')) {
    const base64Data = content.split(';base64,')[1];
    zip.file(path, base64Data, { base64: true });
  } else {
    zip.file(path, content);
  }
}

export async function exportProjectToZip(project: CodeProject): Promise<void> {
  const zip = new JSZip();

  // Add all folders if any
  if (project.folders && Array.isArray(project.folders)) {
    for (const folder of project.folders) {
      if (folder && folder.trim()) {
        zip.folder(folder.trim());
      }
    }
  }

  // Add all files
  for (const file of project.files) {
    addFileToZip(zip, file.name, file.content);
  }

  // Generate zip file
  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'project'}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importProjectFromZip(file: File): Promise<{
  files: { name: string; content: string; language: import('../types').CodeLanguage }[];
  folders: string[];
}> {
  const zip = await JSZip.loadAsync(file);
  const files: { name: string; content: string; language: import('../types').CodeLanguage }[] = [];
  const foldersSet = new Set<string>();

  const entries = Object.keys(zip.files);

  // Detect root folder prefix if all entries share a single root folder (e.g., repo-main/)
  let rootPrefix = '';
  const firstLevelDirs = new Set<string>();
  entries.forEach((path) => {
    const parts = path.split('/');
    if (parts.length > 1) {
      firstLevelDirs.add(parts[0]);
    }
  });
  if (firstLevelDirs.size === 1) {
    const singleDir = Array.from(firstLevelDirs)[0];
    if (entries.every((p) => p.startsWith(singleDir + '/'))) {
      rootPrefix = singleDir + '/';
    }
  }

  for (const rawPath of entries) {
    const zipEntry = zip.files[rawPath];
    let cleanPath = rawPath;
    if (rootPrefix && cleanPath.startsWith(rootPrefix)) {
      cleanPath = cleanPath.slice(rootPrefix.length);
    }
    if (!cleanPath) continue;

    if (zipEntry.dir) {
      foldersSet.add(cleanPath.replace(/\/$/, ''));
      continue;
    }

    // Ignore OS/system metadata files
    if (cleanPath.includes('__MACOSX') || cleanPath.split('/').some((p) => p.startsWith('.'))) {
      continue;
    }

    let content = '';
    const ext = cleanPath.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'bmp'].includes(ext);

    if (isImage) {
      const base64 = await zipEntry.async('base64');
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      content = `data:${mime};base64,${base64}`;
    } else {
      content = await zipEntry.async('text');
    }

    const { detectLanguage } = await import('./fileUtils');
    const language = detectLanguage(cleanPath);

    files.push({
      name: cleanPath,
      content,
      language
    });
  }

  return {
    files,
    folders: Array.from(foldersSet)
  };
}

export async function exportFolderToZip(project: CodeProject, folderPath: string): Promise<void> {
  const cleanFolder = folderPath.trim().replace(/^\/+|\/+$/g, '');
  if (!cleanFolder) return;

  const zip = new JSZip();
  const folderName = cleanFolder.split('/').pop() || cleanFolder;

  const targetFiles = (project.files || []).filter(
    (f) => f.name === cleanFolder || f.name.startsWith(cleanFolder + '/')
  );

  if (targetFiles.length === 0) {
    zip.folder(folderName);
  } else {
    for (const file of targetFiles) {
      const relativePath = file.name.slice(cleanFolder.length + 1) || file.name.split('/').pop() || file.name;
      addFileToZip(zip, `${folderName}/${relativePath}`, file.content);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${folderName.replace(/[\s/\\?%*:|"<>]/g, '_') || 'folder'}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
