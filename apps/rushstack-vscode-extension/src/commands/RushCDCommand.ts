import * as vscode from 'vscode';
import { QuickPickItem, Disposable } from 'vscode';

const rushCDCommand: Disposable = vscode.commands.registerCommand(
  'rushstack-vscode-extension.rushCd',
  async () => {
    // Create a quick pick menu to select a quick pick item
    console.log('rush cd');
    const rushCDQuickPickResults: string | undefined = await vscode.window.showQuickPick(['1', '2', '3'], {
      placeHolder: 'Select a project to run "rush cd" on',
      onDidSelectItem: (item: QuickPickItem) => {
        // eslint-disable-next-line no-void
        void vscode.window.showInformationMessage(`Item selected: ${item.label}`);
      }
    });

    // eslint-disable-next-line no-void
    void vscode.window.showInformationMessage(`Selected: ${rushCDQuickPickResults}`);
  }
);

export default rushCDCommand;
