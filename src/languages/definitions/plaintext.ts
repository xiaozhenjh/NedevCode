import { LanguageDefinition } from '../types';

export const plainTextDefinition: LanguageDefinition = {
  id: 'plaintext',
  name: 'Plain Text',
  extensions: ['.txt'],
  runnable: false,
  unsupportedReason: (file) => `暂不支持运行纯文本入口文件 ("${file.name}")。`,
  tokenize: (code: string) => [{ type: 'text', content: code }]
};
