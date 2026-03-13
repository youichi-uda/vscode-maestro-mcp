import * as vscode from 'vscode';

export interface SerializedSemanticToken {
  line: number;
  startCharacter: number;
  length: number;
  tokenType: string;
  tokenModifiers: string[];
}

export function decodeSemanticTokens(
  tokens: vscode.SemanticTokens,
  legend: vscode.SemanticTokensLegend,
): SerializedSemanticToken[] {
  const result: SerializedSemanticToken[] = [];
  const data = tokens.data;
  let line = 0;
  let char = 0;

  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaChar = data[i + 1];
    const length = data[i + 2];
    const tokenTypeIdx = data[i + 3];
    const tokenModifiersBits = data[i + 4];

    if (deltaLine > 0) {
      line += deltaLine;
      char = deltaChar;
    } else {
      char += deltaChar;
    }

    const tokenType = legend.tokenTypes[tokenTypeIdx] ?? `unknown(${tokenTypeIdx})`;
    const tokenModifiers: string[] = [];
    for (let bit = 0; bit < legend.tokenModifiers.length; bit++) {
      if (tokenModifiersBits & (1 << bit)) {
        tokenModifiers.push(legend.tokenModifiers[bit]);
      }
    }

    result.push({ line, startCharacter: char, length, tokenType, tokenModifiers });
  }

  return result;
}
