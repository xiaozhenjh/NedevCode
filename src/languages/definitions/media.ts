import { LanguageDefinition } from '../types';

export const imageDefinition: LanguageDefinition = {
  id: 'image',
  name: 'Image',
  extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif', '.svg'],
  runnable: false,
  unsupportedReason: (file) => `图片文件 ("${file.name}") 不支持作为代码入口直接运行，可在页面中引用。`,
  tokenize: () => []
};

export const videoDefinition: LanguageDefinition = {
  id: 'video',
  name: 'Video',
  extensions: ['.mp4', '.webm', '.ogg', '.mov', '.mkv', '.avi'],
  runnable: false,
  unsupportedReason: (file) => `视频文件 ("${file.name}") 不支持作为代码入口直接运行，可在页面中引用。`,
  tokenize: () => []
};
