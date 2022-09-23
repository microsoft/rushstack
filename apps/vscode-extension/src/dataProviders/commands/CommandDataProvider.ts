import * as vscode from 'vscode';
import * as Rush from '@rushstack/rush-sdk';

export class CommandDataProvider implements vscode.TreeDataProvider<Command> {
  private _workspaceRoot: string | undefined;
  private _onDidChangeTreeData: vscode.EventEmitter<Command | Command[] | undefined>;

  private _loadRush: () => Promise<typeof Rush>;

  private _commands: Set<Command>;

  private _activeCommand: Command | undefined;

  constructor(workspaceRoot: string | undefined, loadRush: () => Promise<typeof Rush>) {
    this._workspaceRoot = workspaceRoot;
    this._loadRush = loadRush;

    this._onDidChangeTreeData = new vscode.EventEmitter<Command | Command[] | undefined>();

    this._commands = new Set<Command>();

    this.refresh();
  }

  public async refresh(): Promise<void> {
    this._commands.clear();
    this._activeCommand = undefined;

    this._onDidChangeTreeData.fire(undefined);

    const workspaceRoot = this._workspaceRoot;

    if (!workspaceRoot) {
      return;
    }

    const rushSdk = await this._loadRush();

    if (!rushSdk.RushCommandLineParser) {
      return;
    }

    const commandLineParser = new rushSdk.RushCommandLineParser({
      cwd: workspaceRoot,
      excludeDefaultActions: true
    });

    let activeCommand: Command | undefined;

    for (const commandLineAction of commandLineParser.actions) {
      const command = new Command(commandLineAction.actionName);

      if (command.label === 'build') {
        activeCommand = command;
      }

      this._commands.add(command);
    }

    this._onDidChangeTreeData.fire(undefined);

    await vscode.commands.executeCommand('rush.setWatchAction', activeCommand);
  }

  public get onDidChangeTreeData(): vscode.Event<Command | Command[] | undefined> {
    return this._onDidChangeTreeData.event;
  }

  public async getChildren(element?: Command | undefined): Promise<Command[]> {
    if (!element) {
      return Array.from(this._commands).sort((a: Command, b: Command) => a.label.localeCompare(b.label));
    }

    return [];
  }

  public getParent(element: Command): vscode.ProviderResult<Command> {
    return undefined;
  }

  public getWatchAction(): Command | undefined {
    return this._activeCommand;
  }

  public setWatchAction(command: Command | undefined): void {
    this._activeCommand = command;

    vscode.commands.executeCommand(
      'setContext',
      'rush.watchAction',
      command ? `command:${command.label}` : ''
    );

    this._onDidChangeTreeData.fire(undefined);
  }

  public getTreeItem(element: Command): vscode.TreeItem {
    if (element instanceof Command) {
      const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);

      treeItem.id = `command:${element.label}`;

      treeItem.contextValue = `command:${element === this._activeCommand ? 'Watch' : ''}`;

      treeItem.command = {
        command: 'rush.setWatchAction',
        arguments: [element],
        title: 'Set as watch action'
      };

      if (element === this._activeCommand) {
        treeItem.iconPath = new vscode.ThemeIcon(
          'star-full',
          new vscode.ThemeColor('gitDecoration.stageModifiedResourceForeground')
        );
      }

      return treeItem;
    }

    throw new Error('Unknown element type!');
  }
}

export class Command {
  public readonly label: string;

  constructor(label: string) {
    this.label = label;
  }
}
