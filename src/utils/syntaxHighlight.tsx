import React from 'react';
import { CodeLanguage } from '../types';

interface Token {
  type: 'keyword' | 'string' | 'number' | 'comment' | 'function' | 'tag' | 'attr' | 'operator' | 'punctuation' | 'text';
  content: string;
}

export function tokenizeCode(code: string, language: string): Token[] {
  if (!code) return [{ type: 'text', content: '' }];

  const tokens: Token[] = [];
  
  if (language === 'html') {
    const blockRegex = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)|(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;
    let lastIndex = 0;
    let match;
    
    while ((match = blockRegex.exec(code)) !== null) {
      if (match.index > lastIndex) {
        tokens.push(...tokenizeCode(code.substring(lastIndex, match.index), 'html_pure'));
      }
      
      if (match[1]) { // script block
        tokens.push(...tokenizeCode(match[1], 'html_pure'));
        if (match[2]) tokens.push(...tokenizeCode(match[2], 'javascript'));
        tokens.push(...tokenizeCode(match[3], 'html_pure'));
      } else if (match[4]) { // style block
        tokens.push(...tokenizeCode(match[4], 'html_pure'));
        if (match[5]) tokens.push(...tokenizeCode(match[5], 'css'));
        tokens.push(...tokenizeCode(match[6], 'html_pure'));
      }
      
      lastIndex = blockRegex.lastIndex;
    }
    
    if (lastIndex < code.length) {
      tokens.push(...tokenizeCode(code.substring(lastIndex), 'html_pure'));
    }
    return tokens;
  }
  
  if (language === 'html_pure') {
    const htmlRegex = /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z0-9\-]+)|(\s+[a-zA-Z\-]+(?==))|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([<>\/=])|([^<>\s="']+)|(\s+)/g;
    let match;
    while ((match = htmlRegex.exec(code)) !== null) {
      const [full, comment, tag, attr, str, punct, text] = match;
      if (comment) tokens.push({ type: 'comment', content: comment });
      else if (tag) tokens.push({ type: 'tag', content: tag });
      else if (attr) tokens.push({ type: 'attr', content: attr });
      else if (str) tokens.push({ type: 'string', content: str });
      else if (punct) tokens.push({ type: 'punctuation', content: punct });
      else if (text) tokens.push({ type: 'text', content: text });
      else tokens.push({ type: 'text', content: full });
    }
    return tokens;
  }

  if (language === 'css') {
    const cssRegex = /(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(@[a-zA-Z\-]+)|([a-zA-Z\-]+(?=\s*:))|(-?\d+(?:\.\d+)?(?:px|em|rem|vh|vw|%|s|ms)?)|([:;{}])|(\s+)|([^:;{}\s]+)/g;
    let match;
    while ((match = cssRegex.exec(code)) !== null) {
      const [full, comment, str, kw, prop, num, punct, space, text] = match;
      if (comment) tokens.push({ type: 'comment', content: comment });
      else if (str) tokens.push({ type: 'string', content: str });
      else if (kw) tokens.push({ type: 'keyword', content: kw });
      else if (prop) tokens.push({ type: 'attr', content: prop });
      else if (num) tokens.push({ type: 'number', content: full });
      else if (punct) tokens.push({ type: 'punctuation', content: punct });
      else if (space) tokens.push({ type: 'text', content: space });
      else tokens.push({ type: 'text', content: text });
    }
    return tokens;
  }

  if (language === 'json') {
    const jsonRegex = /("(?:[^"\\]|\\.)*"(?=\s*:))|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\],:])|(\s+)/g;
    let match;
    while ((match = jsonRegex.exec(code)) !== null) {
      const [full, key, str, num, bool, punct] = match;
      if (key) tokens.push({ type: 'attr', content: key });
      else if (str) tokens.push({ type: 'string', content: str });
      else if (num || bool) tokens.push({ type: 'number', content: full });
      else if (punct) tokens.push({ type: 'punctuation', content: punct });
      else tokens.push({ type: 'text', content: full });
    }
    return tokens;
  }

  if (language === 'python') {
    const pyRegex = /(#[^\n]*|'''[\s\S]*?'''|"""[\s\S]*?""")|([rfbRFB]?"(?:[^"\\]|\\.)*"|[rfbRFB]?'(?:[^'\\]|\\.)*')|(\b(?:def|class|if|elif|else|for|while|in|import|from|as|return|try|except|finally|with|lambda|pass|break|continue|yield|async|await|global|nonlocal|raise|is|not|and|or|assert|del)\b)|(\b(?:True|False|None)\b)|(\b(?:print|len|range|int|str|float|list|dict|set|tuple|enumerate|zip|sum|min|max|map|filter|input|type|isinstance|abs|round|open|super|self)\b)|(-?\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\())|([+\-*\/%=&|<>!~^]+)|([{}()\[\];:,.\`])|(\s+)|([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;
    while ((match = pyRegex.exec(code)) !== null) {
      const [full, comment, str, kw, boolVal, builtIn, num, fn, op, punct, space, word] = match;
      if (comment) tokens.push({ type: 'comment', content: comment });
      else if (str) tokens.push({ type: 'string', content: str });
      else if (kw) tokens.push({ type: 'keyword', content: kw });
      else if (boolVal || num) tokens.push({ type: 'number', content: full });
      else if (builtIn) tokens.push({ type: 'function', content: builtIn });
      else if (fn) tokens.push({ type: 'function', content: fn });
      else if (op) tokens.push({ type: 'operator', content: op });
      else if (punct) tokens.push({ type: 'punctuation', content: punct });
      else if (space) tokens.push({ type: 'text', content: space });
      else tokens.push({ type: 'text', content: full });
    }
    return tokens;
  }

  // JS/TS/General Syntax
  const jsRegex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|default|class|extends|new|this|typeof|instanceof|import|export|from|as|async|await|try|catch|finally|throw|interface|type|enum|public|private|protected|static|readonly)\b)|(\b(?:true|false|null|undefined|NaN|Infinity)\b)|(-?\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())|([+\-*\/%=&|<>!?:^~]+)|([{}()\[\];,.\`])|(\s+)|([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  let match;
  while ((match = jsRegex.exec(code)) !== null) {
    const [full, comment, str, kw, boolVal, num, fn, op, punct] = match;
    if (comment) tokens.push({ type: 'comment', content: comment });
    else if (str) tokens.push({ type: 'string', content: str });
    else if (kw) tokens.push({ type: 'keyword', content: kw });
    else if (boolVal || num) tokens.push({ type: 'number', content: full });
    else if (fn) tokens.push({ type: 'function', content: fn });
    else if (op) tokens.push({ type: 'operator', content: op });
    else if (punct) tokens.push({ type: 'punctuation', content: punct });
    else tokens.push({ type: 'text', content: full });
  }

  return tokens;
}

export const SyntaxHighlightedLine: React.FC<{
  code: string;
  language: CodeLanguage;
  searchQuery?: string;
  isDark?: boolean;
}> = ({ code, language, searchQuery, isDark = false }) => {
  const tokens = tokenizeCode(code, language);

  const getColorClass = (type: Token['type']): string => {
    if (isDark) {
      // VS Code Dark Standard Colors
      switch (type) {
        case 'keyword': return 'text-[#569cd6]';
        case 'tag': return 'text-[#569cd6]';
        case 'string': return 'text-[#ce9178]';
        case 'number': return 'text-[#b5cea8]';
        case 'comment': return 'text-[#6a9955]';
        case 'function': return 'text-[#dcdcaa]';
        case 'attr': return 'text-[#9cdcfe]';
        case 'operator': return 'text-[#d4d4d4]';
        case 'punctuation': return 'text-[#d4d4d4]';
        default: return 'text-[#d4d4d4]';
      }
    } else {
      // VS Code Light Standard Colors
      switch (type) {
        case 'keyword': return 'text-[#0000ff]';
        case 'tag': return 'text-[#800000]';
        case 'string': return 'text-[#a31515]';
        case 'number': return 'text-[#098658]';
        case 'comment': return 'text-[#008000]';
        case 'function': return 'text-[#795e26]';
        case 'attr': return 'text-[#ff0000]';
        case 'operator': return 'text-[#000000]';
        case 'punctuation': return 'text-[#000000]';
        default: return 'text-[#000000]';
      }
    }
  };

  return (
    <span>
      {tokens.map((token, index) => {
        if (searchQuery && token.content.toLowerCase().includes(searchQuery.toLowerCase())) {
          const parts = token.content.split(new RegExp(`(${searchQuery})`, 'gi'));
          return (
            <span key={index} className={getColorClass(token.type)}>
              {parts.map((part, pIdx) =>
                part.toLowerCase() === searchQuery.toLowerCase() ? (
                  <mark key={pIdx} className="bg-[#ed6f21] text-white px-0.5 rounded">
                    {part}
                  </mark>
                ) : (
                  part
                )
              )}
            </span>
          );
        }

        return (
          <span key={index} className={getColorClass(token.type)}>
            {token.content}
          </span>
        );
      })}
    </span>
  );
};
