import * as prettier from 'prettier/standalone';
import parserBabel from 'prettier/plugins/babel';
import parserEstree from 'prettier/plugins/estree';
import parserHtml from 'prettier/plugins/html';
import parserPostcss from 'prettier/plugins/postcss';
import parserTypescript from 'prettier/plugins/typescript';
import parserMarkdown from 'prettier/plugins/markdown';
import parserYaml from 'prettier/plugins/yaml';

/**
 * Modern Prettier + Smart Language AST Auto-Indent & Formatter Engine
 */

export interface IndentResult {
  newContent: string;
  newCursorStart: number;
  newCursorEnd: number;
  handled: boolean;
}

/**
 * Format complete code string using Prettier or advanced language-specific rules
 */
export async function formatCodeAsync(
  code: string,
  language: string,
  tabSize: number = 2,
  useTabs: boolean = false
): Promise<string> {
  if (!code) return '';

  const normalizedLang = (language || 'javascript').toLowerCase();

  // 1. Try Prettier Standalone for supported Web & Data languages
  try {
    let parserName: string | null = null;
    let plugins: any[] = [];

    if (normalizedLang === 'json') {
      try {
        const parsed = JSON.parse(code);
        return JSON.stringify(parsed, null, tabSize);
      } catch {
        parserName = 'json';
        plugins = [parserBabel, parserEstree];
      }
    } else if (['javascript', 'js', 'jsx'].includes(normalizedLang)) {
      parserName = 'babel';
      plugins = [parserBabel, parserEstree];
    } else if (['typescript', 'ts', 'tsx'].includes(normalizedLang)) {
      parserName = 'typescript';
      plugins = [parserTypescript, parserBabel, parserEstree];
    } else if (['html', 'vue', 'xml', 'svg'].includes(normalizedLang)) {
      parserName = 'html';
      plugins = [parserHtml];
    } else if (['css', 'scss', 'less'].includes(normalizedLang)) {
      parserName = 'css';
      plugins = [parserPostcss];
    } else if (['markdown', 'md'].includes(normalizedLang)) {
      parserName = 'markdown';
      plugins = [parserMarkdown];
    } else if (['yaml', 'yml'].includes(normalizedLang)) {
      parserName = 'yaml';
      plugins = [parserYaml];
    }

    if (parserName && plugins.length > 0) {
      const formatted = await prettier.format(code, {
        parser: parserName,
        plugins,
        tabWidth: tabSize,
        useTabs: useTabs,
        semi: true,
        singleQuote: true,
        trailingComma: 'none',
        bracketSpacing: true,
        printWidth: 100
      });
      return formatted.trimEnd();
    }
  } catch (err) {
    console.warn('Prettier formatting fallback to custom auto-indenter:', err);
  }

  // 2. Language-Specific Smart Auto-Indenter Fallback (Python, C, C++, Java, Go, Rust, SQL, Shell, etc.)
  return customSmartFormat(code, normalizedLang, tabSize, useTabs);
}

/**
 * Language-aware smart re-indenter
 */
export function customSmartFormat(
  code: string,
  language: string,
  tabSize: number = 2,
  useTabs: boolean = false
): string {
  const indentStr = useTabs ? '\t' : ' '.repeat(tabSize);
  const lines = code.split('\n');
  const result: string[] = [];

  let currentIndent = 0;
  const isPython = ['python', 'py'].includes(language);
  const isSql = ['sql', 'mysql', 'postgresql'].includes(language);
  const isShell = ['bash', 'sh', 'shell', 'zsh'].includes(language);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      result.push('');
      continue;
    }

    if (isPython) {
      // Python PEP-8 Indentation Logic
      const isDedentKeyword = /^(elif|else|except|finally)\b/.test(trimmed);
      if (isDedentKeyword) {
        currentIndent = Math.max(0, currentIndent - 1);
      }

      result.push(indentStr.repeat(currentIndent) + trimmed);

      // Increase indent if line ends with ':'
      if (trimmed.endsWith(':') && !trimmed.startsWith('#')) {
        currentIndent++;
      } else if (/^(return|pass|break|continue|raise)\b/.test(trimmed)) {
        // Dedent after terminal statement in a block if next line isn't indented
        if (i < lines.length - 1) {
          const nextTrimmed = lines[i + 1].trim();
          if (nextTrimmed && !/^(elif|else|except|finally)\b/.test(nextTrimmed) && !nextTrimmed.startsWith('#')) {
            currentIndent = Math.max(0, currentIndent - 1);
          }
        }
      }
    } else if (isSql) {
      // SQL Indentation
      const isClosingSql = /^(end|where|having|order by|group by|limit)\b/i.test(trimmed);
      if (isClosingSql) {
        currentIndent = Math.max(0, currentIndent - 1);
      }

      result.push(indentStr.repeat(currentIndent) + trimmed);

      if (/^(begin|select|from|where|group by|order by|having|case|when|create|insert|update)\b/i.test(trimmed)) {
        currentIndent++;
      }
    } else if (isShell) {
      // Shell / Bash Indentation
      if (/^(fi|done|esac|\})\b/.test(trimmed)) {
        currentIndent = Math.max(0, currentIndent - 1);
      }

      result.push(indentStr.repeat(currentIndent) + trimmed);

      if (/(then|do|case|\{|\()\s*$/.test(trimmed) || /^if\b/.test(trimmed)) {
        currentIndent++;
      }
    } else {
      // Standard C-like / Algol-like Block Indentation (JS, TS, C, C++, Java, Rust, Go, PHP)
      const closingBracketsCount = (trimmed.match(/^(\}|\]|\)|<\/)/g) || []).length;
      if (closingBracketsCount > 0 || /^(else|catch|finally)\b/.test(trimmed)) {
        currentIndent = Math.max(0, currentIndent - 1);
      }

      result.push(indentStr.repeat(currentIndent) + trimmed);

      // Check opening brackets / blocks
      const lastChar = trimmed.slice(-1);
      const isOpening =
        lastChar === '{' ||
        lastChar === '[' ||
        lastChar === '(' ||
        (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>') && !trimmed.includes('</'));

      if (isOpening) {
        currentIndent++;
      }
    }
  }

  return result.join('\n');
}

/**
 * Handles Enter Key for Smart Newline Auto-Indentation & Bracket Expand
 */
export function handleEnterAutoIndent(
  content: string,
  cursorStart: number,
  cursorEnd: number,
  language: string,
  tabSize: number = 2,
  useTabs: boolean = false
): IndentResult {
  const indentStr = useTabs ? '\t' : ' '.repeat(tabSize);

  // Find current line before cursor
  const lineStart = content.lastIndexOf('\n', cursorStart - 1) + 1;
  const lineEnd = content.indexOf('\n', cursorStart);
  const lineUntilCursor = content.substring(lineStart, cursorStart);
  const lineAfterCursor = content.substring(cursorStart, lineEnd === -1 ? content.length : lineEnd);

  // Extract indentation of current line
  const matchIndent = lineUntilCursor.match(/^[\t ]*/);
  let currentIndent = matchIndent ? matchIndent[0] : '';

  const charBefore = lineUntilCursor.trimEnd().slice(-1);
  const charAfter = lineAfterCursor.trimStart().slice(0, 1);

  const isBetweenBrackets =
    (charBefore === '{' && charAfter === '}') ||
    (charBefore === '[' && charAfter === ']') ||
    (charBefore === '(' && charAfter === ')');

  const isPython = ['python', 'py'].includes(language.toLowerCase());

  // Determine if previous line needs extra indentation
  let needsExtraIndent = false;
  if (isBetweenBrackets) {
    needsExtraIndent = true;
  } else if (isPython) {
    if (lineUntilCursor.trimEnd().endsWith(':')) {
      needsExtraIndent = true;
    }
  } else {
    const trimmedBefore = lineUntilCursor.trimEnd();
    if (
      trimmedBefore.endsWith('{') ||
      trimmedBefore.endsWith('[') ||
      trimmedBefore.endsWith('(') ||
      trimmedBefore.endsWith(':') ||
      trimmedBefore.endsWith('=>') ||
      /^(if|else|for|while|function|def|class|try|catch|finally)\b/.test(trimmedBefore.trim())
    ) {
      needsExtraIndent = true;
    }
  }

  let insertedText = '';
  let newCursorPos = cursorStart;

  if (isBetweenBrackets) {
    // Expand brackets into 3 lines:
    // {
    //   <cursor>
    // }
    const nextIndent = currentIndent + indentStr;
    insertedText = `\n${nextIndent}\n${currentIndent}`;
    newCursorPos = cursorStart + 1 + nextIndent.length;
  } else {
    const nextIndent = currentIndent + (needsExtraIndent ? indentStr : '');
    insertedText = `\n${nextIndent}`;
    newCursorPos = cursorStart + insertedText.length;
  }

  const newContent = content.substring(0, cursorStart) + insertedText + content.substring(cursorEnd);

  return {
    newContent,
    newCursorStart: newCursorPos,
    newCursorEnd: newCursorPos,
    handled: true
  };
}

/**
 * Handles Tab and Shift+Tab key presses for Block Indentation
 */
export function handleTabAutoIndent(
  content: string,
  cursorStart: number,
  cursorEnd: number,
  outdent: boolean = false,
  tabSize: number = 2,
  useTabs: boolean = false
): IndentResult {
  const indentStr = useTabs ? '\t' : ' '.repeat(tabSize);

  // Single cursor without selection range (and not outdenting)
  if (cursorStart === cursorEnd && !outdent) {
    const newContent = content.substring(0, cursorStart) + indentStr + content.substring(cursorEnd);
    return {
      newContent,
      newCursorStart: cursorStart + indentStr.length,
      newCursorEnd: cursorStart + indentStr.length,
      handled: true
    };
  }

  // Multi-line or single-line range selection (or Outdent)
  const lineStart = content.lastIndexOf('\n', cursorStart - 1) + 1;
  const lineEnd = content.indexOf('\n', cursorEnd);
  const actualLineEnd = lineEnd === -1 ? content.length : lineEnd;

  const selectedText = content.substring(lineStart, actualLineEnd);
  const lines = selectedText.split('\n');

  let deltaLength = 0;
  const newLines = lines.map((line) => {
    if (outdent) {
      if (line.startsWith('\t')) {
        deltaLength--;
        return line.substring(1);
      }
      if (line.startsWith(indentStr)) {
        deltaLength -= indentStr.length;
        return line.substring(indentStr.length);
      }
      // Remove any leading spaces up to tabSize
      const match = line.match(/^ {1,4}/);
      if (match) {
        deltaLength -= match[0].length;
        return line.substring(match[0].length);
      }
      return line;
    } else {
      deltaLength += indentStr.length;
      return indentStr + line;
    }
  });

  const newSelectedText = newLines.join('\n');
  const newContent = content.substring(0, lineStart) + newSelectedText + content.substring(actualLineEnd);

  const newCursorStart = Math.max(lineStart, cursorStart + (outdent ? (lines[0].startsWith(indentStr) ? -indentStr.length : 0) : indentStr.length));
  const newCursorEnd = Math.max(newCursorStart, cursorEnd + deltaLength);

  return {
    newContent,
    newCursorStart,
    newCursorEnd,
    handled: true
  };
}

/**
 * Handles Backspace key at indentation to delete tab-width spaces at once
 */
export function handleBackspaceAutoIndent(
  content: string,
  cursorStart: number,
  cursorEnd: number,
  tabSize: number = 2
): IndentResult {
  if (cursorStart !== cursorEnd || cursorStart === 0) {
    return { newContent: content, newCursorStart: cursorStart, newCursorEnd: cursorEnd, handled: false };
  }

  const lineStart = content.lastIndexOf('\n', cursorStart - 1) + 1;
  const beforeCursor = content.substring(lineStart, cursorStart);

  // Check if everything before cursor on this line is spaces
  if (/^ +$/.test(beforeCursor)) {
    const spacesToDelete = beforeCursor.length % tabSize === 0 ? tabSize : beforeCursor.length % tabSize;
    const newContent = content.substring(0, cursorStart - spacesToDelete) + content.substring(cursorStart);
    const newPos = cursorStart - spacesToDelete;
    return {
      newContent,
      newCursorStart: newPos,
      newCursorEnd: newPos,
      handled: true
    };
  }

  return { newContent: content, newCursorStart: cursorStart, newCursorEnd: cursorEnd, handled: false };
}
