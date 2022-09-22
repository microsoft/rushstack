import * as vscode from 'vscode';
import * as Rush from '@rushstack/rush-sdk';

export class CommandDataProvider implements vscode.TreeDataProvider<Command> {
  private _workspaceRoot: string | undefined;
  private _onDidChangeTreeData: vscode.EventEmitter<Command | Command[] | undefined>;

  private _pendingRush!: Promise<Rush.RushCommandLineParser | undefined>;
  private _pendingCommands!: Promise<Command[]>;
  private _loadRush: () => Promise<typeof Rush>;

  constructor(workspaceRoot: string | undefined, loadRush: () => Promise<typeof Rush>) {
    this._workspaceRoot = workspaceRoot;
    this._loadRush = loadRush;

    this._onDidChangeTreeData = new vscode.EventEmitter<Command | Command[] | undefined>();

    this.refresh();
  }

  public async refresh(): Promise<void> {
    const workspaceRoot = this._workspaceRoot;

    if (workspaceRoot) {
      this._pendingRush = (async () => {
        const rushSdk = await this._loadRush();

        if (!rushSdk.RushCommandLineParser) {
          return;
        }

        const commandLineParser = new rushSdk.RushCommandLineParser({
          cwd: workspaceRoot
        });

        return commandLineParser;
      })();
    }

    this._pendingCommands = (async () => {
      const commandLineParser = await this._pendingRush;

      if (commandLineParser) {
        const commands: Command[] = [];

        for (const commandLineAction of commandLineParser.actions) {
          const command = new Command(commandLineAction.actionName);

          commands.push(command);
        }

        return commands;
      }

      return [];
    })();

    await this._pendingCommands;
  }

  public get onDidChangeTreeData(): vscode.Event<Command | Command[] | undefined> {
    return this._onDidChangeTreeData.event;
  }

  public async getChildren(element?: Command | undefined): Promise<Command[]> {
    if (!element) {
      return await this._pendingCommands;
    }

    return [];
  }

  public getParent(element: Command): vscode.ProviderResult<Command> {
    return undefined;
  }

  public getTreeItem(element: Command): vscode.TreeItem {
    if (element instanceof Command) {
      const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);

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
