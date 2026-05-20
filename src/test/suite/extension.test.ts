import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('ydah.collie'));
  });

  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('ydah.collie');
    await ext?.activate();
    assert.ok(ext?.isActive);
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    const collieCommands = commands.filter(cmd => cmd.startsWith('collie.'));

    assert.ok(collieCommands.includes('collie.format'));
    assert.ok(collieCommands.includes('collie.lint'));
    assert.ok(collieCommands.includes('collie.fixAll'));
    assert.ok(collieCommands.includes('collie.restartServer'));
    assert.ok(collieCommands.includes('collie.showOutputChannel'));
    assert.ok(collieCommands.includes('collie.checkSetup'));
    assert.ok(collieCommands.includes('collie.copyEnvironmentInfo'));
    assert.ok(collieCommands.includes('collie.createConfig'));
    assert.ok(collieCommands.includes('collie.openConfig'));
  });
});
