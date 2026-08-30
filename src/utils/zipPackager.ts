import JSZip from 'jszip';
import { CodeProject } from '../types';

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
    zip.file(file.name, file.content);
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
