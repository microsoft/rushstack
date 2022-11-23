import * as vscode from 'vscode';
import { RushConfiguration } from '@microsoft/rush-lib';
import { RushCommandLineParser } from '@microsoft/rush-lib/lib/cli/RushCommandLineParser';
import { terminal } from './logger';

import type { CommandLineAction } from '@rushstack/vsce-rush-command-webview';

export interface IRushWorkspace {
  rushConfiguration: RushConfiguration;
  rushCommandLineParser: RushCommandLineParser;
}

export class RushWorkspace {
  private _rushConfiguration: RushConfiguration;
  private _rushCommandLineParser: RushCommandLineParser;
  private static _rushWorkspace: RushWorkspace | undefined;

  private static readonly _onDidChangeWorkspace: vscode.EventEmitter<RushWorkspace> =
    new vscode.EventEmitter();
  public static readonly onDidChangeWorkspace: vscode.Event<RushWorkspace> =
    RushWorkspace._onDidChangeWorkspace.event;

  private constructor({ rushConfiguration, rushCommandLineParser }: IRushWorkspace) {
    this._rushConfiguration = rushConfiguration;
    this._rushCommandLineParser = rushCommandLineParser;
    RushWorkspace._rushWorkspace = this;
    RushWorkspace._onDidChangeWorkspace.fire(this);
  }

  public static getCurrentInstance(): RushWorkspace {
    if (!RushWorkspace._rushWorkspace) {
      throw new Error('RushWorkspace not initialized');
    }
    return RushWorkspace._rushWorkspace;
  }

  public static initializeFromWorkspaceFolderPaths(
    workspaceFolderPaths: string[]
  ): RushWorkspace | undefined {
    terminal.writeDebugLine(`initialize from workspaceFolderPaths: ${JSON.stringify(workspaceFolderPaths)}`);
    for (const folderPath of workspaceFolderPaths) {
      const rushConfiguration: RushConfiguration | undefined = RushConfiguration.loadFromDefaultLocation({
        startingFolder: folderPath
      });
      terminal.writeDebugLine(`rushConfiguration loaded from: ${folderPath}`);
      if (rushConfiguration) {
        const rushCommandLineParser: RushCommandLineParser = new RushCommandLineParser({
          cwd: folderPath
        });
        return new RushWorkspace({ rushConfiguration, rushCommandLineParser });
      }
    }
    terminal.writeWarningLine(`No rush configuration found in workspace folders`);
    return undefined;
  }

  public static async selectWorkspace(): Promise<RushWorkspace | undefined> {
    const Uris: vscode.Uri[] | undefined = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select workspace folder'
    });
    if (Uris && Uris[0]) {
      return RushWorkspace.initializeFromWorkspaceFolderPaths([Uris[0].fsPath]);
    }
    return undefined;
  }

  public get rushConfiguration(): RushConfiguration {
    return this._rushConfiguration;
  }

  public get workspaceRootPath(): string {
    return this._rushConfiguration.rushJsonFolder;
  }

  public get commandLineActions(): CommandLineAction[] {
    return this._rushCommandLineParser.actions.slice() as unknown as CommandLineAction[];
  }
}
