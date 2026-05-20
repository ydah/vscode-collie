import * as assert from 'assert';
import * as vscode from 'vscode';

suite('LSP Integration Tests', () => {
  setup(async () => {
    await vscode.extensions.getExtension('ydah.collie')?.activate();
  });

  test('Should provide diagnostics for invalid grammar', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'yacc',
      content: '%token TOKEN\n%token TOKEN\n%%\nstart: TOKEN ;\n%%'
    });

    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('collie.lint');

    // Wait for diagnostics
    await new Promise(resolve => setTimeout(resolve, 500));

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

  test('Should apply Collie fix-all action', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'yacc',
      content: '%token TOKEN\n%token TOKEN\n%%\nstart: TOKEN ;\n%%'
    });

    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('collie.fixAll');
    await new Promise(resolve => setTimeout(resolve, 500));

    const fixed = doc.getText();
    assert.strictEqual((fixed.match(/^%token TOKEN$/gm) ?? []).length, 1);
  });

  test('Should expose symbols through Collie search command', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'yacc',
      content: '%token TOKEN\n%%\nstart: TOKEN ;\n%%'
    });

    await vscode.window.showTextDocument(doc);
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'collie.searchSymbols',
      'start'
    );

    assert.ok(symbols.some(symbol => symbol.name === 'start'));
  });

  test('Should preview syntax diagram when server supports it', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'yacc',
      content: '%token TOKEN\n%%\nstart: TOKEN ;\n%%'
    });

    await vscode.window.showTextDocument(doc);
    const html = await vscode.commands.executeCommand<string>(
      'collie.previewSyntaxDiagram',
      'start'
    );

    assert.ok(html.includes('start'));
    assert.ok(html.includes('<svg'));
  });
});
