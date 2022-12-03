import * as vscode from 'vscode';
import helloWorldCommand from './commands/HelloWorldCommand';
import rushCDCommand from './commands/RushCDCommand';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Congratulations, your extension "rushstack-vscode-extension" is now active!');

  context.subscriptions.push(helloWorldCommand);
  context.subscriptions.push(rushCDCommand);
}

// This method is called when your extension is deactivated
export function deactivate(): void {}
