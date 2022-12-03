import * as vscode from 'vscode';

const helloWorkCommand: vscode.Disposable = vscode.commands.registerCommand(
  'rushstack-vscode-extension.helloWorld',
  () => {
    // The code you place here will be executed every time your command is executed
    // Display a message box to the user
    // eslint-disable-next-line no-void
    void vscode.window.showInformationMessage('Hello World from rushstack-vscode-extension!');
  }
);

export default helloWorkCommand;
