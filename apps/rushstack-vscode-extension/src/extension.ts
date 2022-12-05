import * as vscode from 'vscode';
import rushCDCommand from './commands/RushCDCommand';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Congratulations, your extension "rushstack-vscode-extension" is now active!');

  context.subscriptions.push(rushCDCommand);
}

// This method is called when your extension is deactivated
export function deactivate(): void {}
