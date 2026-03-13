import * as vscode from 'vscode';
import { serializeRange, type SerializedRange } from './position';

export interface SerializedHover {
  contents: string[];
  range?: SerializedRange;
}

export function serializeHover(hover: vscode.Hover): SerializedHover {
  const contents = hover.contents.map(c => {
    if (typeof c === 'string') return c;
    if (c instanceof vscode.MarkdownString) return c.value;
    // MarkedString { language, value }
    if ('language' in c && 'value' in c) return `\`\`\`${c.language}\n${c.value}\n\`\`\``;
    return String(c);
  });
  return {
    contents,
    range: hover.range ? serializeRange(hover.range) : undefined,
  };
}
