import * as assert from 'assert';
import * as vscode from 'vscode';

const isRealServer = (): boolean => process.env.COLLIE_LSP_REAL_SERVER === '1';

suite('LSP Integration Tests', () => {
  setup(async () => {
    await vscode.extensions.getExtension('ydah.collie')?.activate();
  });

  test('Should connect to a real collie-lsp server when requested', async () => {
    if (!isRealServer()) {
      return;
    }

    await vscode.commands.executeCommand('collie.checkSetup');
  });

  test('Should provide diagnostics for invalid grammar', async function (this: Mocha.Context) {
    if (isRealServer()) {
      this.skip();
    }

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

  test('Should format document', async function (this: Mocha.Context) {
    if (isRealServer()) {
      this.skip();
    }

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

  test('Should apply Collie fix-all action', async function (this: Mocha.Context) {
    if (isRealServer()) {
      this.skip();
    }

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

  test('Should expose symbols through Collie search command', async function (this: Mocha.Context) {
    if (isRealServer()) {
      this.skip();
    }

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

  test('Should preview syntax diagram when server supports it', async function (this: Mocha.Context) {
    if (isRealServer()) {
      this.skip();
    }

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

  test('Should smoke test core LSP navigation capabilities', async function (this: Mocha.Context) {
    if (isRealServer()) {
      this.skip();
    }

    const doc = await vscode.workspace.openTextDocument({
      language: 'yacc',
      content: '%token TOKEN\n%%\nstart: TOKEN ;\n%%'
    });
    await vscode.window.showTextDocument(doc);

    const position = new vscode.Position(2, 1);
    const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeDefinitionProvider',
      doc.uri,
      position
    );
    assert.ok(definitions.length > 0);

    const references = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      doc.uri,
      position
    );
    assert.ok(references.length > 0);

    const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
      'vscode.executeFoldingRangeProvider',
      doc.uri
    );
    assert.ok(foldingRanges.length > 0);

    const renameEdit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
      'vscode.executeDocumentRenameProvider',
      doc.uri,
      position,
      'renamed_start'
    );
    assert.ok(renameEdit.size > 0);
  });
});
