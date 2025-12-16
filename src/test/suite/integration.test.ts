import * as assert from 'assert';
import * as vscode from 'vscode';

suite('LSP Integration Tests', () => {
  test('Should provide diagnostics for invalid grammar', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'yacc',
      content: '%token TOKEN\n%token TOKEN\n%%\nstart: TOKEN ;\n%%'
    });

    await vscode.window.showTextDocument(doc);

    // Wait for diagnostics
    await new Promise(resolve => setTimeout(resolve, 1000));

    const diagnostics = vscode.languages.getDiagnostics(doc.uri);
    assert.ok(diagnostics.length > 0);
    assert.ok(diagnostics.some(d => d.message.includes('duplicate')));
  });

  test('Should format document', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'yacc',
      content: '%token  TOKEN\n%%\nstart:TOKEN;\n%%'
    });

    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('collie.format');

    // Wait for formatting
    await new Promise(resolve => setTimeout(resolve, 500));

    const formatted = doc.getText();
    assert.ok(formatted.includes('%token TOKEN'));
  });
});
