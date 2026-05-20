import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { getActiveGrammarEditor, messageForError } from './activeDocument';

interface SyntaxDiagramResponse {
  html?: string;
  svg?: string;
}

export const previewSyntaxDiagram = async (
  client: LanguageClient | undefined,
  ruleName?: string
): Promise<string | undefined> => {
  const editor = getActiveGrammarEditor();
  if (!editor) {
    return undefined;
  }

  if (!client) {
    void vscode.window.setStatusBarMessage('Collie: Language server is not running', 3000);
    return undefined;
  }

  const targetRule = ruleName ?? findRuleNameAtPosition(editor.document, editor.selection.active);
  if (!targetRule) {
    void vscode.window.setStatusBarMessage('Collie: No grammar rule found at cursor', 3000);
    return undefined;
  }

  try {
    const response = await client.sendRequest<string | SyntaxDiagramResponse>(
      'collie/syntaxDiagram',
      {
        textDocument: {
          uri: editor.document.uri.toString()
        },
        ruleName: targetRule
      }
    );
    const html = toHtml(response, targetRule);
    showDiagramPanel(targetRule, html);
    return html;
  } catch (error) {
    void vscode.window.showWarningMessage(
      `Collie syntax diagram is unavailable: ${messageForError(error)}`
    );
    return undefined;
  }
};

const findRuleNameAtPosition = (
  document: vscode.TextDocument,
  position: vscode.Position
): string | undefined => {
  for (let lineNumber = position.line; lineNumber >= 0; lineNumber -= 1) {
    const line = document.lineAt(lineNumber).text;
    const match = /^\s*(?:%rule\s+)?(?:%inline\s+)?([A-Za-z_][A-Za-z0-9_]*)(?:\s*\([^)]*\))?\s*:/.exec(line);
    if (match) {
      return match[1];
    }

    if (/^\s*%%\s*$/.test(line)) {
      return undefined;
    }
  }

  return undefined;
};

const toHtml = (
  response: string | SyntaxDiagramResponse,
  ruleName: string
): string => {
  if (typeof response === 'string') {
    return wrapContent(response, ruleName);
  }

  if (response.html) {
    return response.html;
  }

  if (response.svg) {
    return wrapContent(response.svg, ruleName);
  }

  return wrapContent('<p>No syntax diagram was returned.</p>', ruleName);
};

const wrapContent = (content: string, ruleName: string): string => {
  const body = content.trim().startsWith('<svg')
    ? `<div class="diagram">${content}</div>`
    : content;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 16px; }
    h1 { font-size: 18px; font-weight: 600; margin: 0 0 16px; }
    .diagram { overflow: auto; }
    svg { max-width: 100%; height: auto; background: var(--vscode-editorWidget-background); }
  </style>
</head>
<body>
  <h1>${escapeHtml(ruleName)}</h1>
  ${body}
</body>
</html>`;
};

const showDiagramPanel = (ruleName: string, html: string): void => {
  const panel = vscode.window.createWebviewPanel(
    'collie.syntaxDiagram',
    `Collie Diagram: ${ruleName}`,
    vscode.ViewColumn.Beside,
    { enableScripts: false }
  );
  panel.webview.html = html;
};

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
